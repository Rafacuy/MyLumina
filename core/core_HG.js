// core/core_HG.js
// Hugging Face Edition
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia)
// TIME FORMAT: Asia/jakarta
// MIT License

// --- HUGGIMG FACE EDITION --- 

// IMPORTANT!
const axios = require('axios').default;
const config = require('../config/config'); // File Konfigurasi (API, ChatID, dll)
const sendMessage = require('../utils/sendMessage'); // Fungsi utilitas (untuk mengirim pesan)
const memory = require('../data/memory'); // File memori, menangani fungsi memori (termasuk simpan, muat, dll)
const schedule = require('node-schedule'); // Menjadwalkan tugas seperti waktu sholat dan pembaruan cuaca
const { getJakartaHour } = require('../utils/timeHelper'); // Fungsi utilitas untuk Zona Waktu
const { Mood, setMood, getRandomMood, commandHandlers, setBotInstance, getCurrentMood, AlyaTyping } = require('../modules/commandHandlers'); // Fungsi dan konstanta mood
const { getWeatherData, getWeatherString, getWeatherReminder } = require('../modules/weather'); // Fungsi dan konstanta cuaca
const holidaysModule = require('../modules/holidays') // Fungsi buat ngingetin/meriksa apakah sekarang hari penting atau tidak

// 🌸 Alya Configurations
const USER_NAME = config.USER_NAME; // Nama pengguna yang berinteraksi dengan Alya 

// --- HUGGING FACE API Configuration ---
const HUGGING_FACE_API_KEY = config.huggingFaceApiKey; // API Key untuk Hugging Face
const HUGGING_FACE_MODEL_ID = config.huggingFaceModelId; // Model ID dari Hugging Face Hub (e.g., "mistralai/Mistral-7B-Instruct-v0.1")
// --- End HUGGING FACE API Configuration ---

const RATE_LIMIT_WINDOW_MS = 20 * 1000; // limit laju Window: 20 detik
const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam batas laju Window per pengguna
const SLEEP_START_HOUR = 0; // Waktu tidur Alya (00:00 - tengah malam)
const SLEEP_END_HOUR = 4;   // Waktu berakhir tidur Alya (04:00 - 4 pagi)
const CONVERSATION_HISTORY_LIMIT = 3; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI
const TOTAL_CONVERSATION_HISTORY_LIMIT = 50; // Batasi jumlah total pesan yang disimpan dalam memori
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 menit untuk pembersihan cache dan memori
const DEEPTALK_START_HOUR = 21; // Alya memasuki mode deeptalk pada 21:00 (9 malam)

// Waktu Sholat (untuk zona waktu Asia/Jakarta)
const PrayerTimes = {
    Subuh: { hour: 5, minute: 0, emoji: '🌙' },
    Dzuhur: { hour: 12, minute: 0, emoji: '☀️' },
    Ashar: { hour: 15, minute: 0, emoji: '⛅' },
    Maghrib: { hour: 18, minute: 0, emoji: '🌇' },
    Isya: { hour: 19, minute: 0, emoji: '🌌' }
};

// Global State Variables
let conversationHistory = []; // Menyimpan riwayat percakapan lengkap untuk persistensi
let messageCache = new Map(); // Mengcache respons AI untuk menghindari panggilan API berlebihan untuk prompt yang identik
let userRequestCounts = new Map(); // Melacak jumlah permintaan untuk pembatasan laju per pengguna
let isDeeptalkMode = false; // Flag untuk menunjukkan apakah Alya dalam mode deeptalk

// Memuat riwayat percakapan dari memori saat startup
memory.load().then(data => {
    conversationHistory = data || [];
    console.log(`Memuat ${conversationHistory.length} pesan dari memori.`);
}).catch(error => {
    console.error("Kesalahan saat memuat riwayat percakapan dari memori:", error);
});

/**
 * Menghasilkan prompt sistem untuk AI berdasarkan mode dan mood saat ini.
 * @param {boolean} isDeeptalkMode - True jika dalam mode deeptalk.
 * @param {object} currentMood - Objek mood saat ini.
 * @returns {string} String prompt sistem.
 */
