class AppError extends Error {
    constructor(message, statusCode) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Operational errors are trusted errors (e.g. user input error)

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;