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
      // required: true, // Customer is now optional
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
  if (this.isNew || this.isModified("order_items")) {
    this.subtotal = this.order_items.reduce((total, item) => {
      return total + (item.applied_price * item.quantity);
    }, 0);

    this.total_discount = this.order_items.reduce((total, item) => {
      return total + (item.discount_amount * item.quantity); // Assuming discount_amount is per item
    }, 0);

    this.total_price = Math.max(0, this.order_items.reduce((total, item) => {
      const itemTotal = item.item_total !== undefined ? item.item_total : Math.max(0, (item.applied_price - item.discount_amount) * item.quantity);
      return total + itemTotal;
    }, 0));
  }

  if (
    this.isNew ||
    this.isModified("payments_received") ||
    this.isModified("total_price")
  ) {
    this.order_paid_amount = this.payments_received.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    this.order_outstanding_amount = Math.max(0, this.total_price - this.order_paid_amount);

    if (this.order_status === ORDER_STATUS.CANCELLED) {
      // Leave status as cancelled
    } else if (this.total_price <= 0) { // Covers cases like fully discounted or zero value order
      this.order_status = ORDER_STATUS.FULLY_PAID; // Or some other status like 'Fulfilled'
    } else if (this.order_paid_amount <= 0) {
      this.order_status = ORDER_STATUS.PENDING;
    } else if (this.order_outstanding_amount <= 0) {
      this.order_status = ORDER_STATUS.FULLY_PAID;
    } else if (this.order_paid_amount > 0 && this.order_outstanding_amount > 0) {
      this.order_status = ORDER_STATUS.PARTIALLY_PAID;
    } else { // Default fallback, should ideally not be hit if logic above is comprehensive
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

    await this.save({ session });


    const Customer = mongoose.model("Customers");
    const customer = await Customer.findById(this.customer).session(session);

    if (!customer) {
      throw new Error("Customer not found for this order.");
    }


    customer.cPaidAmount += paymentDetails.amount;

    await customer.save({ session });


    await session.commitTransaction();
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
    await updateCustomerBalance(doc, session);
    next();
  } catch (error) {
    console.error("Error in Order post-save hook:", error);
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
