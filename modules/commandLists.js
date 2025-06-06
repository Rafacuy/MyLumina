// commandLists.js

const fs = require('fs').promises; // Untuk operasi sistem file (membaca/menulis JSON)
const schedule = require('node-schedule'); // Untuk menjadwalkan pengingat
const axios = require('axios'); // Untuk membuat permintaan HTTP ke API
const config = require('../config/config'); // File konfigurasi untuk kunci API dan pengaturan lainnya
const sendMessage = require('../utils/sendMessage'); // Utilitas untuk mengirim pesan (pastikan ada dan tangguh)
const { formatJakartaDateTime, formatJakartaTime, getJakartaMoment } = require('../utils/timeHelper'); // Utilitas untuk waktu Jakarta (pastikan ada dan tangguh)
const { generateAIResponse } = require('../core/coreRouter');

const REMINDERS_FILE = './data/reminders.json'; // Path ke file JSON pengingat
const NOTES_FILE = './data/notes.json'; // Path ke file JSON catatan

/**
 * Memastikan direktori untuk path file ada.
 * @param {string} filePath Path ke file.
 */
const ensureDirExists = async (filePath) => {
    try {
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dir && dir !== '.') {
            // Membuat direktori secara rekursif jika belum ada
            await fs.mkdir(dir, { recursive: true });
        }
    } catch (err) {
        // Jika error adalah EEXIST, tidak apa-apa (direktori sudah ada)
        if (err.code !== 'EEXIST') {
            console.error(`Error membuat direktori untuk ${filePath}:`, err.message);
            // Tergantung tingkat keparahan, Anda mungkin ingin melempar error ini atau menanganinya
            // Untuk saat ini, hanya dicatat. Operasi kritis mungkin perlu dihentikan.
        }
    }
};

// --- Fitur Reminder ---

/**
 * Memuat pengingat dari file JSON.
 * @returns {Promise<Array>} Array objek pengingat.
 */
const loadReminders = async () => {
    await ensureDirExists(REMINDERS_FILE); // Pastikan direktori ada terlebih dahulu
    try {
        const data = await fs.readFile(REMINDERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("File pengingat tidak ditemukan, mengembalikan array kosong.");
            return []; // Fallback: File tidak ada, kembalikan array kosong
        }
        console.error("Error memuat pengingat:", error.message, error.stack);
        return []; // Fallback: Error lain (misalnya, error parse JSON), kembalikan array kosong
    }
};

/**
 * Menyimpan pengingat ke file JSON.
 * @param {Array} reminders Array objek pengingat untuk disimpan.
 * @returns {Promise<boolean>} True jika berhasil, false jika gagal.
 */
