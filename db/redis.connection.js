// No longer needed: const { response } = require('express');
const Redis = require('ioredis');
const dotenv = require("dotenv");
dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'; // Default to localhost if not set
const REDIS_PORT = parseInt(process.env.REDIS_PORT, 10) || 6379; // Default port

if (!process.env.REDIS_HOST && !process.env.OCI_REDIS_HOST) { // Check if OCI_REDIS_HOST was the intended var
    console.warn("Warning: REDIS_HOST is not defined. Defaulting to localhost. If using OCI, set OCI_REDIS_HOST or REDIS_HOST.");
}
// Prioritize OCI_REDIS_HOST if it was the intended variable from the original code
const effectiveHost = process.env.OCI_REDIS_HOST || REDIS_HOST;


const redisClient = new Redis({
    host: effectiveHost,
    port: REDIS_PORT,
    // Add other options like password if needed:
    // password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => {
        // Exponential backoff for retries
        const delay = Math.min(times * 50, 2000); // Max 2 seconds
        console.log(`Redis: Retrying connection in ${delay}ms (attempt ${times})`);
        return delay;
    },
    maxRetriesPerRequest: 3 // Optional: limit retries for individual commands
});

redisClient.on('connect', () => {
    console.log('Redis client connecting...');
});

redisClient.on('ready', () => {
    console.log('Redis client is ready and connected to Redis server.');
    redisClient.ping().then(response => console.log("Redis PING successful:", response))
        .catch(error => console.error("Redis PING failed after ready:", error));
});

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err.message);
    // Note: ioredis handles reconnection automatically based on retryStrategy
});

redisClient.on('end', () => {
    console.log('Redis client connection has ended.');
});

redisClient.on('reconnecting', (delay, attempt) => {
    // This event is fired by ioredis's internal retry mechanism
    // console.log(`Redis client is reconnecting: attempt ${attempt}, delay ${delay}ms`); // Already logged by retryStrategy
});

// Test connection explicitly if needed (ping is good)
// (async () => {
//   try {
//     const pong = await redisClient.ping();
//     console.log('Connected to Redis:', pong);
//   } catch (error) {
//     console.error('Redis connection failed on initial ping:', error.message);
//   }
// })();


module.exports = redisClient;