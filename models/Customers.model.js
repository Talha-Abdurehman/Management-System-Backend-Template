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
  console.log(`[RecalculateBalances] For Customer ID: ${this._id}. Using session: ${!!session}`);

  await this.populate({
    path: "cOrders",
    select: "invoice_id order_outstanding_amount total_price order_paid_amount order_status createdAt", // Added invoice_id, status, createdAt for better logging
    session: session,
  });

  let totalOutstanding = 0;
  let totalValueOrderedAllTime = 0;
  let totalPaymentsAgainstOrders = 0;

  console.log(`[RecalculateBalances] Customer ${this._id} has ${this.cOrders.length} orders.`);
  this.cOrders.forEach((order) => {
    if (order && order.total_price !== undefined && order.order_outstanding_amount !== undefined) {
      console.log(`[RecalculateBalances] Order ID: ${order._id} (Invoice: ${order.invoice_id}), Outstanding: ${order.order_outstanding_amount}, Total: ${order.total_price}, Paid: ${order.order_paid_amount}, Status: ${order.order_status}, Created: ${order.createdAt}`);
      totalValueOrderedAllTime += order.total_price;
      totalOutstanding += order.order_outstanding_amount;
      totalPaymentsAgainstOrders += (order.order_paid_amount); // Simpler: sum of what was paid on orders
    } else {
      console.log(`[RecalculateBalances] Skipped an order for customer ${this._id} due to missing fields: ${order ? order._id : 'N/A'}`);
    }
  });

  console.log(`[RecalculateBalances] Customer ${this._id} - Calculated totalOutstanding BEFORE Math.max: ${totalOutstanding}`);

  // It's crucial that order_outstanding_amount is never negative. The Order model should ensure this.
  // If totalOutstanding is negative, it means some orders have negative outstanding, which is a bug in OrderModel.
  if (totalOutstanding < 0) {
    console.warn(`[RecalculateBalances] WARNING: Customer ${this._id} - totalOutstanding is negative (${totalOutstanding}) before applying floor. This indicates an issue with order balance calculations.`);
    // For safety, we ensure cOutstandingAmt is not negative, but the root cause needs fixing.
    this.cOutstandingAmt = 0;
  } else {
    this.cOutstandingAmt = totalOutstanding;
  }

  // Recalculate cPaidAmount based on sum of payments made against orders directly.
  // General payments made directly to customer account are handled in customersController.updateCustomerPayment
  // This might be an oversimplification if cPaidAmount is meant to be a grand total of *all* payments (order-specific + general).
  // For now, let's assume cPaidAmount on customer reflects sum of order_paid_amounts.
  // If cPaidAmount is also updated by general payments, then this simple sum here could be misleading
  // or overwritten. A better approach for cPaidAmount might be more complex if it includes general payments.
  // Let's focus on cOutstandingAmt for now.
  // this.cPaidAmount = totalPaymentsAgainstOrders; // Revisit this if cPaidAmount has more complex logic.


  console.log(`[RecalculateBalances] Customer ${this._id} - Final cOutstandingAmt: ${this.cOutstandingAmt}`);

  await this.save({ session });
  console.log(`[RecalculateBalances] Customer ${this._id} saved.`);
  return this;
};

module.exports = mongoose.model("Customers", CustomersSchema);
