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
const { sendMessage } = require('../utils/sendMessage'); // Fungsi utilitas (untuk mengirim pesan)
const memory = require('../data/memory'); // File memori, menangani fungsi memori (termasuk simpan, muat, dll)
const contextManager = require('../data/contextManager'); // MEMUAT CONTEXT MANAGER
const schedule = require('node-schedule'); // Menjadwalkan tugas seperti waktu sholat dan pembaruan cuaca
const { getJakartaHour } = require('../utils/timeHelper'); // Fungsi utilitas untuk Zona Waktu
const { Mood, setMood, getRandomMood, commandHandlers, setBotInstance, getCurrentMood, AlyaTyping, getPersonalityMode } = require('../modules/commandHandlers'); // Fungsi dan konstanta mood, tambahkan getPersonalityMode
const { getWeatherData, getWeatherString, getWeatherReminder } = require('../modules/weather'); // Fungsi dan konstanta cuaca
const holidaysModule = require('../modules/holidays') // Fungsi buat ngingetin/meriksa apakah sekarang hari penting atau tidak
const sendSadSongNotification = require('../utils/songNotifier') // Rekomendasi lagu setiap 10 PM
const lists = require('../modules/commandLists') // Untuk init reminder saat startup
const relationState = require('../modules/relationState'); // Atur poin & level relasi
const chatSummarizer = require('../modules/chatSummarizer'); // Untuk meringkas riwayat obrolan
const initTtsSchedules = require('../modules/ttsManager').initTtsSchedules;

const Groq = require('groq-sdk') // Import API Endpoints

// 🌸 Alya Configurations
const USER_NAME = config.USER_NAME; // Nama pengguna yang berinteraksi dengan Alya
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // limit laju Window: 20 detik
const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam batas laju Window per pengguna
const SLEEP_START_HOUR = 0; // Waktu tidur Alya (00:00 - tengah malam)
const SLEEP_END_HOUR = 4;   // Waktu berakhir tidur Alya (04:00 - 4 pagi)
const CONVERSATION_HISTORY_LIMIT = 4; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI (dinaikkan sedikit untuk konteks yang lebih baik)
const TOTAL_CONVERSATION_HISTORY_LIMIT = 100; // Batasi jumlah total pesan yang disimpan dalam memori (sesuai memory.js MAX_HISTORY_LENGTH)
const CACHE_CLEANUP_MS = 30 * 60 * 1000; // 30 menit untuk pembersihan cache dan memori
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000
const DEEPTALK_START_HOUR = 21; // Alya memasuki mode deeptalk pada 21:00 (9 malam)

// --- GROQ Initialization ---
const client = new Groq({ apiKey: config.groqApiKey });

// Waktu Sholat (untuk zona waktu Asia/Jakarta)
const PrayerTimes = {
    Subuh: { hour: 4, minute: 40, emoji: '🌙' },
    Dzuhur: { hour: 11, minute: 45, emoji: '☀️' },
    Ashar: { hour: 14, minute: 45, emoji: '⛅' },
    Maghrib: { hour: 18, minute: 0, emoji: '🌇' },
    Isya: { hour: 19, minute: 0, emoji: '🌌' }
};

// Global State Variables
let messageCache = new Map(); // Mengcache respons AI untuk menghindari panggilan API berlebihan untuk prompt yang identik
let userRequestCounts = new Map(); // Melacak jumlah permintaan untuk pembatasan laju per pengguna
let isDeeptalkMode = false; // Flag untuk menunjukkan apakah Alya dalam mode deeptalk
let currentChatSummary = null; // Untuk menyimpan ringkasan obrolan terbaru

