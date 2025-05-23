const Orders = require("../models/Orders.model.js");
const BusinessHistory = require("../models/BusinessHistory.model.js");

const MAX_HISTORY_UPDATE_ATTEMPTS = 3; // Max retry attempts for business history update

/**
 * Attempts to update the business history.
 * If it fails, it will retry a few times with an exponential backoff.
 * This function is designed to be "fire-and-forget" from the main request flow.
 */
async function attemptBusinessHistoryUpdate(
  orderDate,
  profitForThisOrder,
  ordersInThisTransaction,
  attempt = 1
) {
  const RETRY_DELAY_MS = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s

  try {
    const year = orderDate.getFullYear();
    const month = orderDate.getMonth() + 1; // JS months are 0-indexed
    const day = orderDate.getDate();

    let historyRecord = await BusinessHistory.findOne({ year: year });

    if (!historyRecord) {
      historyRecord = new BusinessHistory({
        year: year,
        months: [
          {
            month: month,
            days: [
              {
                day: day,
                totalProfit: profitForThisOrder,
                totalOrders: ordersInThisTransaction,
              },
            ],
          },
        ],
      });
      await historyRecord.save();
    } else {
      let monthRecord = historyRecord.months.find((m) => m.month === month);
      if (!monthRecord) {
        historyRecord.months.push({
          month: month,
          days: [
            {
              day: day,
              totalProfit: profitForThisOrder,
              totalOrders: ordersInThisTransaction,
            },
          ],
        });
        historyRecord.months.sort((a, b) => a.month - b.month); // Keep sorted
        await historyRecord.save();
      } else {
        let dayRecord = monthRecord.days.find((d) => d.day === day);
        if (!dayRecord) {
          monthRecord.days.push({
            day: day,
            totalProfit: profitForThisOrder,
            totalOrders: ordersInThisTransaction,
          });
          monthRecord.days.sort((a, b) => a.day - b.day); // Keep sorted
          await historyRecord.save();
        } else {
          // Atomic update for existing day record
          const updateResult = await BusinessHistory.updateOne(
            {
              year: year,
              "months.month": month,
              "months.days.day": day
            },
            {
              $inc: {
                "months.$[m].days.$[d].totalProfit": profitForThisOrder,
                "months.$[m].days.$[d].totalOrders": ordersInThisTransaction
              }
            },
            {
              arrayFilters: [
                { "m.month": month },
                { "d.day": day }
              ]
            }
          );
          if (updateResult.matchedCount === 0 || updateResult.modifiedCount === 0) {
            // This might happen if the record was modified between findOne and updateOne.
            // Or if arrayFilters didn't match (shouldn't happen if dayRecord was found).
            // For a robust solution, this case might need a retry of the whole logic or a more complex upsert.
            // For now, log a warning if the atomic update didn't proceed as expected.
            console.warn(`Atomic update for BusinessHistory ${year}-${month}-${day} did not modify. Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}. Re-fetching and trying save (less atomic).`);
            // Fallback to less atomic save for this specific case, or throw to retry.
            // To keep it simple for this fix, we will re-fetch and save if atomic fails.
            const fallbackRecord = await BusinessHistory.findOne({ year: year });
            const fbMonthRecord = fallbackRecord.months.find(m => m.month === month);
            if (fbMonthRecord) {
              const fbDayRecord = fbMonthRecord.days.find(d => d.day === day);
              if (fbDayRecord) {
                fbDayRecord.totalProfit += profitForThisOrder;
                fbDayRecord.totalOrders += ordersInThisTransaction;
                await fallbackRecord.save();
              } else {
                // Day disappeared, log error or re-add
                throw new Error(`Day ${day} disappeared during fallback update for BusinessHistory ${year}-${month}.`);
              }
            } else {
              // Month disappeared, log error or re-add
              throw new Error(`Month ${month} disappeared during fallback update for BusinessHistory ${year}.`);
            }

          }
        }
      }
    }
    console.log(
      `Business history updated successfully for ${year}-${month}-${day} (Attempt ${attempt})`
    );
  } catch (historyError) {
    console.error(
      `Attempt ${attempt}/${MAX_HISTORY_UPDATE_ATTEMPTS} to update business history failed for date ${orderDate
        .toISOString()
        .slice(0, 10)}:`,
      historyError.message
    );
    if (attempt < MAX_HISTORY_UPDATE_ATTEMPTS) {
      console.log(
        `Retrying business history update in ${RETRY_DELAY_MS / 1000}s...`
      );
      setTimeout(
        () =>
          attemptBusinessHistoryUpdate(
            orderDate,
            profitForThisOrder,
            ordersInThisTransaction,
            attempt + 1
          ),
        RETRY_DELAY_MS
      );
    } else {
      console.error(
        `Max retries reached for business history update for date ${orderDate
          .toISOString()
          .slice(
            0,
            10
          )}. Profit: ${profitForThisOrder}, Orders: ${ordersInThisTransaction}. Please investigate manually.`
      );
    }
  }
}

/** @type {import('mongoose').Model<import('../models/Orders')>} */

exports.createOrder = async (req, res) => {
  try {
    const newOrder = new Orders(req.body);
    await newOrder.save();

    const orderDateForHistory = newOrder.createdAt;
    const profitForThisOrder = newOrder.total_price;
    const ordersInThisTransaction = 1;

    attemptBusinessHistoryUpdate(
      orderDateForHistory,
      profitForThisOrder,
      ordersInThisTransaction
    );

    res
      .status(201)
      .json({ Message: "Created Successfully", orderId: newOrder._id });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.invoice_id) {
      return res
        .status(400)
        .json({
          message: `Invoice ID '${err.keyValue.invoice_id}' already exists.`,
        });
    }
    console.error("Error creating order:", err);
    res.status(500).json({ message: `Error Creating Order: ${err.message}` });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const data = await Orders.find();
    if (!data || data.length === 0) {
      return res.status(404).json({ Message: "No orders found!" });
    }
    res.json(data);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res
      .status(500)
      .json({ Message: `Error Fetching Orders: ${err.message}` });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await Orders.findById(id);
    if (!data) {
      return res.status(404).json({ Message: "Order not found!" });
    }
    res.status(200).json({ Message: "Fetched Successfully", data: data });
  } catch (err) {
    console.error(`Error fetching order by ID ${req.params.id}:`, err);
    res
      .status(500)
      .json({ Message: `Error Fetching Order by ID: ${err.message}` });
  }
};

exports.updateOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    // Recalculate total_price if products array is being updated
    if (req.body.products && Array.isArray(req.body.products)) {
      req.body.total_price = req.body.products.reduce(
        (total, product) =>
          total + product.product_price * product.product_quantity,
        0
      );
    }

    const updatedOrder = await Orders.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedOrder) {
      return res.status(404).json({ Message: "Resource not found" });
    }
    res
      .status(200)
      .json({ Message: "Updated Successfully", order: updatedOrder });
  } catch (err) {
    console.error(`Error updating order ${req.params.id}:`, err);
    res.status(500).json({ Message: `Error Updating Order: ${err.message}` });
  }
};

exports.deleteOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedOrder = await Orders.findByIdAndDelete(id);
    if (!deletedOrder) {
      return res.status(404).json({ Message: "Resource not found" });
    }
    res.status(200).json({ Message: "Deleted Successfully" });
  } catch (err) {
    console.error(`Error deleting order ${req.params.id}:`, err);
    res.status(500).json({ Message: `Error Deleting Order: ${err.message}` });
  }
};