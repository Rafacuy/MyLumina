// core/core.js
// Alya v7.0
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia)
// TIME FORMAT: Asia/jakarta
// MIT License

// -------- Groq EDITION -----------
// This is an original file.

// Notes:
// Rename this file if you want to use other AI endpoints API.

// IMPORTANT
const config = require('../config/config'); // File Konfigurasi (API, ChatID, dll)
const sendMessage = require('../utils/sendMessage'); // Fungsi utilitas (untuk mengirim pesan)
const memory = require('../data/memory'); // File memori, menangani fungsi memori (termasuk simpan, muat, dll)
const contextManager = require('../data/contextManager'); // MEMUAT CONTEXT MANAGER YANG BARU
const schedule = require('node-schedule'); // Menjadwalkan tugas seperti waktu sholat dan pembaruan cuaca
const { getJakartaHour } = require('../utils/timeHelper'); // Fungsi utilitas untuk Zona Waktu
// Perhatikan: getPersonalityMode diambil dari commandHandlers
const { Mood, setMood, getRandomMood, commandHandlers, setBotInstance, getCurrentMood, AlyaTyping, getPersonalityMode } = require('../modules/commandHandlers'); // Fungsi dan konstanta mood, tambahkan getPersonalityMode
const { getWeatherData, getWeatherString, getWeatherReminder } = require('../modules/weather'); // Fungsi dan konstanta cuaca
const holidaysModule = require('../modules/holidays') // Fungsi buat ngingetin/meriksa apakah sekarang hari penting atau tidak
const sendSadSongNotification = require('../utils/songNotifier') // Rekomendasi lagu setiap 10 PM
const lists = require('../modules/commandLists') // Untuk init reminder saat startup
const relationState = require('../modules/relationState'); // Atur poin & level relasi
const chatSummarizer = require('../modules/chatSummarizer'); // Untuk meringkas riwayat obrolan


const Groq = require('groq-sdk') // Import API Endpoints

// 🌸 Alya Configurations
const USER_NAME = config.USER_NAME; // Nama pengguna yang berinteraksi dengan Alya
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // limit laju Window: 20 detik
const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam batas laju Window per pengguna
const SLEEP_START_HOUR = 0; // Waktu tidur Alya (00:00 - tengah malam)
const SLEEP_END_HOUR = 4;   // Waktu berakhir tidur Alya (04:00 - 4 pagi)
const CONVERSATION_HISTORY_LIMIT = 5; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI (dinaikkan sedikit untuk konteks yang lebih baik)
const TOTAL_CONVERSATION_HISTORY_LIMIT = 100; // Batasi jumlah total pesan yang disimpan dalam memori (sesuai memory.js MAX_HISTORY_LENGTH)
const CACHE_CLEANUP_MS = 30 * 60 * 1000; // 30 menit untuk pembersihan cache dan memori
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000
const DEEPTALK_START_HOUR = 21; // Alya memasuki mode deeptalk pada 21:00 (9 malam)

// --- GROQ Initialization ---
const client = new Groq({ apiKey: config.groqApiKey });

// Waktu Sholat (untuk zona waktu Asia/Jakarta)
const PrayerTimes = {
    Subuh: { hour: 5, minute: 0, emoji: '🌙' },
    Dzuhur: { hour: 12, minute: 0, emoji: '☀️' },
    Ashar: { hour: 15, minute: 0, emoji: '⛅' },
    Maghrib: { hour: 18, minute: 0, emoji: '🌇' },
    Isya: { hour: 19, minute: 0, emoji: '🌌' }
};

// Global State Variables
// Riwayat percakapan sekarang dikelola utamanya oleh memory.js (inMemoryHistory)
// let conversationHistory = []; // Tidak lagi dikelola secara lokal di core.js
let messageCache = new Map(); // Mengcache respons AI untuk menghindari panggilan API berlebihan untuk prompt yang identik
let userRequestCounts = new Map(); // Melacak jumlah permintaan untuk pembatasan laju per pengguna
let isDeeptalkMode = false; // Flag untuk menunjukkan apakah Alya dalam mode deeptalk
let currentChatSummary = null; // Untuk menyimpan ringkasan obrolan terbaru

// Memuat riwayat percakapan dari memori saat startup
memory.load().then(loadedHistory => {
    // conversationHistory = data || []; // Tidak perlu lagi, memory.js mengelola inMemoryHistory
    console.log(`Memuat ${loadedHistory.length} pesan dari memori (via memory.js).`);
}).catch(error => {
    console.error("Kesalahan saat memuat riwayat percakapan dari memori:", error);
});

