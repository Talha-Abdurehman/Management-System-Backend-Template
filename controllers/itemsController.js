const Item = require("../models/Items.model");

exports.createItem = async (req, res) => {
  try {
    const newItem = new Item(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.product_name) {
      return res
        .status(400)
        .json({ message: `Item with product name '${req.body.product_name}' already exists.` });
    }
    console.error("Error creating item:", error);
    res
      .status(400)
      .json({ message: error.message || "Failed to create item" });
  }
};

exports.deleteItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Item.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ message: "Item not found" });
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error(`Error deleting item ${req.params.id}:`, error);
    res
      .status(500)
      .json({ message: error.message || "Failed to delete item" });
  }
};

exports.fetchAllItems = async (req, res) => {
  try {
    const result = await Item.find();
    if (!result || result.length === 0) {
      return res.status(404).json({ Message: "No items found. Feels Empty!" });
    }
    res.json(result);
  } catch (error) {
    console.error("Error fetching all items:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to fetch items" });
  }
};

exports.fetchById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Item.findById(id);
    if (!result) return res.status(404).json({ Message: "Item Not Found" });
    res.json(result);
  } catch (error) {
    console.error(`Error fetching item by ID ${req.params.id}:`, error);
    res
      .status(500)
      .json({ message: `An Error Occurred: ${error.message}` });
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
    res.status(200).json({ Message: "Updated Successfully", item: result });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.product_name) {
      return res
        .status(400)
        .json({ message: `Item with product name '${req.body.product_name}' already exists.` });
    }
    console.error(`Error updating item ${req.params.id}:`, error);
    return res
      .status(500)
      .json({ message: `An Error Occurred: ${error.message}` });
  }
};