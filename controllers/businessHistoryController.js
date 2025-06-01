const BusinessHistory = require("../models/BusinessHistory.model");
const AppError = require('../utils/AppError');

// Helper function to update or add months and days to a history record
// NOTE: This helper is NOT ATOMIC for concurrent requests trying to create the same new month/day.
// It's prone to race conditions if multiple requests attempt to initialize the same nested document.
// For read-heavy or single-update scenarios, it's acceptable. For high concurrency on new entries,
// a more robust solution (e.g., queuing, distributed locks, or complex atomic ops) is needed.
function _updateNestedHistoryData(existingRecord, newData) {
  newData.months.forEach((newMonthData) => {
    const monthIndex = existingRecord.months.findIndex(
      (m) => m.month === newMonthData.month
    );

    if (monthIndex >= 0) {
      const targetMonth = existingRecord.months[monthIndex];
      newMonthData.days.forEach((newDayData) => {
        const dayIndex = targetMonth.days.findIndex(
          (d) => d.day === newDayData.day
        );
        if (dayIndex >= 0) {
          targetMonth.days[dayIndex].totalProfit = newDayData.totalProfit;
          targetMonth.days[dayIndex].totalOrders = newDayData.totalOrders;
        } else {
          targetMonth.days.push({ day: newDayData.day, totalProfit: newDayData.totalProfit, totalOrders: newDayData.totalOrders });
        }
      });
      targetMonth.days.sort((a, b) => a.day - b.day);
    } else {
      const newMonthEntry = { month: newMonthData.month, days: [] };
      newMonthData.days.forEach(newDayData => {
        newMonthEntry.days.push({ day: newDayData.day, totalProfit: newDayData.totalProfit, totalOrders: newDayData.totalOrders });
      });
      newMonthEntry.days.sort((a, b) => a.day - b.day);
      existingRecord.months.push(newMonthEntry);
    }
  });
  existingRecord.months.sort((a, b) => a.month - b.month);
}

exports.fetchHistory = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    let query = {};
    let dateFilterActive = false;

    let sDate, eDate;

    if (startDate) {
      dateFilterActive = true;
      sDate = new Date(startDate);
      sDate.setUTCHours(0, 0, 0, 0);

      // If only startDate is provided, or if startDate and endDate are the same, filter for that single day.
      // Otherwise, use the endDate for the range.
      eDate = (endDate && startDate !== endDate) ? new Date(endDate) : new Date(startDate);
      eDate.setUTCHours(23, 59, 59, 999);

      const startYear = sDate.getFullYear();
      const endYear = eDate.getFullYear();
      query.year = { $gte: startYear, $lte: endYear };
    }

    let records = await BusinessHistory.find(query).sort({ year: -1 }).lean();

    if (dateFilterActive && records.length > 0) {
      records = records.map(yearRecord => {
        const filteredMonths = yearRecord.months
          .filter(monthData => {
            const monthStartUTC = Date.UTC(yearRecord.year, monthData.month - 1, 1);
            // Last day of month: day 0 of next month
            const monthEndUTC = Date.UTC(yearRecord.year, monthData.month, 0, 23, 59, 59, 999);

            return monthStartUTC <= eDate.getTime() && monthEndUTC >= sDate.getTime();
          })
          .map(monthData => {
            const filteredDays = monthData.days.filter(dayData => {
              const currentDayUTC = Date.UTC(yearRecord.year, monthData.month - 1, dayData.day);
              return currentDayUTC >= sDate.getTime() && currentDayUTC <= eDate.getTime();
            });
            return { ...monthData, days: filteredDays.filter(d => d.totalOrders > 0 || d.totalProfit > 0) }; // Only keep days with data
          });
        return { ...yearRecord, months: filteredMonths.filter(m => m.days.length > 0) };
      });
      records = records.filter(y => y.months.length > 0);
    }

    if (!records || records.length === 0) {
      return res.json([]);
    }
    res.json(records);
  } catch (e) {
    next(new AppError(e.message || "Error fetching history", 500));
  }
};

