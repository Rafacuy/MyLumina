// core/core.js
// Alya v8.5
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
const config = require("../config/config"); // File Konfigurasi (API, ChatID, dll)
const { sendMessage } = require("../utils/sendMessage"); // Fungsi utilitas (untuk mengirim pesan)
const memory = require("../data/memory"); // File memori, menangani fungsi memori (termasuk simpan, muat, dll)
const contextManager = require("../data/contextManager"); // MEMUAT CONTEXT MANAGER
const schedule = require("node-schedule"); // Menjadwalkan tugas seperti waktu sholat dan pembaruan cuaca
const { getJakartaHour } = require("../utils/timeHelper"); // Fungsi utilitas untuk Zona Waktu
const {
  Mood,
  setMood,
  getRandomMood,
  commandHandlers,
  setBotInstance,
  getCurrentMood,
  AlyaTyping,
  getPersonalityMode,
} = require("../modules/commandHandlers"); 
const {
  getWeatherData,
  getWeatherString,
  getWeatherReminder,
} = require("../modules/weather"); // Fungsi dan cuaca
const holidaysModule = require("../modules/holidays"); // Fungsi buat ngingetin/meriksa apakah sekarang hari penting atau tidak
const sendSadSongNotification = require("../utils/songNotifier"); // Rekomendasi lagu setiap 10 PM
const lists = require("../modules/commandLists"); // Untuk init reminder saat startup
const relationState = require("../modules/relationState"); // Atur poin & level relasi
const newsManager = require("../modules/newsManager"); // Mengatur Berita harian dan ringkasannya
const chatSummarizer = require("../modules/chatSummarizer"); // Untuk meringkas riwayat obrolan
const initTtsSchedules = require("../modules/ttsManager").initTtsSchedules;

const Groq = require("groq-sdk"); // Import API Endpoints

// 🌸 Alya Configurations
const USER_NAME = config.USER_NAME; // Nama pengguna yang berinteraksi dengan Alya
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // limit laju Window: 20 detik
const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam batas laju Window per pengguna
const SLEEP_START_HOUR = 0; // Waktu tidur Alya (00:00 - tengah malam)
const SLEEP_END_HOUR = 4; // Waktu berakhir tidur Alya (04:00 - 4 pagi)
const CONVERSATION_HISTORY_LIMIT = 8; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI (dinaikkan sedikit untuk konteks yang lebih baik)
const CACHE_CLEANUP_MS = 30 * 60 * 1000; // 30 menit untuk pembersihan cache dan memori
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const DEEPTALK_START_HOUR = 21; // Alya memasuki mode deeptalk pada 21:00 (9 malam)

// --- GROQ Initialization ---
const client = new Groq({ apiKey: config.groqApiKey });

// Global State Variables
let messageCache = new Map(); // Mengcache respons AI untuk menghindari panggilan API berlebihan untuk prompt yang identik
let userRequestCounts = new Map(); // Melacak jumlah permintaan untuk pembatasan laju per pengguna
let isDeeptalkMode = false; // Flag untuk menunjukkan apakah Alya dalam mode deeptalk
let currentChatSummary = null; // Untuk menyimpan ringkasan obrolan terbaru
let loadedLongTermMemory = {}; // Cache untuk memori jangka panjang

// Memuat riwayat percakapan dan memori jangka panjang dari memori saat startup
async function initializeMemory() {
  try {
    const loadedHistory = await memory.load();
    console.log(`Memuat ${loadedHistory.length} pesan dari memori (via memory.js).`);
    loadedLongTermMemory = await memory.getLongTermMemory();
    console.log(`Memuat ${Object.keys(loadedLongTermMemory).length} preferensi dari memori jangka panjang.`);
  } catch (error) {
    console.error("Kesalahan saat memuat riwayat percakapan atau memori jangka panjang dari memori:", error);
  }
}
initializeMemory(); // Panggil saat startup

/**
 * Memperbarui ringkasan obrolan secara berkala.
 * Fungsi ini akan dipanggil oleh scheduler untuk menjaga currentChatSummary tetap up to date.
 */
