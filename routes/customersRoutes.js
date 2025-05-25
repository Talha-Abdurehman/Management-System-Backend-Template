const app = require("express");
const router = app.Router();
const {
  addOrderToCustomer,
  createCustomer,
  deleteCustomer,
  deleteCustomerOrder,
  getAllCustomers,
  getCustomerById,
  getCustomerOrders,
  getCustomersWithOutstandingBalance,
  getCustomersWithNoOutstandingBalance,
  searchCustomers,
  updateCustomer,
  updateCustomerOrder,
  updateCustomerPayment,
} = require("../controllers/customersController");

// Customer general routes
router.post("/customers", createCustomer);
router.get("/customers", getAllCustomers);
// Specific string routes MUST come BEFORE parameterized routes like /:id
router.get("/customers/search", searchCustomers);
router.get("/customers/outstanding", getCustomersWithOutstandingBalance);
router.get("/customers/paid-off", getCustomersWithNoOutstandingBalance);

// Customer specific routes (parameterized)
router.get("/customers/:id", getCustomerById);
router.put("/customers/:id", updateCustomer);
router.delete("/customers/:id", deleteCustomer);
router.put("/customers/:id/payment", updateCustomerPayment);

// Customer's order specific routes (parameterized)
router.get("/customers/:id/orders", getCustomerOrders);
router.post("/customers/:id/orders", addOrderToCustomer);
router.put("/customers/:id/orders/:orderId", updateCustomerOrder);
router.delete("/customers/:id/orders/:orderId", deleteCustomerOrder);


module.exports = router;
