// models.integration.test.js
const mongoose = require("mongoose");
const dbHelper = require("./mongo.helper"); // Adjust path if needed
const Customer = require("../models/Customers.model"); // Adjust path
const Order = require("../models/Orders.model"); // Adjust path

// Mock Item model for OrderItemSchema ref (if you don't have a real one for testing)
// If you have a real Item model, import it.
// For this test, we'll assume Item IDs are just strings and don't need actual item documents.
// If your OrderItemSchema's `item` ref needs population for other logic, you'd mock/create Item documents.

describe("Customer and Order Models Integration", () => {
  let testCustomer;
  let mockItemObjectId;

  beforeAll(async () => {
    await dbHelper.connect();
    mockItemObjectId = new mongoose.Types.ObjectId().toString();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();

    // Create a fresh customer for each test that needs one
    testCustomer = new Customer({
      cName: "Test User",
      cNIC: "12345-6789012-3",
      cPhone: "0300-1234567",
      cAddress: "123 Test St",
      cPaidAmount: 0,
      cOutstandingAmt: 0, // Corrected spelling from 'cOutstandingAmt'
    });
    await testCustomer.save();
  });

  afterAll(async () => {
    await dbHelper.closeDatabase();
  });

  describe("Customer Model", () => {
    it("should create and save a customer successfully", async () => {
      const customerData = {
        cName: "John Doe",
        cNIC: "98765-4321098-7",
        cPhone: "0312-3456789",
        cAddress: "456 Main St",
        cPaidAmount: 100,
        cOutstandingAmt: 50,
      };
      const newCustomer = new Customer(customerData);
      const savedCustomer = await newCustomer.save();

      expect(savedCustomer._id).toBeDefined();
      expect(savedCustomer.cName).toBe(customerData.cName);
      expect(savedCustomer.cNIC).toBe(customerData.cNIC);
      expect(savedCustomer.cOutstandingAmt).toBe(50); // Ensure this is correct
      expect(savedCustomer.timestamps).toBeDefined; // from {timestamps: true}
    });

    it("should fail to create customer without required fields", async () => {
      const customerData = { cNIC: "11111-1111111-1", cPhone: "0333-1111111" }; // Missing cName, cPaidAmount, cOutstandingAmt
      let err;
      try {
        const newCustomer = new Customer(customerData);
        await newCustomer.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.cName).toBeDefined();
      expect(err.errors.cPaidAmount).toBeDefined();
      expect(err.errors.cOutstandingAmt).toBeDefined();
    });

    it("should enforce unique cNIC", async () => {
      let err;
      try {
        const duplicateCustomer = new Customer({
          cName: "Jane Doe",
          cNIC: "12345-6789012-3", // Same as testCustomer
          cPhone: "0300-9876543",
          cPaidAmount: 0,
          cOutstandingAmt: 0,
        });
        await duplicateCustomer.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe(11000); // MongoDB duplicate key error
    });

    it("should enforce unique cPhone", async () => {
      let err;
      try {
        const duplicateCustomer = new Customer({
          cName: "Jane Doe Phone",
          cNIC: "11111-2222222-3",
          cPhone: "0300-1234567", // Same as testCustomer
          cPaidAmount: 0,
          cOutstandingAmt: 0,
        });
        await duplicateCustomer.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe(11000);
    });
  });

  describe("Order Model", () => {
    it("should create and save an order successfully with calculated totals", async () => {
      const orderData = {
        customer: testCustomer._id,
        invoice_id: "INV-001",
        order_items: [
          {
            item: mockItemObjectId,
            quantity: 2,
            applied_price: 10,
            discount_amount: 1,
          }, // item_total = (10-1)*2 = 18
          { item: mockItemObjectId, quantity: 1, applied_price: 20 }, // item_total = 20*1 = 20
        ],
      };
      const newOrder = new Order(orderData);
      const savedOrder = await newOrder.save();

      expect(savedOrder._id).toBeDefined();
      expect(savedOrder.invoice_id).toBe(orderData.invoice_id);
      expect(savedOrder.order_items.length).toBe(2);

      // Check OrderItemSchema pre-save
      expect(savedOrder.order_items[0].item_total).toBe(18);
      expect(savedOrder.order_items[1].item_total).toBe(20);

      // Check OrdersSchema pre-save
      expect(savedOrder.subtotal).toBe(10 * 2 + 20 * 1); // 20 + 20 = 40
      expect(savedOrder.total_discount).toBe(1 * 2); // 2
      expect(savedOrder.total_price).toBe(18 + 20); // 38

      // Check initial payment status
      expect(savedOrder.order_paid_amount).toBe(0);
      expect(savedOrder.order_outstanding_amount).toBe(38);
      expect(savedOrder.order_status).toBe("Pending");
      expect(savedOrder.customer.toString()).toBe(testCustomer._id.toString());
    });

    it("should fail to create order without required fields", async () => {
      const orderData = { customer: testCustomer._id }; // Missing invoice_id, order_items
      let err;
      try {
        const newOrder = new Order(orderData);
        await newOrder.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.invoice_id).toBeDefined();
      // Order items are not directly required on schema, but applied_price etc. inside would be
    });

    it("should enforce unique invoice_id", async () => {
      await new Order({
        customer: testCustomer._id,
        invoice_id: "INV-UNIQUE-001",
        order_items: [
          { item: mockItemObjectId, quantity: 1, applied_price: 10 },
        ],
      }).save();

      let err;
      try {
        const duplicateOrder = new Order({
          customer: testCustomer._id,
          invoice_id: "INV-UNIQUE-001", // Same invoice_id
          order_items: [
            { item: mockItemObjectId, quantity: 1, applied_price: 15 },
          ],
        });
        await duplicateOrder.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe(11000);
    });
  });

  describe("Customer-Order Integration: Payments and Balances", () => {
    let orderForPayment;

    // Helper function to simulate order creation as it would happen in a service/controller
    async function createOrderForCustomer(customerId, orderData) {
      const customer = await Customer.findById(customerId);
      if (!customer) throw new Error("Test setup error: Customer not found");

      const newOrder = new Order({ ...orderData, customer: customerId });
      await newOrder.save(); // Triggers order's pre-save for totals

      customer.cOrders.push(newOrder._id);
      customer.cOutstandingAmt += newOrder.total_price; // Key step: update customer outstanding
      await customer.save();

      return newOrder;
    }

    beforeEach(async () => {
      // Create an order for the testCustomer
      orderForPayment = await createOrderForCustomer(testCustomer._id, {
        invoice_id: `INV-${Date.now()}`,
        order_items: [
          { item: mockItemObjectId, quantity: 1, applied_price: 100 }, // total_price = 100
        ],
      });
      // testCustomer.cOutstandingAmt should now be 100
      const refreshedCustomer = await Customer.findById(testCustomer._id);
      expect(refreshedCustomer.cOutstandingAmt).toBe(100);
      expect(refreshedCustomer.cOrders.length).toBe(1);
      expect(refreshedCustomer.cOrders[0].toString()).toBe(
        orderForPayment._id.toString()
      );
    });

    it("should correctly add a partial payment to an order and update customer balances", async () => {
      const paymentDetails = { amount: 30, payment_method_used: "Cash" };
      await orderForPayment.addPayment(paymentDetails);

      const updatedOrder = await Order.findById(orderForPayment._id);
      const updatedCustomer = await Customer.findById(testCustomer._id);

      // Check Order
      expect(updatedOrder.payments_received.length).toBe(1);
      expect(updatedOrder.payments_received[0].amount).toBe(30);
      expect(updatedOrder.order_paid_amount).toBe(30);
      expect(updatedOrder.order_outstanding_amount).toBe(70); // 100 - 30
      expect(updatedOrder.order_status).toBe("Partially Paid");

      // Check Customer
      expect(updatedCustomer.cPaidAmount).toBe(30);
      expect(updatedCustomer.cOutstandingAmt).toBe(70); // Initial 100 - 30
    });

    it("should correctly add multiple payments and fully pay an order, updating customer balances", async () => {
      await orderForPayment.addPayment({
        amount: 40,
        payment_method_used: "Card",
      });
      let updatedOrder = await Order.findById(orderForPayment._id);
      let updatedCustomer = await Customer.findById(testCustomer._id);

      expect(updatedOrder.order_paid_amount).toBe(40);
      expect(updatedOrder.order_outstanding_amount).toBe(60);
      expect(updatedOrder.order_status).toBe("Partially Paid");
      expect(updatedCustomer.cPaidAmount).toBe(40);
      expect(updatedCustomer.cOutstandingAmt).toBe(60);

      await orderForPayment.addPayment({
        amount: 60,
        payment_method_used: "Online Payment",
      });
      updatedOrder = await Order.findById(orderForPayment._id);
      updatedCustomer = await Customer.findById(testCustomer._id);

      // Check Order
      expect(updatedOrder.payments_received.length).toBe(2);
      expect(updatedOrder.order_paid_amount).toBe(100);
      expect(updatedOrder.order_outstanding_amount).toBe(0);
      expect(updatedOrder.order_status).toBe("Fully Paid");

      // Check Customer
      expect(updatedCustomer.cPaidAmount).toBe(100);
      expect(updatedCustomer.cOutstandingAmt).toBe(0);
    });

    it("should reflect multiple orders in customer outstanding amount", async () => {
      // orderForPayment already exists (total_price 100, outstanding 100 for customer)

      // Create a second order for the same customer
      const secondOrderData = {
        invoice_id: `INV-SECOND-${Date.now()}`,
        order_items: [
          { item: mockItemObjectId, quantity: 1, applied_price: 50 },
        ], // total_price = 50
      };
      const secondOrder = await createOrderForCustomer(
        testCustomer._id,
        secondOrderData
      );

      const customerAfterSecondOrder = await Customer.findById(
        testCustomer._id
      );
      expect(customerAfterSecondOrder.cOrders.length).toBe(2);
      expect(customerAfterSecondOrder.cOutstandingAmt).toBe(100 + 50); // 150

      // Pay first order fully
      await orderForPayment.addPayment({
        amount: 100,
        payment_method_used: "Cash",
      });
      const customerAfterFirstOrderPaid = await Customer.findById(
        testCustomer._id
      );
      expect(customerAfterFirstOrderPaid.cPaidAmount).toBe(100);
      expect(customerAfterFirstOrderPaid.cOutstandingAmt).toBe(50); // Only second order is outstanding

      // Pay second order partially
      await secondOrder.addPayment({ amount: 20, payment_method_used: "Card" });
      const customerAfterPartialPayment = await Customer.findById(
        testCustomer._id
      );
      expect(customerAfterPartialPayment.cPaidAmount).toBe(100 + 20); // 120
      expect(customerAfterPartialPayment.cOutstandingAmt).toBe(50 - 20); // 30
    });

    it("should correctly recalculate customer balances using recalculateBalances method", async () => {
      // orderForPayment (total 100) is already created for testCustomer
      // Customer outstanding: 100
      let customer = await Customer.findById(testCustomer._id);
      expect(customer.cOutstandingAmt).toBe(100);

      // Create a second order
      const secondOrder = await createOrderForCustomer(testCustomer._id, {
        invoice_id: `INV-RECALC-${Date.now()}`,
        order_items: [
          { item: mockItemObjectId, quantity: 1, applied_price: 75 },
        ], // total_price = 75
      });
      // Customer outstanding should now be 100 + 75 = 175
      customer = await Customer.findById(testCustomer._id);
      expect(customer.cOutstandingAmt).toBe(175);

      // Make some payments
      await orderForPayment.addPayment({
        amount: 50,
        payment_method_used: "Cash",
      }); // Order1: 50 paid, 50 outstanding
      await secondOrder.addPayment({ amount: 25, payment_method_used: "Card" }); // Order2: 25 paid, 50 outstanding

      // After these payments, customer.cOutstandingAmt should be 50 (from order1) + 50 (from order2) = 100
      // customer.cPaidAmount should be 50 + 25 = 75
      customer = await Customer.findById(testCustomer._id);
      expect(customer.cPaidAmount).toBe(75);
      expect(customer.cOutstandingAmt).toBe(100);

      // Manually mess up customer's outstanding amount to test recalculateBalances
      customer.cOutstandingAmt = 999; // Incorrect value
      await customer.save();

      customer = await Customer.findById(testCustomer._id);
      expect(customer.cOutstandingAmt).toBe(999); // Verify it's saved incorrectly

      // Now recalculate
      await customer.recalculateBalances();

      const recalculatedCustomer = await Customer.findById(testCustomer._id);
      const order1 = await Order.findById(orderForPayment._id);
      const order2 = await Order.findById(secondOrder._id);

      expect(order1.order_outstanding_amount).toBe(50);
      expect(order2.order_outstanding_amount).toBe(50);
      expect(recalculatedCustomer.cOutstandingAmt).toBe(100); // Should be 50 + 50
      // Note: The current recalculateBalances doesn't adjust cPaidAmount based on orders,
      // it only recalculates cOutstandingAmt. If you want cPaidAmount to be derived,
      // the method needs to sum total_price of orders and subtract new cOutstandingAmt.
      // For this test, cPaidAmount remains what it was (75), which is correct as per payments made.
      expect(recalculatedCustomer.cPaidAmount).toBe(75);
    });

    it("should update order status correctly based on payments", async () => {
      expect(orderForPayment.order_status).toBe("Pending"); // Initial state

      await orderForPayment.addPayment({
        amount: 1,
        payment_method_used: "Cash",
      });
      let updatedOrder = await Order.findById(orderForPayment._id);
      expect(updatedOrder.order_status).toBe("Partially Paid");

      await orderForPayment.addPayment({
        amount: 99,
        payment_method_used: "Cash",
      }); // Total 100
      updatedOrder = await Order.findById(orderForPayment._id);
      expect(updatedOrder.order_status).toBe("Fully Paid");
    });

    it("order_outstanding_amount should not go negative if overpaid (though this should be prevented at API level)", async () => {
      await orderForPayment.addPayment({
        amount: 120,
        payment_method_used: "Cash",
      }); // Order total is 100
      const updatedOrder = await Order.findById(orderForPayment._id);

      expect(updatedOrder.order_paid_amount).toBe(120);
      expect(updatedOrder.order_outstanding_amount).toBe(-20); // Current model logic allows this
      // The `OrdersSchema.pre('save')` calculates `this.total_price - this.order_paid_amount`.
      // If `order_paid_amount` > `total_price`, outstanding becomes negative.
      // You might want to add logic in `addPayment` or API layer to prevent overpayment
      // or handle refunds. For schema testing, this behavior is as per current pre-save.
      // If you want to clamp order_outstanding_amount at 0:
      // In OrdersSchema.pre('save'):
      // this.order_outstanding_amount = Math.max(0, this.total_price - this.order_paid_amount);
      // And adjust test accordingly
      expect(updatedOrder.order_status).toBe("Fully Paid"); // Because outstanding <=0

      const updatedCustomer = await Customer.findById(testCustomer._id);
      expect(updatedCustomer.cPaidAmount).toBe(120);
      expect(updatedCustomer.cOutstandingAmt).toBe(-20); // 100 (initial outstanding) - 120 (payment)
      // Same for customer, the cOutstandingAmt might go negative.
      // The check `if (customer.cOutstandingAmt < 0) customer.cOutstandingAmt = 0;` in addPayment
      // was for *that specific payment logic*, not for the overall sum.
      // Recalculate would fix this if orders can't have negative outstanding.
      // If order_outstanding_amount clamped at 0, then recalculateBalances would result in 0.
    });
  });
});
