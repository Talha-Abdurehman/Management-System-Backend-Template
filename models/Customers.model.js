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

CustomersSchema.methods.recalculateBalances = async function (options = {}) {
  const session = options.session || undefined;

  await this.populate({
    path: "cOrders",
    select: "order_outstanding_amount total_price order_paid_amount",
    session: session,
  });

  let totalOutstanding = 0;
  let totalValueOrderedAllTime = 0;
  let totalPaymentsAgainstOrders = 0;


  this.cOrders.forEach((order) => {
    if (order && order.total_price !== undefined && order.order_outstanding_amount !== undefined) {
      totalValueOrderedAllTime += order.total_price;
      totalOutstanding += order.order_outstanding_amount;
      totalPaymentsAgainstOrders += (order.total_price - order.order_outstanding_amount);
    }
  });

  this.cOutstandingAmt = totalOutstanding;


  if (this.cOutstandingAmt < 0) {
    this.cOutstandingAmt = 0;
  }


  await this.save({ session });
  return this;
};

module.exports = mongoose.model("Customers", CustomersSchema);
