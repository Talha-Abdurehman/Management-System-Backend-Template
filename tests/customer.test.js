const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const express = require("express");
const Customer = require("../models/Customers.model");
const CustomerController = require("../controllers/customersController");

// Mock Express app
const app = express();
app.use(express.json());

// Setup routes for testing
app.post("/api/customers", CustomerController.createCustomer);
app.get("/api/customers", CustomerController.getAllCustomers);
app.get("/api/customers/search", CustomerController.searchCustomers);
app.get(
  "/api/customers/outstanding",
  CustomerController.getCustomersWithOutstandingBalance
);
app.get("/api/customers/:id", CustomerController.getCustomerById);
app.put("/api/customers/:id", CustomerController.updateCustomer);
app.delete("/api/customers/:id", CustomerController.deleteCustomer);
app.get("/api/customers/:id/orders", CustomerController.getCustomerOrders);
app.post("/api/customers/:id/orders", CustomerController.addOrderToCustomer);
app.put(
  "/api/customers/:id/orders/:orderId",
  CustomerController.updateCustomerOrder
);
app.delete(
  "/api/customers/:id/orders/:orderId",
  CustomerController.deleteCustomerOrder
);
app.put("/api/customers/:id/payment", CustomerController.updateCustomerPayment);

// Test data
const sampleCustomer = {
  cName: "John Doe",
  cNIC: "123456789",
  cPhone: "1234567890",
  cAddress: "123 Test Street",
  cPaidAmount: 500,
  cOutstandingAmt: 100,
};

const sampleOrder = {
  business_name: "Test Business",
  location: "Test Location",
  phone_num: "9876543210",
  invoice_id: "INV-001",
  products: [
    {
      product_name: "Test Product",
      product_category: "Test Category",
      product_quantity: 2,
      retail_price: 100,
      product_price: 90,
      discount_amount: 10,
    },
  ],
  payment_method: "Cash",
  subtotal: 200,
  total_discount: 20,
  total_price: 180,
};

// MongoDB Memory Server setup
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Customer.deleteMany({});
});

