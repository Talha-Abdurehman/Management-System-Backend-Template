const Item = require("../models/Items.model");

exports.createItem = async (req, res) => {
  try {
    const newItem = new Item(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(400).json({ error });
  }
};

exports.deleteItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Item.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ message: "Item not found" });
    else res.json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status.json(error);
  }
};

exports.fetchAllItems = async (req, res) => {
  try {
    const result = await Item.find();
    if (!result) return res.status(404).json({ Message: "Feels Empty!" });
    res.json(result);
  } catch (error) {
    res.status(500).json(error);
  }
};

exports.fetchById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Item.findById(id);
    if (!result) return res.status(404).json({ Message: "Item Not Found" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: `An Error Occurred: ${error}` });
  }
};

exports.updateById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Item.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!result) return res.status(404).json({ Message: "Item Not Found" });
    res.status(200).json({ Message: "Updated Successfully" });
  } catch (error) {
    return res.status(500).json({ error: `An Error Occurred ${error}` });
  }
};
