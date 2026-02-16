// utils/timeHelper.js

const moment = require('moment-timezone'); // Library for handling time and timezones

/**
 * Returns a Moment.js object set to Asia/Jakarta timezone.
 * This is the base function to ensure all time operations are consistent.
 * @returns {object} Moment.js object configured for Asia/Jakarta.
 */
const getJakartaMoment = () => {
    return moment().tz('Asia/Jakarta');
};

/**
 * Returns the current hour in Jakarta in 24-hour format (HH).
 * @returns {number} Current hour (0-23) in Jakarta.
 */
const getJakartaHour = () => {
    return getJakartaMoment().hour();
};

/**
 * Returns the current minute in Jakarta in (MM) format.
 * @returns {number} Current minute (0-59) in Jakarta.
 */
const getJakartaMinute = () => {
    return getJakartaMoment().minute();
};

/**
 * Returns the current date and time in Jakarta in a human-readable format.
 * Example: "Senin, 26 Mei 2025, 17:11"
 * @param {Date|string} [dateInput] Optional: Date or date string to format.
 *   If not provided, will use the current time.
 * @returns {string} Formatted date and time.
 */
const formatJakartaDateTime = (dateInput) => {
    if (dateInput) {
        return moment(dateInput).tz('Asia/Jakarta').format('dddd, DD MMMM YYYY, HH:mm');
    }
    return getJakartaMoment().format('dddd, DD MMMM YYYY, HH:mm');
};

/**
 * Returns the time in Jakarta in HH:MM format.
 * @param {Date|string} [dateInput] Optional: Date or date string to format.
 *   If not provided, will use the current time.
 * @returns {string} Formatted time (HH:MM).
 */
const formatJakartaTime = (dateInput) => {
    if (dateInput) {
        return moment(dateInput).tz('Asia/Jakarta').format('HH:mm');
    }
    return getJakartaMoment().format('HH:mm');
};

module.exports = {
    getJakartaMoment,
    getJakartaHour,
    getJakartaMinute,
    formatJakartaDateTime,
    formatJakartaTime,
};