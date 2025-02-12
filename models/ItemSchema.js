const mongoose = require("mongoose")

const ItemSchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, required: true},
    price: {type: Number, required: true},
    quantity: {type: Number, required: true},
    imageUrl: {type: String, required: true},
    timeStamps: {type: Date, default: Date.now}
})

module.exports = mongoose.model("Item", ItemSchema)