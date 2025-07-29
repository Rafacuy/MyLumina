// modules/commandLists.js

const schedule = require('node-schedule'); // For scheduling reminders
const axios = require('axios'); // For making HTTP requests to APIs
const config = require('../config/config'); // Config file for API keys and other settings
const { sendMessage } = require('../utils/sendMessage'); // Utility for sending messages
const { formatJakartaDateTime, formatJakartaTime, getJakartaMoment } = require('../utils/timeHelper'); // Utility for Jakarta time
const { generateAIResponse } = require('../core/ai-response');
const memory = require('../data/memory'); // Import the memory module

// --- Reminder Feature ---

/**
 * Sets a reminder.
 * @param {object} botInstance - The Telegram Bot API instance.
 * @param {string|number} chatId - The ID of the chat where the reminder should be sent.
 * @param {string} timeString - The time string for the reminder (e.g., "14:30", "besok 10:00").
 * @param {string} message - The reminder message.
 * @param {string} userName - The name of the user setting the reminder.
 * @returns {Promise<string>} A message indicating success or failure of scheduling.
 */
const setReminder = async (botInstance, chatId, timeString, message, userName) => {
    if (!chatId || !timeString || !message || !userName) {
        return `Maaf, Tuan ${userName || 'Pengguna'}. Informasi tidak lengkap untuk mengatur pengingat.`;
    }

    try {
        const now = getJakartaMoment();
        let reminderTime;

        // Time parsing logic
        const timeParts = timeString.split(':');
        if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
            const hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);
            reminderTime = now.clone().hour(hour).minute(minute).second(0);
            if (reminderTime.isBefore(now)) {
                reminderTime.add(1, 'day'); // If time has passed today, schedule for tomorrow
            }
        } else if (timeString.toLowerCase().includes('tomorrow') || timeString.toLowerCase().includes('besok')) {
            const parts = timeString.toLowerCase().split(' ');
            const time = parts.find(p => p.includes(':'));
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
            return `Maaf, Tuan. Format waktu tidak valid atau Lumina tidak bisa memahami waktu yang Anda berikan. Gunakan HH:MM atau 'besok HH:MM'.`;
        }

        const reminderId = `reminder_${chatId}_${Date.now()}`;
        const newReminder = {
            key: reminderId,
            content: message,
            priority: 80, 
            type: 'reminder',
            chatId: chatId,
            userName: userName,
            createdAt: new Date().toISOString(),
            expiry: reminderTime.toISOString()
        };
        
        await memory.saveLTMMemory(reminderId, newReminder);

        // Schedule the job using the Date object from moment
        schedule.scheduleJob(reminderTime.toDate(), async () => {
            try {
                sendMessage(chatId, `🔔 Pengingat untuk Tuan ${userName}:\n${message}`);
                // Delete the reminder from memory after it has been triggered
                await memory.deleteLTMMemory(reminderId);
            } catch (scheduleError) {
                console.error("Error in scheduled reminder task:", scheduleError.message, scheduleError.stack);
            }
        });

        const formattedTime = formatJakartaTime(reminderTime);
        const formattedDate = formatJakartaDateTime(reminderTime).split(',')[0] + ", " + formatJakartaDateTime(reminderTime).split(',')[1];

        return `Baik! Lumina akan mengingatkan Anda pada ${formattedDate} pukul ${formattedTime} untuk: "${message}".`;

    } catch (error) {
        console.error("Error in setReminder:", error.message, error.stack);
        return `Maaf, Tuan. Terjadi kesalahan internal saat Lumina mencoba mengatur pengingat.`;
    }
};

/**
 * Reschedules all reminders when the bot starts.
 * @param {object} botInstance - The Telegram Bot API instance.
 */
const rescheduleReminders = async (botInstance) => {
    try {
        const reminders = await memory.getAllActiveReminders();
        const now = getJakartaMoment();
        let activeRemindersCount = 0;

        for (const reminder of reminders) {
            if (!reminder || !reminder.expiry || !reminder.chatId || !reminder.content) {
                console.warn("Skipping invalid reminder object:", reminder);
                continue;
            }
            const reminderTime = getJakartaMoment(reminder.expiry);
            if (reminderTime.isValid() && reminderTime.isAfter(now)) { // Only reschedule future reminders
                schedule.scheduleJob(reminderTime.toDate(), async () => {
                    try {
                        sendMessage(reminder.chatId, `🔔 Pengingat untuk Tuan ${reminder.userName || 'Pengguna'}:\n${reminder.content}`);
                        await memory.deleteLTMMemory(reminder.key);
                    } catch (scheduleError) {
                        console.error("Error in rescheduled reminder task:", scheduleError.message, scheduleError.stack);
                    }
                });
                activeRemindersCount++;
            } else {
                // Clean up expired reminders that might have been missed
                await memory.deleteLTMMemory(reminder.key);
                console.log(`Cleaned up expired reminder: ${reminder.key}`);
            }
        }
        console.log(`Rescheduled ${activeRemindersCount} active reminders.`);
    } catch (error) {
        console.error("Error rescheduling reminders:", error.message, error.stack);
    }
};

