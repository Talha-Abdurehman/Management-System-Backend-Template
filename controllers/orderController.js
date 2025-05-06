const Orders = require("../models/Orders.model.js");
const BusinessHistory = require("../models/BusinessHistory.model.js");

/** @type {import('mongoose').Model<import('../models/Orders')>} */

exports.createOrder = async (req, res) => {
  try {
    const newOrder = new Orders(req.body);
    await newOrder.save();
    try {
      const orderDate = newOrder.createdAt;
      const year = orderDate.getFullYear();
      const month = orderDate.getMonth() + 1; // JavaScript months are 0-indexed (0-11)
      const day = orderDate.getDate();
      const profitForThisOrder = newOrder.total_price;
      const ordersInThisTransaction = 1;

      let historyRecord = await BusinessHistory.findOne({ year: year });

      if (!historyRecord) {
        // Create new history record for the year, month, and day
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
      } else {
        // Year record exists, find or create month
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
          // Ensure months are sorted if you care about order, though usually not critical
          // historyRecord.months.sort((a, b) => a.month - b.month);
        } else {
          // Month record exists, find or create day
          let dayRecord = monthRecord.days.find((d) => d.day === day);
          if (!dayRecord) {
            monthRecord.days.push({
              day: day,
              totalProfit: profitForThisOrder,
              totalOrders: ordersInThisTransaction,
            });
            // Ensure days are sorted if you care about order
            // monthRecord.days.sort((a, b) => a.day - b.day);
          } else {
            dayRecord.totalProfit += profitForThisOrder;
            dayRecord.totalOrders += ordersInThisTransaction;
          }
        }
      }
      await historyRecord.save();
      console.log(`Business history updated for ${year}-${month}-${day}`);
    } catch (historyError) {
      console.error(
        "Failed to update business history after order creation:",
        historyError
      );
      // You might want to add more robust error handling here,
      // like queuing this update for a retry.
    }

    res.status(201).json({ Message: "Created Successfully", orderId: newOrder._id });
  } catch (err) {
    // Check for duplicate key error for invoice_id specifically if it's a common issue
    if (err.code === 11000 && err.keyPattern && err.keyPattern.invoice_id) {
      return res.status(400).json({ message: `Invoice ID '${err.keyValue.invoice_id}' already exists.` });
    }
    res.status(500).json({ message: `Error Message: ${err}` });
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
    res.status(500).json({ Message: `The Following error occured: ${err}` });
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
    res.status(500).json({ Message: `The Following error occured: ${err}` });
  }
};

exports.updateOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    // Note: If you update total_price or products in an existing order,
    // the business history will NOT automatically reflect this change.
    // You would need additional logic here to reverse the old values and add new ones.
    // This is complex and often handled by creating credit memos or new adjustment orders.
    // For now, we assume updates don't affect total_price in a way that needs history adjustment.
    const updateOrder = await Orders.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updateOrder)
      return res.status(404).json({ Message: "Resource not found" });
    res.status(200).json({ Message: "Updated Successfully ", updateOrder });
  } catch (err) {
    res.status(500).json({ Message: `The Following error occured: ${err}` });
  }
};

exports.deleteOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    // Note: If you delete an order, the business history will NOT automatically
    // decrement the totals. This requires more complex logic (finding the original
    // order's contribution and subtracting it). Often, orders are marked "cancelled"
    // rather than hard deleted for this reason.
    const deleteOrder = await Orders.findByIdAndDelete(id);
    if (!deleteOrder)
      return res.status(404).json({ Message: "Resource not found" });
    res.status(200).json({ Message: "Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ Message: `The following error occured: ${err}` });
  }
};