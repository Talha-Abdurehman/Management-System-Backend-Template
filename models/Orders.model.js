// Orders.model.js
const mongoose = require("mongoose");

// Create an OrderItem schema (remains the same)
const OrderItemSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item", // Make sure you have an "Item" model
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price_type: {
    type: String,
    enum: ["retail", "wholesale"],
    default: "retail",
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
    payment_method: { type: String, enum: ["Cash", "Card", "Online Payment"] }, // This might be the initial payment method
    subtotal: { type: Number, min: 0 },
    total_discount: { type: Number, default: 0, min: 0 },
    total_price: { type: Number, min: 0 }, // This is the total amount due for THIS order
    is_wholesale: { type: Boolean, default: false },

    // ---- NEW FIELDS FOR PARTIAL PAYMENTS ----
    payments_received: [
      {
        amount: { type: Number, required: true, min: 0 },
        payment_date: { type: Date, default: Date.now },
        payment_method_used: {
          type: String,
          enum: ["Cash", "Card", "Online Payment", "Other"],
        }, // Method for THIS specific payment
        notes: { type: String }, // Optional notes for this payment
      },
    ],
    order_paid_amount: { type: Number, default: 0, min: 0 }, // Total amount paid for THIS order
    order_outstanding_amount: { type: Number, default: 0, min: 0 }, // Amount outstanding for THIS order
    order_status: {
      type: String,
      enum: ["Pending", "Partially Paid", "Fully Paid", "Cancelled"],
      default: "Pending",
    },
    // ---- END NEW FIELDS ----

    // Link to the customer who placed the order
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customers",
      required: true, // An order must belong to a customer
    },
  },
  { timestamps: true }
);

// Calculate item_total for each order item
OrderItemSchema.pre("save", function (next) {
  this.item_total = (this.applied_price - this.discount_amount) * this.quantity;
  next();
});

// Pre-save hook to calculate totals for the entire order
OrdersSchema.pre("save", function (next) {
  // Calculate subtotal, total_discount, total_price if order_items are modified or it's a new order
  if (this.isNew || this.isModified("order_items")) {
    this.subtotal = this.order_items.reduce((total, item) => {
      return total + item.applied_price * item.quantity;
    }, 0);

    this.total_discount = this.order_items.reduce((total, item) => {
      return total + item.discount_amount * item.quantity;
    }, 0);

    this.total_price = Math.max(
      this.order_items.reduce((total, item) => {
        // Ensure item_total is calculated. If items are not saved yet, calculate on the fly.
        const itemTotal =
          item.item_total !== undefined
            ? item.item_total
            : (item.applied_price - item.discount_amount) * item.quantity;
        return total + itemTotal;
      }, 0),
      0
    );
  }

  // Calculate order_paid_amount and order_outstanding_amount if payments_received or total_price is modified
  if (
    this.isNew ||
    this.isModified("payments_received") ||
    this.isModified("total_price")
  ) {
    this.order_paid_amount = this.payments_received.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    this.order_outstanding_amount = this.total_price - this.order_paid_amount;

    // Update order_status based on payment
    if (this.order_paid_amount <= 0 && this.total_price > 0) {
      this.order_status = "Pending";
    } else if (this.order_outstanding_amount <= 0 && this.total_price > 0) {
      this.order_status = "Fully Paid";
    } else if (
      this.order_paid_amount > 0 &&
      this.order_outstanding_amount > 0
    ) {
      this.order_status = "Partially Paid";
    } else {
      this.order_status = "Pending";
    }
  }

  next();
});

// Set prices based on wholesale flag
OrdersSchema.methods.applyWholesalePricing = function () {
  this.is_wholesale = true;
  this.order_items.forEach((orderItem) => {
    orderItem.price_type = "wholesale";
    // You'd typically fetch the Item model here and get its wholesale_price
    // For now, let's assume applied_price will be updated externally before saving
  });
};

// ---- NEW METHOD TO ADD A PAYMENT TO THIS ORDER ----
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
    // Customer's outstanding amount is the sum of their orders' outstanding amounts.
    // This specific payment reduces this order's outstanding amount.
    // The overall customer outstanding amount should be recalculated or carefully managed.
    // For this transaction, we are ensuring the payment reduces the direct debt from this order.
    // A more robust solution involves recalculating customer.cOutstandingAmt based on sum of all their orders' outstanding amounts.
    customer.cOutstandingAmt -= paymentDetails.amount;
    if (customer.cOutstandingAmt < 0) customer.cOutstandingAmt = 0;


    await customer.save({ session });

    await session.commitTransaction();
    return this;
  } catch (error) {
    await session.abortTransaction();
    throw error; // Re-throw error to be handled by controller
  } finally {
    session.endSession();
  }
};
// ---- END NEW METHOD ----

module.exports = mongoose.model("Orders", OrdersSchema);
