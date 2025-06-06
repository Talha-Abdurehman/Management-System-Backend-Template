const Orders = require("../models/Orders.model.js");
const BusinessHistory = require("../models/BusinessHistory.model.js");
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

const MAX_HISTORY_UPDATE_ATTEMPTS = 3;

/**
 * Attempts to update the business history.
 * Structure improved for clarity, acknowledging remaining race condition potential
 * for new year/month/day creation without full transactional upserts.
 * $inc is used for existing day records.
 */
async function attemptBusinessHistoryUpdate(
  orderDate,
  profitForThisOrder,
  ordersInThisTransaction,
  attempt = 1
) {
  const RETRY_DELAY_MS = 1000 * Math.pow(2, attempt - 1);

  try {
    const year = orderDate.getUTCFullYear();
    const month = orderDate.getUTCMonth() + 1;
    const day = orderDate.getUTCDate();

    let historyRecord = await BusinessHistory.findOne({ year: year });

    if (!historyRecord) {
      historyRecord = new BusinessHistory({
        year: year,
        months: [{ month: month, days: [{ day: day, totalProfit: profitForThisOrder, totalOrders: ordersInThisTransaction }] }],
      });
      await historyRecord.save();
    } else {
      let monthRecord = historyRecord.months.find((m) => m.month === month);
      if (!monthRecord) {
        historyRecord.months.push({ month: month, days: [{ day: day, totalProfit: profitForThisOrder, totalOrders: ordersInThisTransaction }] });
        historyRecord.months.sort((a, b) => a.month - b.month);
        await historyRecord.save();
      } else {
        let dayRecord = monthRecord.days.find((d) => d.day === day);
        if (!dayRecord) {
          monthRecord.days.push({ day: day, totalProfit: profitForThisOrder, totalOrders: ordersInThisTransaction });
          monthRecord.days.sort((a, b) => a.day - b.day);
          await historyRecord.save();
        } else {
          const updateResult = await BusinessHistory.updateOne(
            { year: year, "months.month": month, "months.days.day": day },
            {
              $inc: {
                "months.$[m].days.$[d].totalProfit": profitForThisOrder,
                "months.$[m].days.$[d].totalOrders": ordersInThisTransaction
              }
            },
            { arrayFilters: [{ "m.month": month }, { "d.day": day }] }
          );

          if (updateResult.matchedCount === 0 || updateResult.modifiedCount === 0) {
            console.warn(`Atomic $inc for BusinessHistory ${year}-${month}-${day} did not modify. Re-fetching and trying manual save.`);
            const fallbackRecord = await BusinessHistory.findOne({ year: year });
            const fbMonth = fallbackRecord.months.find(m => m.month === month);
            if (fbMonth) {
              const fbDay = fbMonth.days.find(d => d.day === day);
              if (fbDay) {
                fbDay.totalProfit += profitForThisOrder;
                fbDay.totalOrders += ordersInThisTransaction;
                await fallbackRecord.save();
              } else { throw new Error(`Fallback: Day ${day} not found in month ${month} for year ${year}.`); }
            } else { throw new Error(`Fallback: Month ${month} not found for year ${year}.`); }
          }
        }
      }
    }
    console.log(`Business history updated successfully for ${year}-${month}-${day} (Attempt ${attempt})`);
  } catch (historyError) {
    console.error(`Attempt ${attempt}/${MAX_HISTORY_UPDATE_ATTEMPTS} to update business history failed for ${orderDate.toISOString().slice(0, 10)}:`, historyError.message);
    if (attempt < MAX_HISTORY_UPDATE_ATTEMPTS) {
      console.log(`Retrying business history update in ${RETRY_DELAY_MS / 1000}s...`);
      setTimeout(() => attemptBusinessHistoryUpdate(orderDate, profitForThisOrder, ordersInThisTransaction, attempt + 1), RETRY_DELAY_MS);
    } else {
      console.error(`Max retries reached for business history update for date ${orderDate.toISOString().slice(0, 10)}. Profit: ${profitForThisOrder}, Orders: ${ordersInThisTransaction}. Please investigate manually.`);
    }
  }
}


