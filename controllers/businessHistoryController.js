const BusinessHistory = require("../models/BusinessHistory.model");

// Helper function to update or add months and days to a history record
function _updateNestedHistoryData(existingRecord, newData) {
  newData.months.forEach((newMonth) => {
    const monthIndex = existingRecord.months.findIndex(
      (m) => m.month === newMonth.month
    );

    if (monthIndex >= 0) {
      // Month exists, update/add days
      const targetMonth = existingRecord.months[monthIndex];
      newMonth.days.forEach((newDay) => {
        const dayIndex = targetMonth.days.findIndex(
          (d) => d.day === newDay.day
        );

        if (dayIndex >= 0) {
          // Update existing day
          targetMonth.days[dayIndex] = newDay;
        } else {
          // Add new day
          targetMonth.days.push(newDay);
        }
      });
      // Optional: Sort days if order matters
      targetMonth.days.sort((a, b) => a.day - b.day);
    } else {
      // Add new month with its days
      existingRecord.months.push(newMonth);
    }
  });
  // Optional: Sort months if order matters
  existingRecord.months.sort((a, b) => a.month - b.month);
}

exports.fetchHistory = async (req, res) => {
  try {
    const data = await BusinessHistory.find();
    if (!data || data.length === 0) {
      return res.status(404).json({ Message: "Not Found" });
    }
    res.json(data);
  } catch (e) {
    console.error("Error fetching history:", e);
    res.status(500).json({ message: e.message || "Internal Server Error" });
  }
};

exports.createHistoryRecord = async (req, res) => {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("Request body for createHistoryRecord:", req.body);
    }

    if (Array.isArray(req.body)) {
      const results = await Promise.all(
        req.body.map(async (historyItem) => {
          const existingRecord = await BusinessHistory.findOne({
            year: historyItem.year,
          });

          if (existingRecord) {
            _updateNestedHistoryData(existingRecord, historyItem);
            await existingRecord.save();
            return { year: historyItem.year, status: "updated" };
          } else {
            const newRecord = new BusinessHistory(historyItem);
            await newRecord.save();
            return { year: historyItem.year, status: "created" };
          }
        })
      );

      return res
        .status(201)
        .json({ message: "Records processed successfully", results });
    } else {
      const historyItem = req.body;
      const existingRecord = await BusinessHistory.findOne({
        year: historyItem.year,
      });

      if (existingRecord) {
        _updateNestedHistoryData(existingRecord, historyItem);
        await existingRecord.save();
        return res
          .status(200)
          .json({ message: "Record updated successfully" });
      } else {
        const newRecord = new BusinessHistory(historyItem);
        await newRecord.save();
        return res
          .status(201)
          .json({ message: "Record created successfully" });
      }
    }
  } catch (e) {
    console.error("Error creating/updating history record:", e);
    res.status(500).json({ message: e.message || "Internal Server Error" });
  }
};

exports.getHistoryByYear = async (req, res) => {
  try {
    const { id } = req.params; // id is the year
    const record = await BusinessHistory.findOne({ year: parseInt(id, 10) });

    if (!record) {
      return res.status(404).json({ message: "Year not found" });
    }

    res.json(record);
  } catch (e) {
    console.error(`Error fetching history for year ${req.params.id}:`, e);
    res.status(500).json({ message: e.message || "Internal Server Error" });
  }
};

exports.updateHistoryByYear = async (req, res) => {
  try {
    const { id } = req.params; // id is the year
    const updateData = req.body;

    const record = await BusinessHistory.findOne({ year: parseInt(id, 10) });

    if (!record) {
      return res.status(404).json({ message: "Year not found" });
    }

    _updateNestedHistoryData(record, updateData);
    await record.save();
    res.json({ message: "Updated successfully" });
  } catch (e) {
    console.error(`Error updating history for year ${req.params.id}:`, e);
    res.status(500).json({ message: e.message || "Internal Server Error" });
  }
};

exports.deleteHistoryByYear = async (req, res) => {
  try {
    const { id } = req.params; // id is the year
    const result = await BusinessHistory.deleteOne({ year: parseInt(id, 10) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Year not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (e) {
    console.error(`Error deleting history for year ${req.params.id}:`, e);
    res.status(500).json({ message: e.message || "Internal Server Error" });
  }
};