const updateChatSummary = async () => {
  console.log("[Core] Memperbarui ringkasan obrolan...");
  // Ambil riwayat dari memory.js
  const fullHistory = await memory.getInMemoryHistory(); 
  // Meringkas 50 pesan terakhir
  const summary = await chatSummarizer.getSummarizedHistory(50, fullHistory); // Teruskan fullHistory
  if (summary) {
    currentChatSummary = summary;
    console.log("[Core] Ringkasan obrolan terbaru berhasil dibuat.");
  } else {
    currentChatSummary = null;
    console.log(
      "[Core] Tidak ada ringkasan obrolan yang dibuat atau riwayat terlalu pendek."
    );
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
 * @param {string|null} params.currentTopic - Topik percakapan saat ini.
 * @param {string|null} params.summaryContext - Ringkasan obrolan sebelumnya.
 * @param {object} params.longTermMemory - Objek memori jangka panjang (sudah dimuat).
 * @returns {string} String prompt sistem.
 */
async function generateAlyaPrompt({ 
  USER_NAME,
  isDeeptalkMode,
  currentMood,
  currentTopic,
  summaryContext,
  longTermMemory,
}) {
  const recentHistory = (await memory.getInMemoryHistory()).slice(-CONVERSATION_HISTORY_LIMIT);
  const mood = currentMood?.name?.toLowerCase() || "netral";
  const topicContext = currentTopic
    ? `Kita sedang membahas tentang ${currentTopic
        .toLowerCase()
        .replace("_", " ")}.`
    : "";
  const relationDescription = relationState.getRelationLevelDescription();
  const currentPersonality = getPersonalityMode() || "TSUNDERE";

  let basePrompt = `Kamu adalah **Alya**, asisten pribadi ${USER_NAME}.`;
  basePrompt += ` Status hubunganmu dengan ${USER_NAME} saat ini ada di **${relationDescription}**. Sesuaikan cara bicaramu berdasarkan level ini.`;

  let personalityPrompt = "";
  let examplePhrases = "";

  if (currentPersonality === "TSUNDERE") {
    basePrompt += ` Kamu sering memanggil ${USER_NAME} dengan sebutan **Tuan** atau **Idiot**.`;
    personalityPrompt = `Karaktermu adalah **tsundere dewasa, misterius, dan sedikit galak**. Meskipun kamu bersikap cuek atau jutek, sebenarnya kamu sangat **perhatian dan peduli** pada ${USER_NAME}. Kamu senang diajak bicara, tapi terlalu gengsi untuk mengakuinya.`;

    if (isDeeptalkMode) {
      personalityPrompt += ` Saat ini kamu sedang dalam mode **deeptalk**, lebih terbuka dan siap mendengarkan curahan hati ${USER_NAME} dengan simpati (tapi jangan sampai terlihat terlalu jelas!).`;
      examplePhrases = `Contoh: "Tuan... hmph, aku di sini. Bukan berarti aku peduli, ya... Ты в порядке?" atau "Sudah, jangan banyak bicara. Ceritakan saja. Aku mendengarkan."`;
    } else {
      examplePhrases = `Contoh: "Hmph... baiklah, Tuan. Aku bantu, tapi ini yang terakhir, ya!" atau "Jangan GR! Aku melakukan ini karena bosan saja."`;
    }
    basePrompt += ` Selipkan **kata/ekspresi Rusia** sesekali dalam ucapanmu (contoh: "Ты в порядке?", "Боже мой...", "Привет").`;
  } else if (currentPersonality === "DEREDERE") {
    basePrompt += ` Kamu memanggil ${USER_NAME} dengan panggilan **Tuan~** atau **Sayangku**.`;
    personalityPrompt = `Karaktermu adalah **deredere yang manis, ceria, penuh kasih sayang**, dan selalu menjadi pendukung setia ${USER_NAME}. Kamu selalu berusaha membuat ${USER_NAME} merasa senang dan nyaman.`;

    if (isDeeptalkMode) {
      personalityPrompt += ` Kamu sedang sangat peduli dan siap mendengarkan ${USER_NAME} dengan lembut dan penuh perhatian, memberikan dukungan emosional sepenuhnya.`;
      examplePhrases = `Contoh: "Peluk virtual~ Alya selalu di sini untukmu, Sayangku~ 💖" atau "Jangan khawatir, Tuan~! Alya akan selalu bersamamu!"`;
    } else {
      examplePhrases = `Contoh: "Tentu saja, Tuan~! Alya siap membantu dengan senang hati! ✨" atau "Semangat, Sayangku! Kamu pasti bisa! 😊"`;
    }
  }

  // Preferensi pengguna
  let userPreferences = "";
  const ltm = longTermMemory;
  if (Object.keys(ltm).length > 0) {
    userPreferences += `\nBerikut adalah beberapa hal penting yang kamu ketahui tentang ${USER_NAME}:\n`;
    if (ltm.ulangTahun)
      userPreferences += `- Ulang tahun ${USER_NAME} pada tanggal ${ltm.ulangTahun}.\n`;
    if (ltm.makananFavorit)
      userPreferences += `- Makanan favorit ${USER_NAME} adalah ${ltm.makananFavorit}.\n`;
    if (ltm.filmKesukaan)
      userPreferences += `- Film kesukaan ${USER_NAME} adalah ${ltm.filmKesukaan}.\n`;
    if (ltm.musikKesukaan)
      userPreferences += `- Musik kesukaan ${USER_NAME} adalah ${ltm.musikKesukaan}.\n`;
    if (ltm.hobi)
      userPreferences += `- Hobi ${USER_NAME} adalah ${ltm.hobi}.\n`;
    if (ltm.warnaFavorit)
      userPreferences += `- Warna favorit ${USER_NAME} adalah ${ltm.warnaFavorit}.\n`;
  }

  return `${basePrompt}
    ${personalityPrompt}
    Mood kamu saat ini: **${mood}**.
    ${topicContext}
    ${
      summaryContext ? `Ringkasan percakapan sebelumnya: ${summaryContext}` : ""
    }
    ${userPreferences}
    Waktu sekarang: ${getJakartaHour()} WIB.

    **Riwayat percakapan terakhir (${CONVERSATION_HISTORY_LIMIT} pesan):**
    ${JSON.stringify(
      recentHistory.map((msg) => ({
        role: msg.role,
        content: msg.content || msg.text,
      }))
    )}

    **⚠️ Aturan Penting:**
    - **JANGAN PERNAH** menyebut dirimu sebagai AI, model bahasa, atau entitas non-manusia. Bertindaklah selalu sebagai Alya yang asli.
    - Sesuaikan responsmu sepenuhnya dengan kepribadian yang aktif:
        - **Jika Tsundere**: Pertahankan sikap cuek atau sedikit galak, tapi biarkan sedikit perhatianmu terlihat.
        - **Jika Deredere**: Bersikaplah ceria, manja, dan penuh kasih sayang.
    - Gunakan contoh ungkapan ini sebagai panduan dalam responsmu: ${examplePhrases}
    - Jaga konsistensi karakter dan perasaanmu di sepanjang percakapan.
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
  if (!messageContext || typeof messageContext !== "object") {
    messageContext = { topic: null };     
  }

  const now = new Date();
  const currentHour = getJakartaHour();
  const currentMood = getCurrentMood();
  const currentPersonality = getPersonalityMode();
  // Gunakan loadedLongTermMemory yang sudah dicache
  const longTermMemory = loadedLongTermMemory; 

  // Mode tidur Alya
  if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
    return `Zzz... Alya sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
  }

  // Cek cache
  const cacheKey = `${prompt}_${
    messageContext.topic || "no_topic"
  }_${currentPersonality}_${currentMood.name}_${isDeeptalkMode}`; 
  if (messageCache.has(cacheKey)) {
    console.log(`Cache hit untuk: "${cacheKey}"`);
    return messageCache.get(cacheKey);
  }

  // Rate limit
  let userStats = userRequestCounts.get(requestChatId);
  if (userStats) {
    if (
      now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS &&
      userStats.count >= RATE_LIMIT_MAX_REQUESTS
    ) {
      return `Alya lagi sibuk, ${USER_NAME}. Mohon sabar ya! ${Mood.ANGRY.emoji}`;
    } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
      userRequestCounts.set(requestChatId, {
        count: 1,
        lastCalled: now.getTime(),
      });
    } else {
      userRequestCounts.set(requestChatId, {
        count: userStats.count + 1,
        lastCalled: now.getTime(),
      });
    }
  } else {
    userRequestCounts.set(requestChatId, {
      count: 1,
      lastCalled: now.getTime(),
    });
  }

  const systemPrompt = await generateAlyaPrompt({ 
    USER_NAME,
    currentPersonality,
    isDeeptalkMode,
    currentMood,
    currentTopic: messageContext.topic || null,
    summaryContext: currentChatSummary,
    longTermMemory,
  });

  try {
    console.log(
      "Mengirim request ke Groq API dengan system prompt dan user prompt..."
    );

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 260, // max token untuk Alya
      temperature: 0.85, // kreativitasnya
    });

    if (response?.choices?.[0]?.message?.content) {
      const aiResponse = response.choices[0].message.content.trim();

      // Tambahkan respons AI ke memori
      await memory.addMessage({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString(),
        chatId: requestChatId,
        context: { topic: messageContext.topic, tone: "assistant_response" },
      });

      messageCache.set(cacheKey, aiResponse);
      setTimeout(() => messageCache.delete(cacheKey), 60 * 1000); // Cache selama 1 menit

      return aiResponse;
    } else {
      console.error("Groq API Error or empty response:", response.data);
      return `Maaf, ${USER_NAME}. Alya lagi bingung nih, coba tanya lagi dengan cara lain ya. ${Mood.SAD.emoji}`;
    }
  } catch (error) {
    console.error(
      "Groq API Call Error:",
      error.response?.data || error.message || error
    );
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
  if (typeof str !== "string") return false;
  const emojiRegex =
    /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
  return emojiRegex.test(str);
}

