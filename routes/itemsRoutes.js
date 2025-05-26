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

module.exports = router;
