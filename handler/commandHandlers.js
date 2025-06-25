// handler/commandHandlers.js

const { sendMessage } = require('../utils/sendMessage'); // Utilities for sending messages
const commandHelper = require('../modules/commandLists'); // Utilities for commands
const config = require('../config/config'); // Configuration File
const Mood = require('../modules/mood');
const { getWeatherData, getWeatherString, getWeatherReminder } = require('../modules/weather'); // Weather utility
const holidaysModule = require('./holidayHandlers');
const memory = require('../data/memory');
const sendSadSongNotification = require('../utils/songNotifier')
const logger = require('../utils/logger');
const Sentry = require('@sentry/node'); 

// Lumina Configuration
const MOOD_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000; // Mood duration: 2 days (in miliseconds)
const USER_NAME = config.USER_NAME;

// Global State Variables
let currentMood = Mood.NORMAL; // Mood Lumina saat ini
let moodTimeoutId; // Menyimpan ID timeout reset mood
let botInstanceRef; // Referensi ke instance bot Telegram
let globalAISummarizer = null;

let personalityMode = 'TSUNDERE'; // Default personality mode: 'TSUNDERE' or 'DEREDERE'

/**
 * Sets the personality mode and saves it to memory.
 * @param {string} mode - The personality mode to set ('TSUNDERE' or 'DEREDERE').
 */
const setPersonalityMode = async (mode) => {
    personalityMode = mode;
    try {
        await memory.savePreference("lumina_personality", mode);
        logger.info({ event: 'personality_change', mode: personalityMode }, `[Personality] Mode kepribadian diubah menjadi: ${personalityMode} dan berhasil disimpan.`);
    } catch (error) {
        logger.error({ event: 'personality_save_error', error: error.message, stack: error.stack }, "[Personality] Gagal menyimpan mode kepribadian:");
        Sentry.captureException(error);
    }
};

const getPersonalityMode = () => personalityMode;

const setAISummarizer = (fn) => {
    globalAISummarizer = fn;
};

const getAISummarizer = () => globalAISummarizer;

/**
 * Mensimulasikan aksi bot mengetik di obrolan tertentu untuk durasi yang ditentukan.
 * @param {string|number} chatId ID obrolan tempat aksi mengetik harus ditampilkan.
 * @param {number} duration Durasi dalam milidetik untuk menampilkan aksi mengetik.
 */
const LuminaTyping = async (chatId, duration = 1500) => {
    if (!botInstanceRef) {
        logger.warn({ event: 'typing_action_failed', reason: 'bot_instance_not_set' }, "Instance bot belum diinisialisasi. Tidak dapat mengirim indikator mengetik.");
        return;
    }
    try {
        await botInstanceRef.sendChatAction(chatId, 'typing');
        return new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        logger.error({ event: 'typing_action_error', chatId: chatId, error: error.message, stack: error.stack }, `Error in LuminaTyping for chat ID ${chatId}`);
        Sentry.captureException(error, { extra: { chatId } });
    }
};

/**
 * Mengatur mood Lumina dan menjadwalkan reset kembali ke 'NORMAL' setelah durasi tertentu.
 * @param {string|number} chatId ID obrolan untuk mengirim pesan status mood.
 * @param {object} newMood Objek mood baru (dari konstanta Mood) untuk diatur.
 * @param {number} durationMs Durasi dalam milidetik untuk mood baru bertahan.
 */
const setMood = (chatId, newMood, durationMs = MOOD_TIMEOUT_MS) => {
    clearTimeout(moodTimeoutId);

    if (currentMood !== newMood) {
        currentMood = newMood;
        logger.info({ event: 'mood_change', mood: newMood.name, chatId }, `Mood changed to ${newMood.name}`);
        if (chatId) {
            sendMessage(chatId, `Lumina sedang ${newMood.name} ${newMood.emoji}`);
        }
    }

    if (newMood !== Mood.NORMAL && newMood !== Mood.CALM) {
        moodTimeoutId = setTimeout(() => {
            currentMood = Mood.NORMAL;
            logger.info({ event: 'mood_reset', chatId }, `Mood reset to NORMAL`);
            if (chatId) {
                sendMessage(chatId, `Lumina kembali normal ${Mood.NORMAL.emoji}`);
            }
        }, durationMs);
    }
};

