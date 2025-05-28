const mongoose = require("mongoose");

const CustomersSchema = new mongoose.Schema(
  {
    cName: { type: String, required: true },
    cNIC: { type: String, unique: true, sparse: true }, // Made optional, sparse index for uniqueness if present
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
  const OrderModel = mongoose.model("Orders");

  try {
    const balanceAggregation = await OrderModel.aggregate([
      { $match: { _id: { $in: this.cOrders || [] } } },
      {
        $group: {
          _id: null, // Group all orders for this customer together
          totalPaidAcrossOrders: { $sum: "$order_paid_amount" }, // Sum of order_paid_amount of each order
          totalOutstandingSum: { $sum: "$order_outstanding_amount" } // Sum of order_outstanding_amount
        }
      }
    ]).session(session || null);

    let newOutstandingAmt = 0;
    let newPaidAmt = 0;

    if (balanceAggregation.length > 0 && balanceAggregation[0]) {
      newPaidAmt = balanceAggregation[0].totalPaidAcrossOrders || 0;
      newOutstandingAmt = balanceAggregation[0].totalOutstandingSum || 0;
    }

    this.cPaidAmount = Math.max(0, newPaidAmt);
    this.cOutstandingAmt = Math.max(0, newOutstandingAmt);

    await this.save({ session });
    return this;
  } catch (error) {
    console.error(`Error in recalculateBalances for customer ${this._id}: ${error.message}`, error);
    throw error;
  }
};

module.exports = mongoose.model("Customers", CustomersSchema);
