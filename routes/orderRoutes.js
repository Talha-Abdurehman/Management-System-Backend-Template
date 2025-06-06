const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController.js");

// Routes for different operations
router.post("/orders", orderController.createOrder);

router.get("/orders", orderController.getOrder);

router.get("/orders/:id", orderController.getOrderById);

router.put("/orders/:id", orderController.updateOrderById);

router.delete("/orders/:id", orderController.deleteOrderById);

router.delete("/orders", orderController.deleteOrders);

// New route for adding payment to a specific order
router.post("/orders/:orderId/payment", orderController.addPaymentToOrder);

//router.delete("/orders", orderController.deleteOrder);

module.exports = router;
