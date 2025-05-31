// modules/holidays.js
// Modul untuk mengambil dan memberitahukan hari libur menggunakan Calendarific API

const axios = require('axios').default;
const config = require('../config/config'); 

/**
 * Mengambil daftar hari libur dari Calendarific API.
 * @param {string} apiKey -  API Key Calendarific Anda.
 * @param {string} country - Kode negara (misalnya, 'ID' untuk Indonesia).
 * @param {number} year - Tahun
 * @param {number} month - Bulan (1-12).
 * @param {number} day - Hari (1-31).
 * @returns {Promise<Array|null>} Sebuah promise yang resolve ke array objek hari libur atau null jika terjadi kesalahan.
 */
async function getHolidays(apiKey, country, year, month, day) {
    if (!apiKey) {
        console.error('[Holidays] Kesalahan: Calendarific API Key tidak tersedia.');
        return null;
    }

    const apiUrl = `https://calendarific.com/api/v2/holidays`;
    try {
        const response = await axios.get(apiUrl, {
            params: {
                api_key: apiKey,
                country: country,
                year: year,
                month: month,
                day: day
            }
        });

        if (response.data && response.data.response && response.data.response.holidays) {
            return response.data.response.holidays;
        } else {
            // Ini bukan error, tapi mungkin tidak ada hari libur.
            // Calendarific mungkin mengembalikan array kosong di response.holidays jika tidak ada.
            console.warn(`[Holidays] Tidak ada data hari libur yang ditemukan untuk ${day}-${month}-${year} di ${country}. Response:`, response.data);
            return [];
        }
    } catch (error) {
        console.error('[Holidays] Kesalahan saat mengambil data hari libur dari Calendarific:', error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Memeriksa apakah sebuah hari libur dianggap penting.
 * @param {object} holiday - Objek hari libur dari Calendarific.
 * @returns {boolean} True jika hari libur dianggap penting, false jika tidak.
 */
function isHolidayImportant(holiday) {
    return holiday.type.some(type => type.toLowerCase().includes('national holiday'));
}

/**
 * Memeriksa hari libur untuk hari ini dan mengirim notifikasi jika ada yang penting.
 * Fungsi ini lebih ditujukan untuk notifikasi terjadwal.
 * @param {string} apiKey - Kunci API Calendarific Anda.
 * @param {string} country - Kode negara (misalnya, 'ID' untuk Indonesia).
 * @param {function} notificationCallback - Fungsi callback untuk mengirim notifikasi. Menerima satu argumen: pesan (string).
 * @param {string} userName - Nama pengguna untuk personalisasi pesan.
 */
async function checkAndNotifyDailyHolidays(apiKey, country, notificationCallback, userName = "Tuan") {
    if (typeof notificationCallback !== 'function') {
        console.error('[Holidays] Kesalahan: notificationCallback harus berupa fungsi.');
        return;
    }

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    console.log(`[Holidays] Memeriksa hari libur (notifikasi) untuk ${day}-${month}-${year} di negara ${country}...`);
    const holidays = await getHolidays(apiKey, country, year, month, day);

    if (holidays && holidays.length > 0) {
        let importantEvents = [];
        holidays.forEach(holiday => {
            if (isHolidayImportant(holiday)) {
                importantEvents.push(`*${holiday.name}*:\nDeskripsi: ${holiday.description || 'Tidak ada deskripsi.'}\nTipe: ${holiday.type.join(', ')}`);
            }
        });
        if (importantEvents.length > 0) {
            const message = `🔔 Pengingat Hari Penting, ${userName}!\n\nHari ini ada:\n${importantEvents.join('\n\n')}`;
            notificationCallback(message);
        } else {
            console.log('[Holidays] Tidak ada hari libur *penting* yang terdaftar untuk notifikasi hari ini.');
            // Opsional: kirim notifikasi bahwa tidak ada hari libur penting
            // notificationCallback(`Tidak ada hari libur penting yang tercatat untuk hari ini, ${userName}.`);
        }
    } else if (holidays) { // holidays adalah array kosong
        console.log('[Holidays] Tidak ada hari libur yang terdaftar untuk hari ini (notifikasi).');
        // notificationCallback(`Tidak ada hari libur khusus yang tercatat untuk hari ini, ${userName}.`);
    } else { // holidays adalah null
        console.log('[Holidays] Gagal memeriksa hari libur (notifikasi) karena kesalahan pengambilan data.');
        // notificationCallback(`Maaf, ${userName}, Lyra tidak dapat memeriksa informasi hari libur saat ini.`);
    }
}

/**
 * Mengambil dan memformat informasi hari libur untuk hari ini menjadi sebuah string 
 * @param {string} apiKey -  API Key Calendarific kamu
 * @param {string} country - Kode negara (misalnya, 'ID' untuk Indonesia).
 * @param {string} userName - Nama pengguna untuk personalisasi pesan.
 * @returns {Promise<string>} Sebuah promise yang resolve ke string pesan.
 */
async function getFormattedTodaysHolidays(apiKey, country, userName = "Tuan") {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    console.log(`[Holidays] Memeriksa hari libur (on-demand) untuk ${day}-${month}-${year} di negara ${country}...`);
    const holidays = await getHolidays(apiKey, country, year, month, day);

    if (holidays && holidays.length > 0) {
        let holidayMessages = [];
        let importantCount = 0;
        holidays.forEach(holiday => {
            const importanceMarker = isHolidayImportant(holiday) ? "🌟 (Penting)" : "";
            if (isHolidayImportant(holiday)) importantCount++;
            holidayMessages.push(`*${holiday.name}* ${importanceMarker}\nDeskripsi: ${holiday.description || 'Tidak ada deskripsi.'}\nTipe: ${holiday.type.join(', ')}`);
        });

        let responseMessage = `📝 Info Hari Ini (${day}-${month}-${year}) untuk ${userName}:\n\n`;
        responseMessage += holidayMessages.join('\n\n');
        if (importantCount > 0) {
            responseMessage += `\n\nAda ${importantCount} acara penting hari ini.`;
        } else {
            responseMessage += `\n\nTidak ada acara yang ditandai sebagai "Penting Nasional" hari ini.`;
        }
        return responseMessage;

    } else if (holidays) { // holidays adalah array kosong
        return `Tidak ada hari libur atau acara khusus yang tercatat untuk hari ini (${day}-${month}-${year}), ${userName}.`;
    } else { // holidays adalah null
        return `Maaf, ${userName}, Lyra tidak dapat memeriksa informasi hari libur saat ini karena ada masalah pengambilan data.`;
    }
}

module.exports = {
    getHolidays,
    isHolidayImportant,
    checkAndNotifyDailyHolidays,
    getFormattedTodaysHolidays 
};
