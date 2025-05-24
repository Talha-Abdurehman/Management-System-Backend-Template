const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");
// dotenv.config(); // Removed, called in index.js

const CLOUDINARY_NAME = process.env.CLOUDINARY_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUDINARY_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  const missingVars = [];
  if (!CLOUDINARY_NAME) missingVars.push("CLOUDINARY_NAME");
  if (!CLOUDINARY_API_KEY) missingVars.push("CLOUDINARY_API_KEY");
  if (!CLOUDINARY_API_SECRET) missingVars.push("CLOUDINARY_API_SECRET");

  console.error(`FATAL ERROR: Cloudinary configuration is incomplete. Missing environment variable(s): ${missingVars.join(", ")}.`);
  // Depending on how critical Cloudinary is at startup, you might exit:
  // process.exit(1); 
  // For now, we'll let the app start but log a critical error.
  // Operations requiring Cloudinary will likely fail.
} else {
  cloudinary.config({
    cloud_name: CLOUDINARY_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  console.log("Cloudinary configured.");
}


// You might want to export the configured cloudinary instance or upload functions
module.exports = cloudinary; // Exporting the configured instance