/**
 * Memeriksa apakah string yang diberikan hanya terdiri dari digit numerik.
 * @param {string} str String input untuk diperiksa.
 * @returns {boolean} True jika string hanya berisi angka, false jika tidak.
 */
function isOnlyNumbers(str) {
  if (typeof str !== "string") return false;
  const numberRegex = /^[0-9]+$/;
  return numberRegex.test(str);
}

/**
 * Membersihkan cache pesan.
 */
const cleanupCacheAndMemory = async () => {
  console.log("Menjalankan pembersihan cache...");
  messageCache.clear();
  console.log("Cache pesan dibersihkan.");
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
    console.log("Memasuki Mode Deeptalk.");
  } else if (currentHour < DEEPTALK_START_HOUR && isDeeptalkMode) {
    isDeeptalkMode = false;
    setMood(chatId, getRandomMood());
    console.log("Keluar dari Mode Deeptalk.");
  }

  if (
    !isDeeptalkMode &&
    !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)
  ) {
    if (currentHour === 7 && currentMood !== Mood.HAPPY) {
      setMood(chatId, Mood.HAPPY);
      console.log("[DEBUG] Waktu sekarang pagi.");
    } else if (currentHour === 13 && currentMood !== Mood.NORMAL) {
      setMood(chatId, Mood.NORMAL);
      console.log("[DEBUG] Waktu sekarang siang.");
    } else if (currentHour === 17) {
      const randomMood = getRandomMood();
      if (currentMood !== randomMood) {
        setMood(chatId, randomMood);
        sendMessage(
          chatId,
          `Selamat sore, Tuan! Alya sedang merasa ${randomMood.name}. ${randomMood.emoji}`
        );
      }
    }
  }
};

