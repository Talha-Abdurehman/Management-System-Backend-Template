const mongoose = require("mongoose");

const ProductItemSchema = new mongoose.Schema({
  product_name: { type: String, required: true },
  product_category: { type: String, required: true },
  product_quantity: { type: Number, required: true, min: 1 }, // Assuming min 1 quantity per item
  product_price: { type: Number, required: true, min: 0 },
}, { _id: false }); // Added _id: false

const OrdersSchema = new mongoose.Schema(
  {
    business_name: { type: String },
    location: { type: String },
    phone_num: { type: Number }, // Consider type String for leading zeros/country codes
    invoice_id: { type: String, required: true, unique: true },
    products: { type: [ProductItemSchema], required: true },
    payment_method: { type: String, enum: ["Cash", "Card", "Online Payment"] },
    total_price: { type: Number, min: 0 }, // min: 0 if it can't be negative
  },
  { timestamps: true }
);

// Pre-save hook to calculate total_price for NEW documents
OrdersSchema.pre("save", function (next) {
  if (this.isNew || this.isModified('products')) { // Only calculate if new or products modified
    this.total_price = this.products.reduce(
      (total, product) =>
        total + product.product_price * product.product_quantity,
      0
    );
  }
  next();
});

module.exports = mongoose.model("Orders", OrdersSchema);