const saveReminders = async (reminders) => {
    if (!Array.isArray(reminders)) {
        console.error("Tipe data tidak valid untuk menyimpan pengingat. Diharapkan array.");
        return false; // Fallback: jangan simpan jika data salah
    }
    await ensureDirExists(REMINDERS_FILE);
    try {
        await fs.writeFile(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error("Error menyimpan pengingat:", error.message, error.stack);
        return false; // Fallback: Menandakan kegagalan penyimpanan
    }
};

/**
 * Mengatur pengingat.
 * @param {object} botInstance Instance API Bot Telegram (tidak digunakan secara aktif untuk penjadwalan di versi ini).
 * @param {string|number} chatId ID Chat tempat pengingat harus dikirim.
 * @param {string} timeString String waktu untuk pengingat (misalnya, "14:30", "besok 10:00").
 * @param {string} message Pesan pengingat.
 * @param {string} userName Nama pengguna yang mengatur pengingat.
 * @returns {Promise<string>} Pesan yang menunjukkan keberhasilan atau kegagalan penjadwalan.
 */
const setReminder = async (botInstance, chatId, timeString, message, userName) => {
    if (!chatId || !timeString || !message || !userName) {
        return `Maaf, Tuan ${userName || 'Pengguna'}. Informasi tidak lengkap untuk mengatur pengingat.`;
    }

    try {
        const now = getJakartaMoment();
        let reminderTime;

        // Parsing waktu dasar
        const timeParts = timeString.split(':');
        if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
            const hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);
            reminderTime = now.clone().hour(hour).minute(minute).second(0);
            if (reminderTime.isBefore(now)) {
                reminderTime.add(1, 'day'); // Jika waktu sudah lewat hari ini, jadwalkan untuk besok
            }
        } else if (timeString.toLowerCase().includes('tomorrow') || timeString.toLowerCase().includes('besok')) {
            const parts = timeString.toLowerCase().split(' ');
            const time = parts.find(p => p.includes(':')); // cari waktu seperti "10:00"
            if (time) {
                const timePartsTomorrow = time.split(':');
                if (timePartsTomorrow.length === 2 && !isNaN(timePartsTomorrow[0]) && !isNaN(timePartsTomorrow[1])) {
                    const hour = parseInt(timePartsTomorrow[0], 10);
                    const minute = parseInt(timePartsTomorrow[1], 10);
                    reminderTime = now.clone().add(1, 'day').hour(hour).minute(minute).second(0);
                }
            }
        }

        if (!reminderTime || !reminderTime.isValid()) {
            return `Maaf, Tuan ${userName}. Format waktu tidak valid atau Alya tidak bisa memahami waktu yang Anda berikan. Gunakan HH:MM atau 'besok HH:MM'.`;
        }

        const reminders = await loadReminders();
        const newReminder = {
            id: Date.now() + Math.random().toString(36).substring(2,7), // ID yang lebih unik
            chatId: chatId,
            time: reminderTime.toISOString(), // Simpan sebagai string ISO
            message: message,
            userName: userName
        };
        reminders.push(newReminder);
        const saveSuccess = await saveReminders(reminders);

        if (!saveSuccess) {
            return `Maaf, Tuan ${userName}. Terjadi kesalahan saat menyimpan pengingat Anda.`;
        }

        // Jadwalkan tugas menggunakan objek Date dari moment
        schedule.scheduleJob(reminderTime.toDate(), async () => {
            try {
                sendMessage(chatId, `🔔 Pengingat untuk Tuan ${userName}:\n${message}`);
                // Hapus pengingat setelah dipicu
                const currentReminders = await loadReminders();
                const updatedReminders = currentReminders.filter(r => r.id !== newReminder.id);
                await saveReminders(updatedReminders);
            } catch (scheduleError) {
                console.error("Error dalam tugas pengingat terjadwal:", scheduleError.message, scheduleError.stack);
            }
        });

        const formattedTime = formatJakartaTime(reminderTime);
        const formattedDate = formatJakartaDateTime(reminderTime).split(',')[0] + ", " + formatJakartaDateTime(reminderTime).split(',')[1]; // Ekstrak bagian tanggal

        return `Baik, Tuan ${userName}! Alya akan mengingatkan Anda pada ${formattedDate} pukul ${formattedTime} untuk: "${message}".`;

    } catch (error) {
        console.error("Error di setReminder:", error.message, error.stack);
        return `Maaf, Tuan ${userName}. Terjadi kesalahan internal saat Alya mencoba mengatur pengingat.`;
    }
};

/**
 * Menjadwalkan ulang semua pengingat saat bot dimulai.
 * @param {object} botInstance Instance API Bot Telegram.
 */