exports.createOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.body.invoice_id) {
      await session.abortTransaction(); session.endSession();
      return next(new AppError("Invoice ID is required.", 400));
    }
    if (!req.body.order_items || req.body.order_items.length === 0) {
      await session.abortTransaction(); session.endSession();
      return next(new AppError("Order must contain at least one item.", 400));
    }

    const customerId = req.body.customer;
    if (customerId && !mongoose.Types.ObjectId.isValid(customerId)) {
      await session.abortTransaction(); session.endSession();
      return next(new AppError("Invalid Customer ID format provided.", 400));
    }

    const newOrderData = { ...req.body };

    // Handle walk-in customer details vs registered customer
    if (customerId) {
      newOrderData.customer = customerId;
      // Ensure walk-in fields are not set if a registered customer is provided
      delete newOrderData.walkInCustomerName;
      delete newOrderData.walkInCustomerCNIC;
      delete newOrderData.walkInCustomerPhone;
    } else {
      // No registered customer ID, so check for walk-in details
      newOrderData.walkInCustomerName = req.body.walkInCustomerName || null;
      newOrderData.walkInCustomerCNIC = req.body.walkInCustomerCNIC || null;
      newOrderData.walkInCustomerPhone = req.body.walkInCustomerPhone || null;
      delete newOrderData.customer; // Ensure customer ref is not set
    }


    const newOrder = new Orders(newOrderData);
    await newOrder.save({ session });

    // If a registered customer is associated with this order, update their cOrders and recalculate balance
    if (newOrder.customer) {
      const CustomerModel = mongoose.model("Customers");
      const customer = await CustomerModel.findById(newOrder.customer).session(session);
      if (customer) {
        if (!customer.cOrders.map(id => id.toString()).includes(newOrder._id.toString())) {
          customer.cOrders.push(newOrder._id);
        }
        await customer.recalculateBalances({ session });
      } else {
        console.warn(`[OrderController.createOrder] Registered Customer with ID ${newOrder.customer} not found when trying to link order ${newOrder._id}.`);
      }
    }


    const orderDateForHistory = newOrder.createdAt;
    const profitForThisOrder = newOrder.total_price;
    const ordersInThisTransaction = 1;

    attemptBusinessHistoryUpdate(orderDateForHistory, profitForThisOrder, ordersInThisTransaction)
      .catch(historyUpdateError => {
        console.error(`BACKGROUND_ERROR: Business history update failed for order ${newOrder._id}: ${historyUpdateError.message}`);
      });

    await session.commitTransaction();

    let populatedOrderForResponse = await Orders.findById(newOrder._id)
      .populate('customer', 'cName cNIC') // Populate registered customer if exists
      .populate('order_items.item', 'product_name retail_price wholesale_price product_category')
      .lean(); // Using lean for potentially faster response, toObject() manually if needed later
    // No specific session needed here for findById after commit, but can be added if issues arise.

    res.status(201).json({ Message: "Created Successfully", order: populatedOrderForResponse });

  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000 && err.keyPattern && err.keyPattern.invoice_id) {
      return next(new AppError(`Invoice ID '${err.keyValue.invoice_id}' already exists.`, 400));
    }
    if (err.name === 'ValidationError') {
      return next(new AppError(err.message, 400));
    }
    console.error(`[OrderController.createOrder] Catch Block Error: ${err.stack || err.message}`);
    next(new AppError(`Error Creating Order: ${err.message}`, 500));
  } finally {
    session.endSession();
  }
};

exports.getOrder = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    let queryFilter = {};

    // By default, only show non-archived orders.
    queryFilter.isArchived = { $ne: true };

    if (startDate) {
      const startOfDay = new Date(startDate);
      startOfDay.setUTCHours(0, 0, 0, 0); // Start of the day in UTC

      if (endDate && startDate === endDate) { // Single day filter
        const endOfDay = new Date(startDate); // Use startDate for end of the same day
        endOfDay.setUTCHours(23, 59, 59, 999); // End of the day in UTC
        queryFilter.createdAt = { $gte: startOfDay, $lte: endOfDay };
      } else if (endDate) { // Date range filter
        const endOfDay = new Date(endDate);
        endOfDay.setUTCHours(23, 59, 59, 999); // End of the day in UTC
        queryFilter.createdAt = { $gte: startOfDay, $lte: endOfDay };
      } else { // Only startDate provided (treat as single day)
        const endOfDay = new Date(startDate);
        endOfDay.setUTCHours(23, 59, 59, 999); // End of the day in UTC
        queryFilter.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
    }


    const data = await Orders.find(queryFilter)
      .populate('customer', 'cName cNIC')
      .populate('order_items.item', 'product_name retail_price wholesale_price product_category')
      .sort({ createdAt: -1 });

    if (!data || data.length === 0) {
      return res.json([]);
    }
    res.json(data);
  } catch (err) {
    console.error("Error in getOrder:", err);
    next(new AppError(`Error Fetching Orders: ${err.message}`, 500));
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid order ID format", 400));
    }
    const data = await Orders.findById(id).populate('customer', 'cName cNIC').populate('order_items.item', 'product_name retail_price wholesale_price');
    if (!data) {
      return next(new AppError("Order not found!", 404));
    }
    res.status(200).json({ Message: "Fetched Successfully", data: data });
  } catch (err) {
    next(new AppError(`Error Fetching Order by ID: ${err.message}`, 500));
  }
};

