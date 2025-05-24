const Customer = require("../models/Customers.model");
const Order = require("../models/Orders.model");
const mongoose = require("mongoose");
const AppError = require('../utils/AppError');

/**
 * Customer Controller
 */
const CustomerController = {
  createCustomer: async (req, res, next) => {
    try {
      const { cName, cNIC, cPhone, cAddress, cImgUrl } = req.body;

      if (!cName || !cNIC || !cPhone) {
        return next(new AppError("Customer Name, CNIC, and Phone are required.", 400));
      }

      const existingCustomer = await Customer.findOne({ $or: [{ cNIC }, { cPhone }] });
      if (existingCustomer) {
        return next(new AppError("Customer with this NIC or phone number already exists.", 400));
      }

      const customer = new Customer({
        cName, cNIC, cPhone, cAddress,
        cPaidAmount: 0, // Initialized
        cOutstandingAmt: 0, // Initialized
        cOrders: [],
        cImgUrl: cImgUrl || null,
      });
      await customer.save();
      res.status(201).json({ success: true, message: "Customer created successfully", data: customer });
    } catch (error) {
      if (error.name === 'ValidationError') return next(new AppError(error.message, 400));
      if (error.code === 11000) return next(new AppError(`Duplicate value for ${Object.keys(error.keyValue)[0]}.`, 400));
      next(new AppError("Error creating customer: " + error.message, 500));
    }
  },

  getAllCustomers: async (req, res, next) => {
    try {
      const customers = await Customer.find().select("-cOrders").sort({ createdAt: -1 });
      res.status(200).json({ success: true, count: customers.length, data: customers });
    } catch (error) {
      next(new AppError("Error fetching customers: " + error.message, 500));
    }
  },

  getCustomerById: async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError("Invalid customer ID format.", 400));
      }
      let query = Customer.findById(req.params.id);
      if (req.query.populateOrders === 'true') {
        query = query.populate({ path: 'cOrders', options: { sort: { createdAt: -1 } } });
      }
      const customer = await query;
      if (!customer) return next(new AppError("Customer not found.", 404));
      res.status(200).json({ success: true, data: customer });
    } catch (error) {
      next(new AppError("Error fetching customer: " + error.message, 500));
    }
  },

  updateCustomer: async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError("Invalid customer ID format.", 400));
      }
      const { cName, cNIC, cPhone, cAddress, cImgUrl } = req.body;
      const updateData = {};
      if (cName) updateData.cName = cName;
      if (cNIC) updateData.cNIC = cNIC;
      if (cPhone) updateData.cPhone = cPhone;
      if (cAddress) updateData.cAddress = cAddress;
      if (cImgUrl !== undefined) updateData.cImgUrl = cImgUrl;

      if (cNIC || cPhone) {
        const queryConditions = [];
        if (cNIC) queryConditions.push({ cNIC });
        if (cPhone) queryConditions.push({ cPhone });
        const existingCustomer = await Customer.findOne({ _id: { $ne: req.params.id }, $or: queryConditions });
        if (existingCustomer) {
          return next(new AppError("NIC or phone number already used by another customer.", 400));
        }
      }

      const customer = await Customer.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true, runValidators: true });
      if (!customer) return next(new AppError("Customer not found.", 404));
      res.status(200).json({ success: true, message: "Customer updated successfully.", data: customer });
    } catch (error) {
      if (error.name === 'ValidationError') return next(new AppError(error.message, 400));
      if (error.code === 11000) return next(new AppError(`Duplicate value for ${Object.keys(error.keyValue)[0]}.`, 400));
      next(new AppError("Error updating customer: " + error.message, 500));
    }
  },

  deleteCustomer: async (req, res, next) => {
    // Note: Deleting a customer with orders can have implications.
    // Consider business logic for handling associated orders (e.g., disassociate, archive, prevent deletion).
    // The current implementation simply deletes the customer.
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError("Invalid customer ID format.", 400));
      }
      const customer = await Customer.findById(req.params.id);
      if (!customer) return next(new AppError("Customer not found.", 404));

      // Example: Prevent deletion if outstanding balance exists
      // if (customer.cOutstandingAmt > 0) {
      //    return next(new AppError("Cannot delete customer with an outstanding balance.", 400));
      // }
      // Example: Disassociate orders (set order.customer to null)
      // await Order.updateMany({ _id: { $in: customer.cOrders } }, { $unset: { customer: "" } });

      await Customer.findByIdAndDelete(req.params.id);
      res.status(200).json({ success: true, message: "Customer deleted successfully." });
    } catch (error) {
      next(new AppError("Error deleting customer: " + error.message, 500));
    }
  },

  getCustomerOrders: async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError("Invalid customer ID format.", 400));
      }
      const customer = await Customer.findById(req.params.id).populate({
        path: 'cOrders',
        populate: { path: 'order_items.item', select: 'product_name retail_price' }, // Populate item details in orders
        options: { sort: { createdAt: -1 } }
      });
      if (!customer) return next(new AppError("Customer not found.", 404));
      res.status(200).json({ success: true, count: customer.cOrders.length, data: customer.cOrders });
    } catch (error) {
      next(new AppError("Error fetching customer orders: " + error.message, 500));
    }
  },

  addOrderToCustomer: async (req, res, next) => {
    // This route creates a NEW order and links it to the customer.
    // It's essentially an alias for POST /api/v1/orders with customer pre-filled.
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Invalid customer ID format.", 400));
      }
      const customer = await Customer.findById(req.params.id).session(session);
      if (!customer) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Customer not found.", 404));
      }

      const orderData = { ...req.body, customer: customer._id };
      const newOrder = new Order(orderData);
      await newOrder.save({ session });

      customer.cOrders.push(newOrder._id);
      // Customer balance (cOutstandingAmt) should be updated based on the new order's outstanding amount.
      // The Order model's pre-save hook calculates order_outstanding_amount.
      customer.cOutstandingAmt += newOrder.order_outstanding_amount;
      await customer.save({ session });

      await session.commitTransaction();
      res.status(201).json({ success: true, message: "Order created and added to customer successfully.", data: newOrder });
    } catch (error) {
      await session.abortTransaction();
      if (error.name === 'ValidationError') return next(new AppError(error.message, 400));
      if (error.code === 11000) return next(new AppError(`Duplicate invoice ID.`, 400));
      next(new AppError("Error adding order to customer: " + error.message, 500));
    } finally {
      session.endSession();
    }
  },

  updateCustomerOrder: async (req, res, next) => {
    // This route is problematic as it implies updating a top-level Order through the Customer.
    // Ideally, orders should be updated via PUT /api/v1/orders/:orderId.
    // If this route is kept, it should ensure the order being updated actually belongs to the customer.
    // For now, focusing on error handling.
    // Critical: This function needs to ensure customer balances are correctly updated if order.total_price changes.
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { id: customerId, orderId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(orderId)) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Invalid customer or order ID format.", 400));
      }

      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Customer not found.", 404));
      }

      const order = await Order.findOne({ _id: orderId, customer: customerId }).session(session);
      if (!order) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Order not found for this customer.", 404));
      }

      const oldOrderOutstanding = order.order_outstanding_amount;

      Object.assign(order, req.body); // Apply updates
      await order.save({ session }); // Triggers Order model's pre-save hooks

      const newOrderOutstanding = order.order_outstanding_amount;
      const changeInOutstanding = newOrderOutstanding - oldOrderOutstanding;
      customer.cOutstandingAmt += changeInOutstanding;
      if (customer.cOutstandingAmt < 0) customer.cOutstandingAmt = 0;

      await customer.save({ session });

      await session.commitTransaction();
      res.status(200).json({ success: true, message: "Order updated successfully.", data: order });
    } catch (error) {
      await session.abortTransaction();
      if (error.name === 'ValidationError') return next(new AppError(error.message, 400));
      next(new AppError("Error updating customer order: " + error.message, 500));
    } finally {
      session.endSession();
    }
  },

  deleteCustomerOrder: async (req, res, next) => {
    // This should ideally only remove the *reference* from the customer.
    // Deleting the Order document itself should be done via DELETE /api/v1/orders/:orderId.
    // If this route *is* meant to delete the actual Order, ensure implications are handled.
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { id: customerId, orderId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(orderId)) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Invalid customer or order ID format.", 400));
      }

      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Customer not found.", 404));
      }

      const orderToRemove = await Order.findOne({ _id: orderId, customer: customerId }).session(session);
      if (!orderToRemove) {
        // If just removing reference, check if it exists in cOrders array.
        const orderIndex = customer.cOrders.findIndex(oId => oId.toString() === orderId);
        if (orderIndex === -1) {
          await session.abortTransaction(); session.endSession();
          return next(new AppError("Order reference not found for this customer.", 404));
        }
        customer.cOrders.splice(orderIndex, 1);
        // Note: Customer balance (cOutstandingAmt) is NOT adjusted here if only reference is removed
        // because the order still exists with its outstanding amount.
      } else {
        // If we are deleting the order itself:
        customer.cOutstandingAmt -= orderToRemove.order_outstanding_amount;
        if (customer.cOutstandingAmt < 0) customer.cOutstandingAmt = 0;
        customer.cOrders = customer.cOrders.filter(oId => oId.toString() !== orderId);
        await Order.findByIdAndDelete(orderId, { session });
      }

      await customer.save({ session });
      await session.commitTransaction();

      res.status(200).json({ success: true, message: "Order processed for customer successfully." });
    } catch (error) {
      await session.abortTransaction();
      next(new AppError("Error processing order for customer: " + error.message, 500));
    } finally {
      session.endSession();
    }
  },

  updateCustomerPayment: async (req, res, next) => {
    // This route handles a general payment to a customer's account, NOT tied to a specific order.
    // For payments against specific orders, use POST /api/v1/orders/:orderId/pay
    // This function might be used for account credits or pre-payments not yet allocated.
    // Its impact on cOutstandingAmt should be carefully considered. If cOutstandingAmt
    // is strictly a sum of order_outstanding_amounts, this direct adjustment can cause drift.
    // It's often better to apply payments to oldest outstanding orders first.
    // For now, it directly adjusts balances as per previous logic.
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError("Invalid customer ID format.", 400));
      }
      const { paymentAmount } = req.body;
      if (paymentAmount === undefined || isNaN(paymentAmount) || Number(paymentAmount) <= 0) {
        return next(new AppError("Valid positive payment amount is required.", 400));
      }

      const customer = await Customer.findById(req.params.id);
      if (!customer) return next(new AppError("Customer not found.", 404));

      customer.cPaidAmount += Number(paymentAmount);
      customer.cOutstandingAmt -= Number(paymentAmount);
      if (customer.cOutstandingAmt < 0) customer.cOutstandingAmt = 0;
      await customer.save();

      res.status(200).json({
        success: true,
        message: "Customer payment updated successfully.",
        data: { cPaidAmount: customer.cPaidAmount, cOutstandingAmt: customer.cOutstandingAmt },
      });
    } catch (error) {
      next(new AppError("Error updating customer payment: " + error.message, 500));
    }
  },

  searchCustomers: async (req, res, next) => {
    try {
      const { query } = req.query;
      if (!query) return next(new AppError("Search query is required.", 400));
      const customers = await Customer.find({
        $or: [
          { cName: { $regex: query, $options: "i" } },
          { cNIC: { $regex: query, $options: "i" } },
          { cPhone: { $regex: query, $options: "i" } },
        ],
      }).select("-cOrders").sort({ cName: 1 });
      res.status(200).json({ success: true, count: customers.length, data: customers });
    } catch (error) {
      next(new AppError("Error searching customers: " + error.message, 500));
    }
  },

  getCustomersWithOutstandingBalance: async (req, res, next) => {
    try {
      const customers = await Customer.find({ cOutstandingAmt: { $gt: 0 } })
        .select("-cOrders") // Exclude cOrders details from this list
        .sort({ cOutstandingAmt: -1 });
      res.status(200).json({ success: true, count: customers.length, data: customers });
    } catch (error) {
      next(new AppError("Error fetching customers with outstanding balance: " + error.message, 500));
    }
  },
};

module.exports = CustomerController;