/**
 * Mendapatkan mood acak dari konstanta Mood yang telah ditentukan.
 * @returns {object} Objek mood yang dipilih secara acak.
 */
const getRandomMood = () => {
    const moods = Object.values(Mood).filter(mood => mood !== Mood.CALM);
    const randomIndex = Math.floor(Math.random() * moods.length);
    return moods[randomIndex];
};


const commandHandlers = [
    {
        pattern: /^\/start$/i,
        response: (chatId, msg) => {
            const userFirstName = msg.from.first_name || USER_NAME;
            const startMessage = `
🌸 Selamat Datang, Tuan ${userFirstName}! 🌸

Saya Lumina, asisten virtual pribadi Anda. Saya di sini untuk membantu Anda dengan berbagai tugas dan membuat hari Anda lebih mudah!

Anda dapat berinteraksi dengan saya menggunakan bahasa natural atau menggunakan beberapa perintah cepat di bawah ini:

- /help - Menampilkan pesan bantuan ini.
- /cuaca - Mendapatkan informasi cuaca terkini.
- /mood - Mengecek suasana hati saya saat ini.
- /note [pesan] - Menyimpan catatan singkat.
- /shownotes - Menampilkan semua catatan Anda.
- /reminder [waktu] [pesan] - Mengatur pengingat.
- /search [kueri] - Mencari informasi di web dan merangkumnya.

Saya juga memiliki dua mode kepribadian yang bisa Anda ubah:
- /tsundere - Mode standar saya, sedikit jual mahal tapi peduli.
- /deredere - Mode yang lebih manis, ceria, dan penyayang.

Silakan coba salah satu perintah atau ajak saya mengobrol! ${Mood.HAPPY.emoji}`;

            return {
                text: startMessage,
                mood: Mood.HAPPY
            };
        }
    },
    {
        pattern: /^(hai|halo|bot|helo|haii|woy|hoy)/i,
        response: (chatId) => {
            const greeting = personalityMode === 'TSUNDERE' ?
                `Hmph, apa maumu, Tuan? ${currentMood.emoji}` :
                `Halo, Tuan~! Lumina senang kamu di sini! ${currentMood.emoji}`;
            return {
                text: greeting,
                mood: Mood.HAPPY
            };
        }
    },
    {
        pattern: /^(terima kasih|makasih|makasih ya)/i,
        response: () => {
            const thanksResponse = personalityMode === 'TSUNDERE' ?
                `J-jangan berlebihan! Aku cuma melakukan tugasku. ${Mood.NORMAL.emoji}` :
                `*Giggle* Makasih, Tuan~! Lumina senang bisa bantu! >_< ${Mood.HAPPY.emoji}`;
            return {
                text: thanksResponse,
                mood: Mood.HAPPY
            };
        }
    },
    {
        pattern: /(siapa kamu|kamu siapa)/i,
        response: (chatId, msg) => {
            const userName = msg.from.first_name || 'Tuan';
            return {
                text: `Saya Lumina, asisten virtual ${userName}. Ada yang bisa saya bantu? ${Mood.NORMAL.emoji}`,
                mood: Mood.NORMAL
            };
        }
    },
    {
        pattern: /(lagi apa|lagi ngapain)/i,
        response: () => ({
            text: `Lumina sedang siap sedia untuk membantu Anda, Tuan. Ada yang bisa saya lakukan? ${Mood.NORMAL.emoji}`,
            mood: Mood.NORMAL
        })
    },
    {
        pattern: /^(mood|suasana hati)/i,
        response: () => ({
            text: `Mood Lumina saat ini sedang ${currentMood.name} ${currentMood.emoji}`,
            mood: currentMood
        })
    },
    {
        pattern: /^\/cuaca/i,
        response: async (chatId) => {
            try {
                await LuminaTyping(chatId);
                const weatherCheckMessage = personalityMode === 'TSUNDERE' ?
                    `Cuaca, huh? Hmph.. Baiklah, Lumina akan cek cuacanya, tunggu bentar..` :
                    `Oke, Tuan~! Lumina akan cek cuaca untukmu! Sebentar ya~`;
                sendMessage(chatId, weatherCheckMessage);
                const weather = await getWeatherData();
                if (weather) {
                    return {
                        text: `Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`,
                        mood: currentMood
                    };
                } else {
                    return {
                        text: `Maaf, Tuan. Lumina tidak berhasil mendapatkan data cuaca saat ini. ${Mood.SAD.emoji}`,
                        mood: Mood.SAD
                    };
                }
            } catch (error) {
                logger.error({ event: 'weather_command_error', error: error.message, stack: error.stack }, "Error in /cuaca command handler");
                Sentry.captureException(error);
                return { text: `Maaf, Tuan. Terjadi kesalahan saat memproses perintah cuaca. ${Mood.SAD.emoji}`, mood: Mood.SAD };
            }
        }
    },
    {
        pattern: /^(lagu sedih|rekomendasi lagu sedih|rekomendasi lagu sad|lagu sad)/i,
        response: async (chatId) => {
            await sendSadSongNotification(chatId);
            return {
                text: null,
                mood: Mood.SAD
            };
        }
    },
    {
        pattern: /(jam berapa|waktu sekarang)/i,
        response: () => {
            const now = new Date();
            const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' };
            const timeString = now.toLocaleTimeString('id-ID', options);
            return {
                text: `Sekarang jam ${timeString}, Tuan. ${currentMood.emoji}`,
                mood: currentMood
            };
        }
    },
    {
        pattern: /(tanggal berapa|hari ini tanggal berapa)/i,
        response: (chatId, msg) => {
            const userName = msg.from.first_name;
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' };
            const dateString = now.toLocaleDateString('id-ID', options);
            return {
                text: `Hari ini ${dateString}, ${userName}. ${currentMood.emoji}`,
                mood: currentMood
            };
        }
    },
    {
        pattern: /(lagi sedih|lagi galau|patah hati|lagi nangis)/i,
        response: async (chatId) => {
            await sendSadSongNotification(chatId);
            const comfortMessage = personalityMode === 'TSUNDERE' ?
                `*Dengus* Lemah banget... tapi aku dengar. ${Mood.CALM.emoji}` :
                `Peluk virtual~ Aku di sini untukmu! ${Mood.CALM.emoji}`;
            return {
                text: comfortMessage,
                mood: Mood.CALM
            };
        }
    },
    {
        pattern: /^\/reminder\s+(\S+)\s+(.+)/i,
        response: async (chatId, msg) => {
             try {
                await LuminaTyping(chatId);
                const [, timeString, message] = msg.text.match(/^\/reminder\s+(\S+)\s+(.+)/i);
                const userName = msg.from.first_name || msg.from.username || 'Tuan';
                const responseText = await commandHelper.setReminder(botInstanceRef, chatId, timeString, message, userName);
                return { text: responseText, mood: Mood.NORMAL };
            } catch (error) {
                logger.error({ event: 'reminder_command_error', error: error.message, stack: error.stack }, "Error in /reminder command handler");
                Sentry.captureException(error);
                return { text: 'Maaf, terjadi kesalahan saat menyetel pengingat.' };
            }
        }
    },
    {
        pattern: /^\/note\s+(.+)/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const [, noteMessage] = msg.text.match(/^\/note\s+(.+)/i);
                const userId = msg.from.id;
                const responseText = await commandHelper.addNote(userId, noteMessage);
                return { text: responseText, mood: Mood.HAPPY };
            } catch (error) {
                logger.error({ event: 'note_command_error', error: error.message, stack: error.stack }, "Error in /note command handler");
                Sentry.captureException(error);
                return { text: 'Maaf, terjadi kesalahan saat menyimpan catatan.' };
            }
        }
    },
    {
        pattern: /^\/shownotes/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const userId = msg.from.id;
                const responseText = await commandHelper.showNotes(userId);
                return { text: responseText, mood: Mood.NORMAL };
            } catch (error) {
                logger.error({ event: 'shownotes_command_error', error: error.message, stack: error.stack }, "Error in /shownotes command handler");
                Sentry.captureException(error);
                return { text: 'Maaf, terjadi kesalahan saat menampilkan catatan.' };
            }
        }
    },
    {
        pattern: /^\/search\s+(.+)$/i,
        response: async (chatId, msg) => {
            try {
                const match = msg.text.match(/^\/search\s+(.+)$/i);
                if (!match || !match[1]) {
                    return { text: `Maaf, Tuan ${msg.from.first_name || ''}. Format perintah /search tidak benar.` };
                }
                const query = match[1].trim();
                const userNameForCommand = msg.from.first_name || '';
                
                await LuminaTyping(chatId);
                sendMessage(chatId, `Baik, Tuan ${userNameForCommand}. Lumina akan mencari "${query}" dan mencoba merangkumnya... Ini mungkin butuh beberapa saat. ${getCurrentMood().emoji}`);
                
                const searchResultText = await commandHelper.performSearch(
                    query,
                    userNameForCommand,
                    chatId,
                    getAISummarizer()
                );
                return { text: searchResultText };
            } catch (error) {
                logger.error({ event: 'search_command_error', query: msg.text, error: error.message, stack: error.stack }, "Error in /search command handler");
                Sentry.captureException(error, { extra: { query: msg.text }});
                return { text: `Maaf, Tuan ${msg.from.first_name || ''}. Terjadi kesalahan internal saat memproses perintah pencarian Anda.` };
            }
        }
    },
    {
        pattern: /^\/help/i,
        response: async (chatId) => {
            await LuminaTyping(chatId);
            const responseText = commandHelper.getHelpMessage(personalityMode); // Pass personality mode
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    {
        pattern: /^\/author/i,
        response: async (chatId) => {
            await LuminaTyping(chatId);
            const responseText = commandHelper.getAuthorInfo();
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    // ---  Personality Switch Commands ---
    {
        pattern: /^\/tsundere/i,
        response: async (chatId) => {
            await setPersonalityMode('TSUNDERE');
            return {
                text: `Hmph, baiklah! Lumina akan kembali ke mode Tsundere. Jangan harap aku jadi manis, Baka! 櫨`,
                mood: Mood.ANGRY 
            };
        }
    },
    {
        pattern: /^\/deredere/i,
        response: async (chatId) => {
            await setPersonalityMode('DEREDERE');
            return {
                text: `Kyaa~! Oke, Tuan~ Lumina akan jadi manis dan ramah untukmu! 減`,
                mood: Mood.LOVING 
            };
        }
    },
];

if (config.calendarificApiKey) {
    commandHandlers.push({
        pattern: /^\/(hariini|liburhariini|infohari)$/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const holidayMessage = await holidaysModule.getFormattedTodaysHolidays(
                    config.calendarificApiKey,
                    'ID',
                    config.USER_NAME
                );
                return { text: holidayMessage };
            } catch (error) {
                 logger.error({ event: 'holiday_command_error', error: error.message, stack: error.stack }, "Error in /hariini command handler");
                 Sentry.captureException(error);
                 return { text: 'Maaf, terjadi kesalahan saat memeriksa hari libur.' };
            }
        }
    });
    logger.info('[Commands] Perintah /hariini untuk info hari libur telah diaktifkan.');
} else {
    logger.warn('[Commands] Calendarific API Key tidak ditemukan di config.js. Perintah /hariini (info hari libur) dinonaktifkan.');
}

/**
 * Mengatur instance bot Telegram. Ini harus dipanggil sekali saat inisialisasi.
 * @param {object} bot Instance bot Telegram.
 */
const setBotInstance = (bot) => {
    botInstanceRef = bot;
};

/**
 * Mengembalikan mood Lumina saat ini.
 * @returns {object} Objek mood Lumina saat ini.
 */
const getCurrentMood = () => currentMood;

module.exports = {
    Mood,
    setMood,
    getRandomMood,
    commandHandlers,
    setBotInstance,
    getCurrentMood,
    LuminaTyping,
    setAISummarizer,
    getPersonalityMode,
    setPersonalityMode 
};
