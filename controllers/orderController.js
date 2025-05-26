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
    const year = orderDate.getFullYear();
    const month = orderDate.getMonth() + 1;
    const day = orderDate.getDate();

    let historyRecord = await BusinessHistory.findOne({ year: year });

    if (!historyRecord) {
      // Create new year, month, and day
      historyRecord = new BusinessHistory({
        year: year,
        months: [{ month: month, days: [{ day: day, totalProfit: profitForThisOrder, totalOrders: ordersInThisTransaction }] }],
      });
      // Sort is not needed here as it's the first entry
      await historyRecord.save();
    } else {
      let monthRecord = historyRecord.months.find((m) => m.month === month);
      if (!monthRecord) {
        // Year exists, but month does not. Add new month and day.
        historyRecord.months.push({ month: month, days: [{ day: day, totalProfit: profitForThisOrder, totalOrders: ordersInThisTransaction }] });
        historyRecord.months.sort((a, b) => a.month - b.month); // Sort months
        await historyRecord.save();
      } else {
        let dayRecord = monthRecord.days.find((d) => d.day === day);
        if (!dayRecord) {
          // Year and month exist, but day does not. Add new day.
          monthRecord.days.push({ day: day, totalProfit: profitForThisOrder, totalOrders: ordersInThisTransaction });
          monthRecord.days.sort((a, b) => a.day - b.day); // Sort days
          await historyRecord.save();
        } else {
          // Year, month, and day exist. Atomically update the day's totals.
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
            // This fallback is a safeguard but indicates a potential race condition or unexpected state.
            // In a high-concurrency system, a more robust distributed lock or transactional approach
            // for the entire find-or-create-and-update logic might be needed for BusinessHistory.
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
    // Ensure customer field is set correctly, even if it was null/undefined initially in req.body
    // but then a customer was created and ID obtained by frontend (as in OrderCompositionPod flow)
    if (customerId) {
      newOrderData.customer = customerId;
    } else {
      delete newOrderData.customer; // Ensure it's not present if no customerId
    }


    const newOrder = new Orders(newOrderData);
    await newOrder.save({ session });

    // If a customer is associated with this order, update the customer's cOrders and recalculate balance
    if (newOrder.customer) {
      const CustomerModel = mongoose.model("Customers");
      const customer = await CustomerModel.findById(newOrder.customer).session(session);
      if (customer) {
        if (!customer.cOrders.map(id => id.toString()).includes(newOrder._id.toString())) {
          customer.cOrders.push(newOrder._id);
          await customer.save({ session });
        }
        // The balance recalculation is now solely handled by the Order model's post-save hook.
        // The explicit call here was redundant.
      } else {
        console.warn(`[OrderController.createOrder] Customer with ID ${newOrder.customer} not found when trying to link order ${newOrder._id}. Order saved without explicit customer link update balance recalculation here.`);
      }
    }


    const orderDateForHistory = newOrder.createdAt;
    const profitForThisOrder = newOrder.total_price;
    const ordersInThisTransaction = 1;
    attemptBusinessHistoryUpdate(orderDateForHistory, profitForThisOrder, ordersInThisTransaction);

    await session.commitTransaction();
    // Populate customer details if they were part of the request and are needed in the response
    let finalOrderResponse = newOrder.toObject();
    if (newOrder.customer && typeof newOrder.customer !== 'string') { // if populated
      // no action needed, already populated by Mongoose if schema is set up for it
    } else if (newOrder.customer) { // if it's an ID, try to populate
      try {
        const populatedOrder = await Orders.findById(newOrder._id).populate('customer', 'cName cNIC').session(session);
        if (populatedOrder) finalOrderResponse = populatedOrder.toObject();
      } catch (popErr) {
        console.error(`[OrderController.createOrder] Error populating customer for response: ${popErr.message}`);
      }
    }

    res.status(201).json({ Message: "Created Successfully", order: finalOrderResponse });
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
    const data = await Orders.find().populate('customer', 'cName cNIC').populate('order_items.item', 'product_name retail_price wholesale_price').sort({ createdAt: -1 });
    if (!data || data.length === 0) {
      return res.json([]); // Return empty array if no orders found
    }
    res.json(data);
  } catch (err) {
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

// New controller for adding payment to an order
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