// commandHelper.js

const fs = require('fs').promises; // Untuk operasi sistem file (membaca/menulis JSON)
const schedule = require('node-schedule'); // Untuk menjadwalkan pengingat
const axios = require('axios'); // Untuk membuat permintaan HTTP ke API
const config = require('../config/config'); // File konfigurasi untuk kunci API dan pengaturan lainnya
const sendMessage = require('./sendMessage'); // Utilitas untuk mengirim pesan
const { formatJakartaDateTime, formatJakartaTime } = require('./timeHelper'); // Utilitas untuk mendapatkan waktu Jakarta
const moment = require('moment-timezone')

const REMINDERS_FILE = './data/reminders.json'; // Path ke file JSON pengingat
const NOTES_FILE = './data/notes.json'; // Path ke file JSON catatan

// Pastikan direktori data ada
const ensureDirExists = async (filePath) => {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dir && dir !== '.') {
        await fs.mkdir(dir, { recursive: true }).catch(err => {
            if (err.code !== 'EEXIST') throw err;
        });
    }
};

// --- Fitur Pengingat ---

/**
 * Memuat pengingat dari file JSON.
 * @returns {Promise<Array>} Sebuah array objek pengingat.
 */
const loadReminders = async () => {
    await ensureDirExists(REMINDERS_FILE);
    try {
        const data = await fs.readFile(REMINDERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File tidak ada, kembalikan array kosong
        }
        console.error("Error loading reminders:", error);
        return [];
    }
};

/**
 * Menyimpan pengingat ke file JSON.
 * @param {Array} reminders Array objek pengingat untuk disimpan.
 */
const saveReminders = async (reminders) => {
    await ensureDirExists(REMINDERS_FILE);
    await fs.writeFile(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf8');
};

/**
 * Menjadwalkan pengingat.
 * @param {object} botInstance Instans API Bot Telegram.
 * @param {string|number} chatId ID obrolan tempat pengingat harus dikirim.
 * @param {string} timeString String waktu untuk pengingat (misalnya, "14:30", "tomorrow 10:00").
 * @param {string} message Pesan pengingat.
 * @param {string} userName Nama pengguna yang mengatur pengingat.
 * @returns {Promise<string>} Pesan yang menunjukkan keberhasilan atau kegagalan penjadwalan.
 */
const setReminder = async (botInstance, chatId, timeString, message, userName) => {
    const now = moment().tz('Asia/Jakarta');
    let reminderTime;

    // Parsing waktu dasar (dapat diperluas untuk input yang lebih kompleks)
    const timeParts = timeString.split(':');
    if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        const hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);

        reminderTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);

        // Jika waktu pengingat di masa lalu untuk hari ini, jadwalkan untuk besok
        if (reminderTime < now) {
            reminderTime.setDate(reminderTime.getDate() + 1);
        }
    } else if (timeString.toLowerCase().includes('tomorrow')) {
        const parts = timeString.toLowerCase().split(' ');
        const time = parts[1]; // contoh: "10:00"
        const timePartsTomorrow = time.split(':');
        if (timePartsTomorrow.length === 2 && !isNaN(timePartsTomorrow[0]) && !isNaN(timePartsTomorrow[1])) {
            const hour = parseInt(timePartsTomorrow[0], 10);
            const minute = parseInt(timePartsTomorrow[1], 10);
            reminderTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute, 0);
        }
    } else {
        return `Maaf, Tuan ${userName}. Format waktu tidak valid. Gunakan format HH:MM atau 'tomorrow HH:MM'.`;
    }

    if (!reminderTime || isNaN(reminderTime.getTime())) {
        return `Maaf, Tuan ${userName}. Hoshino tidak bisa memahami waktu yang Anda berikan.`;
    }

    const reminders = await loadReminders();
    const newReminder = {
        id: Date.now(), // ID unik untuk pengingat
        chatId: chatId,
        time: reminderTime.toISOString(),
        message: message,
        userName: userName
    };
    reminders.push(newReminder);
    await saveReminders(reminders);

    schedule.scheduleJob(reminderTime, () => {
        sendMessage(chatId, `🔔 Pengingat untuk Tuan ${userName}:\n${message}`);
        // Hapus pengingat setelah dipicu
        loadReminders().then(currentReminders => {
            const updatedReminders = currentReminders.filter(r => r.id !== newReminder.id);
            saveReminders(updatedReminders);
        });
    });

    const formattedTime = formatJakartaTime(reminderTime);
    const formattedDate = formatJakartaDateTime(reminderTime).split(',')[0] + ", " + formatJakartaDateTime(reminderTime).split(',')[1]; // Extract date part

    return `Baik, Tuan ${userName}! Hoshino akan mengingatkan Anda pada ${formattedDate} pukul ${formattedTime} untuk: "${message}".`;
};

/**
 * Menjadwalkan ulang semua pengingat saat bot dimulai.
 * @param {object} botInstance Instans API Bot Telegram.
 */
const rescheduleReminders = async (botInstance) => {
    const reminders = await loadReminders();
    const now = moment().tz('Asia/Jakarta');

    const activeReminders = [];
    for (const reminder of reminders) {
        const reminderTime = new Date(reminder.time);
        if (reminderTime > now) { // Hanya jadwalkan ulang pengingat di masa mendatang
            activeReminders.push(reminder);
            schedule.scheduleJob(reminderTime, () => {
                sendMessage(reminder.chatId, `🔔 Pengingat untuk Tuan ${reminder.userName}:\n${reminder.message}`);
                // Hapus pengingat setelah dipicu
                loadReminders().then(currentReminders => {
                    const updatedReminders = currentReminders.filter(r => r.id !== reminder.id);
                    saveReminders(updatedReminders);
                });
            });
        }
    }
    await saveReminders(activeReminders); // Simpan hanya pengingat yang aktif kembali
    console.log(`Rescheduled ${activeReminders.length} reminders.`);
};

