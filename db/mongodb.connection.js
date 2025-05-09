const mongoose = require('mongoose');
const dotenv = require("dotenv");
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("FATAL ERROR: MONGO_URI is not defined in .env file.");
    process.exit(1);
}

const ConnectDB = async () => {
    console.log("Attempting to connect to MongoDB...");
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Successfully established initial connection to MongoDB.");

        mongoose.connection.on('connected', () => {
            console.log('Mongoose event: Connection to MongoDB successful/re-established.');
        });

        mongoose.connection.on('error', (err) => {
            console.error('Mongoose connection error event:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('Mongoose event: Disconnected from MongoDB.');
        });

    } catch (e) {
        console.error("FATAL: Failed to connect to MongoDB on initial startup:", e.message);
        // TODO: More graceful shutdown or retry mechanism for production
        process.exit(1);
    }
};

module.exports = ConnectDB;