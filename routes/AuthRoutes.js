const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

// User creation and login
router.post(
  "/signup",
  authMiddleware,
  adminMiddleware,
  authController.createUser
);
router.post("/login", authController.getUser);

// Admin routes for user management
router.get(
  "/users",
  authMiddleware,
  authController.getAllUsers
);

router.delete(
  "/users/:userId",
  authMiddleware,
  adminMiddleware,
  authController.deleteUserById
);

router.put( // New route for updating a user
  "/users/:userId",
  authMiddleware,
  adminMiddleware,
  authController.updateUserById
);

// Admin routes for user attendance management
router
  .route("/users/:userId/attendance")
  .post(authMiddleware, authController.addUserAttendance)
  .get(authMiddleware, authController.getUserAttendance);

router
  .route("/users/:userId/attendance/:attendanceDate")
  .put(authMiddleware, authController.updateUserAttendance)
  .delete(authMiddleware, authController.deleteUserAttendance);

module.exports = router;