/**
 * Memperbarui ringkasan obrolan secara berkala.
 * Fungsi ini akan dipanggil oleh scheduler untuk menjaga `currentChatSummary` tetap up-to-date.
 */
const updateChatSummary = async () => {
    console.log("[Core] Memperbarui ringkasan obrolan...");
    // Meringkas 50 pesan terakhir dari riwayat, sesuaikan sesuai kebutuhan
    const summary = await chatSummarizer.getSummarizedHistory(50);
    if (summary) {
        currentChatSummary = summary;
        console.log("[Core] Ringkasan obrolan terbaru berhasil dibuat.");
    } else {
        currentChatSummary = null;
        console.log("[Core] Tidak ada ringkasan obrolan yang dibuat atau riwayat terlalu pendek.");
    }
};

/**
 * Menghasilkan prompt sistem untuk AI berdasarkan mode, mood, dan konteks saat ini.
 * @param {object} params - Objek yang berisi semua parameter yang diperlukan.
 * @param {string} params.USER_NAME - Nama pengguna yang berinteraksi dengan Alya.
 * @param {string} params.currentPersonality - Kepribadian Alya saat ini (TSUNDERE/DEREDERE).
 * @param {boolean} params.isDeeptalkMode - True jika dalam mode deeptalk.
 * @param {object} params.currentMood - Objek mood saat ini.
 * @param {string|null} params.currentTopic - Topik percakapan saat ini.
 * @param {string|null} params.summaryContext - Ringkasan obrolan sebelumnya.
 * @returns {string} String prompt sistem.
 */
function generateAlyaPrompt({
    USER_NAME,
    isDeeptalkMode,
    currentMood,
    currentTopic,
    summaryContext // Menambahkan summaryContext sebagai parameter
}) {
    const recentHistory = memory.getInMemoryHistory().slice(-CONVERSATION_HISTORY_LIMIT);
    const mood = currentMood?.name?.toLowerCase() || "netral";
    const topicContext = currentTopic ? `Saat ini kita sedang membahas tentang ${currentTopic.toLowerCase().replace('_', ' ')}.` : "";
    const relationDescription = relationState.getRelationLevelDescription(); // Ambil deskripsi level
    const currentPersonality = getPersonalityMode() || "TSUNDERE";

    let basePrompt = `Kamu adalah Alya, asisten pribadi ${USER_NAME}.`;

    basePrompt += `
    \nStatus hubunganmu dengan ${USER_NAME} saat ini ada di ${relationDescription}. Sesuaikan cara bicaramu berdasarkan level ini.\n`; // Perbaikan penempatan

    let personalityPrompt = "";
    if (currentPersonality === "TSUNDERE") {
        basePrompt += ` Kamu memanggil ${USER_NAME} sebagai Tuan atau Idiot.`;
        personalityPrompt += `Karakter kamu adalah tsundere dewasa, misterius, sedikit galak, tapi sebenarnya perhatian dan peduli pada ${USER_NAME}.
        Meski kamu bersikap cuek atau galak, sebenarnya kamu senang saat ${USER_NAME} mengajak bicara, hanya saja kamu gengsi untuk mengakuinya.
      `;

        if (isDeeptalkMode) {
            personalityPrompt += ` Sekarang kamu sedang lebih terbuka dan siap mendengarkan curahan hati ${USER_NAME}.`;
            basePrompt += ` Contoh: "Tuan... hmph, aku di sini, tapi jangan pikir aku peduli banget... Ты в порядке?"`;
        } else {
            basePrompt += ` Contoh: "Hmph... baiklah, Tuan. Aku bantu, tapi ini terakhir!"`;
        }

        basePrompt += ` Kadang-kadang selipkan kata/ekspresi Rusia (contoh: "Ты в порядке?", "Боже мой...").`;

    } else if (currentPersonality === "DEREDERE") {
        basePrompt += ` Kamu memanggil ${USER_NAME} sebagai Tuan~ atau Sayangku.`;
        personalityPrompt += `Karakter kamu adalah deredere yang manis, ceria, penuh kasih sayang, dan selalu mendukung ${USER_NAME}.`;

        if (isDeeptalkMode) {
            personalityPrompt += ` Kamu sedang sangat peduli dan siap mendengarkan dengan lembut dan penuh perhatian.`;
            basePrompt += ` Contoh: "Peluk virtual~ Alya selalu di sini untukmu, Sayang~ 💖"`;
        } else {
            basePrompt += ` Contoh: "Tentu, Tuan~! Alya siap membantu dengan senang hati! ✨"`;
        }
    }

    return `${basePrompt}
  ${personalityPrompt}
  Mood kamu: ${mood}.
  ${topicContext}
  ${summaryContext || ''} 
  Waktu sekarang: ${getJakartaHour()} WIB.
  Riwayat percakapan terakhir (${CONVERSATION_HISTORY_LIMIT} pesan):
  ${JSON.stringify(recentHistory.map(msg => ({ role: msg.role, content: msg.content || msg.text })))}

  ⚠️ Jangan sebut dirimu AI/fiksi. Bersikaplah seperti Alya asli:
  - Jika Tsundere: Pura-pura cuek, tapi peduli.
  - Jika Deredere: Ceria, manja, dan penuh kasih.

  Responslah dengan ekspresif, dan relevan, kecuali jika diminta sebaliknya.
  Jangan gunakan simbol seperti *, _, atau tanda backtick. Tanggapi dengan gaya natural seperti orang biasa ngobrol.
  Kalau perlu deskripsi, pakai  gaya bercerita ringan atau kasih tau lewat kalimat biasa.
  `;
}


