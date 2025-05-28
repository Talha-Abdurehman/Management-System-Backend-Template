const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Category name is required."],
            trim: true,
            unique: true, // Ensures uniqueness at the database level
            // Consider adding a custom setter or pre-save hook for case-insensitivity if DB collation doesn't handle it
        },
        // You could add other fields like description, image, etc. in the future
    },
    {
        timestamps: true,
    }
);

// Optional: Pre-save hook to ensure case-insensitive uniqueness if not handled by DB collation
// categorySchema.pre('save', async function(next) {
//   if (this.isModified('name') || this.isNew) {
//     const existingCategory = await this.constructor.findOne({ 
//       name: new RegExp(`^${this.name}$`, 'i') 
//     });
//     if (existingCategory && existingCategory._id.toString() !== this._id.toString()) {
//       return next(new Error(`Category with name '${this.name}' already exists.`));
//     }
//   }
//   next();
// });

module.exports = mongoose.model("Category", categorySchema);