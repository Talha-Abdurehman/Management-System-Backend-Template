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
    const updates = req.body;

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
    if (error instanceof AppError) {
      return next(error);
    }
    if (error.name === 'CastError' && error.path === '_id') {
      return next(new AppError("Invalid item ID format in batch update.", 400));
    }
    next(new AppError(error.message || "Failed to batch update stock", 500));
  }
};

exports.getAllCategories = async (req, res, next) => {
  try {
    const categories = await Item.distinct('product_category');
    categories.sort(); // Optional: sort alphabetically
    res.json(categories);
  } catch (error) {
    next(new AppError(error.message || "Failed to fetch categories", 500));
  }
};

exports.renameCategory = async (req, res, next) => {
  try {
    const { oldName, newName } = req.body;

    if (!oldName || !newName) {
      return next(new AppError("Both oldName and newName are required.", 400));
    }
    if (typeof oldName !== 'string' || typeof newName !== 'string') {
      return next(new AppError("Category names must be strings.", 400));
    }
    if (newName.trim() === "") {
      return next(new AppError("New category name cannot be empty.", 400));
    }
    if (oldName === newName) {
      return res.json({ message: "Old and new category names are the same. No changes made.", modifiedCount: 0 });
    }

    // Check if the old category name exists
    const oldCategoryExists = await Item.findOne({ product_category: oldName });
    if (!oldCategoryExists) {
      return next(new AppError(`Category '${oldName}' not found.`, 404));
    }

    // Optional: Check if the new category name already exists (to prevent unintentional merging)
    // Depending on desired behavior, you might allow merging or prevent it.
    // For this implementation, we'll allow it but log if it happens.
    const newCategoryAlreadyExists = await Item.findOne({ product_category: newName });
    if (newCategoryAlreadyExists) {
      console.warn(`Warning: Renaming category '${oldName}' to '${newName}', which already exists. Items will be merged under '${newName}'.`);
    }

    const result = await Item.updateMany(
      { product_category: oldName },
      { $set: { product_category: newName } }
    );

    if (result.modifiedCount === 0 && !newCategoryAlreadyExists) {
      // This could happen if oldName was valid but no items matched during the updateMany call,
      // which shouldn't occur if oldCategoryExists check passed. Or concurrency issue.
      return res.json({ message: `No items found for category '${oldName}' to update.`, modifiedCount: 0 });
    }

    res.json({ message: `Category '${oldName}' successfully renamed to '${newName}'.`, modifiedCount: result.modifiedCount });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return next(new AppError(error.message, 400));
    }
    next(new AppError(error.message || "Failed to rename category", 500));
  }
};