// routes/workerRoutes.js
const express = require("express");
const router = express.Router();
const {
  createWorker,
  getAllWorkers,
  getWorkerById,
  updateWorker,
  deleteWorker,
  addAttendance,
  updateAttendance,
  deleteAttendance,
  getWorkerAttendance,
} = require("../controllers/workerController"); // Adjust path

// Worker routes
router.route("/worker").post(createWorker).get(getAllWorkers);

router
  .route("/worker/:id")
  .get(getWorkerById)
  .put(updateWorker)
  .delete(deleteWorker);

// Attendance sub-document routes
router
  .route("/worker/:workerId/attendance")
  .post(addAttendance)
  .get(getWorkerAttendance);

router
  .route("/worker/:workerId/attendance/:attendanceDate") // attendanceDate as YYYY-MM-DD
  .put(updateAttendance)
  .delete(deleteAttendance);

module.exports = router;