const rescheduleReminders = async (botInstance) => {
    try {
        const reminders = await loadReminders();
        const now = getJakartaMoment();
        let activeRemindersCount = 0;
        const validRemindersToKeep = [];

        for (const reminder of reminders) {
            // Validasi objek pengingat dasar
            if (!reminder || typeof reminder.time !== 'string' || typeof reminder.chatId === 'undefined' || typeof reminder.message !== 'string') {
                console.warn("Melewati objek pengingat tidak valid:", reminder);
                continue;
            }
            const reminderTime = getJakartaMoment(reminder.time); // Gunakan getJakartaMoment untuk mem-parse string ISO yang disimpan
            if (reminderTime.isValid() && reminderTime.isAfter(now)) { // Hanya jadwalkan ulang pengingat di masa depan
                validRemindersToKeep.push(reminder);
                schedule.scheduleJob(reminderTime.toDate(), async () => {
                    try {
                        sendMessage(reminder.chatId, `🔔 Pengingat untuk Tuan ${reminder.userName || 'Pengguna'}:\n${reminder.message}`);
                        const currentReminders = await loadReminders();
                        const updatedReminders = currentReminders.filter(r => r.id !== reminder.id);
                        await saveReminders(updatedReminders);
                    } catch (scheduleError) {
                        console.error("Error dalam tugas pengingat yang dijadwalkan ulang:", scheduleError.message, scheduleError.stack);
                    }
                });
                activeRemindersCount++;
            }
        }
        // Simpan kembali hanya pengingat yang aktif dan valid
        await saveReminders(validRemindersToKeep);
        console.log(`Menjadwalkan ulang ${activeRemindersCount} pengingat. Memangkas ${reminders.length - validRemindersToKeep.length} pengingat lama atau tidak valid.`);
    } catch (error) {
        console.error("Error menjadwalkan ulang pengingat:", error.message, error.stack);
    }
};

// --- Fitur Catatan ---

/**
 * Memuat catatan untuk pengguna tertentu dari file JSON.
 * @param {string|number} userId ID Pengguna.
 * @returns {Promise<Array>} Array objek catatan untuk pengguna.
 */
const loadNotes = async (userId) => {
    if (typeof userId === 'undefined' || userId === null) {
        console.error("Tidak dapat memuat catatan: userId tidak terdefinisi atau null.");
        return []; // Fallback: kembalikan array kosong jika userId tidak valid
    }
    await ensureDirExists(NOTES_FILE);
    try {
        const data = await fs.readFile(NOTES_FILE, 'utf8');
        const allNotes = JSON.parse(data);
        return allNotes[userId] || [];
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("File catatan tidak ditemukan, mengembalikan array kosong untuk pengguna:", userId);
            return [];
        }
        console.error(`Error memuat catatan untuk pengguna ${userId}:`, error.message, error.stack);
        return []; // Fallback: Error lain, kembalikan array kosong
    }
};

/**
 * Menyimpan catatan untuk pengguna tertentu ke file JSON.
 * @param {string|number} userId ID Pengguna.
 * @param {Array} userNotes Array objek catatan untuk pengguna yang akan disimpan.
 * @returns {Promise<boolean>} True jika berhasil, false jika gagal.
 */
const saveNotes = async (userId, userNotes) => {
    if (typeof userId === 'undefined' || userId === null) {
        console.error("Tidak dapat menyimpan catatan: userId tidak terdefinisi atau null.");
        return false;
    }
    if (!Array.isArray(userNotes)) {
        console.error(`Tipe data tidak valid untuk menyimpan catatan pengguna ${userId}. Diharapkan array.`);
        return false;
    }
    await ensureDirExists(NOTES_FILE);
    let allNotes = {};
    try {
        // Coba baca catatan yang ada terlebih dahulu untuk menjaga data pengguna lain
        const data = await fs.readFile(NOTES_FILE, 'utf8');
        allNotes = JSON.parse(data);
        if (typeof allNotes !== 'object' || allNotes === null) { // Pastikan allNotes adalah objek
            console.warn("File catatan berisi data non-objek. Mengatur ulang.");
            allNotes = {};
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("File catatan tidak ditemukan, akan membuat yang baru.");
        } else if (error instanceof SyntaxError) { // Error parsing JSON
            console.warn("File catatan rusak atau bukan JSON yang valid. Akan menimpa dengan data baru untuk pengguna ini, catatan pengguna lain mungkin hilang jika tidak hati-hati.");
            // Opsional: backup file yang rusak sebelum menimpa
            // await fs.copyFile(NOTES_FILE, `${NOTES_FILE}.corrupted.${Date.now()}`).catch(e => console.error("Gagal mem-backup file catatan yang rusak",e));
            allNotes = {}; // Mulai dari awal untuk menghindari penyebaran kerusakan
        } else {
            console.error("Error membaca file catatan sebelum menyimpan:", error.message, error.stack);
        }
    }
    try {
        allNotes[userId] = userNotes;
        await fs.writeFile(NOTES_FILE, JSON.stringify(allNotes, null, 2), 'utf8');
        return true;
    } catch (writeError) {
        console.error(`Error menyimpan catatan untuk pengguna ${userId}:`, writeError.message, writeError.stack);
        return false; // Fallback: Menandakan kegagalan penyimpanan
    }
};

