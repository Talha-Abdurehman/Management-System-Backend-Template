// controllers/workerController.js
const Worker = require("../models/WorkerModel"); // Adjust path as needed
const mongoose = require("mongoose");

// --- Worker CRUD Operations ---

// @desc    Create a new worker
// @route   POST /api/workers
// @access  Private (example, adjust as needed)
exports.createWorker = async (req, res, next) => {
  try {
    const { name, cnic, phone, salary } = req.body;

    if (!name || !cnic || !salary) {
      return res.status(400).json({
        success: false,
        message: "Name, CNIC, and Salary are required",
      });
    }

    // Optional: Check if CNIC already exists if it should be unique
    const existingWorker = await Worker.findOne({ cnic });
    if (existingWorker) {
      return res.status(400).json({
        success: false,
        message: "Worker with this CNIC already exists",
      });
    }

    const worker = await Worker.create({
      name,
      cnic,
      phone,
      salary,
      attendance: [], // Initialize with empty attendance
    });

    res.status(201).json({ success: true, data: worker });
  } catch (error) {
    // Mongoose validation errors can be caught here
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res
        .status(400)
        .json({ success: false, message: messages.join(", ") });
    }
    next(error); // Pass to global error handler
  }
};

// @desc    Get all workers
// @route   GET /api/workers
// @access  Public (example)
exports.getAllWorkers = async (req, res, next) => {
  try {
    const workers = await Worker.find().sort({ createdAt: -1 }); // Sort by newest first
    res
      .status(200)
      .json({ success: true, count: workers.length, data: workers });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single worker by ID
// @route   GET /api/workers/:id
// @access  Public (example)
exports.getWorkerById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid worker ID format" });
    }
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found with id of ${req.params.id}`,
      });
    }
    res.status(200).json({ success: true, data: worker });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a worker's details (name, cnic, phone, salary)
// @route   PUT /api/workers/:id
// @access  Private (example)
exports.updateWorker = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid worker ID format" });
    }
    const { name, cnic, phone, salary } = req.body;

    // Fields to update
    const updateFields = {};
    if (name) updateFields.name = name;
    if (cnic) updateFields.cnic = cnic;
    if (phone) updateFields.phone = phone;
    if (salary) updateFields.salary = salary;

    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No fields provided for update" });
    }

    // Optional: if CNIC is updated, check for uniqueness again
    if (cnic) {
      const existingWorker = await Worker.findOne({
        cnic,
        _id: { $ne: req.params.id },
      });
      if (existingWorker) {
        return res.status(400).json({
          success: false,
          message: "Another worker with this CNIC already exists",
        });
      }
    }

    const worker = await Worker.findByIdAndUpdate(req.params.id, updateFields, {
      new: true, // Return the modified document
      runValidators: true, // Run schema validators on update
    });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found with id of ${req.params.id}`,
      });
    }
    res.status(200).json({ success: true, data: worker });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res
        .status(400)
        .json({ success: false, message: messages.join(", ") });
    }
    next(error);
  }
};

// @desc    Delete a worker
// @route   DELETE /api/workers/:id
// @access  Private (example)
exports.deleteWorker = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid worker ID format" });
    }
    const worker = await Worker.findByIdAndDelete(req.params.id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found with id of ${req.params.id}`,
      });
    }
    res.status(200).json({
      success: true,
      message: "Worker deleted successfully",
      data: {},
    }); // Or res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- Attendance Sub-document Operations ---

// @desc    Add an attendance record for a worker
// @route   POST /api/workers/:workerId/attendance
// @access  Private (example)
exports.addAttendance = async (req, res, next) => {
  try {
    const { workerId } = req.params;
    const { date, status, payment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid worker ID format" });
    }

    if (!date || !status || !payment) {
      return res.status(400).json({
        success: false,
        message: "Date, status, and payment are required for attendance",
      });
    }

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found with id of ${workerId}`,
      });
    }

    // Optional: Check if attendance for this date already exists
    const existingAttendance = worker.attendance.find(
      (att) =>
        new Date(att.date).toISOString().split("T")[0] ===
        new Date(date).toISOString().split("T")[0]
    );
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: `Attendance for date ${
          new Date(date).toISOString().split("T")[0]
        } already exists for this worker.`,
      });
    }

    const newAttendance = { date: new Date(date), status, payment }; // Ensure date is a Date object

    // Validate attendance sub-document (Mongoose does this implicitly on save/update with $push)
    // but good to have a mental check for required fields, enums etc.

    worker.attendance.push(newAttendance);
    await worker.save(); // This will run validators on the sub-document

    res.status(201).json({ success: true, data: worker });
  } catch (error) {
    if (error.name === "ValidationError") {
      // Validation errors for sub-documents might be nested.
      // Mongoose usually provides good error messages for sub-document validation.
      const messages = Object.values(error.errors).map((val) => val.message);
      return res
        .status(400)
        .json({ success: false, message: messages.join(", ") });
    }
    next(error);
  }
};

