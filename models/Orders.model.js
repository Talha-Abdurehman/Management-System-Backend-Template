const mongoose = require("mongoose");
const {
  ITEM_PRICE_TYPE,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS
} = require('../utils/constants');

const OrderItemSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price_type: {
    type: String,
    enum: Object.values(ITEM_PRICE_TYPE),
    default: ITEM_PRICE_TYPE.RETAIL,
  },
  applied_price: {
    type: Number,
    required: true,
    min: 0,
  },
  discount_amount: {
    type: Number,
    default: 0,
    min: 0,
  },
  item_total: {
    type: Number,
    min: 0,
  },
});

const OrdersSchema = new mongoose.Schema(
  {
    business_name: { type: String },
    location: { type: String },
    phone_num: { type: String },
    invoice_id: { type: String, required: true, unique: true },
    order_items: [OrderItemSchema],
    payment_method: {
      type: String,
      enum: [ORDER_PAYMENT_METHOD.CASH, ORDER_PAYMENT_METHOD.CARD, ORDER_PAYMENT_METHOD.ONLINE_PAYMENT]
    },
    subtotal: { type: Number, default: 0, min: 0 },
    total_discount: { type: Number, default: 0, min: 0 },
    total_price: { type: Number, default: 0, min: 0 },
    is_wholesale: { type: Boolean, default: false },

    payments_received: [
      {
        amount: { type: Number, required: true, min: 0 },
        payment_date: { type: Date, default: Date.now },
        payment_method_used: {
          type: String,
          enum: Object.values(ORDER_PAYMENT_METHOD),
          required: true,
        },
        notes: { type: String },
      },
    ],
    order_paid_amount: { type: Number, default: 0, min: 0 },
    order_outstanding_amount: { type: Number, default: 0, min: 0 },
    order_status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customers",
      required: false, // Explicitly make it optional
    },
  },
  { timestamps: true }
);

OrderItemSchema.pre("save", function (next) {
  if (this.isModified('applied_price') || this.isModified('discount_amount') || this.isModified('quantity')) {
    this.item_total = Math.max(0, (this.applied_price - this.discount_amount) * this.quantity);
  }
  next();
});

OrdersSchema.pre("save", function (next) {
  // Calculate financial fields if order_items changed, or if it's a new order,
  // or if the overall total_discount field itself was modified directly.
  if (this.isNew || this.isModified("order_items") || this.isModified("total_discount")) {
    // 1. Calculate Subtotal: Sum of (applied_price * quantity) for each item.
    // This is the price before any discounts.
    this.subtotal = this.order_items.reduce((sum, item) => {
      return sum + (item.applied_price * item.quantity);
    }, 0);

    // 2. Calculate Sum of Item-Level Discounts
    // Each OrderItem already calculates its own item_total = (applied_price - discount_amount) * quantity.
    // So, the sum of (item.discount_amount * quantity) can be derived if needed,
    // but it's better to sum item_total from each item if item-level discounts are applied first.

    // Let's recalculate total_price based on item_total of each OrderItem
    // The OrderItemSchema.pre("save") hook ensures item_total is correct: (applied_price - discount_amount) * quantity
    let priceAfterItemDiscounts = 0;
    this.order_items.forEach(item => {
      // Ensure item_total is calculated if not present (e.g. if not saved yet as subdocument)
      const currentItemTotal = item.item_total !== undefined
        ? item.item_total
        : Math.max(0, (item.applied_price - (item.discount_amount || 0)) * item.quantity);
      priceAfterItemDiscounts += currentItemTotal;
    });

    // 3. Apply Overall Order Discount
    // The `this.total_discount` field is assumed to be the "Overall Discount" from the payload.
    const overallOrderDiscountValue = this.total_discount || 0;

    // Final Total Price = Price After Item Discounts - Overall Order Discount
    this.total_price = Math.max(0, priceAfterItemDiscounts - overallOrderDiscountValue);
  }

  // Calculate payment-related fields if relevant fields changed
  if (
    this.isNew ||
    this.isModified("payments_received") ||
    this.isModified("total_price") // total_price can change due to item changes or discount changes
  ) {
    this.order_paid_amount = this.payments_received.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    this.order_outstanding_amount = Math.max(0, this.total_price - this.order_paid_amount);

    // Update order_status based on payment status
    if (this.order_status === ORDER_STATUS.CANCELLED) {
      // Do not change if already cancelled
    } else if (this.total_price <= 0 && this.order_items.length > 0) { // Order has items but value is <=0 (e.g. fully discounted)
      this.order_status = ORDER_STATUS.FULLY_PAID;
    } else if (this.total_price <= 0 && this.order_items.length == 0) { // No items, no price
      this.order_status = ORDER_STATUS.PENDING; // Or another status like 'EMPTY' if that makes sense
    } else if (this.order_paid_amount >= this.total_price) {
      this.order_status = ORDER_STATUS.FULLY_PAID;
    } else if (this.order_paid_amount > 0 && this.order_paid_amount < this.total_price) {
      this.order_status = ORDER_STATUS.PARTIALLY_PAID;
    } else { // this.order_paid_amount <= 0 and this.total_price > 0
      this.order_status = ORDER_STATUS.PENDING;
    }
  }

  next();
});