// --- Notes Feature ---

/**
 * Adds a new note for a user.
 * @param {string|number} userId - The User's ID.
 * @param {string} noteMessage - The content of the note.
 * @param {string} userName - The user's name for the message.
 * @returns {Promise<string>} A message indicating success.
 */
const addNote = async (userId, noteMessage, userName) => {
    if (!userId || !noteMessage) {
        return `Maaf, Tuan ${userName || 'Pengguna'}. Informasi tidak lengkap untuk menambah catatan.`;
    }
    try {
        const noteId = `note_${userId}_${Date.now()}`;
        const newNote = {
            key: noteId,
            content: noteMessage,
            priority: 90, // As requested
            type: 'note',
            chatId: userId,
            createdAt: new Date().toISOString()
        };
        await memory.saveLTMMemory(noteId, newNote);
        return `Baik, Tuan ${userName}! Catatan Anda telah Lumina simpan.`;
    } catch (error) {
        console.error(`Error in addNote for user ${userId}:`, error.message, error.stack);
        return `Maaf, Tuan.. Terjadi kesalahan internal saat Lumina mencoba menambah catatan.`;
    }
};

/**
 * Shows all notes for a user.
 * @param {string|number} userId - The User's ID.
 * @param {string} userName - The user's name for the message.
 * @returns {Promise<string>} A formatted string of notes or a message if no notes exist.
 */
const showNotes = async (userId, userName) => {
    if (!userId) {
        return `Maaf, Tuan ${userName || ''}. Lumina tidak bisa menampilkan catatan tanpa ID pengguna.`;
    }
    try {
        const userNotes = await memory.getNotesForUser(userId);
        if (userNotes.length === 0) {
            return `Tuan ${userName}, Anda belum memiliki catatan yang Lumina simpan.`;
        }
        let response = `Catatan pribadi Tuan ${userName}:\n\n`;
        userNotes.forEach((note, index) => {
            const noteMsg = note.content || "(Catatan kosong)";
            const date = formatJakartaDateTime(note.createdAt);
            response += `${index + 1}. [${date}] ${noteMsg}\n`;
        });
        return response;
    } catch (error) {
        console.error(`Error in showNotes for user ${userId}:`, error.message, error.stack);
        return `Maaf, Tuan. Terjadi kesalahan internal saat Lumina mencoba menampilkan catatan Anda.`;
    }
};

// --- Search Feature (Using Google Custom Search API & Lumina AI for Summary) ---

/**
 * Performs a search using Google Custom Search API and summarizes the results with AI.
 * @param {string} query - The search query.
 * @param {string} userName - The user's name.
 * @param {string|number} requestChatId - The chat ID of the request, for rate-limiting & AI context.
 * @param {Function} aiSummarizer - The function from Lumina to generate an AI summary (e.g., generateAIResponse).
 * @returns {Promise<string>} A formatted string with search results and its summary.
 */