describe("CustomerController", () => {
  describe("createCustomer", () => {
    it("should create a new customer", async () => {
      const response = await request(app)
        .post("/api/customers")
        .send(sampleCustomer);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.cName).toBe(sampleCustomer.cName);
      expect(response.body.data.cNIC).toBe(sampleCustomer.cNIC);
    });

    it("should not create customer with duplicate NIC", async () => {
      // First create a customer
      await request(app).post("/api/customers").send(sampleCustomer);

      // Try to create another with same NIC
      const response = await request(app)
        .post("/api/customers")
        .send(sampleCustomer);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("getAllCustomers", () => {
    it("should return all customers", async () => {
      // Create a couple of customers
      await Customer.create(sampleCustomer);
      await Customer.create({
        ...sampleCustomer,
        cNIC: "987654321",
        cPhone: "9876543210",
      });

      const response = await request(app).get("/api/customers");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });
  });

  describe("getCustomerById", () => {
    it("should return customer by ID", async () => {
      const customer = await Customer.create(sampleCustomer);

      const response = await request(app).get(`/api/customers/${customer._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.cNIC).toBe(sampleCustomer.cNIC);
    });

    it("should return 404 for non-existent customer", async () => {
      const response = await request(app).get(
        `/api/customers/${new mongoose.Types.ObjectId()}`
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("updateCustomer", () => {
    it("should update customer data", async () => {
      const customer = await Customer.create(sampleCustomer);
      const updatedData = {
        cName: "Jane Doe",
        cAddress: "456 New Street",
      };

      const response = await request(app)
        .put(`/api/customers/${customer._id}`)
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.cName).toBe(updatedData.cName);
      expect(response.body.data.cAddress).toBe(updatedData.cAddress);
    });

    it("should not update with existing NIC or phone", async () => {
      // Create two customers
      await Customer.create(sampleCustomer);
      const customer2 = await Customer.create({
        ...sampleCustomer,
        cNIC: "987654321",
        cPhone: "9876543210",
      });

      // Try to update second customer with first customer's NIC
      const response = await request(app)
        .put(`/api/customers/${customer2._id}`)
        .send({ cNIC: sampleCustomer.cNIC });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("deleteCustomer", () => {
    it("should delete customer", async () => {
      const customer = await Customer.create(sampleCustomer);

      const response = await request(app).delete(
        `/api/customers/${customer._id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify customer was deleted
      const deleted = await Customer.findById(customer._id);
      expect(deleted).toBeNull();
    });
  });

  describe("getCustomerOrders", () => {
    it("should return customer orders", async () => {
      const customer = await Customer.create({
        ...sampleCustomer,
        orders: [sampleOrder],
      });

      const response = await request(app).get(
        `/api/customers/${customer._id}/orders`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].invoice_id).toBe(sampleOrder.invoice_id);
    });
  });

  describe("addOrderToCustomer", () => {
    it("should add order to customer", async () => {
      const customer = await Customer.create(sampleCustomer);
      const initialOutstanding = customer.cOutstandingAmt;

      const response = await request(app)
        .post(`/api/customers/${customer._id}/orders`)
        .send(sampleOrder);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.invoice_id).toBe(sampleOrder.invoice_id);

      // Verify customer's outstanding amount was updated
      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.cOutstandingAmt).toBe(
        initialOutstanding + sampleOrder.total_price
      );
    });
  });

  describe("updateCustomerOrder", () => {
    it("should update a customer order", async () => {
      // Create customer with an order
      const customer = await Customer.create({
        ...sampleCustomer,
        orders: [sampleOrder],
      });

      const orderId = customer.orders[0]._id;
      const initialOutstanding = customer.cOutstandingAmt;
      const updatedOrderData = {
        total_price: 200, // Changed from 180
        payment_method: "Card",
      };

      const response = await request(app)
        .put(`/api/customers/${customer._id}/orders/${orderId}`)
        .send(updatedOrderData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payment_method).toBe(
        updatedOrderData.payment_method
      );

      // Verify outstanding amount was updated
      const updatedCustomer = await Customer.findById(customer._id);
      const priceDifference =
        updatedOrderData.total_price - sampleOrder.total_price;
      expect(updatedCustomer.cOutstandingAmt).toBe(
        initialOutstanding + priceDifference
      );
    });

    it("should return 404 for non-existent order", async () => {
      const customer = await Customer.create(sampleCustomer);
      const fakeOrderId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .put(`/api/customers/${customer._id}/orders/${fakeOrderId}`)
        .send({ payment_method: "Card" });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("deleteCustomerOrder", () => {
    it("should delete a customer order", async () => {
      // Create customer with an order
      const customer = await Customer.create({
        ...sampleCustomer,
        orders: [sampleOrder],
      });

      const orderId = customer.orders[0]._id;
      const initialOutstanding = customer.cOutstandingAmt;

      const response = await request(app).delete(
        `/api/customers/${customer._id}/orders/${orderId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify order was removed and outstanding amount adjusted
      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.orders.length).toBe(0);
      expect(updatedCustomer.cOutstandingAmt).toBe(
        initialOutstanding - sampleOrder.total_price
      );
    });
  });

  describe("updateCustomerPayment", () => {
    it("should update customer payment amounts", async () => {
      const customer = await Customer.create(sampleCustomer);
      const initialPaid = customer.cPaidAmount;
      const initialOutstanding = customer.cOutstandingAmt;
      const paymentAmount = 50;

      const response = await request(app)
        .put(`/api/customers/${customer._id}/payment`)
        .send({ paymentAmount });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify payment updates
      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.cPaidAmount).toBe(initialPaid + paymentAmount);
      expect(updatedCustomer.cOutstandingAmt).toBe(
        initialOutstanding - paymentAmount
      );
    });

    it("should handle payment greater than outstanding amount", async () => {
      const customer = await Customer.create({
        ...sampleCustomer,
        cOutstandingAmt: 30,
      });
      const initialPaid = customer.cPaidAmount;
      const paymentAmount = 50; // More than outstanding

      const response = await request(app)
        .put(`/api/customers/${customer._id}/payment`)
        .send({ paymentAmount });

      expect(response.status).toBe(200);

      // Verify payment updates (outstanding should be 0, not negative)
      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.cPaidAmount).toBe(initialPaid + paymentAmount);
      expect(updatedCustomer.cOutstandingAmt).toBe(0);
    });

    it("should reject invalid payment amounts", async () => {
      const customer = await Customer.create(sampleCustomer);

      const response = await request(app)
        .put(`/api/customers/${customer._id}/payment`)
        .send({ paymentAmount: -10 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("searchCustomers", () => {
    it("should search customers by name", async () => {
      await Customer.create(sampleCustomer);
      await Customer.create({
        ...sampleCustomer,
        cName: "Jane Smith",
        cNIC: "987654321",
        cPhone: "9876543210",
      });

      const response = await request(app).get(
        "/api/customers/search?query=John"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].cName).toBe(sampleCustomer.cName);
    });

    it("should search customers by phone number", async () => {
      await Customer.create(sampleCustomer);

      const response = await request(app).get(
        "/api/customers/search?query=12345"
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
    });

    it("should require search query", async () => {
      const response = await request(app).get("/api/customers/search");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("getCustomersWithOutstandingBalance", () => {
    it("should return only customers with outstanding balance", async () => {
      // Customer with outstanding balance
      await Customer.create(sampleCustomer);

      // Customer with zero outstanding balance
      await Customer.create({
        ...sampleCustomer,
        cName: "Zero Balance",
        cNIC: "111222333",
        cPhone: "1112223333",
        cOutstandingAmt: 0,
      });

      const response = await request(app).get("/api/customers/outstanding");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].cOutstandingAmt).toBeGreaterThan(0);
    });
  });
});
