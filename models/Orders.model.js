const mongoose = require("mongoose");

const OrdersSchema = mongoose.Schema(
  {
    business_name: { type: String },
    location: { type: String },
    phone_num: { type: Number },
    invoice_id: { type: String, required: true, unique: true },
    product_name: { type: String, required: true },
    product_category: { type: String, required: true },
    product_quantity: { type: Number, required: true },
    product_price: { type: Number, required: true },
    payment_method: { type: String, enum: ["Cash", "Card", "Online Payment"] },
    total_price: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Orders", OrdersSchema);
