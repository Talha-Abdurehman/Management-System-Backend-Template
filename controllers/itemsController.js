const Item = require("../models/ItemSchema")

exports.createItem = async(req, res) => {
    try {
        const newItem = new Item(req.body);
        await newItem.save();
        res.status(201).json(newItem)
    }
    catch(error) {
        res.status(400).json({message})
    }

}