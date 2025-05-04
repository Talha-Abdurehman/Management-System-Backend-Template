const mongoose = require("mongoose");

const DaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    totalProfit: { type: Number, required: true, default: 0 },
    totalOrders: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const MonthSchema = new mongoose.Schema(
  {
    month: { type: Number },
    days: [DaySchema],
  },
  { _id: false }
);

const BusinessHistorySchema = new mongoose.Schema({
  year: { type: Number },
  months: [MonthSchema],
});

module.exports = mongoose.model("BusinessHistory", BusinessHistorySchema);