exports.createHistoryRecord = async (req, res, next) => {
  try {
    // Input validation (basic)
    if (!req.body || (Array.isArray(req.body) && req.body.length === 0) || (!Array.isArray(req.body) && !req.body.year)) {
      return next(new AppError("Invalid request body. Year is required.", 400));
    }

    if (Array.isArray(req.body)) {
      const results = [];
      for (const historyItem of req.body) {
        if (!historyItem.year) {
          results.push({ year: null, status: "skipped", error: "Year is required for item." });
          continue;
        }
        const existingRecord = await BusinessHistory.findOne({ year: historyItem.year });
        if (existingRecord) {
          _updateNestedHistoryData(existingRecord, historyItem);
          await existingRecord.save();
          results.push({ year: historyItem.year, status: "updated" });
        } else {
          const newRecord = new BusinessHistory(historyItem);
          // Ensure months and days are sorted if provided in unsorted manner
          newRecord.months.forEach(month => month.days.sort((a, b) => a.day - b.day));
          newRecord.months.sort((a, b) => a.month - b.month);
          await newRecord.save();
          results.push({ year: historyItem.year, status: "created" });
        }
      }
      return res.status(201).json({ message: "Records processed successfully", results });
    } else {
      const historyItem = req.body;
      if (!historyItem.year) return next(new AppError("Year is required.", 400));

      const existingRecord = await BusinessHistory.findOne({ year: historyItem.year });
      if (existingRecord) {
        _updateNestedHistoryData(existingRecord, historyItem);
        await existingRecord.save();
        return res.status(200).json({ message: "Record updated successfully", data: existingRecord });
      } else {
        const newRecord = new BusinessHistory(historyItem);
        newRecord.months.forEach(month => month.days.sort((a, b) => a.day - b.day));
        newRecord.months.sort((a, b) => a.month - b.month);
        await newRecord.save();
        return res.status(201).json({ message: "Record created successfully", data: newRecord });
      }
    }
  } catch (e) {
    if (e.name === 'ValidationError') {
      return next(new AppError(e.message, 400));
    }
    if (e.code === 11000) { // Duplicate year
      return next(new AppError(`History record for year ${req.body.year || e.keyValue.year} already exists.`, 400));
    }
    next(new AppError(e.message || "Error creating/updating history record", 500));
  }
};

exports.getHistoryByYear = async (req, res, next) => {
  try {
    const year = parseInt(req.params.id, 10);
    if (isNaN(year)) {
      return next(new AppError("Invalid year format.", 400));
    }
    const record = await BusinessHistory.findOne({ year: year });
    if (!record) {
      return next(new AppError("Year not found", 404));
    }
    res.json(record);
  } catch (e) {
    next(new AppError(e.message || "Error fetching history by year", 500));
  }
};

exports.updateHistoryByYear = async (req, res, next) => {
  try {
    const year = parseInt(req.params.id, 10);
    if (isNaN(year)) {
      return next(new AppError("Invalid year format.", 400));
    }
    const updateData = req.body;
    if (!updateData || !updateData.months) { // Basic validation
      return next(new AppError("Invalid update data. 'months' array is required.", 400));
    }

    const record = await BusinessHistory.findOne({ year: year });
    if (!record) {
      return next(new AppError("Year not found, cannot update.", 404));
    }

    _updateNestedHistoryData(record, updateData);
    await record.save();
    res.json({ message: "Updated successfully", data: record });
  } catch (e) {
    if (e.name === 'ValidationError') {
      return next(new AppError(e.message, 400));
    }
    next(new AppError(e.message || "Error updating history by year", 500));
  }
};

exports.deleteHistoryByYear = async (req, res, next) => {
  try {
    const year = parseInt(req.params.id, 10);
    if (isNaN(year)) {
      return next(new AppError("Invalid year format.", 400));
    }
    const result = await BusinessHistory.deleteOne({ year: year });
    if (result.deletedCount === 0) {
      return next(new AppError("Year not found, nothing to delete.", 404));
    }
    res.json({ message: "Deleted successfully" });
  } catch (e) {
    next(new AppError(e.message || "Error deleting history by year", 500));
  }
};