async function performSearch(query, userName, requestChatId, aiSummarizer) {
    if (!query || typeof query !== 'string' || query.trim() === "") {
        return `Maaf, Tuan. Mohon berikan kata kunci pencarian yang valid.`;
    }

    const apiKey = config.GOOGLE_SEARCH_API_KEY;
    const cx = config.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        console.error("Google Search API Key or CX is not configured in config.js (dotenv).");
        return `Maaf, Tuan. Fitur pencarian belum dikonfigurasi dengan benar oleh administrator. Lumina tidak bisa melanjutkan.`;
    }

    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: { key: apiKey, cx: cx, q: query, num: 3, hl: 'id', gl: 'id' }
        });

        const data = response.data;
        if (data.items && data.items.length > 0) {
            let resultText = `Lumina menemukan ini untuk "${query}", Tuan ${userName}:\n\n`;
            let contentToSummarize = "";
            data.items.forEach((item, index) => {
                const title = item.title || "Judul tidak tersedia";
                const snippet = item.snippet || "Kutipan tidak tersedia";
                const link = item.link || "Tautan tidak tersedia";
                resultText += `${index + 1}. *${title}*\n`;
                resultText += `   ${snippet.replace(/\n/g, ' ')}\n`;
                resultText += `   Link: ${link})\n\n`;
                contentToSummarize += `${title}. ${snippet}\n`;
            });

            if (typeof aiSummarizer === 'function' && contentToSummarize.trim() !== "") {
                resultText += `\n--- Ringkasan dari Lumina ---\n`;
                try {
                    const summarizationPrompt = `Sebagai Lumina, asisten AI yang cerdas dan sedikit tsundere, ringkaskan dengan gaya khasmu informasi berikut yang ditemukan untuk Tuan ${userName} terkait pencarian "${query}". Buat ringkasan yang informatif namun tetap singkat dan menarik:\n\n${contentToSummarize}`;
                    const summary = await aiSummarizer(summarizationPrompt, requestChatId);
                    if (summary && !summary.toLowerCase().includes("maaf") && !summary.toLowerCase().includes("zzz") && !summary.toLowerCase().includes("mohon bersabar") && summary.length > 15) {
                        resultText += `${summary}\n\n`;
                    } else {
                        resultText += `Hmph, sepertinya Lumina tidak bisa memberikan ringkasan yang bagus untuk ini, Tuan ${userName}. Mungkin hasilnya terlalu sedikit atau kurang jelas.\n\n`;
                        console.log("Summary by Lumina was skipped or result was unsuitable/error:", summary);
                    }
                } catch (summarizationError) {
                    console.error("Error during summarization with Lumina:", summarizationError.message, summarizationError.stack);
                    resultText += `Ugh, terjadi kesalahan teknis saat Lumina mencoba membuat ringkasan, Tuan ${userName}. Menyebalkan.\n\n`;
                }
            } else if (typeof aiSummarizer !== 'function') {
                resultText += `\n--- Ringkasan dari Lumina ---\nFitur ringkasan AI tidak tersedia saat ini karena ada masalah teknis, Tuan ${userName}.\n\n`;
                console.warn("aiSummarizer function was not provided to performSearch. Skipping summary.");
            }
            return resultText;
        } else {
            return `Maaf, Tuan ${userName}. Lumina tidak menemukan hasil yang relevan untuk "${query}". Mungkin coba kata kunci lain?`;
        }
    } catch (error) {
        console.error("Error fetching from Google Custom Search API:", error.response ? JSON.stringify(error.response.data) : error.message, error.stack);
        let errorMessage = `Maaf, Tuan ${userName}. Terjadi masalah saat Lumina mencoba menghubungi layanan pencarian.`;
        if (error.response && error.response.status === 403) {
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

// --- Help Command and Author ---

/**
 * Returns the list of available commands.
 * @param {string} userName - The user's name for personalization.
 * @returns {string} A formatted string listing all commands.
 */
const getHelpMessage = (userName) => {
    try {
        return `Daftar perintah Lumina untuk Tuan ${userName || 'Pengguna'}:\n\n` +
               `• /reminder [HH:MM atau besok HH:MM] [pesan]: Menjadwalkan pengingat.\n` +
               `• /note [pesan]*: Menyimpan catatan pribadi.\n` +
               `• /shownotes*: Menampilkan semua catatan pribadi Anda.\n` +
               `• /search [query]: Mencari informasi menggunakan Google & diringkas Lumina.\n` +
               `• /help : Menampilkan daftar perintah ini.\n` +
               `• /author : Menampilkan informasi pembuat Lumina.\n\n` +
               `(*) Perintah yang ditandai bintang lebih cocok digunakan dalam chat pribadi dengan Lumina.` +
               `Sst, Ada Secret Command loh!, Coba tebak ...`;
    } catch (error) {
        console.error("Error generating help message:", error.message, error.stack);
        return "Maaf, terjadi kesalahan saat menampilkan bantuan. Silakan coba lagi nanti.";
    }
};

/**
 * Returns information about the author.
 * @returns {string} A formatted string with author information.
 */
const getAuthorInfo = () => {
    try {
        return `Lumina v8.1 \n` + 
               `AUTHOR: Arash\n` +
               `TIKTOK: @rafardhancuy\n` +
               `Github: https://github.com/Rafacuy\n` +
               `LANGUAGE: ID (Indonesia)\n` +
               `TIME FORMAT: Asia/Jakarta\n` +
               `FITUR BARU: Pencarian Google dengan ringkasan AI oleh Lumina!\n` +
               `MIT License`;
    } catch (error) {
        console.error("Error generating author info:", error.message, error.stack);
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
