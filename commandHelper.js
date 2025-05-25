// commandHelper.js
// This file contains helper functions for various commands in HoshinoBot.

const fs = require('fs').promises; // For file system operations (reading/writing JSON)
const schedule = require('node-schedule'); // For scheduling reminders
const axios = require('axios'); // For making HTTP requests to APIs
const config = require('./config'); // Configuration file for API keys and other settings
const sendMessage = require('./utils/sendMessage'); // Utility for sending messages
const { getJakartaHour } = require('./utils/timeHelper'); // Utility for getting Jakarta hour

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
            return []; // File doesn't exist, return empty array
        }
        console.error("Error loading reminders:", error);
        return [];
    }
};

/**
 * Saves reminders to the JSON file.
 * @param {Array} reminders The array of reminder objects to save.
 */
const saveReminders = async (reminders) => {
    await ensureDirExists(REMINDERS_FILE);
    await fs.writeFile(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf8');
};

/**
 * Schedules a reminder.
 * @param {object} botInstance The Telegram Bot API instance.
 * @param {string|number} chatId The chat ID where the reminder should be sent.
 * @param {string} timeString The time string for the reminder (e.g., "14:30", "tomorrow 10:00").
 * @param {string} message The reminder message.
 * @param {string} userName The name of the user setting the reminder.
 * @returns {Promise<string>} A message indicating the success or failure of scheduling.
 */
const setReminder = async (botInstance, chatId, timeString, message, userName) => {
    const now = new Date();
    let reminderTime;

    // Basic time parsing (can be expanded for more complex inputs)
    const timeParts = timeString.split(':');
    if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        const hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);

        reminderTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);

        // If the reminder time is in the past for today, schedule for tomorrow
        if (reminderTime < now) {
            reminderTime.setDate(reminderTime.getDate() + 1);
        }
    } else if (timeString.toLowerCase().includes('tomorrow')) {
        const parts = timeString.toLowerCase().split(' ');
        const time = parts[1]; // e.g., "10:00"
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
        id: Date.now(), // Unique ID for the reminder
        chatId: chatId,
        time: reminderTime.toISOString(),
        message: message,
        userName: userName
    };
    reminders.push(newReminder);
    await saveReminders(reminders);

    schedule.scheduleJob(reminderTime, () => {
        sendMessage(chatId, `🔔 Pengingat untuk Tuan ${userName}:\n${message}`);
        // Remove reminder after it's triggered
        loadReminders().then(currentReminders => {
            const updatedReminders = currentReminders.filter(r => r.id !== newReminder.id);
            saveReminders(updatedReminders);
        });
    });

    const formattedTime = reminderTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const formattedDate = reminderTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

    return `Baik, Tuan ${userName}! Hoshino akan mengingatkan Anda pada ${formattedDate} pukul ${formattedTime} untuk: "${message}".`;
};

/**
 * Reschedules all reminders on bot startup.
 * @param {object} botInstance The Telegram Bot API instance.
 */
