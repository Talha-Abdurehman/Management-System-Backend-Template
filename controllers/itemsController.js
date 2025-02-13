const Item = require("../models/ItemSchema")

exports.createItem = async(req, res) => {
    try {
        const newItem = new Item(req.body);
        await newItem.save();
        res.status(201).json(newItem)
    }
    catch(error) {
        res.status(400).json({error})
    }

}

exports.deleteItemById = async(req, res) => {
    try {
        const {id} = req.params;
        const result = await Item.findByIdAndDelete(id);
        if(!result) return res.status(404).json({message:"Item not found"})
        else res.json({message:"Item deleted successfully"})
    }
    catch(error){
        res.status.json(error);
    }
}