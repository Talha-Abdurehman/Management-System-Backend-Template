const mongoose = require("mongoose");
const { ITEM_PRICE_TYPE } = require('../utils/constants');

const ItemSchema = new mongoose.Schema(
  {
    product_name: { type: String, required: true, unique: true },
    product_category: { type: String },
    product_quantity: { type: Number, required: true, min: 1 },
    retail_price: { type: Number, required: true, min: 0 },
    wholesale_price: { type: Number, min: 0 },
    price_type: {
      type: String,
      enum: Object.values(ITEM_PRICE_TYPE),
      default: ITEM_PRICE_TYPE.RETAIL,
    },
    imgUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", ItemSchema);
