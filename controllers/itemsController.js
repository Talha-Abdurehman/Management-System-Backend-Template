const Item = require("../models/Items.model");
const Category = require("../models/Category.model");
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

exports.createItem = async (req, res, next) => {
  try {
    const itemData = { ...req.body };
    if (!itemData.product_category || itemData.product_category.trim() === "") {
      itemData.product_category = "Uncategorized"; // Ensure default if empty string sent
    }
    const newItem = new Item(itemData);
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
    const updateData = { ...req.body };
    if (updateData.hasOwnProperty('product_category') && (updateData.product_category === null || updateData.product_category.trim() === "")) {
      updateData.product_category = "Uncategorized";
    }

    const result = await Item.findByIdAndUpdate(id, updateData, {
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
    if (name.trim().toLowerCase() === "uncategorized") {
      return next(new AppError("Cannot create a category named 'Uncategorized' as it is a system-reserved default.", 400));
    }

    const existingCategory = await Category.findOne({ name: { $regex: `^${name.trim()}`, $options: 'i' } });
    if (existingCategory) {
      return next(new AppError(`Category '${name.trim()}' already exists.`, 400));
    }

    const newCategory = new Category({ name: name.trim() });
    await newCategory.save();
    res.status(201).json({ message: "Category created successfully", category: newCategory });
  } catch (error) {
    if (error.code === 11000) {
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
    const categories = await Category.find().sort({ name: 1 });
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

    const trimmedOldName = oldName.trim();
    const trimmedNewName = newName.trim();

    if (trimmedNewName === "") {
      return next(new AppError("New category name cannot be empty.", 400));
    }
    if (trimmedNewName.toLowerCase() === "uncategorized") {
      return next(new AppError("Cannot rename a category to 'Uncategorized' as it is a system-reserved default.", 400));
    }
    if (trimmedOldName.toLowerCase() === trimmedNewName.toLowerCase()) {
      return res.json({ message: "Old and new category names are the same. No changes made.", modifiedCount: 0 });
    }

    const escapeRegex = (string) => string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const findOldNameFilter = { name: { $regex: `^${escapeRegex(trimmedOldName)}$`, $options: 'i' } };
    const categoryToUpdate = await Category.findOne(findOldNameFilter);

    if (!categoryToUpdate) {
      return next(new AppError(`Category '${trimmedOldName}' not found.`, 404));
    }

    const findNewNameFilter = { name: { $regex: `^${escapeRegex(trimmedNewName)}$`, $options: 'i' }, _id: { $ne: categoryToUpdate._id } };
    const newNameExists = await Category.findOne(findNewNameFilter);

    if (newNameExists) {
      return next(new AppError(`Category name '${trimmedNewName}' already exists.`, 400));
    }

    categoryToUpdate.name = trimmedNewName;
    await categoryToUpdate.save();

    const itemUpdateFilter = { product_category: { $regex: `^${escapeRegex(trimmedOldName)}$`, $options: 'i' } };
    const itemUpdatePayload = { $set: { product_category: trimmedNewName } };
    const itemUpdateResult = await Item.updateMany(itemUpdateFilter, itemUpdatePayload);

    res.json({
      message: `Category '${trimmedOldName}' successfully renamed to '${trimmedNewName}'. Updated ${itemUpdateResult.modifiedCount} items.`,
      modifiedItemCount: itemUpdateResult.modifiedCount,
      updatedCategory: categoryToUpdate
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      return next(new AppError(error.message, 400));
    }
    if (error.code === 11000) {
      return next(new AppError(`Category name '${req.body.newName.trim()}' already results in a duplicate.`, 400));
    }
    next(new AppError(error.message || "Failed to rename category", 500));
  }
};

exports.deleteCategoryByName = async (req, res, next) => {
  try {
    const categoryNameParam = req.params.name;

    if (!categoryNameParam || categoryNameParam.trim() === "") {
      return next(new AppError("Category name parameter is required.", 400));
    }

    const escapeRegex = (string) => string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const trimmedCategoryName = categoryNameParam.trim();
    const safeRegexCategoryName = escapeRegex(trimmedCategoryName);

    const deleteFilter = { name: { $regex: `^${safeRegexCategoryName}$`, $options: 'i' } };

    const categoryToDelete = await Category.findOneAndDelete(deleteFilter);

    if (!categoryToDelete) {
      return next(new AppError(`Category '${trimmedCategoryName}' not found.`, 404));
    }

    const actualDeletedCategoryName = categoryToDelete.name;
    const safeActualDeletedCategoryNameRegex = escapeRegex(actualDeletedCategoryName);
    const itemUpdateFilter = { product_category: { $regex: `^${safeActualDeletedCategoryNameRegex}$`, $options: 'i' } };

    const updateResult = await Item.updateMany(
      itemUpdateFilter,
      { $set: { product_category: "Uncategorized" } }
    );

    res.json({
      message: `Category '${actualDeletedCategoryName}' deleted successfully. ${updateResult.modifiedCount} items updated to 'Uncategorized'.`,
      deletedCategory: categoryToDelete,
      itemsUpdatedCount: updateResult.modifiedCount
    });

  } catch (error) {
    next(new AppError(error.message || "Failed to delete category", 500));
  }
};

exports.batchDeleteCategories = async (req, res, next) => {
  try {
    const { names } = req.body;

    if (!names || !Array.isArray(names) || names.length === 0) {
      return next(new AppError("Array of category names is required for batch deletion.", 400));
    }

    const trimmedNames = names.map(name => name.trim()).filter(name => name !== "");
    if (trimmedNames.length === 0) {
      return next(new AppError("No valid category names provided after trimming.", 400));
    }

    const categoryDeletionResult = await Category.deleteMany({
      name: { $in: trimmedNames.map(name => new RegExp(`^${name}`, 'i')) }
    });

    const itemUpdateResult = await Item.updateMany(
      { product_category: { $in: trimmedNames.map(name => new RegExp(`^${name}`, 'i')) } },
      { $set: { product_category: "Uncategorized" } }
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
  console.log("[ItemsController] Batch Update Category: Received request with body:", req.body);
  try {
    const { itemIds, newCategoryName } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      console.log("[ItemsController] Batch Update Category: Validation Error - itemIds array is required and cannot be empty.");
      return next(new AppError("Array of itemIds is required.", 400));
    }

    for (const itemId of itemIds) {
      if (!mongoose.Types.ObjectId.isValid(itemId)) {
        console.log(`[ItemsController] Batch Update Category: Validation Error - Invalid itemId format: ${itemId}`);
        return next(new AppError(`Invalid itemId format: ${itemId}`, 400));
      }
    }
    console.log("[ItemsController] Batch Update Category: Item IDs validated:", itemIds);

    let categoryToSet;
    if (newCategoryName && newCategoryName.trim() !== "" && newCategoryName.trim().toLowerCase() !== "uncategorized") {
      console.log(`[ItemsController] Batch Update Category: Attempting to set new category to '${newCategoryName.trim()}'`);
      const categoryExists = await Category.findOne({ name: { $regex: `^${newCategoryName.trim()}`, $options: 'i' } });
      if (!categoryExists) {
        console.log(`[ItemsController] Batch Update Category: Validation Error - Category '${newCategoryName.trim()}' does not exist.`);
        return next(new AppError(`Category '${newCategoryName.trim()}' does not exist. Please create it first or choose 'Uncategorized'.`, 400));
      }
      categoryToSet = categoryExists.name; // Use the exact name from DB to maintain case consistency
      console.log(`[ItemsController] Batch Update Category: Category '${categoryToSet}' found and will be used.`);
    } else {
      categoryToSet = "Uncategorized";
      console.log("[ItemsController] Batch Update Category: Setting category to 'Uncategorized'.");
    }

    const updateResult = await Item.updateMany(
      { _id: { $in: itemIds.map(id => new mongoose.Types.ObjectId(id)) } },
      { $set: { product_category: categoryToSet } }
    );
    console.log("[ItemsController] Batch Update Category: Item.updateMany result:", updateResult);


    if (updateResult.matchedCount === 0 && itemIds.length > 0) { // Check if itemIds was not empty
      console.log("[ItemsController] Batch Update Category: No items found matching the provided IDs for update.");
      // It's not necessarily an error if no items matched, but could be an indication of a problem.
      // For now, we will proceed to send a success response, but indicate 0 modified.
    }


    res.status(200).json({
      message: `${updateResult.modifiedCount} item(s) updated to category '${categoryToSet}'. Matched ${updateResult.matchedCount} items.`,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
    });

  } catch (error) {
    console.error("[ItemsController] Batch Update Category: Error caught:", error);
    if (error.name === 'CastError' && error.path === '_id') {
      return next(new AppError("Invalid item ID format in batch update.", 400));
    }
    next(new AppError(error.message || "Failed to batch update item categories", 500));
  }
};