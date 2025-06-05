const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

/**
 * Adds an attendance record for a given entity (User or Employee).
 * @param {mongoose.Model} Model - The Mongoose model (User or Employee).
 * @param {String} entityId - The ID of the user or employee.
 * @param {Object} attendanceData - Object containing date, status, payment.
 * @returns {Promise<Object>} The updated entity document.
 */
exports.addAttendanceRecord = async (Model, entityId, attendanceData) => {
    const { date, status, payment } = attendanceData;

    if (!date || !status || !payment) {
        throw new AppError("Date, status, and payment are required.", 400);
    }
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
        throw new AppError(`Invalid ${Model.modelName} ID format`, 400);
    }

    const entity = await Model.findById(entityId);
    if (!entity) {
        throw new AppError(`${Model.modelName} not found`, 404);
    }

    const attendanceDate = new Date(date);
    attendanceDate.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day

    const existingAttendance = entity.attendance.find(
        (att) => att.date.getTime() === attendanceDate.getTime()
    );

    if (existingAttendance) {
        throw new AppError(
            `Attendance for ${attendanceDate.toISOString().split("T")[0]} already exists. Use PUT to update.`,
            400
        );
    }

    entity.attendance.push({ date: attendanceDate, status, payment });
    await entity.save();
    return entity;
};

exports.getAttendanceRecords = async (Model, entityId) => {
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
        throw new AppError(`Invalid ${Model.modelName} ID format`, 400);
    }
    const entity = await Model.findById(entityId).select("username name attendance isAdmin");
    if (!entity) {
        throw new AppError(`${Model.modelName} not found`, 404);
    }
    return entity.attendance;
};

exports.updateAttendanceRecord = async (Model, entityId, dateString, updateData) => {
    const { status, payment } = updateData;

    if (!mongoose.Types.ObjectId.isValid(entityId)) {
        throw new AppError(`Invalid ${Model.modelName} ID format`, 400);
    }

    const attendanceDate = new Date(dateString);
    if (isNaN(attendanceDate.getTime())) {
        throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
    }
    attendanceDate.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day for comparison

    const entity = await Model.findById(entityId);
    if (!entity) {
        throw new AppError(`${Model.modelName} not found`, 404);
    }

    const attendanceIndex = entity.attendance.findIndex(
        (att) => att.date.getTime() === attendanceDate.getTime()
    );

    if (attendanceIndex === -1) {
        throw new AppError("Attendance record not found for this date.", 404);
    }

    if (status) entity.attendance[attendanceIndex].status = status;
    if (payment !== undefined) entity.attendance[attendanceIndex].payment = payment;

    await entity.save();
    return entity;
};

exports.deleteAttendanceRecord = async (Model, entityId, dateString) => {
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
        throw new AppError(`Invalid ${Model.modelName} ID format`, 400);
    }

    const attendanceDate = new Date(dateString);
    if (isNaN(attendanceDate.getTime())) {
        throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
    }
    attendanceDate.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day for comparison

    const entity = await Model.findById(entityId);
    if (!entity) {
        throw new AppError(`${Model.modelName} not found`, 404);
    }

    const initialLength = entity.attendance.length;
    entity.attendance = entity.attendance.filter(
        (att) => att.date.getTime() !== attendanceDate.getTime()
    );

    if (entity.attendance.length === initialLength) {
        throw new AppError("Attendance record not found for this date.", 404);
    }

    await entity.save();
    return entity;
};