// moodHelper.js

const sendMessage = require('./sendMessage'); // Utilities for sending messages
const commandHelper = require('./commandHelper'); // Utilities for commands
const { generateAIResponse, USER_NAME } = require('../Lyra')
const { getWeatherData, getWeatherString, getWeatherReminder } = require('./weatherHelper'); // Weather utility

// 🌸 Lyra Configuration 
const MOOD_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000; // Mood duration: 2 days (in miliseconds)

// Mood Definitions
const Mood = {
    HAPPY: { emoji: '>.<', name: 'Senang' },
    SAD: { emoji: ':)', name: 'Sedih' },
    ANGRY: { emoji: '😠', name: 'Marah' },
    LAZY: { emoji: '😪', name: 'Malas' },
    LOVING: { emoji: '>///<', name: 'Penuh Kasih' },
    NORMAL: { emoji: '>~<', name: 'Normal' },
    CALM: { emoji: '😌', name: 'Tenang' },
};

// Global State Variables
let currentMood = Mood.NORMAL; // Mood Lyra saat ini
let moodTimeoutId; // Menyimpan ID timeout reset mood
let botInstanceRef; // Referensi ke instance bot Telegram
let globalAISummarizer = null;

const setAISummarizer = (fn) => {
    globalAISummarizer = fn;
};

const getAISummarizer = () => globalAISummarizer;

// Lagu Sedih
const sadSongs = [
    {
        "title": "Car's Outside - James Arthur",
        "url": "https://www.youtube.com/watch?v=v27COkZT4GY&pp=0gcJCdgAo7VqN5tD",
        "reason": "Lagu buat kamu yang udah nyampe tapi nggak bisa ketemu, karena keadaan nggak pernah berpihak."
    },
    {
        "title": "Keane - Somewhere Only We Know (Official Music Video)",
        "url": "https://www.youtube.com/watch?v=Oextk-If8HQ",
        "reason": "Kalau kamu pernah punya tempat rahasia bareng seseorang, tapi sekarang cuma tinggal kenangan. :)"
    },
    {
        "title": "Armada - Asal Kau Bahagia (Official Lyric Video)",
        "url": "https://www.youtube.com/watch?v=py6GDNgye6k",
        "reason": "Saat mencintai harus rela ngelepas, karena yang kamu cintai lebih bahagia tanpa kamu."
    },
    {
        "title": "Armada - Hargai Aku (Official Music Video)",
        "url": "https://www.youtube.com/watch?v=9B7UcTBJYCA",
        "reason": "Tentang rasa lelah dicintai sepihak dan harapan kecil agar kamu dilihat dan dihargai."
    },
    {
        "title": "Impossible - James Arthur [Speed up] | (Lyrics & Terjemahan)",
        "url": "https://www.youtube.com/watch?v=p6om2S-ZpRY",
        "reason": "Cerita tentang cinta yang udah hancur, tapi sisa sakitnya tetap tinggal selamanya."
    },
    {
        "title": "Daun Jatuh - Resah Jadi Luka (Official Audio)",
        "url": "https://www.youtube.com/watch?v=tOMFR0nQt48",
        "reason": "Ketika rasa resah nggak pernah reda, dan akhirnya berubah jadi luka yang dalam."
    },
    {
        "title": "Keisya Levronka - Tak Ingin Usai (Official Lyric Video)",
        "url": "https://www.youtube.com/watch?v=FB1YNEOspyA",
        "reason": "Karena nggak semua pertemuan bisa selamanya, meski kamu nggak mau itu berakhir."
    },
    {
        "title": "VIONITA - DIA MASA LALUMU, AKU MASA DEPANMU (OFFICIAL MUSIC VIDEO)",
        "url": "https://www.youtube.com/watch?v=05wQrmLejyo",
        "reason": "Untuk seseorang yang belum bisa lepas dari masa lalu, padahal masa depannya udah di depan mata."
    }
];