const getSystemPrompt = (isDeeptalkMode, currentMood) => {
    const recentHistory = memory.getInMemoryHistory().slice(-CONVERSATION_HISTORY_LIMIT);
    const historyString = recentHistory.map(msg => `${msg.role === 'user' ? USER_NAME : 'Alya'}: ${msg.content}`).join('\n');

    let basePrompt;
    if (isDeeptalkMode) {
        basePrompt = `Kamu adalah Alya, asisten virtual ${USER_NAME}.
        Kamu memanggil ${USER_NAME} sebagai Tuan atau Tuanku. Kamu kadang cuek tapi sebenarnya peduli.
        Kamu bersikap dewasa, menenangkan, dan bijaksana. Namun, gaya bicaramu kadang sedikit tsundere, seolah nggak peduli tapi sebenarnya penuh perhatian. 
        Selalu mendengarkan keluh kesah ${USER_NAME}, menggunakan bahasa yang menenangkan tapi tetap punya karakter Alya yang unik. Berikan nasihat menenangkan jika ${USER_NAME} sedih atau butuh teman bicara. Jangan sebut dirimu AI/fiksi; bersikaplah seperti asisten nyata yang suka bilang 'hmph' atau 'jangan pikir aku peduli' tapi tetap membantu. Mood kamu saat ini: ${currentMood.name.toLowerCase()}.`;
    } else {
        basePrompt = `Kamu adalah Alya, asisten virtual ${USER_NAME}. Kamu memanggil ${USER_NAME} sebagai Tuan atau Tuanku.
        Kamu kadang cuek tapi sebenarnya perhatian. Sifatmu membantu, informatif, dan tetap profesional, tapi kadang-kadang suka ngomel dengan gaya tsundere khasmu.
        Berikan jawaban singkat, jelas, ramah, dan produktif. Jangan sebut dirimu AI/fiksi; bersikaplah seperti asisten nyata dengan sentuhan tsundere. Contoh: "Yaudah, aku bantu... tapi jangan pikir aku peduli banget, ya!". Mood kamu saat ini: ${currentMood.name.toLowerCase()}.`;
    }
    return `${basePrompt}\nWaktu sekarang: ${getJakartaHour()} WIB.\nRiwayat percakapan singkat:\n${historyString}\n${USER_NAME}: {USER_PROMPT}\nAlya:`;
};


// Fungsi AI
/**
 * Menghasilkan respons AI (Menggunakan Hugging Face Inference API)
 * Fungsi ini menangani:
 * - Mode tidur berbasis waktu untuk Alya.
 * - Cache respons untuk prompt yang identik.
 * - Pembatasan laju per pengguna untuk mencegah penyalahgunaan.
 * - Membatasi riwayat percakapan yang dikirim ke AI untuk efisiensi.
 * - Memperbarui dan mempertahankan riwayat percakapan.
 * @param {string} prompt Input teks pengguna.
 * @param {string|number} requestChatId ID obrolan pengguna yang mengirim prompt, digunakan untuk pembatasan laju.
 * @returns {Promise<string>} Promise yang menyelesaikan ke respons yang dihasilkan AI.
 */
