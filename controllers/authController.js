const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

exports.createUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ message: "User Already Exists" });

    const hashedPass = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPass, isAdmin: false });
    await newUser.save();
    res.status(201).json({ message: "User Created Successfully" });
  } catch (e) {
    return res.status(500).json({ message: `Server error: ${e}` });
  }
};

exports.getUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "User not found" });
    const isMatched = await bcrypt.compare(password, user.password);
    if (!isMatched)
      return res.status(400).json({ message: "Invalid Credentials" });

    const tokenPayload = {
      userId: user._id,
      isAdmin: user.isAdmin
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (e) {
    return res.status(500).json({ message: `Server error: ${e}` });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, "-password");
    res.json(users);
  } catch (e) {
    res.status(500).json({ message: `Server error: ${e}` });
  }
};

exports.deleteUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.userId === userId) {
      return res.status(400).json({ message: "Cannot delete your own account." });
    }

    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json({ message: "User deleted successfully." });
  } catch (e) {
    res.status(500).json({ message: `Server error: ${e}` });
  }
};