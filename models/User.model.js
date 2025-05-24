const mongoose = require("mongoose");
const { ATTENDANCE_STATUS, PAYMENT_STATUS } = require('../utils/constants');

const AttendanceSchema = new mongoose.Schema(
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

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false }, // Typically hide password by default
  isAdmin: { type: Boolean, default: false },
  imgUrl: { type: String },
  cnic: {
    type: String,
    unique: true,
    sparse: true
  },
  salary: { type: Number },
  attendance: [AttendanceSchema],
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);