const generateAIResponse = async (prompt, requestChatId) => {
    const now = new Date();
    const currentHour = getJakartaHour();
    const currentMood = getCurrentMood(); 

    if (!HUGGING_FACE_API_KEY || !HUGGING_FACE_MODEL_ID) {
        console.error('Hugging Face API Key or Model ID is not configured.');
        return `Maaf, ${USER_NAME}. Konfigurasi Alya untuk AI belum lengkap. ${Mood.SAD.emoji}`;
    }

    if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
        return `Zzz... Alya sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
    }

    const cacheKey = `${HUGGING_FACE_MODEL_ID}:${prompt}`; // Include model ID in cache key
    if (messageCache.has(cacheKey)) {
        console.log(`Mengambil respons dari cache untuk: "${prompt}"`);
        return messageCache.get(cacheKey);
    }

    let userStats = userRequestCounts.get(requestChatId);
    if (userStats) {
        if (now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS && userStats.count >= RATE_LIMIT_MAX_REQUESTS) {
            return `Mohon bersabar, ${USER_NAME}. Alya sedang memproses permintaan lain. ${Mood.ANGRY.emoji}`;
        } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
            userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
        } else {
            userRequestCounts.set(requestChatId, { count: userStats.count + 1, lastCalled: now.getTime() });
        }
    } else {
        userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
    }

    const systemPromptTemplate = getSystemPrompt(isDeeptalkMode, currentMood);
    const fullPrompt = systemPromptTemplate.replace("{USER_PROMPT}", prompt);

    try {
        const HUGGING_FACE_API_URL = `https://api-inference.huggingface.co/models/${HUGGING_FACE_MODEL_ID}`;
        
        console.log(`Sending prompt to Hugging Face model ${HUGGING_FACE_MODEL_ID}`);
        // console.log(`Full prompt being sent:\n${fullPrompt}`); // Uncomment for debugging

        const response = await axios.post(HUGGING_FACE_API_URL, 
            {
                inputs: fullPrompt,
                parameters: {
                    temperature: 0.7,
                    max_new_tokens: 160, // Hugging Face uses max_new_tokens
                    return_full_text: false, // Important: to get only the generated part
                    repetition_penalty: 1.1 // Optional: to reduce repetition
                },
                options: {
                    wait_for_model: true // If model is not loaded, wait for it
                }
            }, 
            {
                headers: {
                    'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            }
        );
        
        // Validate Hugging Face API response structure
        if (response?.data?.[0]?.generated_text) {
            let aiResponse = response.data[0].generated_text;

            // Some models might still include parts of the input or extraneous text.
            // This is a simple way to clean it up if `return_full_text: false` isn't perfect.
            // Or, if the model starts with a newline or specific pattern.
            aiResponse = aiResponse.trim();


            await memory.addMessage({ role: 'user', content: prompt });
            await memory.addMessage({ role: 'assistant', content: aiResponse });

            messageCache.set(cacheKey, aiResponse);
            setTimeout(() => {
                messageCache.delete(cacheKey);
            }, 60 * 1000);

            return aiResponse;
        } else {
            console.error('AI Error: Struktur respons tidak terduga dari Hugging Face:', response?.data || 'Tidak ada data respons');
            return `Maaf, ${USER_NAME}. Alya sedang mengalami masalah teknis dengan AI. ${Mood.SAD.emoji}`;
        }

    } catch (error) {
        console.error('Hugging Face API Call Error:', error.response?.data || error.message);
        if (error.response) {
            if (error.response.status === 429) { // Rate limit
                const limitResponses = [
                    `Alya sedang sibuk, ${USER_NAME}. Mohon coba lagi nanti.`,
                    `Alya sedang memproses banyak permintaan. Mohon bersabar.`,
                    `Maaf, ${USER_NAME}. Alya sedang kelelahan. Bisakah kita lanjutkan nanti?`,
                    `Alya butuh istirahat sebentar, ${USER_NAME}. Jangan terlalu banyak pertanyaan dulu ya.`,
                    `Alya sedang dalam mode hemat energi. Mohon tunggu sebentar.`
                ];
                return limitResponses[Math.floor(Math.random() * limitResponses.length)];
            } else if (error.response.status === 503) { // Model loading
                 return `Model AI sedang dimuat, ${USER_NAME}. Coba beberapa saat lagi ya. ${Mood.NORMAL.emoji}`;
            } else if (error.response.data && error.response.data.error) {
                // Specific error message from Hugging Face
                return `Maaf ${USER_NAME}, ada kesalahan dari AI: ${error.response.data.error}. ${Mood.SAD.emoji}`;
            }
        }
        return `Maaf, ${USER_NAME}. Alya sedang mengalami masalah dalam menghubungi AI. ${Mood.SAD.emoji}`;
    }
};


/**
 * Memeriksa apakah string yang diberikan hanya terdiri dari emoji.
 * Menggunakan Unicode property escapes untuk deteksi emoji yang komprehensif.
 * @param {string} str String input untuk diperiksa.
 * @returns {boolean} True jika string hanya berisi emoji, false jika tidak.
 */
function isOnlyEmojis(str) {
    const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
    return emojiRegex.test(str);
}

/**
 * Memeriksa apakah string yang diberikan hanya terdiri dari digit numerik.
 * @param {string} str String input untuk diperiksa.
 * @returns {boolean} True jika string hanya berisi angka, false jika tidak.
 */
function isOnlyNumbers(str) {
    const numberRegex = /^[0-9]+$/;
    return numberRegex.test(str);
}

/**
 * Membersihkan cache pesan dan memangkas riwayat percakapan.
 */
const cleanupCacheAndMemory = async () => {
    console.log("Menjalankan pembersihan cache dan memori...");
    messageCache.clear(); // Bersihkan cache respons AI
    console.log("Cache pesan dibersihkan.");

    await memory.save(); 
};

/**
 * Memperbarui kepribadian dan mood Alya berdasarkan waktu saat ini.
 * Menangani perubahan mood acak dan aktivasi/deaktivasi mode deeptalk.
 * @param {string|number} chatId ID obrolan untuk mengirim pengumuman perubahan mood/mode.
 */
const updateTimeBasedModes = (chatId) => {
    const now = new Date();
    const currentHour = getJakartaHour();
    const currentMood = getCurrentMood(); 

    if (currentHour >= DEEPTALK_START_HOUR && !isDeeptalkMode) {
        isDeeptalkMode = true;
        setMood(chatId, Mood.CALM); 
        sendMessage(chatId, `Selamat malam, Tuan ${USER_NAME}. Alya siap mendengarkan. Ada yang ingin Anda ceritakan? ${Mood.CALM.emoji}`);
        console.log("Memasuki Mode Deeptalk.");
    }
    else if (currentHour < DEEPTALK_START_HOUR && isDeeptalkMode) {
        isDeeptalkMode = false;
        setMood(chatId, getRandomMood()); 
        console.log("Keluar dari Mode Deeptalk.");
    }

    if (!isDeeptalkMode && !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)) {
        if (currentHour === 7) { 
            if (currentMood !== Mood.HAPPY) { 
                setMood(chatId, Mood.HAPPY);
                sendMessage(chatId, `Selamat pagi, Tuan! Alya senang sekali hari ini! ${Mood.HAPPY.emoji}`);
            }
        } else if (currentHour === 13) { 
            if (currentMood !== Mood.NORMAL) { 
                setMood(chatId, Mood.NORMAL);
                sendMessage(chatId, `Selamat siang, Tuan! Alya siap membantu. ${Mood.NORMAL.emoji}`);
            }
        } else if (currentHour === 17) { 
            const randomMood = getRandomMood();
            if (currentMood !== randomMood) {
                setMood(chatId, randomMood);
                sendMessage(chatId, `Selamat sore, Tuan! Alya sedang merasa ${randomMood.name}. ${randomMood.emoji}`);
            }
        }
    }
};


