const mongoose = require("mongoose");
const { ATTENDANCE_STATUS, PAYMENT_STATUS } = require('../utils/constants');

const AttendanceSchema = mongoose.Schema(
  {
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
    },
    payment: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      required: true,
    },
  },
  { _id: false }
);

const EmployeeSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    cnic: { type: String, required: true, unique: true },
    phone: { type: String },
    salary: { type: Number, required: true },
    attendance: [AttendanceSchema],
    imgUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", EmployeeSchema);
