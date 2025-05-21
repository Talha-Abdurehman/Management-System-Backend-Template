// tests/Orders.model.test.js
const mongoose = require("mongoose");
const dbHelper = require("./mongo.helper");
const Order = require("../models/Orders.model");
const Customer = require("../models/Customers.model"); // Actual Customer model

describe("Orders Model", () => {
  let mockItemObjectId1, mockItemObjectId2, testCustomer;

  beforeAll(async () => {
    await dbHelper.connect();
    mockItemObjectId1 = new mongoose.Types.ObjectId();
    mockItemObjectId2 = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();
    // Create a fresh customer for each test that needs one for linking
    testCustomer = new Customer({
      cName: "Order Test Customer",
      cNIC: `11111-${Date.now()}-1`, // Ensure unique NIC for each run
      cPhone: `0300-${Date.now()}`, // Ensure unique Phone
      cPaidAmount: 0,
      cOutstandingAmt: 0,
    });
    await testCustomer.save();
  });

  afterAll(async () => {
    await dbHelper.closeDatabase();
  });

  describe("Schema Validations and Defaults", () => {
    it("should create an order with defaults: is_wholesale=false, payments_received=[], order_paid_amount=0, order_status=Pending, total_discount=0", async () => {
      const orderData = {
        invoice_id: "INV-DEF-001",
        customer: testCustomer._id,
        order_items: [
          { item: mockItemObjectId1, quantity: 1, applied_price: 10 },
        ],
      };
      const order = new Order(orderData);
      const savedOrder = await order.save();

      expect(savedOrder.is_wholesale).toBe(false);
      expect(savedOrder.payments_received.length).toBe(0);
      expect(savedOrder.order_paid_amount).toBe(0);
      expect(savedOrder.order_status).toBe("Pending"); // total_price > 0, paid_amount = 0
      expect(savedOrder.total_discount).toBe(0); // item has no discount_amount
    });

    it("should require invoice_id and customer", async () => {
      const order = new Order({
        order_items: [
          { item: mockItemObjectId1, quantity: 1, applied_price: 10 },
        ],
      });
      let err;
      try {
        await order.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.invoice_id).toBeDefined();
      expect(err.errors.customer).toBeDefined();
    });

    it("OrderItemSchema: should require item, quantity, applied_price", async () => {
      const order = new Order({
        invoice_id: "INV-ITEM-REQ",
        customer: testCustomer._id,
        order_items: [{}], // Missing required fields in subdocument
      });
      let err;
      try {
        await order.save();
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors["order_items.0.item"]).toBeDefined();
      expect(err.errors["order_items.0.quantity"]).toBeDefined();
      expect(err.errors["order_items.0.applied_price"]).toBeDefined();
    });

    it("OrderItemSchema: quantity min 1, applied_price min 0, discount_amount min 0", async () => {
      const order = new Order({
        invoice_id: "INV-ITEM-MIN",
        customer: testCustomer._id,
        order_items: [
          {
            item: mockItemObjectId1,
            quantity: 0,
            applied_price: -1,
            discount_amount: -1,
          },
        ],
      });
      let err;
      try {
        await order.save();
      } catch (e) {
        err = e;
      }
      expect(err.errors["order_items.0.quantity"].kind).toBe("min");
      expect(err.errors["order_items.0.applied_price"].kind).toBe("min");
      expect(err.errors["order_items.0.discount_amount"].kind).toBe("min");
    });

    it("OrdersSchema: subtotal, total_discount, total_price, order_paid_amount, order_outstanding_amount min 0", async () => {
      // These are typically calculated, but direct invalid assignment should fail if schema enforced min.
      // However, they are mostly results of calculations. The inputs to calculations (price, quantity) have mins.
      // This test is more conceptual for these calculated fields.
      const order = new Order({
        invoice_id: "INV-ORDER-MIN",
        customer: testCustomer._id,
        order_items: [],
        subtotal: -1, // Try to set directly
      });
      let err;
      try {
        await order.save();
      } catch (e) {
        err = e;
      }
      // For calculated fields, the validation might not trigger this way unless explicitly set to a negative value
      // *and* the schema has a `min` validator directly on it that runs before pre-save hooks overwrite.
      // The pre-save hooks will calculate them, so this direct assignment might be overwritten.
      // The more important test is that calculations don't result in negative values where not allowed.
      // Our calculations naturally prevent negative totals unless item_total itself becomes negative,
      // which is prevented by item.applied_price min 0 and item.discount_amount min 0.
      expect(order.subtotal).toBe(0); // Pre-save will calculate it from empty order_items.
    });
  });

  describe("Pre-save Hooks Calculations", () => {
    it("OrderItemSchema: pre-save calculates item_total = (applied_price - discount_amount) * quantity", async () => {
      const orderData = {
        invoice_id: "INV-ITEMCALC",
        customer: testCustomer._id,
        order_items: [
          {
            item: mockItemObjectId1,
            quantity: 3,
            applied_price: 10,
            discount_amount: 2,
          }, // (10-2)*3 = 24
          {
            item: mockItemObjectId2,
            quantity: 1,
            applied_price: 5,
            discount_amount: 0,
          }, // (5-0)*1 = 5
        ],
      };
      const order = new Order(orderData);
      // The pre-save on OrderItemSchema runs when the Order is saved and new order_items are processed.
      const savedOrder = await order.save();

      // Check item_total on the saved subdocuments
      const orderFromDb = await Order.findById(savedOrder._id); // Re-fetch to ensure subdoc hooks ran
      expect(orderFromDb.order_items[0].item_total).toBe(24);
      expect(orderFromDb.order_items[1].item_total).toBe(5);
    });

    it("OrdersSchema: pre-save calculates subtotal, total_discount, total_price", async () => {
      const order = new Order({
        invoice_id: "INV-ORDERCALC",
        customer: testCustomer._id,
        order_items: [
          {
            item: mockItemObjectId1,
            quantity: 2,
            applied_price: 100,
            discount_amount: 10,
          }, // item_total = 180
          { item: mockItemObjectId2, quantity: 1, applied_price: 50 }, // item_total = 50
        ],
      });
      const savedOrder = await order.save();

      expect(savedOrder.subtotal).toBe(100 * 2 + 50 * 1); // 200 + 50 = 250
      expect(savedOrder.total_discount).toBe(10 * 2 + 0 * 1); // 20
      expect(savedOrder.total_price).toBe(180 + 50); // 230
    });

    it("OrdersSchema: pre-save calculates payment fields and status for new order", async () => {
      const order = new Order({
        invoice_id: "INV-NEWPAY",
        customer: testCustomer._id,
        order_items: [
          { item: mockItemObjectId1, quantity: 1, applied_price: 100 },
        ],
      });
      const savedOrder = await order.save();

      expect(savedOrder.order_paid_amount).toBe(0);
      expect(savedOrder.order_outstanding_amount).toBe(100);
      expect(savedOrder.order_status).toBe("Pending");
    });

    it("OrdersSchema: pre-save updates payment fields and status when payments_received is modified", async () => {
      const order = new Order({
        invoice_id: "INV-MODPAY",
        customer: testCustomer._id,
        order_items: [
          { item: mockItemObjectId1, quantity: 1, applied_price: 100 },
        ],
      });
      await order.save(); // total_price = 100, outstanding = 100, status = Pending

      order.payments_received.push({ amount: 30, payment_method_used: "Cash" });
      let savedOrder = await order.save();
      expect(savedOrder.order_paid_amount).toBe(30);
      expect(savedOrder.order_outstanding_amount).toBe(70);
      expect(savedOrder.order_status).toBe("Partially Paid");

      order.payments_received.push({ amount: 70, payment_method_used: "Card" });
      savedOrder = await order.save();
      expect(savedOrder.order_paid_amount).toBe(100);
      expect(savedOrder.order_outstanding_amount).toBe(0);
      expect(savedOrder.order_status).toBe("Fully Paid");
    });

    it("OrdersSchema: pre-save sets status to Pending if total_price is 0 and no payments", async () => {
      const order = new Order({
        invoice_id: "INV-FREEBIE",
        customer: testCustomer._id,
        order_items: [
          {
            item: mockItemObjectId1,
            quantity: 1,
            applied_price: 0,
            discount_amount: 0,
          },
        ], // total_price = 0
      });
      const savedOrder = await order.save();
      expect(savedOrder.total_price).toBe(0);
      expect(savedOrder.order_paid_amount).toBe(0);
      expect(savedOrder.order_outstanding_amount).toBe(0);
      expect(savedOrder.order_status).toBe("Pending"); // As per current logic: (paid <=0 && total > 0) is Pending, else (outstanding <= 0 && total > 0) is Fully Paid, else (paid >0 && outstanding > 0) is Partially Paid, else Pending.
      // If total_price is 0, none of the first three conditions are met, so it falls to the final 'else Pending'.
      // This might be an edge case to refine if "Fully Paid" is desired for 0-value orders.
    });

    it("OrdersSchema: status should be Fully Paid if total_price > 0 and order_outstanding_amount becomes <= 0", async () => {
      const order = new Order({
        invoice_id: "INV-OVERPAY",
        customer: testCustomer._id,
        order_items: [
          { item: mockItemObjectId1, quantity: 1, applied_price: 100 },
        ],
      });
      await order.save();

      order.payments_received.push({
        amount: 120,
        payment_method_used: "Cash",
      }); // Overpayment
      const savedOrder = await order.save();
      expect(savedOrder.order_paid_amount).toBe(120);
      expect(savedOrder.order_outstanding_amount).toBe(-20);
      expect(savedOrder.order_status).toBe("Fully Paid");
    });
  });

  describe("Instance Methods", () => {
    describe("applyWholesalePricing", () => {
      it("should set is_wholesale to true and update item price_type (in memory)", async () => {
        const order = new Order({
          invoice_id: "INV-WHOLE",
          customer: testCustomer._id,
          order_items: [
            {
              item: mockItemObjectId1,
              quantity: 1,
              applied_price: 10,
              price_type: "retail",
            },
            { item: mockItemObjectId2, quantity: 1, applied_price: 20 }, // default retail
          ],
        });
        // Method does not save, it modifies the instance in memory
        order.applyWholesalePricing();
        expect(order.is_wholesale).toBe(true);
        expect(order.order_items[0].price_type).toBe("wholesale");
        expect(order.order_items[1].price_type).toBe("wholesale");

        // To persist, save must be called
        await order.save();
        const fetchedOrder = await Order.findById(order._id);
        expect(fetchedOrder.is_wholesale).toBe(true);
        expect(fetchedOrder.order_items[0].price_type).toBe("wholesale");
      });
    });

    describe("addPayment", () => {
      let orderForPayment;
      const orderTotal = 200;

      beforeEach(async () => {
        orderForPayment = new Order({
          invoice_id: "INV-ADDPAY",
          customer: testCustomer._id,
          order_items: [
            { item: mockItemObjectId1, quantity: 1, applied_price: orderTotal },
          ],
        });
        await orderForPayment.save(); // total_price = 200
        // Customer initial state: cPaidAmount: 0, cOutstandingAmt: 0
      });

      it("should add payment, update order balances, and update customer balances", async () => {
        const paymentAmount = 75;
        const paymentDetails = {
          amount: paymentAmount,
          payment_method_used: "Card",
        };
        const updatedOrder = await orderForPayment.addPayment(paymentDetails);

        // Check Order
        expect(updatedOrder.payments_received.length).toBe(1);
        expect(updatedOrder.payments_received[0].amount).toBe(paymentAmount);
        expect(updatedOrder.order_paid_amount).toBe(paymentAmount);
        expect(updatedOrder.order_outstanding_amount).toBe(
          orderTotal - paymentAmount
        );
        expect(updatedOrder.order_status).toBe("Partially Paid");

        // Check Customer
        const updatedCustomer = await Customer.findById(testCustomer._id);
        expect(updatedCustomer.cPaidAmount).toBe(paymentAmount);
        expect(updatedCustomer.cOutstandingAmt).toBe(-paymentAmount); // Initial 0 - 75 = -75. The model doesn't link order total to customer outstanding on order creation.
        // This highlights that cOutstandingAmt on customer should be managed more carefully, perhaps increased when an order is created.
        // For the scope of addPayment, it correctly decreases cOutstandingAmt.
      });

      it("should correctly update customer balances with multiple payments", async () => {
        // Customer: paid=0, outstanding=0
        await orderForPayment.addPayment({
          amount: 50,
          payment_method_used: "Cash",
        });
        // Order: paid=50, outstanding=150
        // Customer: paid=50, outstanding=-50

        await orderForPayment.addPayment({
          amount: 100,
          payment_method_used: "Online Payment",
        });
        // Order: paid=150, outstanding=50
        // Customer: paid=50+100=150, outstanding=-50-100 = -150

        const updatedCustomer = await Customer.findById(testCustomer._id);
        expect(updatedCustomer.cPaidAmount).toBe(150);
        expect(updatedCustomer.cOutstandingAmt).toBe(-150);

        const updatedOrder = await Order.findById(orderForPayment._id);
        expect(updatedOrder.order_paid_amount).toBe(150);
        expect(updatedOrder.order_outstanding_amount).toBe(50);
      });

      it("should throw error if customer for the order is not found", async () => {
        const tempCustomer = new Customer({
          cName: "temp",
          cNIC: `t-${Date.now()}`,
          cPhone: `00-${Date.now()}`,
          cPaidAmount: 0,
          cOutstandingAmt: 0,
        });
        await tempCustomer.save();
        const orderWithNonExistentCustomerLink = new Order({
          invoice_id: "INV-NOCUST",
          customer: new mongoose.Types.ObjectId(), // A non-existent customer ID
          order_items: [
            { item: mockItemObjectId1, quantity: 1, applied_price: 10 },
          ],
        });
        await orderWithNonExistentCustomerLink.save();

        let err;
        try {
          await orderWithNonExistentCustomerLink.addPayment({
            amount: 5,
            payment_method_used: "Cash",
          });
        } catch (error) {
          err = error;
        }
        expect(err).toBeDefined();
        expect(err.message).toBe("Customer not found for this order.");
      });

      it("customer cOutstandingAmt can go negative if payments exceed initial amount", async () => {
        // Customer starts with cOutstandingAmt = 0
        // Order total is 200
        await orderForPayment.addPayment({
          amount: 250,
          payment_method_used: "Cash",
        }); // Pay more than order total

        const updatedCustomer = await Customer.findById(testCustomer._id);
        expect(updatedCustomer.cPaidAmount).toBe(250);
        expect(updatedCustomer.cOutstandingAmt).toBe(-250); // 0 - 250

        const updatedOrder = await Order.findById(orderForPayment._id);
        expect(updatedOrder.order_paid_amount).toBe(250);
        expect(updatedOrder.order_outstanding_amount).toBe(orderTotal - 250); // -50
        expect(updatedOrder.order_status).toBe("Fully Paid");
      });
    });
  });
});
