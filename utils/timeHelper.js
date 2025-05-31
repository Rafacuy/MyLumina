// utils/timeHelper.js

const moment = require('moment-timezone'); // Library untuk penanganan waktu dan zona waktu

/**
 * Mengembalikan objek Moment.js yang diatur ke zona waktu Asia/Jakarta.
 * Ini adalah fungsi dasar untuk memastikan semua operasi waktu konsisten.
 * @returns {object} Objek Moment.js yang dikonfigurasi untuk Asia/Jakarta.
 */
const getJakartaMoment = () => {
    return moment().tz('Asia/Jakarta');
};

/**
 * Mengembalikan jam saat ini di Jakarta dalam format 24 jam (HH).
 * @returns {number} Jam saat ini (0-23) di Jakarta.
 */
const getJakartaHour = () => {
    return getJakartaMoment().hour();
};

/**
 * Mengembalikan menit saat ini di Jakarta dalam format (MM).
 * @returns {number} Menit saat ini (0-59) di Jakarta.
 */
const getJakartaMinute = () => {
    return getJakartaMoment().minute();
};

/**
 * Mengembalikan tanggal dan waktu saat ini di Jakarta dalam format yang mudah dibaca.
 * Contoh: "Senin, 26 Mei 2025, 17:11"
 * @param {Date|string} [dateInput] Opsional: Tanggal atau string tanggal untuk diformat. Jika tidak disediakan, akan menggunakan waktu saat ini.
 * @returns {string} Tanggal dan waktu yang diformat.
 */
const formatJakartaDateTime = (dateInput) => {
    if (dateInput) {
        return moment(dateInput).tz('Asia/Jakarta').format('dddd, DD MMMM YYYY, HH:mm');
    }
    return getJakartaMoment().format('dddd, DD MMMM YYYY, HH:mm');
};

/**
 * Mengembalikan waktu di Jakarta dalam format HH:MM.
 * @param {Date|string} [dateInput] Opsional: Tanggal atau string tanggal untuk diformat. Jika tidak disediakan, akan menggunakan waktu saat ini.
 * @returns {string} Waktu yang diformat (HH:MM).
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
    formatJakartaTime
};


