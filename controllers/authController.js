const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

exports.createUser = async (req, res) => {
  try {
    const { username, password, imgUrl, isAdmin, cnic, salary } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "User Already Exists" });
    }

    // Check for CNIC uniqueness if provided
    if (cnic) {
      const existingCnic = await User.findOne({ cnic });
      if (existingCnic) {
        return res.status(400).json({ message: `CNIC '${cnic}' already exists.` });
      }
    }

    const hashedPass = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashedPass,
      isAdmin: typeof isAdmin === 'boolean' ? isAdmin : false,
      imgUrl: imgUrl || null,
      cnic: cnic || null,
      salary: salary || null,
    });
    await newUser.save();
    res.status(201).json({ message: "User Created Successfully", user: newUser });
  } catch (e) {
    // Handle potential duplicate key errors for username or cnic if not caught by pre-checks
    if (e.code === 11000) {
      let field = Object.keys(e.keyValue)[0];
      field = field === 'username' ? 'Username' : (field === 'cnic' ? 'CNIC' : field);
      return res.status(400).json({ message: `${field} '${e.keyValue[Object.keys(e.keyValue)[0]]}' already exists.` });
    }
    return res.status(500).json({ message: `Server error during user creation: ${e.message}` });
  }
};

exports.getUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).select("+password");

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatched = await bcrypt.compare(password, user.password);
    if (!isMatched) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const tokenPayload = {
      userId: user._id,
      isAdmin: user.isAdmin,
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const userObject = user.toObject();
    delete userObject.password;

    res.json({ token, user: userObject });
  } catch (e) {
    return res.status(500).json({ message: `Server error: ${e}` });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    // Using .lean() can improve performance for read-only operations and ensures plain JS objects.
    const users = await User.find({}, "-password").lean();
    res.json(users);
  } catch (e) {
    res.status(500).json({ message: `Server error: ${e}` });
  }
};




exports.deleteUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.userId === userId) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own account." });
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

// --- User Attendance Controllers ---

exports.addUserAttendance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, status, payment } = req.body;

    if (!date || !status || !payment) {
      return res
        .status(400)
        .json({ message: "Date, status, and payment are required." });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const existingAttendance = user.attendance.find(
      (att) => att.date.getTime() === attendanceDate.getTime()
    );

    if (existingAttendance) {
      return res.status(400).json({
        message: `Attendance for ${attendanceDate.toISOString().split("T")[0]
          } already exists for this user. Use PUT to update.`,
      });
    }

    user.attendance.push({ date: attendanceDate, status, payment });
    await user.save();
    res
      .status(201)
      .json({ message: "Attendance added successfully for user", user });
  } catch (error) {
    res.status(500).json({ message: `Failed to add attendance: ${error.message}` });
  }
};

exports.getUserAttendance = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }
    const user = await User.findById(userId).select(
      "username isAdmin attendance"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user.attendance);
  } catch (error) {
    res.status(500).json({ message: `Failed to fetch user attendance: ${error.message}` });
  }
};

exports.updateUserAttendance = async (req, res) => {
  try {
    const { userId, attendanceDate: dateString } = req.params;
    const { status, payment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const attendanceDate = new Date(dateString);
    if (isNaN(attendanceDate.getTime())) {
      return res
        .status(400)
        .json({ message: "Invalid date format. Use YYYY-MM-DD." });
    }
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const attendanceIndex = user.attendance.findIndex(
      (att) => att.date.getTime() === attendanceDate.getTime()
    );

    if (attendanceIndex === -1) {
      return res
        .status(404)
        .json({ message: "Attendance record not found for this user on this date." });
    }

    if (status) user.attendance[attendanceIndex].status = status;
    if (payment) user.attendance[attendanceIndex].payment = payment;

    await user.save();
    res.json({ message: "Attendance updated successfully for user", user });
  } catch (error) {
    res.status(500).json({ message: `Failed to update attendance: ${error.message}` });
  }
};

exports.deleteUserAttendance = async (req, res) => {
  try {
    const { userId, attendanceDate: dateString } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const attendanceDate = new Date(dateString);
    if (isNaN(attendanceDate.getTime())) {
      return res
        .status(400)
        .json({ message: "Invalid date format. Use YYYY-MM-DD." });
    }
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const initialLength = user.attendance.length;
    user.attendance = user.attendance.filter(
      (att) => att.date.getTime() !== attendanceDate.getTime()
    );

    if (user.attendance.length === initialLength) {
      return res
        .status(404)
        .json({ message: "Attendance record not found for this user on this date." });
    }

    await user.save();
    res.json({ message: "Attendance deleted successfully for user", user });
  } catch (error) {
    res.status(500).json({ message: `Failed to delete attendance: ${error.message}` });
  }
};

exports.updateUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const { username, password, isAdmin, imgUrl, cnic, salary } = req.body;
    const updateData = {};

    if (username) updateData.username = username;
    if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;
    if (imgUrl !== undefined) updateData.imgUrl = imgUrl;
    if (cnic !== undefined) updateData.cnic = cnic;
    if (salary !== undefined) updateData.salary = salary;


    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Check for username uniqueness if it's being changed
    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: `Username '${username}' already exists.` });
      }
    }
    // Check for CNIC uniqueness if it's being changed and is not null/empty
    if (cnic) {
      const existingCnic = await User.findOne({ cnic, _id: { $ne: userId } });
      if (existingCnic) {
        return res.status(400).json({ message: `CNIC '${cnic}' already exists for another user.` });
      }
    }


    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true, runValidators: true }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ message: "User updated successfully.", user: updatedUser });
  } catch (e) {
    // Handle potential duplicate key errors for username or cnic if not caught by pre-checks
    if (e.code === 11000) {
      let field = Object.keys(e.keyValue)[0];
      field = field === 'username' ? 'Username' : (field === 'cnic' ? 'CNIC' : field);
      return res.status(400).json({ message: `${field} '${e.keyValue[Object.keys(e.keyValue)[0]]}' already exists.` });
    }
    res.status(500).json({ message: `Server error during user update: ${e.message}` });
  }
};