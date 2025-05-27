// commandHelper.js
// This file contains helper functions for various bot commands like reminders, notes, and search.

const fs = require('fs').promises; // For file system operations (reading/writing JSON)
const schedule = require('node-schedule'); // For scheduling reminders
const axios = require('axios'); // For making HTTP requests to APIs
const config = require('../config/config'); // Configuration file for API keys and other settings
const sendMessage = require('./sendMessage'); // Utility for sending messages
const { formatJakartaDateTime, formatJakartaTime, getJakartaMoment } = require('./timeHelper'); // Utility for getting Jakarta time

const REMINDERS_FILE = './data/reminders.json'; // Path to the reminders JSON file
const NOTES_FILE = './data/notes.json'; // Path to the notes JSON file

// Ensure data directories exist
const ensureDirExists = async (filePath) => {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dir && dir !== '.') {
        await fs.mkdir(dir, { recursive: true }).catch(err => {
            if (err.code !== 'EEXIST') throw err;
        });
    }
};

// --- Reminder Feature ---

/**
 * Loads reminders from the JSON file.
 * @returns {Promise<Array>} An array of reminder objects.
 */
const loadReminders = async () => {
    await ensureDirExists(REMINDERS_FILE);
    try {
        const data = await fs.readFile(REMINDERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File does not exist, return an empty array
        }
        console.error("Error loading reminders:", error);
        return [];
    }
};

/**
 * Saves reminders to the JSON file.
 * @param {Array} reminders Array of reminder objects to save.
 */
const saveReminders = async (reminders) => {
    await ensureDirExists(REMINDERS_FILE);
    await fs.writeFile(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf8');
};

/**
 * Schedules a reminder.
 * @param {object} botInstance Telegram Bot API instance.
 * @param {string|number} chatId Chat ID where the reminder should be sent.
 * @param {string} timeString Time string for the reminder (e.g., "14:30", "tomorrow 10:00").
 * @param {string} message Reminder message.
 * @param {string} userName User's name who set the reminder.
 * @returns {Promise<string>} A message indicating success or failure of scheduling.
 */
const setReminder = async (botInstance, chatId, timeString, message, userName) => {
    const now = getJakartaMoment(); // Get current time in Jakarta timezone
    let reminderTime;

    // Basic time parsing (can be extended for more complex inputs)
    const timeParts = timeString.split(':');
    if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        const hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);

        // Create a moment object for the reminder time in Jakarta timezone
        reminderTime = now.clone().hour(hour).minute(minute).second(0);

        // If the reminder time is in the past for today, schedule it for tomorrow
        if (reminderTime.isBefore(now)) {
            reminderTime.add(1, 'day');
        }
    } else if (timeString.toLowerCase().includes('tomorrow')) {
        const parts = timeString.toLowerCase().split(' ');
        const time = parts[1]; // e.g., "10:00"
        const timePartsTomorrow = time.split(':');
        if (timePartsTomorrow.length === 2 && !isNaN(timePartsTomorrow[0]) && !isNaN(timePartsTomorrow[1])) {
            const hour = parseInt(timePartsTomorrow[0], 10);
            const minute = parseInt(timePartsTomorrow[1], 10);
            reminderTime = now.clone().add(1, 'day').hour(hour).minute(minute).second(0);
        }
    } else {
        return `Maaf, Tuan ${userName}. Format waktu tidak valid. Gunakan format HH:MM atau 'tomorrow HH:MM'.`;
    }

    if (!reminderTime || !reminderTime.isValid()) {
        return `Maaf, Tuan ${userName}. Lyra tidak bisa memahami waktu yang Anda berikan.`;
    }

    const reminders = await loadReminders();
    const newReminder = {
        id: Date.now(), // Unique ID for the reminder
        chatId: chatId,
        time: reminderTime.toISOString(), // Store as ISO string
        message: message,
        userName: userName
    };
    reminders.push(newReminder);
    await saveReminders(reminders);

    // Schedule the job using the Date object from moment
    schedule.scheduleJob(reminderTime.toDate(), () => {
        sendMessage(chatId, `🔔 Pengingat untuk Tuan ${userName}:\n${message}`);
        // Remove the reminder after it's triggered
        loadReminders().then(currentReminders => {
            const updatedReminders = currentReminders.filter(r => r.id !== newReminder.id);
            saveReminders(updatedReminders);
        });
    });

    const formattedTime = formatJakartaTime(reminderTime);
    const formattedDate = formatJakartaDateTime(reminderTime).split(',')[0] + ", " + formatJakartaDateTime(reminderTime).split(',')[1]; // Extract date part

    return `Baik, Tuan ${userName}! Lyra akan mengingatkan Anda pada ${formattedDate} pukul ${formattedTime} untuk: "${message}".`;
};

/**
 * Reschedules all reminders when the bot starts.
 * @param {object} botInstance Telegram Bot API instance.
 */
