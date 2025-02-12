const {welcomeController} = require("../controllers/welcomeController")
const express = require("express")
const router = express.Router()


router.get("/homepage", welcomeController)


module.exports = router;