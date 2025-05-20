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
  updateCustomerPayment,
} = require("../controllers/customersController");

router.get("/customers", getAllCustomers);
router.get("/customers/:id", getCustomerById);
router.get("/customers/orders", getCustomerOrders);
router.post("/customers", createCustomer);
router.put("/customers/:id/orders", addOrderToCustomer);
router.put("/customers/:id", updateCustomer);
router.put("/customers/:id/orders/", updateCustomerOrder);
router.delete("/customers/:id", deleteCustomer);
router.delete("/customers/:id/orders", deleteCustomerOrder);

module.exports = router;
