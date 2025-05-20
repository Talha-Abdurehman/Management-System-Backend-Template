const mongoose = require("mongoose");

const OrdersSchema = new mongoose.Schema(
  {
    business_name: { type: String },
    location: { type: String },
    phone_num: { type: String }, // Changed to String for phone numbers with leading zeros/country codes
    invoice_id: { type: String, required: true, unique: true },
    products: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Item",
      required: true,
    },
    payment_method: { type: String, enum: ["Cash", "Card", "Online Payment"] },
    subtotal: { type: Number, min: 0 }, // Subtotal before discounts
    total_discount: { type: Number, default: 0, min: 0 }, // Total discount across all items
    total_price: { type: Number, min: 0 }, // Final price after discounts
    is_wholesale: { type: Boolean, default: false }, // Flag to indicate if this is a wholesale order
  },
  { timestamps: true }
);

// Pre-save hook to calculate totals for the entire order
OrdersSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("products")) {
    // Calculate subtotal (sum of retail/wholesale prices before discount)
    this.subtotal = this.products.reduce((total, product) => {
      const basePrice =
        product.price_type === "wholesale"
          ? product.wholesale_price
          : product.retail_price;
      return total + basePrice * product.product_quantity;
    }, 0);

    // Calculate total discount
    this.total_discount = this.products.reduce(
      (total, product) =>
        total + product.discount_amount * product.product_quantity,
      0
    );

    // Calculate final price
    this.total_price = this.products.reduce(
      (total, product) =>
        total + product.product_price * product.product_quantity,
      0
    );
  }
  next();
});

// Set prices based on wholesale flag (optional utility method)
OrdersSchema.methods.applyWholesalePricing = function () {
  this.is_wholesale = true;

  this.products.forEach((product) => {
    if (product.wholesale_price) {
      product.price_type = "wholesale";
    }
  });
};

module.exports = mongoose.model("Orders", OrdersSchema);
