const BusinessHistory = require("../models/BusinessHistory.model");

exports.fetchHistory = async (req, res) => {
  try {
    const data = await BusinessHistory.find();
    if (!data || data.length === 0) {
      return res.status(404).json({ Message: "Not Found" });
    } else {
      res.json(data);
    }
  } catch (e) {
    res.status(500).json({ message: `${e}` });
  }
};

exports.createHistoryRecord = async (req, res) => {
  try {
    console.log(req.body);

    // Check if the data is an array
    if (Array.isArray(req.body)) {
      // Handle array of history records
      const results = await Promise.all(
        req.body.map(async (historyItem) => {
          // Check if a record with this year already exists
          const existingRecord = await BusinessHistory.findOne({
            year: historyItem.year,
          });

          if (existingRecord) {
            // Update existing record
            historyItem.months.forEach((newMonth) => {
              const monthIndex = existingRecord.months.findIndex(
                (m) => m.month === newMonth.month
              );

              if (monthIndex >= 0) {
                // Month exists, update/add days
                newMonth.days.forEach((newDay) => {
                  const dayIndex = existingRecord.months[
                    monthIndex
                  ].days.findIndex((d) => d.day === newDay.day);

                  if (dayIndex >= 0) {
                    // Update existing day
                    existingRecord.months[monthIndex].days[dayIndex] = newDay;
                  } else {
                    // Add new day
                    existingRecord.months[monthIndex].days.push(newDay);
                  }
                });
              } else {
                // Add new month
                existingRecord.months.push(newMonth);
              }
            });

            await existingRecord.save();
            return { year: historyItem.year, status: "updated" };
          } else {
            // Create new record
            const newRecord = new BusinessHistory(historyItem);
            await newRecord.save();
            return { year: historyItem.year, status: "created" };
          }
        })
      );

      return res.status(201).json({
        message: "Records processed successfully",
        results,
      });
    } else {
      // Handle single history record
      const historyItem = req.body;

      // Check if a record with this year already exists
      const existingRecord = await BusinessHistory.findOne({
        year: historyItem.year,
      });

      if (existingRecord) {
        // Update logic for existing record (same as in array case)
        historyItem.months.forEach((newMonth) => {
          const monthIndex = existingRecord.months.findIndex(
            (m) => m.month === newMonth.month
          );

          if (monthIndex >= 0) {
            newMonth.days.forEach((newDay) => {
              const dayIndex = existingRecord.months[monthIndex].days.findIndex(
                (d) => d.day === newDay.day
              );

              if (dayIndex >= 0) {
                existingRecord.months[monthIndex].days[dayIndex] = newDay;
              } else {
                existingRecord.months[monthIndex].days.push(newDay);
              }
            });
          } else {
            existingRecord.months.push(newMonth);
          }
        });

        await existingRecord.save();
        return res.status(200).json({ message: "Record updated successfully" });
      } else {
        // Create new record
        const newRecord = new BusinessHistory(historyItem);
        await newRecord.save();
        return res.status(201).json({ message: "Record created successfully" });
      }
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: `${e}` });
  }
};

exports.getHistoryByYear = async (req, res) => {
  try {
    const { id } = req.params; // id is the year
    const record = await BusinessHistory.findOne({ year: id });

    if (!record) {
      return res.status(404).json({ message: "Year not found" });
    }

    res.json(record);
  } catch (e) {
    res.status(500).json({ message: `${e}` });
  }
};

exports.updateHistoryByYear = async (req, res) => {
  try {
    const { id } = req.params; // id is the year
    const updateData = req.body;

    const record = await BusinessHistory.findOne({ year: id });

    if (!record) {
      return res.status(404).json({ message: "Year not found" });
    }

    // Update logic (similar to create)
    updateData.months.forEach((newMonth) => {
      const monthIndex = record.months.findIndex(
        (m) => m.month === newMonth.month
      );

      if (monthIndex >= 0) {
        newMonth.days.forEach((newDay) => {
          const dayIndex = record.months[monthIndex].days.findIndex(
            (d) => d.day === newDay.day
          );

          if (dayIndex >= 0) {
            record.months[monthIndex].days[dayIndex] = newDay;
          } else {
            record.months[monthIndex].days.push(newDay);
          }
        });
      } else {
        record.months.push(newMonth);
      }
    });

    await record.save();
    res.json({ message: "Updated successfully" });
  } catch (e) {
    res.status(500).json({ message: `${e}` });
  }
};

exports.deleteHistoryByYear = async (req, res) => {
  try {
    const { id } = req.params; // id is the year
    const result = await BusinessHistory.deleteOne({ year: id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Year not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (e) {
    res.status(500).json({ message: `${e}` });
  }
};
