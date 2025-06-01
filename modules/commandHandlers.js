// modules/commandHandlers.js

const sendMessage = require('../utils/sendMessage'); // Utilities for sending messages
const commandHelper = require('./commandLists'); // Utilities for commands
const config = require('../config/config'); // Configuration File
const Mood = require('./mood');
const { getWeatherData, getWeatherString, getWeatherReminder } = require('./weather'); // Weather utility
const holidaysModule = require('./holidays');
const sendSadSongNotification = require('../utils/songNotifier')

// 🌸 Alya Configuration
const MOOD_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000; // Mood duration: 2 days (in miliseconds)
const USER_NAME = config.USER_NAME;

// Global State Variables
let currentMood = Mood.NORMAL; // Mood Alya saat ini
let moodTimeoutId; // Menyimpan ID timeout reset mood
let botInstanceRef; // Referensi ke instance bot Telegram
let globalAISummarizer = null;

let personalityMode = 'TSUNDERE'; // Default personality mode: 'TSUNDERE' or 'DEREDERE'

const setPersonalityMode = (mode) => {
    personalityMode = mode;
    console.log(`[Personality] Alya's personality mode set to: ${personalityMode}`);
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
const AlyaTyping = async (chatId, duration = 1500) => {
    if (!botInstanceRef) {
        console.warn("Instance bot belum diinisialisasi untuk aksi mengetik. Tidak dapat mengirim indikator mengetik.");
        return;
    }
    try {
        await botInstanceRef.sendChatAction(chatId, 'typing');
        return new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        console.error(`Error in AlyaTyping for chat ID ${chatId}:`, error.message);
    }
};


/**
 * Mengatur mood Alya dan menjadwalkan reset kembali ke 'NORMAL' setelah durasi tertentu.
 * Jika mood baru sudah menjadi mood saat ini, tidak ada tindakan yang diambil untuk menghindari pesan berlebihan.
 * Mood seperti 'CALM' (untuk deeptalk) tidak direset secara otomatis.
 * @param {string|number} chatId ID obrolan untuk mengirim pesan status mood.
 * @param {object} newMood Objek mood baru (dari konstanta Mood) untuk diatur.
 * @param {number} durationMs Durasi dalam milidetik untuk mood baru bertahan.
 */
const setMood = (chatId, newMood, durationMs = MOOD_TIMEOUT_MS) => {
    clearTimeout(moodTimeoutId); // Hapus reset mood yang sebelumnya dijadwalkan

    // Hanya perbarui dan umumkan mood jika benar-benar berubah
    if (currentMood !== newMood) {
        currentMood = newMood;
        if (chatId) {
            sendMessage(chatId, `Alya sedang ${newMood.name} ${newMood.emoji}`);
        }
    }

    // Jadwalkan reset mood hanya jika mood baru bukan 'NORMAL' atau 'CALM'
    if (newMood !== Mood.NORMAL && newMood !== Mood.CALM) {
        moodTimeoutId = setTimeout(() => {
            currentMood = Mood.NORMAL;
            if (chatId) {
                sendMessage(chatId, `Alya kembali normal ${Mood.NORMAL.emoji}`);
            }
        }, durationMs);
    }
};


/**
 * Mendapatkan mood acak dari konstanta Mood yang telah ditentukan, tidak termasuk mood yang ditujukan untuk mode tertentu (seperti CALM).
 * @returns {object} Objek mood yang dipilih secara acak.
 */
const getRandomMood = () => {
    const moods = Object.values(Mood).filter(mood => mood !== Mood.CALM);
    const randomIndex = Math.floor(Math.random() * moods.length);
    return moods[randomIndex];
};

const commandHandlers = [
    {
        pattern: /^(hai|halo|bot|helo|haii|woy|hoy)/i, // Pola regex untuk dicocokkan
        response: (chatId) => { // Tambahkan chatId sebagai argumen
            const greeting = personalityMode === 'TSUNDERE' ?
                `Hmph, apa maumu, Tuan? ${currentMood.emoji}` :
                `Halo, Tuan~! Alya senang kamu di sini! ${currentMood.emoji}`;
            return {
                text: greeting,
                mood: Mood.HAPPY // Mood yang akan diatur setelah perintah ini
            };
        }
    },
    {
        pattern: /^(terima kasih|makasih|makasih ya)/i,
        response: (chatId) => { // Tambahkan chatId sebagai argumen
            const thanksResponse = personalityMode === 'TSUNDERE' ?
                `J-jangan berlebihan! Aku cuma melakukan tugasku. ${Mood.NORMAL.emoji}` :
                `*Giggle* Makasih, Tuan~! Alya senang bisa bantu! >_< ${Mood.HAPPY.emoji}`;
            return {
                text: thanksResponse,
                mood: Mood.HAPPY
            };
        }
    },
    {
        pattern: /(siapa kamu|kamu siapa)/i,
        response: () => ({
            text: `Saya Alya, asisten virtual ${USER_NAME}. Ada yang bisa saya bantu? ${Mood.NORMAL.emoji}`,
            mood: Mood.NORMAL
        })
    },
    {
        pattern: /(lagi apa|lagi ngapain)/i,
        response: () => ({
            text: `Alya sedang siap sedia untuk membantu Anda, Tuan ${USER_NAME}. Ada yang bisa saya lakukan? ${Mood.NORMAL.emoji}`,
            mood: Mood.NORMAL
        })
    },
    {
        pattern: /^(mood|suasana hati)/i,
        response: () => ({
            text: `Mood Alya saat ini sedang ${currentMood.name} ${currentMood.emoji}`,
            mood: currentMood
        })
    },
    {
        pattern: /^\/cuaca/i,
        response: async (chatId) => {
            await AlyaTyping(chatId);
            const weatherCheckMessage = personalityMode === 'TSUNDERE' ?
                `Cuaca, huh? Hmph.. Baiklah, Alya akan cek cuacanya, tunggu bentar..` :
                `Oke, Tuan~! Alya akan cek cuaca untukmu! Sebentar ya~`;
            sendMessage(chatId, weatherCheckMessage);
            const weather = await getWeatherData();
            if (weather) {
                return {
                    text: `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`,
                    mood: currentMood
                };
            } else {
                return {
                    text: `Hmm... Alya kek nya. ${Mood.SAD.emoji}`,
                    mood: Mood.SAD
                };
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
                text: `Sekarang jam ${timeString}, ${USER_NAME}. ${currentMood.emoji}`,
                mood: currentMood
            };
        }
    },
    {
        pattern: /(tanggal berapa|hari ini tanggal berapa)/i,
        response: () => {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' };
            const dateString = now.toLocaleDateString('id-ID', options);
            return {
                text: `Hari ini ${dateString}, ${USER_NAME}. ${currentMood.emoji}`,
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
            await AlyaTyping(chatId);
            const [, timeString, message] = msg.text.match(/^\/reminder\s+(\S+)\s+(.+)/i);
            const userName = msg.from.first_name || msg.from.username || 'Tuan';
            const responseText = await commandHelper.setReminder(botInstanceRef, chatId, timeString, message, userName);
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    {
        pattern: /^\/note\s+(.+)/i,
        response: async (chatId, msg) => {
            await AlyaTyping(chatId);
            const [, noteMessage] = msg.text.match(/^\/note\s+(.+)/i);
            const userId = msg.from.id;
            const responseText = await commandHelper.addNote(userId, noteMessage);
            return { text: responseText, mood: Mood.HAPPY };
        }
    },
    {
        pattern: /^\/shownotes/i,
        response: async (chatId, msg) => {
            await AlyaTyping(chatId);
            const userId = msg.from.id;
            const responseText = await commandHelper.showNotes(userId);
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    // Perintah baru: Search
    {
        pattern: /^\/search\s+(.+)$/i,
        response: async (chatId, msg) => {
            try {
                // Ekstrak kueri pencarian dari pesan menggunakan pola RegEx
                const match = msg.text.match(/^\/search\s+(.+)$/i);
                if (!match || !match[1]) {
                    // Seharusnya tidak terjadi jika pattern.test() sudah lolos, tapi sebagai pengaman
                    sendMessage(chatId, `Maaf, Tuan ${msg.from.first_name || USER_NAME}. Format perintah /search tidak benar.`);
                    return {}; // Kembalikan objek kosong atau sesuai struktur respons handler Tuan
                }
                const query = match[1].trim(); // match[1] berisi teks yang ditangkap oleh grup (.+)
                const userNameForCommand = msg.from.first_name || USER_NAME;

                if (query) {
                    await AlyaTyping(chatId);
                    sendMessage(chatId, `Baik, Tuan ${userNameForCommand}. Alya akan mencari "${query}" dan mencoba merangkumnya untuk Anda... Ini mungkin butuh beberapa saat. ${getCurrentMood().emoji}`);


                    const searchResultText = await commandHelper.performSearch(
                        query,
                        userNameForCommand,
                        chatId,
                        getAISummarizer()
                    );
                    return { text: searchResultText }; // Kembalikan teks untuk dikirim oleh loop handler utama
                } else {
                    return { text: `Tuan ${userNameForCommand}, mohon berikan kata kunci pencarian setelah perintah /search.` };
                }
            } catch (error) {
                console.error("Error di handler /search:", error);
                return { text: `Maaf, Tuan ${msg.from.first_name || USER_NAME}. Terjadi kesalahan internal saat memproses perintah pencarian Anda.` };
            }
        }
    },
    {
        pattern: /^\/help/i,
        response: async (chatId) => {
            await AlyaTyping(chatId);
            const responseText = commandHelper.getHelpMessage();
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    {
        pattern: /^\/author/i,
        response: async (chatId) => {
            await AlyaTyping(chatId);
            const responseText = commandHelper.getAuthorInfo();
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    // ---  Personality Switch Commands ---
    {
        pattern: /^\/tsundere/i,
        response: async (chatId) => {
            setPersonalityMode('TSUNDERE');
            return {
                text: `Hmph, baiklah! Alya akan kembali ke mode Tsundere. Jangan harap aku jadi manis, Idiot! 🔥`,
                mood: Mood.ANGRY // Atau mood yang sesuai untuk Tsundere
            };
        }
    },
    {
        pattern: /^\/deredere/i,
        response: async (chatId) => {
            setPersonalityMode('DEREDERE');
            return {
                text: `Kyaa~! Oke, Tuan~ Alya akan jadi manis dan ramah untukmu! 🌸`,
                mood: Mood.HAPPY // Atau mood yang sesuai untuk Deredere
            };
        }
    },
];

if (config.calendarificApiKey) {
    commandHandlers.push({
        pattern: /^\/(hariini|liburhariini|infohari)$/i,
        response: async (chatId, msg) => {
            await AlyaTyping(chatId);

            const holidayMessage = await holidaysModule.getFormattedTodaysHolidays(
                config.calendarificApiKey,
                'ID', // Ganti 'ID' dengan kode negara yang diinginkan jika perlu
                config.USER_NAME // Mengambil USER_NAME dari config untuk personalisasi
            );

            // Berdasarkan struktur commandHandlers di core.js yang Anda berikan,
            // handler harus mengembalikan objek dengan properti 'text'.
            return { text: holidayMessage };
        }
    });
    console.log('[Commands] Perintah /hariini untuk info hari libur telah diaktifkan.');
} else {
    console.warn('[Commands] Calendarific API Key tidak ditemukan di config.js. Perintah /hariini (info hari libur) dinonaktifkan.');
}


/**
 * Mengatur instance bot Telegram. Ini harus dipanggil sekali saat inisialisasi.
 * @param {object} bot Instance bot Telegram.
 */
const setBotInstance = (bot) => {
    botInstanceRef = bot;
};

/**
 * Mengembalikan mood Alya saat ini.
 * @returns {object} Objek mood Alya saat ini.
 */
const getCurrentMood = () => currentMood;

module.exports = {
    Mood,
    setMood,
    getRandomMood,
    commandHandlers,
    setBotInstance,
    getCurrentMood,
    AlyaTyping,
    setAISummarizer,
    getPersonalityMode 
};
