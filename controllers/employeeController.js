const Employee = require("../models/Employee.model.js");
const mongoose = require("mongoose");

exports.createEmployee = async (req, res) => {
  try {
    const { name, cnic, phone, salary } = req.body;
    if (!name || !cnic || !salary) {
      return res
        .status(400)
        .json({ message: "Name, CNIC, and Salary are required." });
    }

    const existingEmployee = await Employee.findOne({ cnic });
    if (existingEmployee) {
      return res
        .status(400)
        .json({ message: `Employee with CNIC ${cnic} already exists.` });
    }

    const newEmployee = new Employee({ name, cnic, phone, salary });
    await newEmployee.save();
    res.status(201).json({
      message: "Employee created successfully",
      employee: newEmployee,
    });
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ message: "Failed to create employee" });
  }
};

exports.getAllEmployees = async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });
    res.json(employees);
  } catch (error) {
    console.error("Error fetching all employees:", error);
    res.status(500).json({ message: "Failed to fetch employees" });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json(employee);
  } catch (error) {
    console.error(`Error fetching employee by ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to fetch employee" });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }
    const { name, cnic, phone, salary } = req.body;

    if (cnic) {
      const existingEmployee = await Employee.findOne({
        cnic,
        _id: { $ne: id },
      });
      if (existingEmployee) {
        return res
          .status(400)
          .json({ message: `Employee with CNIC ${cnic} already exists.` });
      }
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { name, cnic, phone, salary },
      { new: true, runValidators: true }
    );

    if (!updatedEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json({
      message: "Employee updated successfully",
      employee: updatedEmployee,
    });
  } catch (error) {
    console.error(`Error updating employee ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to update employee" });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }
    const result = await Employee.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error(`Error deleting employee ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to delete employee" });
  }
};

exports.addAttendance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { date, status, payment } = req.body;

    if (!date || !status || !payment) {
      return res
        .status(400)
        .json({ message: "Date, status, and payment are required." });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const existingAttendance = employee.attendance.find(
      (att) => att.date.getTime() === attendanceDate.getTime()
    );

    if (existingAttendance) {
      return res.status(400).json({
        message: `Attendance for ${
          attendanceDate.toISOString().split("T")[0]
        } already exists. Use PUT to update.`,
      });
    }

    employee.attendance.push({ date: attendanceDate, status, payment });
    await employee.save();
    res
      .status(201)
      .json({ message: "Attendance added successfully", employee });
  } catch (error) {
    console.error("Error adding attendance:", error);
    res.status(500).json({ message: "Failed to add attendance" });
  }
};

exports.getEmployeeAttendance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }
    const employee = await Employee.findById(employeeId).select(
      "name cnic attendance"
    );
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json(employee.attendance);
  } catch (error) {
    console.error("Error fetching employee attendance:", error);
    res.status(500).json({ message: "Failed to fetch employee attendance" });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const { employeeId, attendanceDate: dateString } = req.params;
    const { status, payment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }

    const attendanceDate = new Date(dateString);
    if (isNaN(attendanceDate.getTime())) {
      return res
        .status(400)
        .json({ message: "Invalid date format. Use YYYY-MM-DD." });
    }
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const attendanceIndex = employee.attendance.findIndex(
      (att) => att.date.getTime() === attendanceDate.getTime()
    );

    if (attendanceIndex === -1) {
      return res
        .status(404)
        .json({ message: "Attendance record not found for this date." });
    }

    if (status) employee.attendance[attendanceIndex].status = status;
    if (payment) employee.attendance[attendanceIndex].payment = payment;

    await employee.save();
    res.json({ message: "Attendance updated successfully", employee });
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({ message: "Failed to update attendance" });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    const { employeeId, attendanceDate: dateString } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }

    const attendanceDate = new Date(dateString);
    if (isNaN(attendanceDate.getTime())) {
      return res
        .status(400)
        .json({ message: "Invalid date format. Use YYYY-MM-DD." });
    }
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const initialLength = employee.attendance.length;
    employee.attendance = employee.attendance.filter(
      (att) => att.date.getTime() !== attendanceDate.getTime()
    );

    if (employee.attendance.length === initialLength) {
      return res
        .status(404)
        .json({ message: "Attendance record not found for this date." });
    }

    await employee.save();
    res.json({ message: "Attendance deleted successfully", employee });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({ message: "Failed to delete attendance" });
  }
};
