const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const AppError = require('../utils/AppError');
const attendanceService = require('../services/attendanceService');

exports.createUser = async (req, res, next) => {
  try {
    const { username, password, imgUrl, isAdmin, cnic, salary } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return next(new AppError("User Already Exists", 400));
    }

    if (cnic) {
      const existingCnic = await User.findOne({ cnic });
      if (existingCnic) {
        return next(new AppError(`CNIC '${cnic}' already exists.`, 400));
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

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({ message: "User Created Successfully", user: userResponse });
  } catch (e) {
    if (e.code === 11000) {
      let field = Object.keys(e.keyValue)[0];
      field = field === 'username' ? 'Username' : (field === 'cnic' ? 'CNIC' : field);
      return next(new AppError(`${field} '${e.keyValue[Object.keys(e.keyValue)[0]]}' already exists.`, 400));
    }
    return next(new AppError(`Server error during user creation: ${e.message}`, 500));
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return next(new AppError('Please provide username and password', 400));
    }
    const user = await User.findOne({ username }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError("Incorrect username or password", 401));
    }

    const tokenPayload = {
      userId: user._id,
      isAdmin: user.isAdmin,
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    });

    const userObject = user.toObject();
    delete userObject.password;

    res.json({ token, user: userObject });
  } catch (e) {
    return next(new AppError(`Server error: ${e.message}`, 500));
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({}, "-password").lean();
    res.json(users);
  } catch (e) {
    return next(new AppError(`Server error: ${e.message}`, 500));
  }
};

exports.deleteUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (req.user.userId === userId) {
      return next(new AppError("Cannot delete your own account.", 400));
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return next(new AppError("Invalid user ID format", 400));
    }

    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return next(new AppError("User not found.", 404));
    }
    res.json({ message: "User deleted successfully." });
  } catch (e) {
    return next(new AppError(`Server error: ${e.message}`, 500));
  }
};

exports.updateUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return next(new AppError("Invalid user ID format", 400));
    }

    const { username, password, isAdmin, imgUrl, cnic, salary } = req.body;
    const updateData = {};

    if (username) updateData.username = username;
    if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;
    if (imgUrl !== undefined) updateData.imgUrl = imgUrl; // Allows setting to null
    if (cnic !== undefined) updateData.cnic = cnic; // Allows setting to null
    if (salary !== undefined) updateData.salary = salary; // Allows setting to null

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUser) {
        return next(new AppError(`Username '${username}' already exists.`, 400));
      }
    }
    if (cnic) {
      const existingCnic = await User.findOne({ cnic, _id: { $ne: userId } });
      if (existingCnic) {
        return next(new AppError(`CNIC '${cnic}' already exists for another user.`, 400));
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true, runValidators: true }).select("-password");

    if (!updatedUser) {
      return next(new AppError("User not found.", 404));
    }

    res.json({ message: "User updated successfully.", user: updatedUser });
  } catch (e) {
    if (e.code === 11000) {
      let field = Object.keys(e.keyValue)[0];
      field = field === 'username' ? 'Username' : (field === 'cnic' ? 'CNIC' : field);
      return next(new AppError(`${field} '${e.keyValue[Object.keys(e.keyValue)[0]]}' already exists.`, 400));
    }
    return next(new AppError(`Server error during user update: ${e.message}`, 500));
  }
};

// --- User Attendance Controllers ---

exports.addUserAttendance = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await attendanceService.addAttendanceRecord(User, userId, req.body);
    const userResponse = user.toObject();
    delete userResponse.password;
    res.status(201).json({ message: "Attendance added successfully for user", user: userResponse });
  } catch (error) {
    next(error);
  }
};

exports.getUserAttendance = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const attendance = await attendanceService.getAttendanceRecords(User, userId);
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

exports.updateUserAttendance = async (req, res, next) => {
  try {
    const { userId, attendanceDate } = req.params;
    const user = await attendanceService.updateAttendanceRecord(User, userId, attendanceDate, req.body);
    const userResponse = user.toObject();
    delete userResponse.password;
    res.json({ message: "Attendance updated successfully for user", user: userResponse });
  } catch (error) {
    next(error);
  }
};

exports.deleteUserAttendance = async (req, res, next) => {
  try {
    const { userId, attendanceDate } = req.params;
    const user = await attendanceService.deleteAttendanceRecord(User, userId, attendanceDate);
    const userResponse = user.toObject();
    delete userResponse.password;
    res.json({ message: "Attendance deleted successfully for user", user: userResponse });
  } catch (error) {
    next(error);
  }
};