exports.updateOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid order ID format", 400));
    }

    // Recalculation of total_price if products array is being updated is handled by pre-save hook in Order model.
    const updatedOrder = await Orders.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    }).populate('customer', 'cName cNIC').populate('order_items.item', 'product_name retail_price wholesale_price');

    if (!updatedOrder) {
      return next(new AppError("Order not found", 404));
    }
    // Consider if customer balances need updating if total_price changed.
    // The Order model's addPayment method handles customer balance for payments.
    // If total_price changes directly here, customer balance might become inconsistent
    // unless recalculated or managed via a service.
    // For now, this update is order-centric.

    res.status(200).json({ Message: "Updated Successfully", order: updatedOrder });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return next(new AppError(err.message, 400));
    }
    next(new AppError(`Error Updating Order: ${err.message}`, 500));
  }
};

exports.deleteOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid order ID format", 400));
    }
    const deletedOrder = await Orders.findByIdAndDelete(id);
    if (!deletedOrder) {
      return next(new AppError("Order not found", 404));
    }
    // Consider if customer's cOrders array and balances need updating.
    // This might require finding the customer and pulling the order ID, then recalculating.
    // This logic is better suited for a service layer.
    // For now, simple deletion.

    res.status(200).json({ Message: "Deleted Successfully" });
  } catch (err) {
    next(new AppError(`Error Deleting Order: ${err.message}`, 500));
  }
};

exports.addPaymentToOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const paymentDetails = req.body; // { amount, payment_method_used, notes? }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(new AppError("Invalid order ID format", 400));
    }
    if (!paymentDetails.amount || typeof paymentDetails.amount !== 'number' || paymentDetails.amount <= 0) {
      return next(new AppError("Valid payment amount is required.", 400));
    }
    if (!paymentDetails.payment_method_used) {
      return next(new AppError("Payment method is required.", 400));
    }

    const order = await Orders.findById(orderId);
    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    if (order.order_status === 'Fully Paid' || order.order_status === 'Cancelled') {
      return next(new AppError(`Order is already ${order.order_status.toLowerCase()} and cannot accept further payments.`, 400));
    }

    const updatedOrder = await order.addPayment(paymentDetails); // Uses the model method

    res.status(200).json({
      message: "Payment added successfully",
      order: updatedOrder
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      return next(new AppError(error.message, 400));
    }
    next(new AppError(error.message || "Failed to add payment to order", 500));
  }
};

exports.deleteOrders = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { startDate, endDate, confirmDeleteAll } = req.query;
    let filter = {};

    if (startDate) {
      const startOfDay = new Date(startDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = endDate ? new Date(endDate) : new Date(startDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      filter.createdAt = { $gte: startOfDay, $lte: endOfDay };
    } else if (confirmDeleteAll !== 'true') {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError("You must provide a date range or confirm archival of ALL orders by setting 'confirmDeleteAll=true'. This is a safety measure.", 400));
    }

    // Always apply the non-archived filter to avoid re-archiving
    filter.isArchived = { $ne: true };

    const updateResult = await Orders.updateMany(
      filter,
      { $set: { isArchived: true } },
      { session }
    );

    if (updateResult.matchedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ message: "No active orders found in the specified criteria to archive." });
    }

    await session.commitTransaction();

    res.status(200).json({
      message: `${updateResult.modifiedCount} order(s) archived and cleared from view successfully.`,
      archivedCount: updateResult.modifiedCount
    });

  } catch (err) {
    await session.abortTransaction();
    console.error(`[OrderController.deleteOrders (Archive)] Error: ${err.stack || err.message}`);
    next(new AppError(`Error archiving orders: ${err.message}`, 500));
  } finally {
    session.endSession();
  }
};