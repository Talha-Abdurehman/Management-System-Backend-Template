// subhanTraders-app-master/middleware/adminMiddleware.js

const adminMiddleware = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next(); // User is admin, proceed to the next middleware or route handler
    } else {
        res.status(403).json({ message: "Forbidden: Administrator access required." });
    }
};

module.exports = adminMiddleware;