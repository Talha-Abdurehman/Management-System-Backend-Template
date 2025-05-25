const Employee = require("../models/Employee.model.js");
const mongoose = require("mongoose");
const AppError = require('../utils/AppError');
const attendanceService = require('../services/attendanceService');

exports.createEmployee = async (req, res, next) => {
  try {
    const { name, cnic, phone, salary, imgUrl } = req.body;
    if (!name || !cnic || !salary) {
      return next(new AppError("Name, CNIC, and Salary are required.", 400));
    }

    const existingEmployee = await Employee.findOne({ cnic });
    if (existingEmployee) {
      return next(new AppError(`Employee with CNIC ${cnic} already exists.`, 400));
    }

    const newEmployee = new Employee({ name, cnic, phone, salary, imgUrl: imgUrl || null });
    await newEmployee.save();
    res.status(201).json({
      message: "Employee created successfully",
      employee: newEmployee,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.cnic) {
      return next(new AppError(`Employee with CNIC '${req.body.cnic}' already exists.`, 400));
    }
    next(new AppError(error.message || "Failed to create employee", 500));
  }
};

exports.getAllEmployees = async (req, res, next) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });
    res.json(employees);
  } catch (error) {
    next(new AppError(error.message || "Failed to fetch employees", 500));
  }
};

exports.getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid employee ID format", 400));
    }
    const employee = await Employee.findById(id);
    if (!employee) {
      return next(new AppError("Employee not found", 404));
    }
    res.json(employee);
  } catch (error) {
    next(new AppError(error.message || "Failed to fetch employee", 500));
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid employee ID format", 400));
    }
    const { name, cnic, phone, salary, imgUrl } = req.body;

    if (cnic) {
      const existingEmployee = await Employee.findOne({
        cnic,
        _id: { $ne: id },
      });
      if (existingEmployee) {
        return next(new AppError(`Employee with CNIC ${cnic} already exists.`, 400));
      }
    }

    const updateFields = {};
    if (name) updateFields.name = name;
    if (cnic) updateFields.cnic = cnic;
    if (phone) updateFields.phone = phone;
    if (salary) updateFields.salary = salary;
    if (imgUrl !== undefined) {
      updateFields.imgUrl = imgUrl;
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedEmployee) {
      return next(new AppError("Employee not found", 404));
    }
    res.json({
      message: "Employee updated successfully",
      employee: updatedEmployee,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.cnic) {
      return next(new AppError(`Employee with CNIC '${req.body.cnic}' already exists.`, 400));
    }
    next(new AppError(error.message || "Failed to update employee", 500));
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid employee ID format", 400));
    }
    const result = await Employee.findByIdAndDelete(id);
    if (!result) {
      return next(new AppError("Employee not found", 404));
    }
    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    next(new AppError(error.message || "Failed to delete employee", 500));
  }
};

// --- Employee Attendance Controllers using Attendance Service ---

exports.addAttendance = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const employee = await attendanceService.addAttendanceRecord(Employee, employeeId, req.body);
    res.status(201).json({ message: "Attendance added successfully", employee });
  } catch (error) {
    next(error);
  }
};

exports.getEmployeeAttendance = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const attendance = await attendanceService.getAttendanceRecords(Employee, employeeId);
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

exports.updateAttendance = async (req, res, next) => {
  try {
    const { employeeId, attendanceDate } = req.params;
    const employee = await attendanceService.updateAttendanceRecord(Employee, employeeId, attendanceDate, req.body);
    res.json({ message: "Attendance updated successfully", employee });
  } catch (error) {
    next(error);
  }
};

exports.deleteAttendance = async (req, res, next) => {
  try {
    const { employeeId, attendanceDate } = req.params;
    const employee = await attendanceService.deleteAttendanceRecord(Employee, employeeId, attendanceDate);
    res.json({ message: "Attendance deleted successfully", employee });
  } catch (error) {
    next(error);
  }
};