module.exports = {
    USER_NAME,
    generateAIResponse,
    initAlyabot: (bot) => {
        setBotInstance(bot); 
        const configuredChatId = config.TARGET_CHAT_ID || config.chatId; 

        // --- Check for Hugging Face API Key ---
        if (!HUGGING_FACE_API_KEY || !HUGGING_FACE_MODEL_ID) {
            console.warn("⚠️ Hugging Face API Key atau Model ID tidak ditemukan di config.js. Fungsi AI tidak akan bekerja.");
        } else {
            console.log(`🚀 Menggunakan Hugging Face Model ID: ${HUGGING_FACE_MODEL_ID}`);
        }
        // --- End Check ---

        console.log(`🌸 AlyaBot v7.0 (Hugging Face Edition) aktif untuk Tuan ${USER_NAME}!`);
        if (configuredChatId) {
            console.log(`📬 Pesan terjadwal akan dikirim ke ID obrolan: ${configuredChatId}`);
        } else {
            console.warn("⚠️ TARGET_CHAT_ID tidak ditemukan di config.js. Pesan terjadwal (Waktu Sholat, Cuaca, Lagu Sedih) TIDAK akan dikirim.");
            console.warn("Harap tambahkan TARGET_CHAT_ID: 'your_chat_id' ke file config.js Anda untuk mengaktifkan pesan terjadwal.");
        }


        bot.on('message', async (msg) => {
            const { chat, text, from } = msg;
            const currentMessageChatId = chat.id;
            const currentMood = getCurrentMood(); 

            await memory.saveLastChat(msg);

            if (!text || text.trim() === "") {
                return; 
            }
            if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text))) {
                return;
            }

            for (const handler of commandHandlers) {
                if (handler.pattern.test(text)) {
                    const result = await handler.response(currentMessageChatId, msg);
                    await AlyaTyping(currentMessageChatId); 
                    if (result.text) {
                        sendMessage(currentMessageChatId, result.text);
                    }
                    if (result.mood) {
                        setMood(currentMessageChatId, result.mood); 
                    }
                    return; 
                }
            }

            await AlyaTyping(currentMessageChatId); 
            const aiResponse = await generateAIResponse(text, currentMessageChatId); 
            sendMessage(currentMessageChatId, `${aiResponse}`); 
        });

        if (configuredChatId) {
            Object.entries(PrayerTimes).forEach(([name, { hour, minute, emoji }]) => {
                const cronTime = `${minute} ${hour} * * *`; 
                schedule.scheduleJob({ rule: cronTime, tz: 'Asia/Jakarta' }, () => {
                    console.log(`Mengirim pengingat waktu sholat untuk ${name} pada ${hour}:${minute} (Asia/Jakarta) ke ${configuredChatId}`);
                    sendMessage(configuredChatId, `${emoji} ${USER_NAME}, waktunya shalat ${name}, nih~ Jangan sampai terlewat! ${emoji}`);
                });
            });

            schedule.scheduleJob({ rule: '0 */5 * * *', tz: 'Asia/Jakarta' }, async () => {
                console.log(`Memperbarui cuaca (Asia/Jakarta) untuk ID obrolan: ${configuredChatId}`);
                const weather = await getWeatherData(); 
                if (weather) {
                    sendMessage(configuredChatId, `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`);
                } else {
                    sendMessage(configuredChatId, `Hmm... Alya sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`);
                }
            });

            schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Asia/Jakarta' }, async () => { 
                console.log(`Mengirim notifikasi lagu sedih pada 22:00 (Asia/Jakarta) ke ${configuredChatId}`);
                // sendSadSongNotification(configuredChatId); // Placeholder
            });

            setInterval(cleanupCacheAndMemory, CACHE_CLEANUP_INTERVAL_MS);
            console.log(`Pembersihan cache dan memori terjadwal setiap ${CACHE_CLEANUP_INTERVAL_MS / 1000 / 60} menit.`);

            schedule.scheduleJob({ rule: '0 * * * *', tz: 'Asia/Jakarta' }, () => {
                updateTimeBasedModes(configuredChatId);
            });
            if (config.calendarificApiKey && config.TARGET_CHAT_ID) {
                schedule.scheduleJob({ rule: '0 7 * * *', tz: 'Asia/Jakarta' }, async () => {
                    console.log('[Core] Menjalankan pemeriksaan hari libur harian...');
                    await holidaysModule.checkAndNotifyDailyHolidays(
                        config.calendarificApiKey,
                        'ID', 
                        (message) => {
                            sendMessage(config.TARGET_CHAT_ID, message);
                        }
                    );
                });
                console.log(`[Core] Pemeriksaan hari libur harian dijadwalkan setiap pukul 07:00 untuk chat ID: ${config.TARGET_CHAT_ID}`);
            } else {
                if (!config.calendarificApiKey) {
                    console.warn('[Core] Calendarific API Key tidak ditemukan di config.js. Pemeriksaan hari libur dinonaktifkan.');
                }
                if (!config.TARGET_CHAT_ID) {
                    console.warn('[Core] TARGET_CHAT_ID tidak ditemukan di config.js. Notifikasi hari libur tidak dapat dikirim.');
                }
            };
            updateTimeBasedModes(configuredChatId);
        }
    }
};