const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

// Only admins can create new users (staff or other admins)
router.post(
  "/signup",
  authMiddleware,
  adminMiddleware,
  authController.createUser
);
router.post("/login", authController.getUser);

module.exports = router;

// Admin routes for user management
router.get(
  "/users",
  authMiddleware,
  adminMiddleware,
  authController.getAllUsers
);
router.delete(
  "/users/:userId",
  authMiddleware,
  adminMiddleware,
  authController.deleteUserById
);
