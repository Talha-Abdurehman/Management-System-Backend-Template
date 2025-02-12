const express = require("express")
const ConnectDB = require("./db/connection")
const welcomeRoute = require("./routes/welcomeRoute")
const dotenv = require("dotenv")

const app = express()
app.use(express.json())
app.use(express.urlencoded({extended: true}))


dotenv.config()
const PORT = process.env.PORT || 3000

ConnectDB()

app.use("/api", welcomeRoute)
app.listen(PORT, ()=> {
    console.log(`Listening on PORT ${PORT}`)
})