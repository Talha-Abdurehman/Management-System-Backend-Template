const Customer = require("../models/Customers.model");
const Order = require("../models/Orders.model"); // Added Order model
const mongoose = require("mongoose");

/**
 * Customer Controller
 * Provides methods for managing customer data and their referenced orders
 */
const CustomerController = {
  /**
   * Create a new customer
   * @route POST /api/customers
   */
  createCustomer: async (req, res) => {
    try {
      const { cName, cNIC, cPhone, cAddress, cPaidAmount, cOutstandingAmt, cImgUrl } =
        req.body;

      const existingCustomer = await Customer.findOne({
        $or: [{ cNIC }, { cPhone }],
      });

      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          message: "Customer with this NIC or phone number already exists",
        });
      }

      const customer = new Customer({
        cName,
        cNIC,
        cPhone,
        cAddress,
        cPaidAmount: cPaidAmount || 0,
        cOutstandingAmt: cOutstandingAmt || 0,
        cOrders: [],
        cImgUrl: cImgUrl || null,
      });

      await customer.save();

      res.status(201).json({
        success: true,
        message: "Customer created successfully",
        data: customer,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error creating customer",
        error: error.message,
      });
    }
  },

  /**
   * Get all customers
   * @route GET /api/customers
   */
  getAllCustomers: async (req, res) => {
    try {
      const customers = await Customer.find().select("-cOrders"); // Exclude cOrders details for listing

      res.status(200).json({
        success: true,
        count: customers.length,
        data: customers,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching customers",
        error: error.message,
      });
    }
  },

  /**
   * Get customer by ID, optionally populating cOrders
   * @route GET /api/customers/:id
   */
  getCustomerById: async (req, res) => {
    try {
      let query = Customer.findById(req.params.id);
      if (req.query.populateOrders === 'true') {
        query = query.populate('cOrders');
      }
      const customer = await query;


      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      res.status(200).json({
        success: true,
        data: customer,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching customer",
        error: error.message,
      });
    }
  },

  /**
   * Update customer basic details
   * @route PUT /api/customers/:id
   */
  updateCustomer: async (req, res) => {
    try {
      const { cName, cNIC, cPhone, cAddress, cImgUrl } = req.body; // Payment amounts handled by separate routes

      if (cNIC || cPhone) {
        const queryConditions = [];
        if (cNIC) queryConditions.push({ cNIC });
        if (cPhone) queryConditions.push({ cPhone });

        const existingCustomer = await Customer.findOne({
          _id: { $ne: req.params.id },
          $or: queryConditions,
        });

        if (existingCustomer) {
          return res.status(400).json({
            success: false,
            message: "NIC or phone number already used by another customer",
          });
        }
      }
      const updateData = { cName, cNIC, cPhone, cAddress };
      if (cImgUrl !== undefined) updateData.cImgUrl = cImgUrl;


      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Customer updated successfully",
        data: customer,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating customer",
        error: error.message,
      });
    }
  },

  /**
   * Delete customer
   * @route DELETE /api/customers/:id
   */
  deleteCustomer: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      // Consider implications: what happens to their orders?
      // Option 1: Prevent deletion if orders exist.
      // Option 2: Delete/archive orders (complex).
      // Option 3: Disassociate orders (set order.customer to null, if schema allows).
      // For now, simple deletion. Add business logic as needed.
      if (customer.cOrders && customer.cOrders.length > 0) {
        // Optionally, set customer field on related orders to null or handle otherwise
        // await Order.updateMany({ _id: { $in: customer.cOrders } }, { $unset: { customer: "" } });
      }

      await Customer.findByIdAndDelete(req.params.id);


      res.status(200).json({
        success: true,
        message: "Customer deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting customer",
        error: error.message,
      });
    }
  },

  /**
   * Get customer's orders (list of referenced order documents)
   * @route GET /api/customers/:id/orders
   */
  getCustomerOrders: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id).populate({
        path: 'cOrders',
        options: { sort: { createdAt: -1 } } // Example: sort orders by creation date
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      res.status(200).json({
        success: true,
        count: customer.cOrders.length,
        data: customer.cOrders,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching customer orders",
        error: error.message,
      });
    }
  },

  /**
   * Add order FOR a customer (creates a new Order document and links it)
   * @route POST /api/customers/:id/orders
   */
  addOrderToCustomer: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const customer = await Customer.findById(req.params.id).session(session);

      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      const orderData = req.body;
      orderData.customer = customer._id; // Link order to this customer

      const newOrder = new Order(orderData);
      await newOrder.save({ session });

      customer.cOrders.push(newOrder._id);
      // The Order model's pre-save hook and addPayment method will handle financial updates.
      // For new orders, outstanding amount will be total_price, paid will be 0.
      // The customer's balance recalculation should occur upon order save/payment.
      // We can explicitly call recalculateBalances here if needed, or ensure Order model handles it.
      // For simplicity, let's assume the Order.save() triggers recalculation of order.outstanding_amount
      // and customer.recalculateBalances() (if such a method is robustly implemented)
      // or rely on the Order.addPayment() to update customer balances.

      // For now, let's call a method to sync customer balance after adding order.
      customer.cOutstandingAmt += newOrder.total_price; // Direct update, ensure this matches Order model logic.

      await customer.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(201).json({ // Changed to 201 for resource creation
        success: true,
        message: "Order created and added to customer successfully",
        data: newOrder,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res.status(500).json({
        success: false,
        message: "Error adding order to customer",
        error: error.message,
      });
    }
  },


  /**
   * Update a specific order linked to a customer.
   * This route should ideally redirect or be handled by orderController.
   * For now, it updates the referenced Order document.
   * @route PUT /api/customers/:id/orders/:orderId
   */
  updateCustomerOrder: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const customer = await Customer.findById(req.params.id).session(session);
      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Customer not found" });
      }

      const orderExistsInCustomer = customer.cOrders.some(id => id.toString() === req.params.orderId);
      if (!orderExistsInCustomer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Order not associated with this customer" });
      }

      const order = await Order.findById(req.params.orderId).session(session);
      if (!order) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      const oldOrderTotal = order.total_price || 0;

      // Update order fields from req.body
      Object.assign(order, req.body);
      // The Order model's pre-save hooks should recalculate totals if order_items are changed.
      await order.save({ session });

      // Adjust customer's outstanding balance if order total changed
      const newOrderTotal = order.total_price || 0;
      if (newOrderTotal !== oldOrderTotal) {
        customer.cOutstandingAmt = (customer.cOutstandingAmt - oldOrderTotal) + newOrderTotal;
        await customer.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: "Order updated successfully",
        data: order,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res.status(500).json({
        success: false,
        message: "Error updating customer order",
        error: error.message,
      });
    }
  },


  /**
   * Remove an order reference from a customer. Does not delete the Order document itself.
   * To delete an Order document, use the orderController.
   * @route DELETE /api/customers/:id/orders/:orderId
   */
  deleteCustomerOrder: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const customer = await Customer.findById(req.params.id).session(session);

      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      const orderIdToRemove = req.params.orderId;
      const initialOrderCount = customer.cOrders.length;

      // Fetch the order to adjust customer's balance
      const orderToRemove = await Order.findById(orderIdToRemove).session(session);
      if (orderToRemove && customer.cOrders.some(id => id.toString() === orderIdToRemove)) {
        customer.cOutstandingAmt -= (orderToRemove.order_outstanding_amount || 0);
        // It's generally better to let Customer.recalculateBalances() handle this if it exists and is reliable.
        // Or ensure that deleting an order also triggers an update on the customer's total.
      }


      customer.cOrders = customer.cOrders.filter(
        (orderId) => orderId.toString() !== orderIdToRemove
      );

      if (customer.cOrders.length === initialOrderCount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "Order reference not found for this customer",
        });
      }
      if (customer.cOutstandingAmt < 0) customer.cOutstandingAmt = 0; // Ensure not negative

      await customer.save({ session });
      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: "Order reference removed from customer successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res.status(500).json({
        success: false,
        message: "Error removing order reference from customer",
        error: error.message,
      });
    }
  },

  /**
   * Update customer payment (general payment, not tied to specific order directly via this route)
   * It's generally better to make payments against specific orders.
   * This method updates cPaidAmount and cOutstandingAmt.
   * @route PUT /api/customers/:id/payment
   */
  updateCustomerPayment: async (req, res) => {
    try {
      const { paymentAmount } = req.body;

      if (paymentAmount === undefined || isNaN(paymentAmount) || Number(paymentAmount) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid positive payment amount is required",
        });
      }

      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      customer.cPaidAmount += Number(paymentAmount);
      customer.cOutstandingAmt -= Number(paymentAmount);
      if (customer.cOutstandingAmt < 0) {
        customer.cOutstandingAmt = 0; // Cannot be negative
      }


      await customer.save();

      res.status(200).json({
        success: true,
        message: "Customer payment updated successfully",
        data: {
          cPaidAmount: customer.cPaidAmount,
          cOutstandingAmt: customer.cOutstandingAmt,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating customer payment",
        error: error.message,
      });
    }
  },

  /**
   * Search customers by name, NIC, or phone
   * @route GET /api/customers/search
   */
  searchCustomers: async (req, res) => {
    try {
      const { query } = req.query;

      if (!query) {
        return res.status(400).json({
          success: false,
          message: "Search query is required",
        });
      }

      const customers = await Customer.find({
        $or: [
          { cName: { $regex: query, $options: "i" } },
          { cNIC: { $regex: query, $options: "i" } },
          { cPhone: { $regex: query, $options: "i" } },
        ],
      }).select("-cOrders");

      res.status(200).json({
        success: true,
        count: customers.length,
        data: customers,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error searching customers",
        error: error.message,
      });
    }
  },

  /**
   * Get customers with outstanding balance
   * @route GET /api/customers/outstanding
   */
  getCustomersWithOutstandingBalance: async (req, res) => {
    try {
      const customers = await Customer.find({
        cOutstandingAmt: { $gt: 0 },
      })
        .select("-cOrders")
        .sort({ cOutstandingAmt: -1 });

      res.status(200).json({
        success: true,
        count: customers.length,
        data: customers,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching customers with outstanding balance",
        error: error.message,
      });
    }
  },
};

module.exports = CustomerController;