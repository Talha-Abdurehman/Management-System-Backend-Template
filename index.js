const express = require("express")
const ConnectDB = require("./db/connection")
const redisClient = require('./db/redis.connection')
const dotenv = require("dotenv")

const app = express()
app.use(express.json())
app.use(express.urlencoded({extended: true}))


dotenv.config()
const PORT = process.env.PORT || 3000

ConnectDB()

// API Routes for Items and Listing etc
app.use("/api", require("./routes/itemsRoutes"))


app.get("/", (req, res) => {
    res.send("<h1>Current Status: Running</h1>")
})

app.listen(PORT, ()=> {
    console.log(`Listening on PORT ${PORT}`)
})