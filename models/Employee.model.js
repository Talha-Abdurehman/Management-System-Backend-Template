const mongoose = require("mongoose");

const AttendanceSchema = mongoose.Schema(
  {
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["present", "halfDay", "absent"],
      required: true,
    },
    payment: {
      type: String,
      enum: ["full", "half", "unpaid"],
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