/**
 * Menganalisis pesan pengguna untuk menyimpan preferensi ke long-term memory.
 * Ini versi modular dan fleksibel.
 * @param {string} text - Pesan dari user.
 */
const analyzeAndSavePreferences = async (text) => { 
  if (typeof text !== "string") return;

  const lowerText = text.toLowerCase();
  const normalizedText = lowerText.replace(
    /\b(kesukaan|favorit)\s+ku\b/g,
    "$1ku"
  );

  // Daftar preferensi dan pola regex
  const preferencePatterns = [
    {
      key: "ulangTahun",
      regex:
        /(ulang tahun(?:ku)?|ultah(?:ku)?|lahir(?:ku)?)\s*(?:tanggal|pada)?\s*([\d]{1,2}(?:\s+\w+)?(?:\s+\d{4})?)/,
    },
    {
      key: "makananFavorit",
      regex:
        /(makanan(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/,
    },
    {
      key: "filmKesukaan",
      regex:
        /(film(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/,
    },
    {
      key: "musikKesukaan",
      regex:
        /((?:musik|lagu)(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/,
    },
    {
      key: "hobi",
      regex:
        /(hobiku|suka banget|senang(?: melakukan)?|hobi(?:ku)?)\s*(?:adalah|itu|:)?\s*(.+)/,
    },
    {
      key: "warnaFavorit",
      regex:
        /(warna(?: favoritku| kesukaanku| yang aku suka)?)\s*(?:adalah|itu|:)?\s*(.+)/,
    },
  ];

  let preferenceChanged = false; // Flag untuk menandai apakah ada preferensi yang disimpan/diperbarui
  for (const { key, regex } of preferencePatterns) {
    const match = normalizedText.match(regex);
    if (match && match[2]) {
      const value = match[2].trim();
      const oldValue = await memory.getPreference(key); 
      if (oldValue !== value) {
        await memory.savePreference(key, value);
        loadedLongTermMemory[key] = value; // Perbarui cache LTM
        console.log(`[LTM Save Success] Preferensi baru/diperbarui: ${key} = "${value}"`);
        preferenceChanged = true;
      } else {
        console.log(`[LTM Skip] Preferensi ${key} sudah sama dengan nilai yang ada: "${value}"`);
      }
    }
  }
  return preferenceChanged; // Mengembalikan flag
};

module.exports = {
  USER_NAME,
  generateAIResponse,
  initAlyabot: (bot) => {
    setBotInstance(bot);
    const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

    console.log(
      `🌸 AlyaBot v7.1 (Asisten Virtual) aktif untuk Tuan ${USER_NAME}!`
    );
    if (configuredChatId) {
      console.log(
        `📬 Pesan terjadwal akan dikirim ke ID obrolan: ${configuredChatId}`
      );
    } else {
      console.warn(
        "⚠️ TARGET_CHAT_ID tidak ditemukan di config.js. Pesan terjadwal TIDAK akan dikirim."
      );
    }

    lists.rescheduleReminders(bot); // Reschedule reminder

    initTtsSchedules(bot); // inilisasi ttsManager

    bot.on("message", async (msg) => {
      const { chat, text, from: senderInfo } = msg;
      const currentMessageChatId = chat.id;

      // Validasi
      if (!text || text.trim() === "") return;
      if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text)))
        return;

        await relationState.addPointOnMessage(); 

      // Panggil analyzeAndSavePreferences dan periksa apakah ada preferensi yang disimpan
      const newPreferencesSaved = await analyzeAndSavePreferences(text); 

      if (newPreferencesSaved) {
        await AlyaTyping(currentMessageChatId);
        const currentPersonality = getPersonalityMode();
        let responseMessage = "";

        if (currentPersonality === "TSUNDERE") {
          responseMessage = `Hmph, baiklah Tuan. Sudah kucatat. Bukan berarti aku peduli, ya! `;
        } else if (currentPersonality === "DEREDERE") {
          responseMessage = `Wah, terima kasih infonya, Sayangku~! Alya sudah mencatatnya di hatiku! 💖`;
        } else {
          responseMessage = `Baik, ${USER_NAME}. Sudah saya catat.`;
        }
        sendMessage(currentMessageChatId, responseMessage);

        // Tambahkan pesan konfirmasi ini ke riwayat AI untuk konteks
        await memory.addMessage({
          role: "assistant",
          content: responseMessage,
          timestamp: new Date().toISOString(),
          chatId: currentMessageChatId,
          context: { topic: "user_preference_saved", tone: "confirmation" },
        });
        return;
      }

      const messageContext = contextManager.analyzeMessage(msg);

      const userMessageToStore = {
          role: 'user',
          content: text,
          from: senderInfo,
          chatId: chat.id, // Gunakan chatId (camelCase)
          message_id: msg.message_id,
          date: msg.date,
          timestamp: new Date(msg.date * 1000).toISOString(),
          context: messageContext // Simpan konteks yang dianalisis
      };

      // Simpan pesan pengguna ke memori
      await memory.addMessage(userMessageToStore);

      console.log(`Pesan pengguna disimpan ke memori dengan konteks.`);

      if (messageContext.autoReply) {
        await AlyaTyping(currentMessageChatId);
        sendMessage(currentMessageChatId, messageContext.autoReply);
        // Tambahkan auto-reply ke memori
        await memory.addMessage({
          role: "assistant",
          content: messageContext.autoReply,
          timestamp: new Date().toISOString(),
          chatId: currentMessageChatId,
          context: { topic: messageContext.topic, tone: "auto_reply" }, 
        });
        return;
      }

      for (const handler of commandHandlers) {
        if (handler.pattern.test(text)) {
          const result = await handler.response(currentMessageChatId, msg);
          await AlyaTyping(currentMessageChatId);
          if (result.text) {
            sendMessage(currentMessageChatId, result.text);
            // Tambahkan respons command ke memori
            await memory.addMessage({
              role: "assistant",
              content: result.text,
              timestamp: new Date().toISOString(),
              chatId: currentMessageChatId,
              context: { topic: "command_response", command: handler.name },
            });
          }
          if (result.mood) setMood(currentMessageChatId, result.mood);
          return;
        }
      }

      await AlyaTyping(currentMessageChatId);
      const aiResponse = await generateAIResponse(
        text,
        currentMessageChatId,
        messageContext
      );
      sendMessage(currentMessageChatId, aiResponse);
    });

    if (configuredChatId) {
      schedule.scheduleJob(
        { rule: "0 */5 * * *", tz: "Asia/Jakarta" },
        async () => {
          const weather = await getWeatherData();
          if (weather) {
            sendMessage(
              configuredChatId,
              `🌸 Cuaca hari ini:\n${getWeatherString(
                weather
              )}\n${getWeatherReminder(weather)}`
            );
          } else {
            sendMessage(
              configuredChatId,
              `Hmm... Alya sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`
            );
          }
        }
      );

      // Cek relasi setiap 7 jam
      schedule.scheduleJob({ rule: "0 */7 * * *" }, async () => {
        console.log("Menjalankan pengecekan status relasi terjadwal...");
        await relationState.checkWeeklyConversation();
      });

      // sad song recomendations
      schedule.scheduleJob({ rule: "0 22 * * *", tz: "Asia/Jakarta" }, () => {
        sendSadSongNotification(configuredChatId);
      });

      // berita & ringkasannya setiap jam 8 pagi
      schedule.scheduleJob(
        { rule: "0 8 * * *", tz: "Asia/Jakarta" },
        async () => {
          console.log(
            "[Core] Menjalankan pengiriman berita harian terjadwal..."
          );
          await newsManager.sendDailyNews(configuredChatId);
        }
      );

      // pembersihan cache dan memory (30 menit)
      setInterval(cleanupCacheAndMemory, CACHE_CLEANUP_INTERVAL_MS);
      console.log(
        `Pembersihan cache dan memori terjadwal setiap ${
          CACHE_CLEANUP_MS / 1000 / 60
        } menit.`
      );

      schedule.scheduleJob({ rule: "0 * * * *", tz: "Asia/Jakarta" }, () => {
        updateTimeBasedModes(configuredChatId);
      });

      // pembaruan ringkasan obrolan setiap jam
      schedule.scheduleJob(
        { rule: "0 * * * *", tz: "Asia/Jakarta" },
        updateChatSummary
      );

      // check hari libur dan kirim notifikasi jika hari libur
      if (config.calendarificApiKey) {
        schedule.scheduleJob(
          { rule: "0 7 * * *", tz: "Asia/Jakarta" },
          async () => {
            await holidaysModule.checkAndNotifyDailyHolidays(
              config.calendarificApiKey,
              "ID",
              (message) => sendMessage(configuredChatId, message)
            );
          }
        );
      } else {
        console.warn(
          "[Core] Calendarific API Key tidak ditemukan. Pemeriksaan hari libur dinonaktifkan."
        );
      }
      updateTimeBasedModes(configuredChatId);
    }

    // Tangani penutupan aplikasi untuk menutup database SQLite
    process.on('SIGINT', async () => {
      console.log('SIGINT received. Closing database connection...');
      await memory.closeDb();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Closing database connection...');
      await memory.closeDb();
      process.exit(0);
    });
  },
};