/**
 * Menambahkan catatan baru untuk pengguna.
 * @param {string|number} userId ID Pengguna.
 * @param {string} noteMessage Isi catatan.
 * @param {string} userName Nama pengguna untuk pesan.
 * @returns {Promise<string>} Pesan yang menunjukkan keberhasilan.
 */
const addNote = async (userId, noteMessage, userName) => {
    if (!userId || !noteMessage) {
        return `Maaf, Tuan ${userName || 'Pengguna'}. Informasi tidak lengkap untuk menambah catatan.`;
    }
    try {
        const userNotes = await loadNotes(userId);
        const newNote = {
            id: Date.now() + Math.random().toString(36).substring(2,7), // ID yang lebih unik
            timestamp: getJakartaMoment().toISOString(), // Simpan timestamp dalam zona waktu Jakarta
            message: noteMessage
        };
        userNotes.push(newNote);
        const saveSuccess = await saveNotes(userId, userNotes);

        if (saveSuccess) {
            return `Baik, Tuan ${userName}! Catatan Anda telah Alya simpan.`;
        } else {
            return `Maaf, Tuan ${userName}. Terjadi kesalahan saat Alya mencoba menyimpan catatan Anda.`;
        }
    } catch (error) {
        console.error(`Error di addNote untuk pengguna ${userId}:`, error.message, error.stack);
        return `Maaf, Tuan ${userName}. Terjadi kesalahan internal saat Alya mencoba menambah catatan.`;
    }
};

/**
 * Menampilkan semua catatan untuk pengguna.
 * @param {string|number} userId ID Pengguna.
 * @param {string} userName Nama pengguna untuk pesan.
 * @returns {Promise<string>} String catatan yang diformat atau pesan jika tidak ada catatan.
 */
const showNotes = async (userId, userName) => {
    if (!userId) {
        return `Maaf, Tuan ${userName || 'Pengguna'}. Alya tidak bisa menampilkan catatan tanpa ID pengguna.`;
    }
    try {
        const userNotes = await loadNotes(userId);
        if (userNotes.length === 0) {
            return `Tuan ${userName}, Anda belum memiliki catatan yang Alya simpan.`;
        }
        let response = `Catatan pribadi Tuan ${userName}:\n\n`;
        userNotes.forEach((note, index) => {
            // Fallback untuk properti catatan yang mungkin hilang
            const noteMsg = note.message || "(Catatan kosong)";
            const noteTimestamp = note.timestamp || new Date().toISOString(); // Fallback ke waktu sekarang jika timestamp hilang
            const date = formatJakartaDateTime(noteTimestamp); // Format timestamp menggunakan zona waktu Jakarta
            response += `${index + 1}. [${date}] ${noteMsg}\n`;
        });
        return response;
    } catch (error) {
        console.error(`Error di showNotes untuk pengguna ${userId}:`, error.message, error.stack);
        return `Maaf, Tuan ${userName}. Terjadi kesalahan internal saat Alya mencoba menampilkan catatan Anda.`;
    }
};



