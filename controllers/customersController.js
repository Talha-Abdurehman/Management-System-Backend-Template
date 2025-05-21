const Customer = require("../models/Customers.model");

/**
 * Customer Controller
 * Provides methods for managing customer data and their embedded orders
 */
const CustomerController = {
  /**
   * Create a new customer
   * @route POST /api/customers
   */
  createCustomer: async (req, res) => {
    try {
      const { cName, cNIC, cPhone, cAddress, cPaidAmount, cOutstandingAmt } =
        req.body;

      // Check for existing customer with same NIC or phone
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
        orders: [],
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
      const customers = await Customer.find().select("-orders");

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
   * Get customer by ID
   * @route GET /api/customers/:id
   */
  getCustomerById: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);

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
   * Update customer
   * @route PUT /api/customers/:id
   */
  updateCustomer: async (req, res) => {
    try {
      const { cName, cNIC, cPhone, cAddress, cPaidAmount, cOutstandingAmt } =
        req.body;

      // Check for existing customer with same NIC or phone (excluding current customer)
      if (cNIC || cPhone) {
        const query = {
          _id: { $ne: req.params.id },
          $or: [],
        };

        if (cNIC) query.$or.push({ cNIC });
        if (cPhone) query.$or.push({ cPhone });

        if (query.$or.length > 0) {
          const existingCustomer = await Customer.findOne(query);

          if (existingCustomer) {
            return res.status(400).json({
              success: false,
              message: "NIC or phone number already used by another customer",
            });
          }
        }
      }

      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        {
          cName,
          cNIC,
          cPhone,
          cAddress,
          cPaidAmount,
          cOutstandingAmt,
        },
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
      const customer = await Customer.findByIdAndDelete(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

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
   * Get customer's orders
   * @route GET /api/customers/:id/orders
   */
  getCustomerOrders: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id).select("orders");

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      res.status(200).json({
        success: true,
        count: customer.orders.length,
        data: customer.orders,
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
   * Add order to customer
   * @route POST /api/customers/:id/orders
   */
  addOrderToCustomer: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      const newOrder = req.body;

      // Add order to customer's orders array
      customer.orders.push(newOrder);

      // Update outstanding amount based on order total
      if (newOrder.total_price > 0) {
        customer.cOutstandingAmt += newOrder.total_price;
      }

      await customer.save();

      res.status(200).json({
        success: true,
        message: "Order added to customer successfully",
        data: customer.orders[customer.orders.length - 1],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error adding order to customer",
        error: error.message,
      });
    }
  },

  /**
   * Update customer order
   * @route PUT /api/customers/:id/orders/:orderId
   */
  updateCustomerOrder: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      const orderIndex = customer.orders.findIndex(
        (order) => order._id.toString() === req.params.orderId
      );

      if (orderIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Order not found for this customer",
        });
      }

      // Get old order total for adjusting outstanding amount
      const oldOrderTotal = customer.orders[orderIndex].total_price || 0;

      // Update order fields
      const updatedOrder = req.body;
      Object.keys(updatedOrder).forEach((key) => {
        customer.orders[orderIndex][key] = updatedOrder[key];
      });

      // Adjust outstanding amount based on order total difference
      if (customer.orders[orderIndex].total_price !== oldOrderTotal) {
        customer.cOutstandingAmt =
          customer.cOutstandingAmt -
          oldOrderTotal +
          customer.orders[orderIndex].total_price;
      }

      await customer.save();

      res.status(200).json({
        success: true,
        message: "Order updated successfully",
        data: customer.orders[orderIndex],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating customer order",
        error: error.message,
      });
    }
  },

  /**
   * Delete customer order
   * @route DELETE /api/customers/:id/orders/:orderId
   */
  deleteCustomerOrder: async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      const orderIndex = customer.orders.findIndex(
        (order) => order._id.toString() === req.params.orderId
      );

      if (orderIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Order not found for this customer",
        });
      }

      // Adjust outstanding amount
      const orderTotal = customer.orders[orderIndex].total_price || 0;
      customer.cOutstandingAmt -= orderTotal;

      // Remove order
      customer.orders.splice(orderIndex, 1);

      await customer.save();

      res.status(200).json({
        success: true,
        message: "Order removed from customer successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error removing order from customer",
        error: error.message,
      });
    }
  },

  /**
   * Update customer payment
   * @route PUT /api/customers/:id/payment
   */
  updateCustomerPayment: async (req, res) => {
    try {
      const { paymentAmount } = req.body;

      if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid payment amount is required",
        });
      }

      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      // Update paid and outstanding amounts
      customer.cPaidAmount += Number(paymentAmount);
      customer.cOutstandingAmt = Math.max(
        0,
        customer.cOutstandingAmt - Number(paymentAmount)
      );

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
      }).select("-orders");

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
        .select("-orders")
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