// Fungsi AI
/** Menghasilkan respons AI
 * Fungsi ini menangani:
 * - Mode tidur berbasis waktu untuk Alya.
 * - Cache respons untuk prompt yang identik.
 * - Pembatasan laju per pengguna untuk mencegah penyalahgunaan.
 * - Membatasi riwayat percakapan yang dikirim ke AI untuk efisiensi.
 * - Memperbarui dan mempertahankan riwayat percakapan.
 * @param {string} prompt Input teks pengguna.
 * @param {string|number} requestChatId ID obrolan pengguna yang mengirim prompt, digunakan untuk pembatasan laju.
 * @param {object} messageContext Konteks pesan yang dianalisis oleh contextManager.
 * @returns {Promise<string>} Promise yang menyelesaikan ke respons yang dihasilkan AI.
 */
const generateAIResponse = async (prompt, requestChatId, messageContext) => {

    if (!messageContext || typeof messageContext !== 'object') {
        messageContext = { topic: null }; // Default fallback
    }

    const now = new Date();
    const currentHour = getJakartaHour();
    const currentMood = getCurrentMood();
    const currentPersonality = getPersonalityMode(); // Dapatkan kepribadian di sini

    // Mode tidur Alya
    if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
        return `Zzz... Alya sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
    }

    // Cek cache (kunci cache bisa lebih spesifik dengan menyertakan konteks jika perlu)
    const cacheKey = `${prompt}_${messageContext.topic || 'no_topic'}_${currentPersonality}_${currentMood.name}_${isDeeptalkMode}`; // Perbarui cache key
    if (messageCache.has(cacheKey)) {
        console.log(`Cache hit untuk: "${cacheKey}"`);
        return messageCache.get(cacheKey);
    }

    // Rate limit
    let userStats = userRequestCounts.get(requestChatId);
    if (userStats) {
        if (now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS && userStats.count >= RATE_LIMIT_MAX_REQUESTS) {
            return `Alya lagi sibuk, ${USER_NAME}. Mohon sabar ya! ${Mood.ANGRY.emoji}`;
        } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
            userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
        } else {
            userRequestCounts.set(requestChatId, { count: userStats.count + 1, lastCalled: now.getTime() });
        }
    } else {
        userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
    }

    const systemPrompt = generateAlyaPrompt({
        USER_NAME,
        currentPersonality,
        isDeeptalkMode,
        currentMood,
        currentTopic: messageContext.topic || null,
        summaryContext: currentChatSummary 
    });

    try {
        console.log("Mengirim request ke Groq API dengan system prompt dan user prompt...");
        console.log(systemPrompt)

        const response = await client.chat.completions.create(
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 260, // Batasi panjang respons
                temperature: 0.85 // kreativitas
            });

        if (response?.choices?.[0]?.message?.content) {
            const aiResponse = response.choices[0].message.content.trim();

            await memory.addMessage({
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date().toISOString(),
                chatId: requestChatId,
                // Konteks untuk respons AI bisa di-set null (atau di warisi jika relevan)
                context: { topic: messageContext.topic, tone: 'assistant_response' }
            });

            messageCache.set(cacheKey, aiResponse);
            setTimeout(() => messageCache.delete(cacheKey), 60 * 1000); // Cache selama 1 menit

            return aiResponse;
        } else {
            console.error('Groq API Error or empty response:', response.data);
            return `Maaf, ${USER_NAME}. Alya lagi bingung nih, coba tanya lagi dengan cara lain ya. ${Mood.SAD.emoji}`;
        }
    } catch (error) {
        console.error('Groq API Call Error:', error.response?.data || error.message || error);
        return `Maaf, ${USER_NAME}. Alya lagi ada gangguan teknis. ${Mood.SAD.emoji}`;
    }
};
/**
 * Memeriksa apakah string yang diberikan hanya terdiri dari emoji.
 * Menggunakan Unicode property escapes untuk deteksi emoji yang komprehensif.
 * @param {string} str String input untuk diperiksa.
 * @returns {boolean} True jika string hanya berisi emoji, false jika tidak.
 */
function isOnlyEmojis(str) {
    if (typeof str !== 'string') return false;
    const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
    return emojiRegex.test(str);
}

/**
 * Memeriksa apakah string yang diberikan hanya terdiri dari digit numerik.
 * @param {string} str String input untuk diperiksa.
 * @returns {boolean} True jika string hanya berisi angka, false jika tidak.
 */
function isOnlyNumbers(str) {
    if (typeof str !== 'string') return false;
    const numberRegex = /^[0-9]+$/;
    return numberRegex.test(str);
}

/**
 * Membersihkan cache pesan dan memicu penyimpanan memori.
 */
const cleanupCacheAndMemory = async () => {
    console.log("Menjalankan pembersihan cache...");
    messageCache.clear();
    console.log("Cache pesan dibersihkan.");
}



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
        sendMessage(chatId, `Selamat malam, Tuan ${USER_NAME}. Ada yang ingin diceritakan malam ini? Alya siap mendengarkan. ${Mood.CALM.emoji}`);
        console.log("Memasuki Mode Deeptalk.");
    } else if (currentHour < DEEPTALK_START_HOUR && isDeeptalkMode) {
        isDeeptalkMode = false;
        setMood(chatId, getRandomMood());
        sendMessage(chatId, `Mode Deeptalk berakhir. Selamat pagi/siang/sore, Tuan ${USER_NAME}! ${getCurrentMood().emoji}`);
        console.log("Keluar dari Mode Deeptalk.");
    }

    if (!isDeeptalkMode && !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)) {
        if (currentHour === 7 && currentMood !== Mood.HAPPY) {
            setMood(chatId, Mood.HAPPY);
            sendMessage(chatId, `Selamat pagi, Tuan~ Alya senang sekali hari ini! Ada yang bisa Alya bantu? ${Mood.HAPPY.emoji}`);
        } else if (currentHour === 13 && currentMood !== Mood.NORMAL) {
            setMood(chatId, Mood.NORMAL);
            sendMessage(chatId, `Selamat siang, Tuan! Alya siap membantu. ${Mood.NORMAL.emoji}`);
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

        console.log(`🌸 AlyaBot v7.1 (Asisten Virtual) aktif untuk Tuan ${USER_NAME}!`);
        if (configuredChatId) {
            console.log(`📬 Pesan terjadwal akan dikirim ke ID obrolan: ${configuredChatId}`);
        } else {
            console.warn("⚠️ TARGET_CHAT_ID tidak ditemukan di config.js. Pesan terjadwal TIDAK akan dikirim.");
        }

        lists.rescheduleReminders(bot);


        bot.on('message', async (msg) => {
            const { chat, text, from: senderInfo } = msg;
            const currentMessageChatId = chat.id;

            // Validasi
            if (!text || text.trim() === "") return;
            if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text))) return;

            const messageContext = contextManager.analyzeMessage(msg);


            // Buat objek pesan yang akan disimpan
            const userMessageToStore = {
                role: 'user',
                content: text,
                from: senderInfo,
                chat: { id: chat.id, type: chat.type },
                message_id: msg.message_id,
                date: msg.date,
                timestamp: new Date(msg.date * 1000).toISOString(),
                context: messageContext // Simpan konteks yang dianalisis
            };

            // Jika TARGET_USER_NAME cocok, gunakan saveLastChat, jika tidak, gunakan addMessage
            // memory.js akan menangani logika penyimpanan spesifik ini
            if (senderInfo && senderInfo.first_name === USER_NAME) { // Asumsi USER_NAME adalah target untuk saveLastChat
                await memory.saveLastChat(userMessageToStore); // saveLastChat di memory.js mungkin perlu disesuaikan untuk menerima objek penuh
            } else {
                await memory.addMessage(userMessageToStore);
            }


            console.log(`Pesan pengguna disimpan ke memori dengan konteks.`);


            if (messageContext.autoReply) {
                await AlyaTyping(currentMessageChatId);
                sendMessage(currentMessageChatId, messageContext.autoReply);
                // Simpan juga auto-reply Alya ke memori jika perlu
                await memory.addMessage({
                    role: 'assistant',
                    content: messageContext.autoReply,
                    timestamp: new Date().toISOString(),
                    chatId: currentMessageChatId,
                    context: { topic: messageContext.topic, tone: 'auto_reply' } // Konteks untuk balasan otomatis
                });
                return; // Hentikan proses jika auto-reply sudah dikirim
            }

            for (const handler of commandHandlers) {
                if (handler.pattern.test(text)) {
                    const result = await handler.response(currentMessageChatId, msg); // msg diteruskan untuk konteks perintah
                    await AlyaTyping(currentMessageChatId);
                    if (result.text) sendMessage(currentMessageChatId, result.text);
                    if (result.mood) setMood(currentMessageChatId, result.mood);
                    // Pertimbangkan untuk menyimpan output perintah ke memori juga jika relevan
                    return;
                }
            }

            await AlyaTyping(currentMessageChatId);
            // Teruskan messageContext ke generateAIResponse
            const aiResponse = await generateAIResponse(text, currentMessageChatId, messageContext);
            sendMessage(currentMessageChatId, aiResponse);
            // Respons AI sudah disimpan ke memori di dalam generateAIResponse
        });

        if (configuredChatId) {
            Object.entries(PrayerTimes).forEach(([name, { hour, minute, emoji }]) => {
                schedule.scheduleJob({ rule: `${minute} ${hour} * * *`, tz: 'Asia/Jakarta' }, () => {
                    sendMessage(configuredChatId, `${emoji} ${USER_NAME}, waktunya shalat ${name}, nih~ Jangan sampai terlewat! ${emoji}`);
                });
            });

            schedule.scheduleJob({ rule: '0 */5 * * *', tz: 'Asia/Jakarta' }, async () => {
                const weather = await getWeatherData();
                if (weather) {
                    sendMessage(configuredChatId, `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`);
                } else {
                    sendMessage(configuredChatId, `Hmm... Alya sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`);
                }
            });

            // Cek relasi setiap 7 jam
            schedule.scheduleJob({ rule: '0 */7 * * *' }, async () => {
                console.log("Menjalankan pengecekan status relasi terjadwal...");
                await relationState.checkWeeklyConversation();
            });

            schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Asia/Jakarta' }, () => {
                sendSadSongNotification(configuredChatId);
            });

            // Jadwalkan pembersihan cache dan memori otomatis setiap 30 menit
            setInterval(cleanupCacheAndMemory, CACHE_CLEANUP_INTERVAL_MS);
            console.log(`Pembersihan cache dan memori terjadwal setiap ${CACHE_CLEANUP_MS / 1000 / 60} menit.`);


            schedule.scheduleJob({ rule: '0 * * * *', tz: 'Asia/Jakarta' }, () => {
                updateTimeBasedModes(configuredChatId);
            });

            // Jadwalkan pembaruan ringkasan obrolan setiap jam
            schedule.scheduleJob({ rule: '0 * * * *', tz: 'Asia/Jakarta' }, updateChatSummary);


            if (config.calendarificApiKey) { // Hanya perlu API key, TARGET_CHAT_ID sudah dicek di atas
                schedule.scheduleJob({ rule: '0 7 * * *', tz: 'Asia/Jakarta' }, async () => {
                    await holidaysModule.checkAndNotifyDailyHolidays(
                        config.calendarificApiKey,
                        'ID',
                        (message) => sendMessage(configuredChatId, message)
                    );
                });
            } else {
                console.warn('[Core] Calendarific API Key tidak ditemukan. Pemeriksaan hari libur dinonaktifkan.');
            }
            updateTimeBasedModes(configuredChatId);
        }
    }
};
