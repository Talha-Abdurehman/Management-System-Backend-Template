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
  searchCustomers,
  updateCustomer,
  updateCustomerOrder,
  updateCustomerPayment, // Ensure this is exported if used, or handle payment through order controller
} = require("../controllers/customersController");

// Customer general routes
router.post("/customers", createCustomer);
router.get("/customers", getAllCustomers);
router.get("/customers/search", searchCustomers); // Added search route explicitly
router.get("/customers/outstanding", getCustomersWithOutstandingBalance); // Added outstanding route explicitly

// Customer specific routes
router.get("/customers/:id", getCustomerById);
router.put("/customers/:id", updateCustomer);
router.delete("/customers/:id", deleteCustomer);
router.put("/customers/:id/payment", updateCustomerPayment); // Route for general payment update

// Customer's order specific routes
router.get("/customers/:id/orders", getCustomerOrders);
router.post("/customers/:id/orders", addOrderToCustomer); // Changed from PUT to POST for creation
router.put("/customers/:id/orders/:orderId", updateCustomerOrder);
router.delete("/customers/:id/orders/:orderId", deleteCustomerOrder);


module.exports = router;
