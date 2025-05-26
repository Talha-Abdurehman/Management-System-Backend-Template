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
  const OrderModel = mongoose.model("Orders");

  try {
    const result = await OrderModel.aggregate([
      { $match: { _id: { $in: this.cOrders || [] } } }, // Ensure cOrders is not null
      {
        $group: {
          _id: null,
          totalOutstandingSum: { $sum: "$order_outstanding_amount" }
        }
      }
    ]).session(session || null);

    let newOutstandingAmt = 0;
    if (result.length > 0 && result[0].totalOutstandingSum !== undefined) {
      newOutstandingAmt = result[0].totalOutstandingSum;
    }

    this.cOutstandingAmt = Math.max(0, newOutstandingAmt);

    // cPaidAmount is not recalculated here. It's managed by direct customer payments
    // and potentially reflected through order_paid_amount sums if a different strategy is adopted.
    // For now, this method solely focuses on deriving cOutstandingAmt from linked orders.

    await this.save({ session });
    return this;
  } catch (error) {
    // It's good practice to log errors that occur during critical financial calculations
    console.error(`Error in recalculateBalances for customer ${this._id}: ${error.message}`, error);
    // Depending on policy, you might want to re-throw or handle gracefully
    throw error; // Re-throw to ensure calling functions are aware of failure
  }
};

module.exports = mongoose.model("Customers", CustomersSchema);
