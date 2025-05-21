const mongoose = require("mongoose");

const CustomersSchema = new mongoose.Schema(
  {
    cName: { type: String, required: true },
    cNIC: { type: String, required: true, unique: true },
    cPhone: { type: String, required: true, unique: true },
    cAddress: { type: String },
    cPaidAmount: { type: Number, required: true },
    cOutstandingAmt: { type: Number, required: true },
    cOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Orders",
      },
    ],
    cImgUrl: { type: String },
  },
  { timestamps: true }
);

CustomersSchema.methods.recalculateBalances = async function () {
  await this.populate({
    path: "cOrders",
    select: "order_outstanding_amount total_price", // Only select necessary fields
  });

  let totalOutstanding = 0;
  let totalValueOrdered = 0; // Total value of all orders placed

  this.cOrders.forEach((order) => {
    if (order) {
      // Ensure order exists (it might have been deleted)
      totalValueOrdered += order.total_price || 0;
      totalOutstanding += order.order_outstanding_amount || 0;
    }
  });

  this.cOutstandingAmt = totalOutstanding;
  // cPaidAmount can be derived: totalValueOrdered - totalOutstanding
  // However, keeping cPaidAmount as a direct sum of payments might be more intuitive for audit.
  // For simplicity, we'll let cPaidAmount be updated transactionally.
  // If you want cPaidAmount to be purely derived:
  // this.cPaidAmount = totalValueOrdered - totalOutstanding;

  await this.save();
  return this;
};

module.exports = mongoose.model("Customers", CustomersSchema);