// --- Fitur Pencarian (Menggunakan Google Custom Search API & Alya AI untuk Ringkasan) ---

/**
 * Melakukan pencarian menggunakan Google Custom Search API dan merangkum hasilnya dengan AI.
 * @param {string} query query pencarian.
 * @param {string} userName Nama pengguna.
 * @param {string|number} requestChatId ID chat permintaan, untuk pembatasan laju & konteks AI.
 * @param {Function} aiSummarizer Fungsi dari Alya.js untuk menghasilkan ringkasan AI (misalnya, generateAIResponse).
 * @returns {Promise<string>} String yang diformat dengan hasil pencarian dan ringkasannya.
 */
async function performSearch(query, userName, requestChatId, aiSummarizer) {
    if (!query || typeof query !== 'string' || query.trim() === "") {
        return `Maaf, Tuan ${userName}. Mohon berikan kata kunci pencarian yang valid.`;
    }

    const apiKey = config.GOOGLE_SEARCH_API_KEY;
    const cx = config.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        console.error("Kunci API Google Search atau CX tidak dikonfigurasi di config.js (dotenv).");
        return `Maaf, Tuan ${userName}. Fitur pencarian belum dikonfigurasi dengan benar oleh administrator. Alya tidak bisa melanjutkan.`;
    }

    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: apiKey,
                cx: cx,
                q: query,
                num: 3,
                hl: 'id',
                gl: 'id' // Bias geolokasi ke Indonesia
            }
        });

        const data = response.data;
        if (data.items && data.items.length > 0) {
            let resultText = `Alya menemukan ini untuk "${query}", Tuan ${userName}:\n\n`;
            let contentToSummarize = "";
            data.items.forEach((item, index) => {
                const title = item.title || "Judul tidak tersedia";
                const snippet = item.snippet || "Kutipan tidak tersedia";
                const link = item.link || "Tautan tidak tersedia";
                resultText += `${index + 1}. *${title}*\n`; // Markdown untuk judul
                resultText += `   ${snippet.replace(/\n/g, ' ')}\n`; // Bersihkan kutipan
                resultText += `   [Link](${link})\n\n`; // Markdown untuk link
                contentToSummarize += `${title}. ${snippet}\n`; // Kumpulkan konten untuk diringkas
            });

            // Ringkasan dengan Alya.js jika aiSummarizer tersedia dan ada konten
            if (typeof aiSummarizer === 'function' && contentToSummarize.trim() !== "") {
                resultText += `\n--- Ringkasan dari Alya ---\n`;
                try {
                    const summarizationPrompt = `Sebagai Alya, asisten AI yang cerdas dan sedikit tsundere, ringkaskan dengan gaya khasmu informasi berikut yang ditemukan untuk Tuan ${userName} terkait pencarian "${query}". Buat ringkasan yang informatif namun tetap singkat dan menarik:\n\n${contentToSummarize}`;

                    const summary = await aiSummarizer(summarizationPrompt, requestChatId);

                    // Periksa apakah ringkasan valid dan bukan pesan error/placeholder dari Alya
                    if (summary && !summary.toLowerCase().includes("maaf") && !summary.toLowerCase().includes("zzz") && !summary.toLowerCase().includes("mohon bersabar") && summary.length > 15) { // Panjang minimal untuk ringkasan yang berarti
                        resultText += `${summary}\n\n`;
                    } else {
                        resultText += `Hmph, sepertinya Alya tidak bisa memberikan ringkasan yang bagus untuk ini, Tuan ${userName}. Mungkin hasilnya terlalu sedikit atau kurang jelas.\n\n`;
                        console.log("Ringkasan oleh Alya dilewati atau hasilnya tidak sesuai/error:", summary);
                    }
                } catch (summarizationError) {
                    console.error("Error selama peringkasan dengan Alya:", summarizationError.message, summarizationError.stack);
                    resultText += `Ugh, terjadi kesalahan teknis saat Alya mencoba membuat ringkasan, Tuan ${userName}. Menyebalkan.\n\n`;
                }
            } else if (typeof aiSummarizer !== 'function') {
                resultText += `\n--- Ringkasan dari Alya ---\nFitur ringkasan AI tidak tersedia saat ini karena ada masalah teknis, Tuan ${userName}.\n\n`;
                console.warn("Fungsi aiSummarizer tidak diberikan ke performSearch. Ringkasan dilewati.");
            }
            return resultText;
        } else {
            return `Maaf, Tuan ${userName}. Alya tidak menemukan hasil yang relevan untuk "${query}". Mungkin coba kata kunci lain?`;
        }
    } catch (error) {
        console.error("Error mengambil dari Google Custom Search API:", error.response ? JSON.stringify(error.response.data) : error.message, error.stack);
        // Fallback untuk error API
        let errorMessage = `Maaf, Tuan ${userName}. Terjadi masalah saat Alya mencoba menghubungi layanan pencarian.`;
        if (error.response && error.response.status === 403) { // Forbidden, seringkali masalah kunci API atau kuota
            errorMessage += ` Sepertinya ada masalah dengan konfigurasi API pencarian atau kuota telah terlampaui.`;
        } else if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
            errorMessage += ` Detail dari Google: ${error.response.data.error.message}`;
        } else if (error.isAxiosError && error.message.includes('timeout')) {
            errorMessage += ` Waktu pencarian habis. Mungkin jaringan sedang lambat.`;
        } else if (error.message) {
            errorMessage += ` Detail teknis: ${error.message}`;
        }
        return errorMessage;
    }
}