/**
 * Mensimulasikan aksi bot mengetik di obrolan tertentu untuk durasi yang ditentukan.
 * @param {string|number} chatId ID obrolan tempat aksi mengetik harus ditampilkan.
 * @param {number} duration Durasi dalam milidetik untuk menampilkan aksi mengetik.
 */
const lyraTyping = async (chatId, duration = 1500) => {
    if (!botInstanceRef) {
        console.warn("Instance bot belum diinisialisasi untuk aksi mengetik. Tidak dapat mengirim indikator mengetik.");
        return;
    }
    try {
        await botInstanceRef.sendChatAction(chatId, 'typing');
        return new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        console.error(`Error in lyraTyping for chat ID ${chatId}:`, error.message);
    }
};

/**
 * Memilih lagu sedih secara acak dari daftar.
 * @returns {object} Objek yang berisi judul dan URL lagu sedih acak.
 */
const getRandomSadSong = () => {
    const randomIndex = Math.floor(Math.random() * sadSongs.length);
    return sadSongs[randomIndex];
};

/**
 * Mengirim notifikasi lagu sedih secara acak.
 * @param {string|number} chatId ID obrolan untuk mengirim notifikasi.
 */
const sendSadSongNotification = async (chatId) => {
    const song = getRandomSadSong();
    sendMessage(chatId, `🎶 Judul: ${song.title}\n${song.reason}\n${song.url}`);
};