OrdersSchema.methods.applyWholesalePricing = function () {
  this.is_wholesale = true;
  this.order_items.forEach((orderItem) => {
    orderItem.price_type = ITEM_PRICE_TYPE.WHOLESALE;
  });
};

OrdersSchema.methods.addPayment = async function (paymentDetails) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    this.payments_received.push({
      amount: paymentDetails.amount,
      payment_method_used: paymentDetails.payment_method_used,
      notes: paymentDetails.notes,
      payment_date: paymentDetails.payment_date || new Date(),
    });

    // Saving the order will trigger its pre-save (to update order's own balances)
    // and post-save (to call customer.recalculateBalances()) hooks.
    // These hooks will use the session if this save is part of an existing session,
    // or operate without if not.
    await this.save({ session });

    // The customer's balance, including cPaidAmount if it's derived from orders,
    // will be correctly updated by the customer.recalculateBalances() method
    // called from this order's post-save hook.
    // No direct customer.cPaidAmount manipulation or customer.save() is needed here anymore.

    await session.commitTransaction();
    // Populate customer details before returning the order if needed by frontend
    // Or ensure the frontend re-fetches if it needs the updated customer.
    // For now, just returning 'this' (the order) is fine, as hooks handle customer.
    return this;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

async function updateCustomerBalance(doc, session) {
  if (doc && doc.customer) {
    const Customer = mongoose.model("Customers");
    const customer = await Customer.findById(doc.customer).session(session);
    if (customer) {
      await customer.recalculateBalances({ session });
    }
  }
}

OrdersSchema.post("save", async function (doc, next) {
  const session = doc.$session();
  try {
    // await updateCustomerBalance(doc, session); // Removed: Controller will handle for new orders.
    next();
  } catch (error) {
    console.error("Error in Order post-save hook (was for updateCustomerBalance):", error);
    next(error);
  }
});

OrdersSchema.post("findOneAndUpdate", async function (doc, next) {

  const session = this.mongooseOptions.session;
  try {
    await updateCustomerBalance(doc, session);
    next();
  } catch (error) {
    console.error("Error in Order post-findOneAndUpdate hook:", error);
    next(error);
  }
});

OrdersSchema.post("findOneAndDelete", async function (doc, next) {

  const session = this.mongooseOptions.session;
  try {
    await updateCustomerBalance(doc, session);
    next();
  } catch (error) {
    console.error("Error in Order post-findOneAndDelete hook:", error);
    next(error);
  }
});


module.exports = mongoose.model("Orders", OrdersSchema);