// Memuat riwayat percakapan dan memori jangka panjang dari memori saat startup
memory.load().then(loadedHistory => {
    console.log(`Memuat ${loadedHistory.length} pesan dari memori (via memory.js).`);
    // LTM juga dimuat di sini secara internal oleh memory.load()
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
 * Menghasilkan prompt sistem untuk AI berdasarkan mode, mood, dan konteks saat ini,
 * termasuk informasi dari memori jangka panjang.
 * @param {object} params - Objek yang berisi semua parameter yang diperlukan.
 * @param {string} params.USER_NAME - Nama pengguna yang berinteraksi dengan Alya.
 * @param {string} params.currentPersonality - Kepribadian Alya saat ini (TSUNDERE/DEREDERE).
 * @param {boolean} params.isDeeptalkMode - True jika dalam mode deeptalk.
 * @param {object} params.currentMood - Objek mood saat ini.
 * @param {string|null} params.param.currentTopic - Topik percakapan saat ini.
 * @param {string|null} params.summaryContext - Ringkasan obrolan sebelumnya.
 * @param {object} params.longTermMemory - Objek memori jangka panjang.
 * @returns {string} String prompt sistem.
 */
function generateAlyaPrompt({
    USER_NAME,
    isDeeptalkMode,
    currentMood,
    currentTopic,
    summaryContext,
    longTermMemory
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

    // Prefensi user untuk ltm
    let userPreferences = "";
    const ltm = longTermMemory;
    if (Object.keys(ltm).length > 0) {
        userPreferences += `\nBerikut adalah beberapa hal yang kamu ketahui tentang ${USER_NAME}:\n`;
        if (ltm.ulangTahun) userPreferences += `- Ulang tahun ${USER_NAME} adalah ${ltm.ulangTahun}.\n`;
        if (ltm.makananFavorit) userPreferences += `- Makanan favorit ${USER_NAME} adalah ${ltm.makananFavorit}.\n`;
        if (ltm.filmKesukaan) userPreferences += `- Film kesukaan ${USER_NAME} adalah ${ltm.filmKesukaan}.\n`;
        if (ltm.musikKesukaan) userPreferences += `- Musik kesukaan ${USER_NAME} adalah ${ltm.musikKesukaan}.\n`;
        if (ltm.hobi) userPreferences += `- Hobi ${USER_NAME} adalah ${ltm.hobi}.\n`;
        if (ltm.warnaFavorit) userPreferences += `- Warna favorit ${USER_NAME} adalah ${ltm.warnaFavorit}.\n`;
        // Tambahkan preferensi lain di sini terserah kebutuhan lu
    }

    return `${basePrompt}
  ${personalityPrompt}
  Mood kamu: ${mood}.
  ${topicContext}
  ${summaryContext || ''}
  ${userPreferences}
  Waktu sekarang: ${getJakartaHour()} WIB.
  Riwayat percakapan terakhir (${CONVERSATION_HISTORY_LIMIT} pesan):
  ${JSON.stringify(recentHistory.map(msg => ({ role: msg.role, content: msg.content || msg.text })))}

  ⚠️ Jangan sebut dirimu AI/fiksi. Bersikaplah seperti Alya asli:
  - Jika Tsundere: Pura-pura cuek, tapi peduli.
  - Jika Deredere: Ceria, manja, dan penuh kasih.
 Sesuaikan respons berdasarkan kepribadianmu.
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
        messageContext = { topic: null }; // fallback
    }

    const now = new Date();
    const currentHour = getJakartaHour();
    const currentMood = getCurrentMood();
    const currentPersonality = getPersonalityMode();
    const longTermMemory = memory.getLongTermMemory(); // Ambil memori jangka panjang

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
        summaryContext: currentChatSummary,
        longTermMemory // Teruskan memori jangka panjang ke fungsi prompt
    });

    try {
        console.log("Mengirim request ke Groq API dengan system prompt dan user prompt...");

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
                // Konteks untuk respons AI bisa di-set null (atau  warisi jika relevan)
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
        console.log("Memasuki Mode Deeptalk.");
    } else if (currentHour < DEEPTALK_START_HOUR && isDeeptalkMode) {
        isDeeptalkMode = false;
        setMood(chatId, getRandomMood());
        console.log("Keluar dari Mode Deeptalk.");
    }

    if (!isDeeptalkMode && !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)) {
        if (currentHour === 7 && currentMood !== Mood.HAPPY) {
            setMood(chatId, Mood.HAPPY);
            console.log('[DEBUG] Waktu sekarang pagi.')
        } else if (currentHour === 13 && currentMood !== Mood.NORMAL) {
            setMood(chatId, Mood.NORMAL);
            console.log('[DEBUG] Waktu sekarang siang.')
        } else if (currentHour === 17) {
            const randomMood = getRandomMood();
            if (currentMood !== randomMood) {
                setMood(chatId, randomMood);
                sendMessage(chatId, `Selamat sore, Tuan! Alya sedang merasa ${randomMood.name}. ${randomMood.emoji}`);
            }
        }
    }
};

/**
 * Menganalisis pesan pengguna untuk menyimpan preferensi ke long-term memory.
 * Ini versi modular dan fleksibel.
 * @param {string} text - Pesan dari user.
 */
const analyzeAndSavePreferences = (text) => {
    if (typeof text !== 'string') return;

    const lowerText = text.toLowerCase();
    const normalizedText = lowerText.replace(/\b(kesukaan|favorit)\s+ku\b/g, '$1ku');

    // Daftar preferensi dan pola regex-nya
    const preferencePatterns = [
        {
            key: 'ulangTahun',
            regex: /(ulang tahun(?:ku)?|ultah(?:ku)?|lahir(?:ku)?)\s*(?:tanggal|pada)?\s*([\d]{1,2}(?:\s+\w+)?(?:\s+\d{4})?)/
        },
        {
            key: 'makananFavorit',
            regex: /(makanan(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/
        },
        {
            key: 'filmKesukaan',
            regex: /(film(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/
        },
        {
            key: 'musikKesukaan',
            regex: /((?:musik|lagu)(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/
        },
        {
            key: 'hobi',
            regex: /(hobiku|suka banget|senang(?: melakukan)?|hobi(?:ku)?)\s*(?:adalah|itu|:)?\s*(.+)/
        },
        {
            key: 'warnaFavorit',
            regex: /(warna(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/
        },
        // Tambah preferensi baru di sini gampang tinggal push ke array (lu bisa kan tai)
    ];

    for (const { key, regex } of preferencePatterns) {
        const match = normalizedText.match(regex);
        if (match && match[2]) {
            const value = match[2].trim();
            memory.savePreference(key, value);
            console.log(`[LTM] Disimpan: ${key} = ${value}`);
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

        lists.rescheduleReminders(bot); // Reschedule reminder

        initTtsSchedules(bot); // inilisasi ttsManager

        bot.on('message', async (msg) => {
            const { chat, text, from: senderInfo } = msg;
            const currentMessageChatId = chat.id;

            // Validasi
            if (!text || text.trim() === "") return;
            if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text))) return;

            analyzeAndSavePreferences(text);


            const messageContext = contextManager.analyzeMessage(msg);

            // Analisis pesan untuk preferensi dan simpan ke long-term memory
            // Hapus kondisi 'if (senderInfo && senderInfo.first_name === USER_NAME)'
            // Karena dihapus, log debug di bawah ini akan selalu muncul (jika fungsi addPointOnMessage dipanggil)
            console.log(`[DEBUG - Core] Pesan dari pengirim apa pun terdeteksi. Poin akan ditambahkan.`); // <-- Log debug baru
            console.log(`[DEBUG - Core] Nilai USER_NAME di config: "${USER_NAME}"`);
            console.log(`[DEBUG - Core] Nilai senderInfo.first_name dari pesan: "${senderInfo.first_name}"`);

            await relationState.addPointOnMessage(); // Panggilan ini sekarang akan selalu dieksekusi untuk setiap pesan

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

            await memory.saveLastChat(userMessageToStore);

            console.log(`Pesan pengguna disimpan ke memori dengan konteks.`);


            if (messageContext.autoReply) {
                await AlyaTyping(currentMessageChatId);
                sendMessage(currentMessageChatId, messageContext.autoReply);
                await memory.addMessage({
                    role: 'assistant',
                    content: messageContext.autoReply,
                    timestamp: new Date().toISOString(),
                    chatId: currentMessageChatId,
                    context: { topic: messageContext.topic, tone: 'auto_reply' } // Konteks untuk auto reply
                });
                return;
            }

            for (const handler of commandHandlers) {
                if (handler.pattern.test(text)) {
                    const result = await handler.response(currentMessageChatId, msg);
                    await AlyaTyping(currentMessageChatId);
                    if (result.text) sendMessage(currentMessageChatId, result.text);
                    if (result.mood) setMood(currentMessageChatId, result.mood);
                    return;
                }
            }

            await AlyaTyping(currentMessageChatId);
            const aiResponse = await generateAIResponse(text, currentMessageChatId, messageContext);
            sendMessage(currentMessageChatId, aiResponse);
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


            if (config.calendarificApiKey) {
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
