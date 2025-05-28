const Item = require("../models/Items.model");
const Category = require("../models/Category.model");
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

exports.createCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === "") {
      return next(new AppError("Category name is required.", 400));
    }

    // Case-insensitive check for existing category
    const existingCategory = await Category.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existingCategory) {
      return next(new AppError(`Category '${name.trim()}' already exists.`, 400));
    }

    const newCategory = new Category({ name: name.trim() });
    await newCategory.save();
    res.status(201).json({ message: "Category created successfully", category: newCategory });
  } catch (error) {
    if (error.code === 11000) { // Mongoose unique index violation (fallback)
      return next(new AppError(`Category '${req.body.name.trim()}' already exists.`, 400));
    }
    if (error.name === 'ValidationError') {
      return next(new AppError(error.message, 400));
    }
    next(new AppError(error.message || "Failed to create category", 500));
  }
};

exports.getAllCategories = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 }); // Sort alphabetically by name
    const categoryNames = categories.map(cat => cat.name);
    res.json(categoryNames);
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

    const trimmedNewName = newName.trim();
    if (trimmedNewName === "") {
      return next(new AppError("New category name cannot be empty.", 400));
    }
    if (oldName.trim().toLowerCase() === trimmedNewName.toLowerCase()) {
      return res.json({ message: "Old and new category names are the same. No changes made.", modifiedCount: 0 });
    }

    // Check if the old category name exists in the Category collection
    const categoryToUpdate = await Category.findOne({ name: { $regex: `^${oldName.trim()}$`, $options: 'i' } });
    if (!categoryToUpdate) {
      return next(new AppError(`Category '${oldName.trim()}' not found.`, 404));
    }

    // Check if the new category name already exists (case-insensitive)
    const newNameExists = await Category.findOne({
      name: { $regex: `^${trimmedNewName}$`, $options: 'i' },
      _id: { $ne: categoryToUpdate._id } // Exclude the current category being renamed
    });
    if (newNameExists) {
      return next(new AppError(`Category name '${trimmedNewName}' already exists.`, 400));
    }

    // Update category name in Category collection
    categoryToUpdate.name = trimmedNewName;
    await categoryToUpdate.save();

    // Update product_category field in all relevant Items
    const itemUpdateResult = await Item.updateMany(
      { product_category: oldName }, // Case-sensitive match for updating items might be intended
      // Or use: { product_category: { $regex: `^${oldName.trim()}$`, $options: 'i' } } for case-insensitive match on items
      { $set: { product_category: trimmedNewName } }
    );

    res.json({
      message: `Category '${oldName.trim()}' successfully renamed to '${trimmedNewName}'. Updated ${itemUpdateResult.modifiedCount} items.`,
      modifiedItemCount: itemUpdateResult.modifiedCount,
      updatedCategory: categoryToUpdate
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      return next(new AppError(error.message, 400));
    }
    if (error.code === 11000) { // Mongoose unique index violation on Category collection
      return next(new AppError(`Category name '${req.body.newName.trim()}' already exists.`, 400));
    }
    next(new AppError(error.message || "Failed to rename category", 500));
  }
};

exports.deleteCategoryByName = async (req, res, next) => {
  try {
    const categoryName = req.params.name;
    if (!categoryName || categoryName.trim() === "") {
      return next(new AppError("Category name parameter is required.", 400));
    }

    // Find and delete the category (case-insensitive)
    const categoryToDelete = await Category.findOneAndDelete({
      name: { $regex: `^${categoryName.trim()}$`, $options: 'i' }
    });

    if (!categoryToDelete) {
      return next(new AppError(`Category '${categoryName.trim()}' not found.`, 404));
    }

    // Update items that used this category
    const updateResult = await Item.updateMany(
      { product_category: { $regex: `^${categoryName.trim()}$`, $options: 'i' } }, // Match items with the category name (case-insensitive)
      { $set: { product_category: "No Category" } }
    );

    res.json({
      message: `Category '${categoryToDelete.name}' deleted successfully. ${updateResult.modifiedCount} items updated to 'No Category'.`,
      deletedCategory: categoryToDelete,
      itemsUpdatedCount: updateResult.modifiedCount
    });

  } catch (error) {
    next(new AppError(error.message || "Failed to delete category", 500));
  }
};

