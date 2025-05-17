const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
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

const UserSchema = new mongoose.Schema({ // Renamed to UserSchema for consistency
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  imgUrl: { type: String },
  cnic: {
    type: String,
    unique: true,
    sparse: true // Allows multiple nulls but cnic value itself must be unique
  },
  salary: { type: Number },
  attendance: [AttendanceSchema],
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);