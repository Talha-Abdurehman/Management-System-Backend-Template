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
router.post("/customers", createCustomer);
router.put("/customers/:id", updateCustomer);
router.delete("/customers/:id", deleteCustomer);