exports.batchDeleteCategories = async (req, res, next) => {
  try {
    const { names } = req.body; // Expecting an array of category names

    if (!names || !Array.isArray(names) || names.length === 0) {
      return next(new AppError("Array of category names is required for batch deletion.", 400));
    }

    // Sanitize names (trimming)
    const trimmedNames = names.map(name => name.trim()).filter(name => name !== "");
    if (trimmedNames.length === 0) {
      return next(new AppError("No valid category names provided after trimming.", 400));
    }

    // Case-insensitive matching for deletion from Category collection
    const categoryDeletionResult = await Category.deleteMany({
      name: { $in: trimmedNames.map(name => new RegExp(`^${name}$`, 'i')) }
    });

    // Update items that used these categories (case-insensitive match)
    const itemUpdateResult = await Item.updateMany(
      { product_category: { $in: trimmedNames.map(name => new RegExp(`^${name}$`, 'i')) } },
      { $set: { product_category: "No Category" } }
    );

    res.json({
      message: `Batch delete operation complete. ${categoryDeletionResult.deletedCount} categories removed. ${itemUpdateResult.modifiedCount} items updated.`,
      categoriesDeletedCount: categoryDeletionResult.deletedCount,
      itemsUpdatedCount: itemUpdateResult.modifiedCount,
    });

  } catch (error) {
    next(new AppError(error.message || "Failed to batch delete categories", 500));
  }
};

exports.batchUpdateItemCategory = async (req, res, next) => {
  try {
    const { itemIds, newCategoryName } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return next(new AppError("Array of itemIds is required.", 400));
    }

    // Validate ObjectIds
    for (const itemId of itemIds) {
      if (!mongoose.Types.ObjectId.isValid(itemId)) {
        return next(new AppError(`Invalid itemId format: ${itemId}`, 400));
      }
    }

    // If newCategoryName is provided, validate it exists in Category collection (optional, but good practice)
    // If newCategoryName is null or an empty string, it means unassign category
    let categoryToSet = newCategoryName;
    if (newCategoryName && newCategoryName.trim() !== "") {
      const categoryExists = await Category.findOne({ name: { $regex: `^${newCategoryName.trim()}$`, $options: 'i' } });
      if (!categoryExists) {
        // Option 1: Error out if category doesn't exist
        // return next(new AppError(`Category '${newCategoryName.trim()}' does not exist. Please create it first.`, 400));
        // Option 2: Or, allow setting any string, which might create ad-hoc categories if not managed.
        // For this implementation, we'll assume frontend sends valid categories from its list,
        // or null/empty to unassign. If a non-existent category name is sent, it will be set as is.
        // If strict category validation is desired, the check above should be enabled.
      }
      categoryToSet = newCategoryName.trim();
    } else {
      categoryToSet = null; // Explicitly set to null if newCategoryName is empty or null
    }


    const updateResult = await Item.updateMany(
      { _id: { $in: itemIds.map(id => new mongoose.Types.ObjectId(id)) } },
      { $set: { product_category: categoryToSet } }
    );

    if (updateResult.matchedCount === 0) {
      return next(new AppError("No items found matching the provided IDs.", 404));
    }

    res.status(200).json({
      message: `${updateResult.modifiedCount} item(s) updated to category '${categoryToSet === null ? "None" : categoryToSet}'.`,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
    });

  } catch (error) {
    if (error.name === 'CastError' && error.path === '_id') {
      return next(new AppError("Invalid item ID format in batch update.", 400));
    }
    next(new AppError(error.message || "Failed to batch update item categories", 500));
  }
};