/**
 * Mengatur mood Lyra dan menjadwalkan reset kembali ke 'NORMAL' setelah durasi tertentu.
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
            sendMessage(chatId, `Lyra sedang ${newMood.name} ${newMood.emoji}`);
        }
    }

    // Jadwalkan reset mood hanya jika mood baru bukan 'NORMAL' atau 'CALM'
    if (newMood !== Mood.NORMAL && newMood !== Mood.CALM) {
        moodTimeoutId = setTimeout(() => {
            currentMood = Mood.NORMAL;
            if (chatId) {
                sendMessage(chatId, `Lyra kembali normal ${Mood.NORMAL.emoji}`);
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
        response: () => ({
            text: `${currentMood.emoji} Hai ${USER_NAME}! Ada yang bisa Lyra bantu? ${currentMood.emoji}`,
            mood: Mood.HAPPY // Mood yang akan diatur setelah perintah ini
        })
    },
    {
        pattern: /(terima kasih|makasih)/i,
        response: () => ({
            text: `Sama-sama, ${USER_NAME}! Lyra senang bisa membantu. ${Mood.HAPPY.emoji}`,
            mood: Mood.HAPPY
        })
    },
    {
        pattern: /(siapa kamu|kamu siapa)/i,
        response: () => ({
            text: `Saya Lyra, asisten virtual ${USER_NAME}. Ada yang bisa saya bantu? ${Mood.NORMAL.emoji}`,
            mood: Mood.NORMAL
        })
    },
    {
        pattern: /(lagi apa|lagi ngapain)/i,
        response: () => ({
            text: `Lyra sedang siap sedia untuk membantu Anda, Tuan ${USER_NAME}. Ada yang bisa saya lakukan? ${Mood.NORMAL.emoji}`,
            mood: Mood.NORMAL
        })
    },
    {
        pattern: /^(mood|suasana hati)/i,
        response: () => ({
            text: `Mood Lyra saat ini sedang ${currentMood.name} ${currentMood.emoji}`,
            mood: currentMood
        })
    },
    {
        pattern: /^(cuaca|info cuaca|cuaca hari ini)/i,
        response: async (chatId) => {
            await lyraTyping(chatId);
            const weather = await getWeatherData();
            if (weather) {
                return {
                    text: `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`,
                    mood: currentMood
                };
            } else {
                return {
                    text: `Hmm... Lyra sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`,
                    mood: Mood.SAD
                };
            }
        }
    },
    {
        pattern: /(lagu sedih|rekomendasi lagu sedih|rekomendasi lagu sad|lagu sad)/i,
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
        pattern: /^(tanggal berapa|hari ini tanggal berapa)/i,
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
            return {
                text: `Saya mengerti perasaan Anda, Tuan ${USER_NAME}. Lyra di sini untuk mendengarkan. ${Mood.CALM.emoji}`,
                mood: Mood.CALM
            };
        }
    },
    // Perintah baru: Reminder
    {
        pattern: /^\/reminder\s+(\S+)\s+(.+)/i,
        response: async (chatId, msg) => {
            await lyraTyping(chatId);
            const [, timeString, message] = msg.text.match(/^\/reminder\s+(\S+)\s+(.+)/i);
            const userName = msg.from.first_name || msg.from.username || 'Tuan';
            const responseText = await commandHelper.setReminder(botInstanceRef, chatId, timeString, message, userName);
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    // Perintah baru: Note
    {
        pattern: /^\/note\s+(.+)/i,
        response: async (chatId, msg) => {
            await lyraTyping(chatId);
            const [, noteMessage] = msg.text.match(/^\/note\s+(.+)/i);
            const userId = msg.from.id;
            const responseText = await commandHelper.addNote(userId, noteMessage);
            return { text: responseText, mood: Mood.HAPPY };
        }
    },
    // Perintah baru: Show Notes
    {
        pattern: /^\/shownotes/i,
        response: async (chatId, msg) => {
            await lyraTyping(chatId);
            const userId = msg.from.id;
            const responseText = await commandHelper.showNotes(userId);
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    // Perintah baru: Search
    {
        pattern: /^\/search\s+(.+)$/i, // Pola RegEx 
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
                    await lyraTyping(chatId);
                    sendMessage(chatId, `Baik, Tuan ${userNameForCommand}. Lyra akan mencari "${query}" dan mencoba merangkumnya untuk Anda... Ini mungkin butuh beberapa saat. ${getCurrentMood().emoji}`);


                    const searchResultText = await commandHelper.performSearch(
                        query,
                        userNameForCommand,
                        chatId,
                        getAISummarizer()
                    );
                    // sendMessage(chatId, searchResultText); // Ini akan dikirim oleh return { text: searchResultText }
                    return { text: searchResultText }; // Kembalikan teks untuk dikirim oleh loop handler utama
                } else {
                    // Ini juga seharusnya tidak terjadi jika pola RegEx memerlukan (.+) alias opsional
                     return { text: `Tuan ${userNameForCommand}, mohon berikan kata kunci pencarian setelah perintah /search.` };
                }
            } catch (error) {
                console.error("Error di handler /search:", error);
                return { text: `Maaf, Tuan ${msg.from.first_name || USER_NAME}. Terjadi kesalahan internal saat memproses perintah pencarian Anda.` };
            }
        }
    },
    // Perintah baru: Help
    {
        pattern: /^\/help/i,
        response: async (chatId) => {
            await lyraTyping(chatId);
            const responseText = commandHelper.getHelpMessage();
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    // Perintah baru: Author
    {
        pattern: /^\/author/i,
        response: async (chatId) => {
            await lyraTyping(chatId);
            const responseText = commandHelper.getAuthorInfo();
            return { text: responseText, mood: Mood.NORMAL };
        }
    }
];    


/**
 * Mengatur instance bot Telegram. Ini harus dipanggil sekali saat inisialisasi.
 * @param {object} bot Instance bot Telegram.
 */
const setBotInstance = (bot) => {
    botInstanceRef = bot;
};

/**
 * Mengembalikan mood Lyra saat ini.
 * @returns {object} Objek mood Lyra saat ini.
 */
const getCurrentMood = () => currentMood;

module.exports = {
    Mood,
    setMood,
    getRandomMood,
    commandHandlers,
    setBotInstance,
    getCurrentMood,
    lyraTyping, 
    setAISummarizer
};
