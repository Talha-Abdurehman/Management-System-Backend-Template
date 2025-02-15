const { response } = require('express');
const Redis = require('ioredis')

const redisClient = new Redis({
    host: process.env.OCI_REDIS_PORT,
    port: 6379,
});

redisClient.ping().then(response => console.log("Connected to Redis", response))
.catch(error => console.error("redis Connection failed: ", error))

module.exports = redisClient;
