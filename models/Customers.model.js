const mongoose = require("mongoose");
const OrdersSchema = require("../models/Orders.model");

/** @type {import('mongoose').Schema} */

const CustomersSchema = new mongoose.Schema(
  {
    cName: { type: String, required: true },
    cNIC: { type: String, required: true, unique: true },
    cPhone: { type: String, required: true, unique: true },
    cAddress: { type: String },
    cPaidAmount: { type: Number, required: true },
    cOustandingAmt: { type: Number, required: true },
    orders: { type: [OrdersSchema] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customers", CustomersSchema);
