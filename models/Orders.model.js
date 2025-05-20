const mongoose = require("mongoose");

const ProductItemSchema = new mongoose.Schema(
  {
    product_name: { type: String, required: true },
    product_category: { type: String, required: true },
    product_quantity: { type: Number, required: true, min: 1 },
    retail_price: { type: Number, required: true, min: 0 }, // Original retail price
    wholesale_price: { type: Number, min: 0 }, // Optional wholesale price
    discount_amount: { type: Number, default: 0, min: 0 }, // Fixed discount amount (not percentage)
    product_price: { type: Number, required: true, min: 0 }, // Final price after discount
    price_type: {
      type: String,
      enum: ["retail", "wholesale"],
      default: "retail",
    }, // Track which type of price is being used
  },
  { _id: false }
);

const OrdersSchema = new mongoose.Schema(
  {
    business_name: { type: String },
    location: { type: String },
    phone_num: { type: String }, // Changed to String for phone numbers with leading zeros/country codes
    invoice_id: { type: String, required: true, unique: true },
    products: { type: [ProductItemSchema], required: true },
    payment_method: { type: String, enum: ["Cash", "Card", "Online Payment"] },
    subtotal: { type: Number, min: 0 }, // Subtotal before discounts
    total_discount: { type: Number, default: 0, min: 0 }, // Total discount across all items
    total_price: { type: Number, min: 0 }, // Final price after discounts
    is_wholesale: { type: Boolean, default: false }, // Flag to indicate if this is a wholesale order
  },
  { timestamps: true }
);

// Helper function to calculate final product price based on retail/wholesale and discount
ProductItemSchema.pre("save", function (next) {
  // Determine base price based on price type
  const basePrice =
    this.price_type === "wholesale" ? this.wholesale_price : this.retail_price;

  // Apply discount if any
  this.product_price = Math.max(0, basePrice - this.discount_amount);
  next();
});

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
