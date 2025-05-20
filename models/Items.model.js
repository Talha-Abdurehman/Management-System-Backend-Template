const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
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
    },
    imgUrl: { type: String }, // Track which type of price is being used
  },
  { timestamps: true }
);

// Helper function to calculate final product price based on retail/wholesale and discount
ItemSchema.pre("save", function (next) {
  // Determine base price based on price type
  const basePrice =
    this.price_type === "wholesale" ? this.wholesale_price : this.retail_price;

  // Apply discount if any
  this.product_price = Math.max(0, basePrice - this.discount_amount);
  next();
});

module.exports = mongoose.model("Item", ItemSchema);
