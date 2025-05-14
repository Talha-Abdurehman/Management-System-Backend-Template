const express = require("express");
const router = express.Router();
const {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  addAttendance,
  updateAttendance,
  deleteAttendance,
  getEmployeeAttendance,
} = require("../controllers/employeeController");

// Employee routes
router.route("/employee").post(createEmployee).get(getAllEmployees);

router
  .route("/employee/:id")
  .get(getEmployeeById)
  .put(updateEmployee)
  .delete(deleteEmployee);

// Attendance sub-document routes
router
  .route("/employee/:employeeId/attendance")
  .post(addAttendance)
  .get(getEmployeeAttendance);

router
  .route("/employee/:employeeId/attendance/:attendanceDate") // attendanceDate as YYYY-MM-DD
  .put(updateAttendance)
  .delete(deleteAttendance);

module.exports = router;