const rescheduleReminders = async (botInstance) => {
    const reminders = await loadReminders();
    const now = getJakartaMoment();

    const activeReminders = [];
    for (const reminder of reminders) {
        const reminderTime = getJakartaMoment(reminder.time); // Use getJakartaMoment to parse stored ISO string
        if (reminderTime.isAfter(now)) { // Only reschedule future reminders
            activeReminders.push(reminder);
            schedule.scheduleJob(reminderTime.toDate(), () => { 
                sendMessage(reminder.chatId, `🔔 Pengingat untuk Tuan ${reminder.userName}:\n${reminder.message}`);
                // Remove the reminder after it's triggered
                loadReminders().then(currentReminders => {
                    const updatedReminders = currentReminders.filter(r => r.id !== reminder.id);
                    saveReminders(updatedReminders);
                });
            });
        }
    }
    await saveReminders(activeReminders); // Save only active reminders back
    console.log(`Rescheduled ${activeReminders.length} reminders.`);
};

// --- Note Feature ---

/**
 * Loads notes for a specific user from the JSON file.
 * @param {string|number} userId User ID.
 * @returns {Promise<Array>} An array of note objects for the user.
 */
const loadNotes = async (userId) => {
    await ensureDirExists(NOTES_FILE);
    try {
        const data = await fs.readFile(NOTES_FILE, 'utf8');
        const allNotes = JSON.parse(data);
        return allNotes[userId] || [];
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File does not exist, return an empty array
        }
        console.error("Error loading notes:", error);
        return [];
    }
};

/**
 * Saves notes for a specific user to the JSON file.
 * @param {string|number} userId User ID.
 * @param {Array} userNotes Array of note objects for the user to save.
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
 * Adds a new note for the user.
 * @param {string|number} userId User ID.
 * @param {string} noteMessage Content of the note.
 * @returns {Promise<string>} A message indicating success.
 */
const addNote = async (userId, noteMessage) => {
    const userNotes = await loadNotes(userId);
    const newNote = {
        id: Date.now(),
        timestamp: getJakartaMoment().toISOString(), // Store timestamp in Jakarta timezone
        message: noteMessage
    };
    userNotes.push(newNote);
    await saveNotes(userId, userNotes);
    return `Baik, Tuan! Catatan Anda telah Lyra simpan.`;
};

/**
 * Displays all notes for the user.
 * @param {string|number} userId User ID.
 * @returns {Promise<string>} Formatted string of all notes or a message if no notes exist.
 */
const showNotes = async (userId) => {
    const userNotes = await loadNotes(userId);
    if (userNotes.length === 0) {
        return `Tuan ${userId}, Anda belum memiliki catatan yang Lyra simpan.`;
    }
    let response = `Catatan pribadi Tuan ${userId}:\n\n`;
    userNotes.forEach((note, index) => {
        const date = formatJakartaDateTime(note.timestamp); // Format timestamp using Jakarta timezone
        response += `${index + 1}. [${date}] ${note.message}\n`;
    });
    return response;
};

// --- Search Feature (Using Google Custom Search API) ---

/**
 * Performs a search using Google Custom Search API.
 * @param {string} query Search query.
 * @returns {Promise<string>} Formatted string with search results.
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
                num: 3 // Retrieve top 3 results
            }
        });

        const data = response.data;
        if (data.items && data.items.length > 0) {
            let result = `Lyra menemukan ini untuk "${query}":\n\n`;
            data.items.forEach((item, index) => {
                result += `${index + 1}. ${item.title}\n`;
                result += `${item.snippet}\n`;
                result += `Link: ${item.link}\n\n`;
            });
            return result;
        } else {
            return `Maaf, Tuan. Lyra tidak menemukan hasil yang relevan untuk "${query}".`;
        }
    } catch (error) {
        console.error("Error fetching from Google Custom Search API:", error.message);
        return `Maaf, Tuan. Terjadi kesalahan saat mencari informasi: ${error.message}`;
    }
};

// --- Help and Author Commands ---

/**
 * Returns the list of available commands.
 * @returns {string} A formatted string listing all commands.
 */
const getHelpMessage = () => {
    return `Daftar perintah Lyra:\n\n` +
           `• /reminder [HH:MM] [pesan]: Menjadwalkan pengingat.\n` +
           `• /note [pesan]*: Menyimpan catatan pribadi.\n` +
           `• /shownotes*: Menampilkan semua catatan pribadi Anda.\n` +
           `• /search [query]: Mencari informasi menggunakan Google.\n` +
           `• /help : Menampilkan daftar perintah ini.\n` +
           `• /author : Menampilkan informasi penulis Lyra.\n`;
};

/**
 * Returns information about the author.
 * @returns {string} A formatted string with author information.
 */
const getAuthorInfo = () => {
    return `Lyra v4.0 (Optimized)\n` +
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
