const mongoose = require('mongoose');
const dotenv = require("dotenv")
dotenv.config()

const ConnectDB = () => {
    try {
        mongoose.connect(process.env.MONGO_URI)
        console.log("Connected to Mongodb")
    }
    catch(e) {
        console.log(e)
    }
}

module.exports = ConnectDB;