// --- Help Command dan Author ---

/**
 * Mengembalikan daftar perintah yang tersedia.
 * @param {string} userName Nama pengguna untuk personalisasi.
 * @returns {string} String yang diformat yang mencantumkan semua perintah.
 */
const getHelpMessage = (userName) => {
    try {
        return `Daftar perintah Alya untuk Tuan ${userName || 'Pengguna'}:\n\n` +
               `• /reminder [HH:MM atau besok HH:MM] [pesan]: Menjadwalkan pengingat.\n` +
               `• /note [pesan]*: Menyimpan catatan pribadi.\n` +
               `• /shownotes*: Menampilkan semua catatan pribadi Anda.\n` +
               `• /search [query]: Mencari informasi menggunakan Google & diringkas Alya.\n` +
               `• /help : Menampilkan daftar perintah ini.\n` +
               `• /author : Menampilkan informasi pembuat Alya.\n\n` +
               `(*) Perintah yang ditandai bintang lebih cocok digunakan dalam chat pribadi dengan Alya.` +
               `Sst, Ada Secret Command loh!, Coba tebak ...`;
    } catch (error) {
        console.error("Error menghasilkan pesan bantuan:", error.message, error.stack);
        return "Maaf, terjadi kesalahan saat menampilkan bantuan. Silakan coba lagi nanti.";
    }
};

/**
 * Ngembaliin informasi tentang author.
 * @returns {string} String yg diformat dengan informasi author.
 */
const getAuthorInfo = () => {
    try {
        return `Alya v8.1 \n` + 
               `AUTHOR: Arash\n` +
               `TIKTOK: @rafardhancuy\n` +
               `Github: https://github.com/Rafacuy\n` +
               `LANGUAGE: ID (Indonesia)\n` +
               `TIME FORMAT: Asia/Jakarta\n` +
               `FITUR BARU: Pencarian Google dengan ringkasan AI oleh Alya!\n` +
               `MIT License`;
    } catch (error) {
        console.error("Error menghasilkan info author:", error.message, error.stack);
        return "Maaf, terjadi kesalahan saat menampilkan info author.";
    }
};

module.exports = {
    setReminder,
    rescheduleReminders,
    addNote,
    showNotes,
    performSearch,
    getHelpMessage,
    getAuthorInfo,
};
