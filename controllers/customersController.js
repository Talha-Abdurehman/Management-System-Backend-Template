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

      if (!cName || !cPhone) {
        return next(new AppError("Customer Name and Phone are required.", 400));
      }

      // Check Phone uniqueness (always)
      const existingPhone = await Customer.findOne({ cPhone });
      if (existingPhone) {
        return next(new AppError(`Customer with phone number '${cPhone}' already exists.`, 400));
      }

      // Check CNIC uniqueness (if provided)
      const trimmedCNIC = cNIC ? cNIC.trim() : null;
      if (trimmedCNIC && trimmedCNIC !== "") {
        const existingCnic = await Customer.findOne({ cNIC: trimmedCNIC });
        if (existingCnic) {
          return next(new AppError(`Customer with CNIC '${trimmedCNIC}' already exists.`, 400));
        }
      }

      const customerToSave = {
        cName,
        cPhone,
        cAddress,
        cPaidAmount: 0,
        cOutstandingAmt: 0,
        cOrders: [],
        cImgUrl: cImgUrl || null,
      };

      if (trimmedCNIC) { // Only add cNIC to the object if it has a value
        customerToSave.cNIC = trimmedCNIC;
      }

      const customer = new Customer(customerToSave);
      await customer.save();
      res.status(201).json({ success: true, message: "Customer created successfully", data: customer });
    } catch (error) {
      if (error.name === 'ValidationError') return next(new AppError(error.message, 400));
      if (error.code === 11000) {
        let field = Object.keys(error.keyValue)[0];
        let value = error.keyValue[field];
        return next(new AppError(`A customer with this ${field} ('${value}') already exists.`, 400));
      }
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
      if (cNIC !== undefined) {
        updateData.cNIC = (cNIC && cNIC.trim() !== "") ? cNIC.trim() : null;
      }
      if (cPhone) updateData.cPhone = cPhone;
      if (cAddress) updateData.cAddress = cAddress;
      if (cImgUrl !== undefined) updateData.cImgUrl = cImgUrl;


      if (updateData.cNIC) { // If cNIC is being set to a non-null, non-empty value
        const existingCnic = await Customer.findOne({ cNIC: updateData.cNIC, _id: { $ne: req.params.id } });
        if (existingCnic) {
          return next(new AppError(`CNIC '${updateData.cNIC}' already used by another customer.`, 400));
        }
      }
      if (updateData.cPhone) { // If cPhone is being updated
        const existingPhone = await Customer.findOne({ cPhone: updateData.cPhone, _id: { $ne: req.params.id } });
        if (existingPhone) {
          return next(new AppError(`Phone '${updateData.cPhone}' already used by another customer.`, 400));
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const customerId = req.params.id;
      const { deleteOrders = 'false' } = req.query;

      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Invalid customer ID format.", 400));
      }

      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Customer not found.", 404));
      }

      if (customer.cOutstandingAmt > 0) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Cannot delete customer with an outstanding balance. Please clear the balance first.", 400));
      }

      let message;

      if (deleteOrders === 'true') {
        await Order.deleteMany({ customer: customer._id }, { session });
        await Customer.findByIdAndDelete(customerId, { session });
        message = "Customer and all associated orders deleted successfully.";
      } else {
        await Order.updateMany({ customer: customer._id }, { $set: { customer: null } }, { session });
        await Customer.findByIdAndDelete(customerId, { session });
        message = "Customer profile deleted successfully. Order history has been retained but disassociated.";
      }

      await session.commitTransaction();
      res.status(200).json({ success: true, message: message });
    } catch (error) {
      await session.abortTransaction();
      next(new AppError("Error deleting customer: " + error.message, 500));
    } finally {
      session.endSession();
    }
  },

  getCustomerOrders: async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError("Invalid customer ID format.", 400));
      }
      const customer = await Customer.findById(req.params.id).populate({
        path: 'cOrders',
        populate: { path: 'order_items.item', select: 'product_name retail_price' },
        options: { sort: { createdAt: -1 } }
      });
      if (!customer) return next(new AppError("Customer not found.", 404));
      res.status(200).json({ success: true, count: customer.cOrders.length, data: customer.cOrders });
    } catch (error) {
      next(new AppError("Error fetching customer orders: " + error.message, 500));
    }
  },

  addOrderToCustomer: async (req, res, next) => {
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
      await newOrder.save({ session }); // This will trigger Order's post-save hook

      customer.cOrders.push(newOrder._id);
      await customer.save({ session }); // Save customer to update cOrders array
      // The balance recalculation is handled by Order's post-save hook.

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

      Object.assign(order, req.body);
      await order.save({ session }); // This will trigger Order's post-save hook, which updates customer balance

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
        const orderIndex = customer.cOrders.findIndex(oId => oId.toString() === orderId);
        if (orderIndex === -1) {
          await session.abortTransaction(); session.endSession();
          return next(new AppError("Order reference not found for this customer.", 404));
        }
        customer.cOrders.splice(orderIndex, 1);
      } else {
        customer.cOrders = customer.cOrders.filter(oId => oId.toString() !== orderId);
        await Order.findByIdAndDelete(orderId, { session }); // This will trigger Order's post-delete hook
      }

      await customer.save({ session }); // Save customer to update cOrders array
      // Balance recalculation is handled by Order's post-delete hook.
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Invalid customer ID format.", 400));
      }
      const { paymentAmount } = req.body;
      if (paymentAmount === undefined || isNaN(paymentAmount) || Number(paymentAmount) <= 0) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Valid positive payment amount is required.", 400));
      }

      const customer = await Customer.findById(req.params.id).session(session);
      if (!customer) {
        await session.abortTransaction(); session.endSession();
        return next(new AppError("Customer not found.", 404));
      }

      customer.cPaidAmount += Number(paymentAmount);
      customer.cOutstandingAmt -= Number(paymentAmount);
      if (customer.cOutstandingAmt < 0) customer.cOutstandingAmt = 0;

      await customer.save({ session }); // This will trigger customer's pre-save if any, and save.
      // Recalculate balances might be called here if needed, or rely on it being generally correct.
      // For general payments, this direct adjustment is usually the intent.

      await session.commitTransaction();
      res.status(200).json({
        success: true,
        message: "Customer payment updated successfully.",
        data: { cPaidAmount: customer.cPaidAmount, cOutstandingAmt: customer.cOutstandingAmt },
      });
    } catch (error) {
      await session.abortTransaction();
      next(new AppError("Error updating customer payment: " + error.message, 500));
    } finally {
      session.endSession();
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
        .select("-cOrders")
        .sort({ cOutstandingAmt: -1 });
      res.status(200).json({ success: true, count: customers.length, data: customers });
    } catch (error) {
      next(new AppError("Error fetching customers with outstanding balance: " + error.message, 500));
    }
  },

  getCustomersWithNoOutstandingBalance: async (req, res, next) => {
    try {
      const customers = await Customer.find({ cOutstandingAmt: { $lte: 0 } })
        .select("-cOrders")
        .sort({ updatedAt: -1 }); // Sort by most recently updated (e.g., paid off)
      res.status(200).json({ success: true, count: customers.length, data: customers });
    } catch (error) {
      next(new AppError("Error fetching customers with no outstanding balance: " + error.message, 500));
    }
  },
};

module.exports = CustomerController;