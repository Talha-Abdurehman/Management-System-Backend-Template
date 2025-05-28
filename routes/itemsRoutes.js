const express = require("express");
const router = express.Router();
const itemsController = require("../controllers/itemsController");

// router.get('/items', getAllItems);
// router.get('/items/:id', getItemById)

router.post("/items", itemsController.createItem);

router.delete("/items/:id", itemsController.deleteItemById);

router.get("/items", itemsController.fetchAllItems);

router.get("/items/:id", itemsController.fetchById);

router.put("/items/:id", itemsController.updateById);

router.post("/items/batch-update-stock", itemsController.batchUpdateStock);

// Category Management Routes
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/categories", itemsController.getAllCategories);
router.post("/categories", adminMiddleware, itemsController.createCategory);
router.put("/categories/rename", adminMiddleware, itemsController.renameCategory);
router.delete("/categories/:name", adminMiddleware, itemsController.deleteCategoryByName);
router.post("/categories/batch-delete", adminMiddleware, itemsController.batchDeleteCategories); // New route for batch deleting categories


module.exports = router;