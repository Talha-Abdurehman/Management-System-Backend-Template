const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true },
    description: { type: String },
    price: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
    quantity: { type: Number, required: true, min: [0, 'Quantity cannot be negative'], default: 0 },
    category: { type: String, required: true },
    imageUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", ItemSchema);