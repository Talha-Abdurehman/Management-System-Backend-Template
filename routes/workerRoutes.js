const app = require("express");
const router = app.Router();

router.post("/workers");
router.get("/workers");
router.get("/workers/:id");
router.delete("/workers/:id");
router.put("/workers/:id");

module.exports = router;