// @desc    Update a specific attendance record for a worker
// @route   PUT /api/workers/:workerId/attendance/:attendanceDate
// @access  Private (example)
// Note: Since AttendanceSchema has _id: false, we identify by date.
// The :attendanceDate param should be in YYYY-MM-DD format.
exports.updateAttendance = async (req, res, next) => {
  try {
    const { workerId, attendanceDate } = req.params; // attendanceDate e.g., "2023-10-27"
    const { status, payment } = req.body; // Only update status and payment

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid worker ID format" });
    }

    if (!status && !payment) {
      return res.status(400).json({
        success: false,
        message: "Either status or payment must be provided for update.",
      });
    }

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found with id of ${workerId}`,
      });
    }

    // Find the attendance record by date. Dates need careful comparison.
    // We compare just the date part, ignoring time.
    const targetDate = new Date(attendanceDate + "T00:00:00.000Z"); // Ensure UTC for comparison

    const attendanceIndex = worker.attendance.findIndex(
      (att) =>
        new Date(att.date).toISOString().split("T")[0] ===
        targetDate.toISOString().split("T")[0]
    );

    if (attendanceIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Attendance record for date ${attendanceDate} not found for this worker.`,
      });
    }

    // Update fields
    if (status) worker.attendance[attendanceIndex].status = status;
    if (payment) worker.attendance[attendanceIndex].payment = payment;

    // Manually trigger validation for the specific subdocument if needed,
    // or rely on parent's save() validation.
    // Mongoose does not validate paths within arrays using findByIdAndUpdate or updateOne by default
    // when using positional operators directly. Modifying in JS and saving triggers full validation.
    await worker.save();

    res.status(200).json({ success: true, data: worker });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res
        .status(400)
        .json({ success: false, message: messages.join(", ") });
    }
    next(error);
  }
};

// @desc    Delete a specific attendance record for a worker
// @route   DELETE /api/workers/:workerId/attendance/:attendanceDate
// @access  Private (example)
// Note: Since AttendanceSchema has _id: false, we identify by date.
// The :attendanceDate param should be in YYYY-MM-DD format.
exports.deleteAttendance = async (req, res, next) => {
  try {
    const { workerId, attendanceDate } = req.params;

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid worker ID format" });
    }

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found with id of ${workerId}`,
      });
    }

    const targetDate = new Date(attendanceDate + "T00:00:00.000Z");
    const initialLength = worker.attendance.length;

    // Filter out the attendance record to be deleted
    worker.attendance = worker.attendance.filter(
      (att) =>
        new Date(att.date).toISOString().split("T")[0] !==
        targetDate.toISOString().split("T")[0]
    );

    if (worker.attendance.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: `Attendance record for date ${attendanceDate} not found for this worker.`,
      });
    }

    await worker.save();
    res.status(200).json({
      success: true,
      message: "Attendance record deleted",
      data: worker,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all attendance records for a specific worker
// @route   GET /api/workers/:workerId/attendance
// @access  Public (example)
exports.getWorkerAttendance = async (req, res, next) => {
  try {
    const { workerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid worker ID format" });
    }

    const worker = await Worker.findById(workerId).select("attendance"); // Only select attendance

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found with id of ${workerId}`,
      });
    }

    // Optionally sort attendance records by date
    const sortedAttendance = worker.attendance.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    ); // Descending

    res.status(200).json({
      success: true,
      count: sortedAttendance.length,
      data: sortedAttendance,
    });
  } catch (error) {
    next(error);
  }
};