const rescheduleReminders = async (botInstance) => {
    const reminders = await loadReminders();
    const now = new Date();

    const activeReminders = [];
    for (const reminder of reminders) {
        const reminderTime = new Date(reminder.time);
        if (reminderTime > now) { // Only reschedule future reminders
            activeReminders.push(reminder);
            schedule.scheduleJob(reminderTime, () => {
                sendMessage(reminder.chatId, `🔔 Pengingat untuk Tuan ${reminder.userName}:\n${reminder.message}`);
                // Remove reminder after it's triggered
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
 * @param {string|number} userId The ID of the user.
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
            return []; // File doesn't exist, return empty array
        }
        console.error("Error loading notes:", error);
        return [];
    }
};

/**
 * Saves notes for a specific user to the JSON file.
 * @param {string|number} userId The ID of the user.
 * @param {Array} userNotes The array of note objects for the user to save.
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
 * Adds a new note for a user.
 * @param {string|number} userId The ID of the user.
 * @param {string} noteMessage The content of the note.
 * @returns {Promise<string>} A message indicating success.
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
 * Displays all notes for a user.
 * @param {string|number} userId The ID of the user.
 * @returns {Promise<string>} A formatted string of all notes or a message if no notes exist.
 */
const showNotes = async (userId) => {
    const userNotes = await loadNotes(userId);
    if (userNotes.length === 0) {
        return `Tuan ${userId}, Anda belum memiliki catatan yang Hoshino simpan.`;
    }
    let response = `Catatan pribadi Tuan ${userId}:\n\n`;
    userNotes.forEach((note, index) => {
        const date = new Date(note.timestamp).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        response += `${index + 1}. [${date}] ${note.message}\n`;
    });
    return response;
};

// --- Search Feature ---

/**
 * Performs a search using DuckDuckGo and Wikipedia.
 * @param {string} query The search query.
 * @returns {Promise<string>} A formatted string with search results.
 */
const performSearch = async (query) => {
    let result = `Hoshino mencari informasi untuk "${query}":\n\n`;

    // DuckDuckGo Instant Answer API
    try {
        const ddgResponse = await axios.get('https://api.duckduckgo.com/', {
            params: {
                q: query,
                format: 'json',
                t: 'HoshinoBot', // Your app name
                nohtml: '1', // Remove HTML tags from text
                skip_disambig: '1' // Skip disambiguation if possible
            }
        });

        const ddgData = ddgResponse.data;
        if (ddgData.AbstractText) {
            result += `🌐 DuckDuckGo:\n${ddgData.AbstractText}\n\n`;
        } else if (ddgData.RelatedTopics && ddgData.RelatedTopics.length > 0) {
            const firstTopic = ddgData.RelatedTopics[0];
            if (firstTopic.Text) {
                result += `🌐 DuckDuckGo (Topik Terkait):\n${firstTopic.Text}\n\n`;
            }
        }
    } catch (error) {
        console.error("Error fetching from DuckDuckGo:", error.message);
        result += "🌐 DuckDuckGo: Gagal mengambil hasil.\n\n";
    }

    // Wikipedia API
    try {
        const wikiResponse = await axios.get('https://id.wikipedia.org/w/api.php', {
            params: {
                action: 'query',
                list: 'search',
                srsearch: query,
                format: 'json',
                srlimit: 1, // Get only the top result
                prop: 'extracts',
                exintro: true, // Get only the introduction
                explaintext: true, // Return plain text
                redirects: 1, // Follow redirects
                origin: '*' // CORS
            }
        });

        const wikiData = wikiResponse.data;
        if (wikiData.query && wikiData.query.search && wikiData.query.search.length > 0) {
            const pageId = wikiData.query.search[0].pageid;
            const extractResponse = await axios.get('https://id.wikipedia.org/w/api.php', {
                params: {
                    action: 'query',
                    prop: 'extracts',
                    pageids: pageId,
                    format: 'json',
                    exintro: true,
                    explaintext: true,
                    redirects: 1,
                    origin: '*'
                }
            });
            const extractData = extractResponse.data;
            const page = extractData.query.pages[pageId];
            if (page && page.extract) {
                result += `📚 Wikipedia:\n${page.extract.substring(0, 500)}...\n`; // Limit to 500 chars
                result += `Baca selengkapnya: https://id.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}\n`;
            }
        }
    } catch (error) {
        console.error("Error fetching from Wikipedia:", error.message);
        result += "📚 Wikipedia: Gagal mengambil hasil.\n";
    }

    if (result === `Hoshino mencari informasi untuk "${query}":\n\n`) {
        return `Maaf, Tuan. Hoshino tidak menemukan hasil yang relevan untuk "${query}".`;
    }
    return result;
};

// --- Help and Author Commands ---

/**
 * Returns the list of available commands.
 * @returns {string} A formatted string listing all commands.
 */
const getHelpMessage = () => {
    return `Daftar perintah Hoshino:\n\n` +
           `• */reminder [HH:MM] [pesan]* atau */reminder tomorrow [HH:MM] [pesan]*: Menjadwalkan pengingat.\n` +
           `• */note [pesan]*: Menyimpan catatan pribadi.\n` +
           `• */shownotes*: Menampilkan semua catatan pribadi Anda.\n` +
           `• */search [query]*: Mencari informasi di DuckDuckGo dan Wikipedia.\n` +
           `• */help*: Menampilkan daftar perintah ini.\n` +
           `• */author*: Menampilkan informasi penulis Hoshino.\n` +
           `• */mood*: Menampilkan mood Hoshino saat ini.\n` +
           `• */cuaca*: Menampilkan informasi cuaca terkini.\n` +
           `• */lagu sedih*: Memberikan rekomendasi lagu sedih.\n` +
           `• */jam berapa*: Menampilkan waktu saat ini.\n` +
           `• */tanggal berapa*: Menampilkan tanggal saat ini.\n` +
           `• */lagi sedih*: Hoshino akan mendengarkan keluh kesah Anda dan merekomendasikan lagu sedih.`;
};

/**
 * Returns information about the author.
 * @returns {string} A formatted string with author information.
 */
const getAuthorInfo = () => {
    return `Hoshino v3.0 (Optimized)\n` +
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
