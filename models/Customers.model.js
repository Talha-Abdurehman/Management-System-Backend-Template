const mongoose = require("mongoose");

const CustomersSchema = new mongoose.Schema(
  {
    cName: { type: String, required: true },
    cNIC: { type: String, required: true, unique: true },
    cPhone: { type: String, required: true, unique: true },
    cAddress: { type: String },
    cPaidAmount: { type: Number, required: true },
    cOustandingAmt: { type: Number, required: true },
    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Orders",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customers", CustomersSchema);
