const express = require("express");
const router = express.Router();
const businessHistoryController = require("../controllers/businessHistoryController");

router.get("/history", businessHistoryController.fetchHistory);

router.get("/history/:id", businessHistoryController.getHistoryByYear);

router.put("/history/:id", businessHistoryController.updateHistoryByYear);

router.delete("/history/:id", businessHistoryController.deleteHistoryByYear);

router.post("/history", businessHistoryController.createHistoryRecord);

module.exports = router;
