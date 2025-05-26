const Item = require("../models/Items.model");
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

exports.createItem = async (req, res, next) => {
  try {
    const newItem = new Item(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.product_name) {
      return next(new AppError(`Item with product name '${req.body.product_name}' already exists.`, 400));
    }
    if (error.name === 'ValidationError') {
      return next(new AppError(error.message, 400));
    }
    next(new AppError(error.message || "Failed to create item", 500));
  }
};

exports.deleteItemById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid item ID format", 400));
    }
    const result = await Item.findByIdAndDelete(id);
    if (!result) return next(new AppError("Item not found", 404));
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    next(new AppError(error.message || "Failed to delete item", 500));
  }
};

exports.fetchAllItems = async (req, res, next) => {
  try {
    const result = await Item.find().sort({ createdAt: -1 });
    if (!result || result.length === 0) {
      // It's debatable if this should be a 404 or an empty 200.
      // For consistency with "not found" for single items, 404 can be used if strict.
      // However, an empty array is often a valid 200 response.
      // Let's return 200 with an empty array.
      return res.json([]);
    }
    res.json(result);
  } catch (error) {
    next(new AppError(error.message || "Failed to fetch items", 500));
  }
};

exports.fetchById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid item ID format", 400));
    }
    const result = await Item.findById(id);
    if (!result) return next(new AppError("Item Not Found", 404));
    res.json(result);
  } catch (error) {
    next(new AppError(`An Error Occurred: ${error.message}`, 500));
  }
};

exports.updateById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid item ID format", 400));
    }
    const result = await Item.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!result) return next(new AppError("Item Not Found", 404));
    res.status(200).json({ Message: "Updated Successfully", item: result });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.product_name) {
      return next(new AppError(`Item with product name '${req.body.product_name}' already exists.`, 400));
    }
    if (error.name === 'ValidationError') {
      return next(new AppError(error.message, 400));
    }
    next(new AppError(`An Error Occurred: ${error.message}`, 500));
  }
};

exports.batchUpdateStock = async (req, res, next) => {
  try {
    const updates = req.body; // Expected format: [{ itemId: "id", quantityChange: -2 }, ...]

    if (!Array.isArray(updates) || updates.length === 0) {
      return next(new AppError("Invalid request body: Expected an array of stock updates.", 400));
    }

    const bulkOps = updates.map(update => {
      if (!update.itemId || typeof update.quantityChange !== 'number') {
        throw new AppError("Invalid update format: Each update must have itemId and quantityChange.", 400);
      }
      return {
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(update.itemId) },
          update: { $inc: { product_quantity: update.quantityChange } }
        }
      };
    });

    if (bulkOps.length > 0) {
      const result = await Item.bulkWrite(bulkOps);
      res.status(200).json({
        message: "Stock quantities updated.",
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      });
    } else {
      res.status(200).json({ message: "No stock updates to perform." });
    }

  } catch (error) {
    if (error instanceof AppError) { // Pass through AppErrors
      return next(error);
    }
    if (error.name === 'CastError' && error.path === '_id') {
      return next(new AppError("Invalid item ID format in batch update.", 400));
    }
    next(new AppError(error.message || "Failed to batch update stock", 500));
  }
};