// --- Fitur Catatan ---

/**
 * Memuat catatan untuk pengguna tertentu dari file JSON.
 * @param {string|number} userId ID pengguna.
 * @returns {Promise<Array>} Sebuah array objek catatan untuk pengguna.
 */
const loadNotes = async (userId) => {
    await ensureDirExists(NOTES_FILE);
    try {
        const data = await fs.readFile(NOTES_FILE, 'utf8');
        const allNotes = JSON.parse(data);
        return allNotes[userId] || [];
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File tidak ada, kembalikan array kosong
        }
        console.error("Error loading notes:", error);
        return [];
    }
};

/**
 * Menyimpan catatan untuk pengguna tertentu ke file JSON.
 * @param {string|number} userId ID pengguna.
 * @param {Array} userNotes Array objek catatan untuk pengguna yang akan disimpan.
 */
const saveNotes = async (userId, userNotes) => {
    await ensureDirExists(NOTES_FILE);
    let allNotes = {};
    try {
        const data = await fs.readFile(NOTES_FILE, 'utf8');
        allNotes = JSON.parse(data);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error("Error reading notes file before saving:", error);
        }
    }
    allNotes[userId] = userNotes;
    await fs.writeFile(NOTES_FILE, JSON.stringify(allNotes, null, 2), 'utf8');
};

/**
 * Menambahkan catatan baru untuk pengguna.
 * @param {string|number} userId ID pengguna.
 * @param {string} noteMessage Konten catatan.
 * @returns {Promise<string>} Pesan yang menunjukkan keberhasilan.
 */
const addNote = async (userId, noteMessage) => {
    const userNotes = await loadNotes(userId);
    const newNote = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        message: noteMessage
    };
    userNotes.push(newNote);
    await saveNotes(userId, userNotes);
    return `Baik, Tuan! Catatan Anda telah Hoshino simpan.`;
};

/**
 * Menampilkan semua catatan untuk pengguna.
 * @param {string|number} userId ID pengguna.
 * @returns {Promise<string>} String yang diformat dari semua catatan atau pesan jika tidak ada catatan.
 */
const showNotes = async (userId) => {
    const userNotes = await loadNotes(userId);
    if (userNotes.length === 0) {
        return `Tuan ${userId}, Anda belum memiliki catatan yang Hoshino simpan.`;
    }
    let response = `Catatan pribadi Tuan ${userId}:\n\n`;
    userNotes.forEach((note, index) => {
        const date = formatJakartaDateTime(note.timestamp);
        response += `${index + 1}. [${date}] ${note.message}\n`;
    });
    return response;
};

// --- Fitur Pencarian (Menggunakan Google Custom Search API) ---

/**
 * Melakukan pencarian menggunakan Google Custom Search API.
 * @param {string} query Kueri pencarian.
 * @returns {Promise<string>} String yang diformat dengan hasil pencarian.
 */
const performSearch = async (query) => {
    const apiKey = config.GOOGLE_SEARCH_API_KEY;
    const cx = config.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        return `Maaf, Tuan. API Key atau Custom Search Engine ID untuk Google Search belum dikonfigurasi.`;
    }

    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: apiKey,
                cx: cx,
                q: query,
                num: 3 // Mengambil 3 hasil teratas
            }
        });

        const data = response.data;
        if (data.items && data.items.length > 0) {
            let result = `Hoshino menemukan ini untuk "${query}":\n\n`;
            data.items.forEach((item, index) => {
                result += `${index + 1}. ${item.title}\n`;
                result += `${item.snippet}\n`;
                result += `Link: ${item.link}\n\n`;
            });
            return result;
        } else {
            return `Maaf, Tuan. Hoshino tidak menemukan hasil yang relevan untuk "${query}".`;
        }
    } catch (error) {
        console.error("Error fetching from Google Custom Search API:", error.message);
        return `Maaf, Tuan. Terjadi kesalahan saat mencari informasi: ${error.message}`;
    }
};

// --- Perintah Bantuan dan Penulis ---

/**
 * Mengembalikan daftar perintah yang tersedia.
 * @returns {string} String yang diformat yang mencantumkan semua perintah.
 */
const getHelpMessage = () => {
    return `Daftar perintah Hoshino:\n\n` +
           `• /reminder [HH:MM] [pesan]: Menjadwalkan pengingat.\n` +
           `• /note [pesan]*: Menyimpan catatan pribadi.\n` +
           `• /shownotes*: Menampilkan semua catatan pribadi Anda.\n` +
           `• /search [query]: Mencari informasi menggunakan Google.\n` +
           `• /help : Menampilkan daftar perintah ini.\n` +
           `• /author : Menampilkan informasi penulis Hoshino.\n`;
};

/**
 * Mengembalikan informasi tentang penulis.
 * @returns {string} String yang diformat dengan informasi penulis.
 */
const getAuthorInfo = () => {
    return `Hoshino v4.0 (Optimized)\n` +
           `AUTHOR: Arash\n` +
           `TIKTOK: @rafardhancuy\n` +
           `Github: https://github.com/Rafacuy\n` +
           `LANGUAGE: ID (Indonesia)\n` +
           `TIME FORMAT: Asia/Jakarta\n` +
           `MIT License`;
};


module.exports = {
    setReminder,
    rescheduleReminders,
    addNote,
    showNotes,
    performSearch,
    getHelpMessage,
    getAuthorInfo
};
