const express = require("express");
const router = express.Router();
const itemsController = require('../controllers/itemsController')

// router.get('/items', getAllItems);
// router.get('/items/:id', getItemById)

router.post('/items', itemsController.createItem);

module.exports = router;

