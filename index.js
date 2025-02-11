const express = require("express")
const ConnectDB = require("./db/connection")
const dotenv = require("dotenv")

dotenv.config()
const app = express()

const PORT = process.env.PORT || 3000


ConnectDB()

app.get("/", (req, res) => {
    res.send("<h1>Hello World Niggers</h1>")
})

app.listen(PORT, ()=> {
    console.log(`Listening on PORT ${PORT}`)
})