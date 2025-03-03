const Orders = require("../models/Orders.model.js");

/** @type {import('mongoose').Model<import('../models/Orders')>} */

exports.createOrder = async (req, res) => {
  try {
    const newOrder = new Orders(req.body);
    await newOrder.save();
    res.status(201).json({ Message: "Created Successfully" });
  } catch (err) {
    res.error.json({ message: `Error Message: ${err}` });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const data = await Orders.find();
    if (!data) {
      return res.status(404).json({ Message: "Not found!" });
    }
    res.json(data).status(200).json({ Message: "Fetched Successfully" });
  } catch (err) {
    res.status().json({ Message: `The Following error occured: ${err}` });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await Orders.findById(id);
    if (!data) {
      return res.status(404).json({ Message: "Not found!" });
    }
    res.json(data).status(200).json({ Message: "Fetched Successfully" });
  } catch (err) {
    res.status().json({ Message: `The Following error occured: ${err}` });
  }
};

exports.updateOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const updateOrder = await Orders.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updateOrder)
      return res.status(404).json({ Message: "Resource not found" });
    res.status(200).json({ Message: "Updated Successfully ", updateOrder });
  } catch (err) {
    res.status(500).json({ Message: `The Following error occured: ${err}` });
  }
};

exports.deleteOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const deleteOrder = await Orders.findByIdAndDelete(id);
    if (!deleteOrder)
      return res.status(404).json({ Message: "Resource not found" });
    res.status(200).json({ Message: "Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ Message: `The following error occured: ${err}` });
  }
};
