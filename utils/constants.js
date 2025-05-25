const ATTENDANCE_STATUS = Object.freeze({
    PRESENT: "present",
    HALFDAY: "halfDay",
    ABSENT: "absent",
});

const PAYMENT_STATUS = Object.freeze({
    FULL: "full",
    HALF: "half",
    UNPAID: "unpaid",
});

const ITEM_PRICE_TYPE = Object.freeze({
    RETAIL: "retail",
    WHOLESALE: "wholesale",
});

const ORDER_PAYMENT_METHOD = Object.freeze({
    CASH: "Cash",
    CARD: "Card",
    ONLINE_PAYMENT: "Online Payment",
    OTHER: "Other", // Added for more specific payment tracking in Orders.payments_received
});

const ORDER_STATUS = Object.freeze({
    PENDING: "Pending",
    PARTIALLY_PAID: "Partially Paid",
    FULLY_PAID: "Fully Paid",
    CANCELLED: "Cancelled",
});

module.exports = {
    ATTENDANCE_STATUS,
    PAYMENT_STATUS,
    ITEM_PRICE_TYPE,
    ORDER_PAYMENT_METHOD,
    ORDER_STATUS,
};