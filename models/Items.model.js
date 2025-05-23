const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    product_name: { type: String, required: true, unique: true },
    product_category: { type: String, required: true },
    product_quantity: { type: Number, required: true, min: 1 },
    retail_price: { type: Number, required: true, min: 0 },
    wholesale_price: { type: Number, min: 0 },
    price_type: {
      type: String,
      enum: ["retail", "wholesale"],
      default: "retail",
    },
    imgUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", ItemSchema);
