// File: subhanTraders-app/routes/welcomeRoute.js
const express = require("express");
const router = express.Router();

const welcomeController = (req, res) => {
    res.status(200).json({ message: "Welcome to the SubhanTraders API v1 Homepage!" });
};

router.get("/homepage", welcomeController);

module.exports = router;