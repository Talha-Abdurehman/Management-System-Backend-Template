const mongoose = require("mongoose")

const ItemSchema = new mongoose.Schema({
    name: {type: String, unique: true, required: true,},
    description: {type: String},
    price: {type: Number, required: true},
    quantity: {type: Number, required: true},
    category: {type: String, required: true},
    imageUrl: {type: String, required: true},
},{timestamps: true})

module.exports = mongoose.model("Item", ItemSchema)