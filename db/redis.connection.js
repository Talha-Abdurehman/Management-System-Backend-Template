const { createClient } = require('redis')
const dotenv = require('dotenv')
dotenv.config()

const redisClient = createClient({
    url: process.env.REDIS_URL,
});

redisClient.on("error", (err)=> {
    console.log("Error Connectig to Redis: ", err)
});

(async () => {
    try {
        await redisClient.connect();
        console.log("Connected to redis");
    }
    catch(err){
        console.log("Error Connecting to redis: ", err);
    }
})();

module.exports = redisClient;
