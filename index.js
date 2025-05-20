const express = require("express");
const ConnectDB = require("./db/mongodb.connection");
const dotenv = require("dotenv");
const authMiddleware = require("./middleware/authMiddleware");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

dotenv.config();
const PORT = process.env.PORT || 3000;

ConnectDB();

//===============================================================================

// Authentication Routes
app.use("/api/v1/auth", require("./routes/AuthRoutes"));

//===============================================================================

// API Routes for Items and Listing etc
app.use("/api/v1", authMiddleware, require("./routes/itemsRoutes"));

// API Routes for Orders / Invoices
app.use("/api/v1", authMiddleware, require("./routes/orderRoutes"));

// API Routes for Business History
app.use("/api/v1", authMiddleware, require("./routes/BusinessHistoryRoutes"));

// API Routes for Employees
app.use("/api/v1", authMiddleware, require("./routes/employeeRoutes"));

// API Routes for Customers
app.use("/api/v1", authMiddleware, require("./routes/customersRoutes"));

//===============================================================================

app.get("/", (req, res) => {
  res.send("<h1>Current Status: Running</h1>");
});

app.listen(PORT, () => {
  console.log(`Listening on PORT ${PORT}`);
});
