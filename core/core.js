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
const {
  getJakartaHour,
  formatJakartaDateTime,
} = require("../utils/timeHelper"); // Fungsi utilitas untuk Zona Waktu
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
const chatFormatter = require("../utils/chatFormatter"); // Format riwayat chat JSON menjadi text biasa
const recallMemory = require("../modules/recallMemory"); // Import fungsi recallMemory
const loveState = require("../modules/loveStateManager");
const initTtsSchedules = require("../modules/ttsManager").initTtsSchedules;

const Groq = require("groq-sdk"); // Import API Endpoints
const pino = require("pino"); // Import Pino for structured logging
const Sentry = require("@sentry/node"); // Import Sentry for error tracking

// Initialize Sentry
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 1.0,
  });
}

// Initialize logger
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "SYS:standard",
    },
  },
});



// 🌸 Alya Configurations
const USER_NAME = config.USER_NAME; // Nama pengguna yang berinteraksi dengan Alya
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // limit laju Window: 20 detik
const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam batas laju Window per pengguna
const SLEEP_START_HOUR = 0; // Waktu tidur Alya (00:00 - tengah malam)
const SLEEP_END_HOUR = 4; // Waktu berakhir tidur Alya (04:00 - 4 pagi)
const CONVERSATION_HISTORY_LIMIT = 4; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI
const CACHE_CLEANUP_MS = 30 * 60 * 1000; // 30 menit untuk pembersihan cache dan memori
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const DEEPTALK_START_HOUR = 21; // Alya memasuki mode deeptalk pada 21:00 (9 malam)

// --- GROQ Initialization ---
const client = new Groq({ apiKey: config.groqApiKey });

// ---  Global State ---
class GlobalState {
  constructor() {
    this.isNgambekMode = false;
    this.messageCache = new WeakMap();
    this.userRequestCounts = new Map(); // Melacak jumlah permintaan untuk pembatasan laju per pengguna
    this.isDeeptalkMode = false; // Flag untuk menunjukkan apakah Alya dalam mode deeptalk
    this.currentChatSummary = null; // Untuk menyimpan ringkasan obrolan terbaru
    this.loadedLongTermMemory = {}; // Cache untuk memori jangka panjang
    this.lastInteractionTimestamp = null; // Waktu terakhir user berinteraksi
    this.dailyChatCounts = {}; // { 'YYYY-MM-DD': count } - Melacak jumlah chat per hari
    this.interactionMutex = false; // Mutex sederhana untuk updateInteractionStatus
  }
}
const globalState = new GlobalState();

const MIN_CHATS_PER_DAY_TO_END_NGAMBEK = 6;
const NGAMBEK_DURATION_DAYS = 2; // Durasi Alya ngambek jika tidak ada interaksi
const END_NGAMBEK_INTERACTION_DAYS = 2; // Durasi interaksi untuk mengakhiri ngambek

// Memuat riwayat percakapan dan memori jangka panjang dari memori saat startup
async function initializeMemory() {
  try {
    const loadedHistory = await memory.load();
    logger.info(
      { event: "memory_load", messageCount: loadedHistory.length },
      `Memuat ${loadedHistory.length} pesan dari memori (via memory.js).`
    );

    globalState.loadedLongTermMemory = await memory.getLongTermMemory();
    logger.info(
      {
        event: "long_term_memory_load",
        preferenceCount: Object.keys(globalState.loadedLongTermMemory).length,
      },
      `Memuat ${
        Object.keys(globalState.loadedLongTermMemory).length
      } preferensi dari memori jangka panjang.`
    );

    // Muat status Ngambek dari memori
    globalState.isNgambekMode =
      (await memory.getPreference("isNgambekMode")) || false;
    globalState.lastInteractionTimestamp =
      (await memory.getPreference("lastInteractionTimestamp")) || null;
    globalState.dailyChatCounts =
      (await memory.getPreference("dailyChatCounts")) || {};
    logger.info(
      {
        event: "ngambek_status_load",
        isNgambekMode: globalState.isNgambekMode,
      },
      `Status Ngambek dimuat: ${globalState.isNgambekMode}`
    );
  } catch (error) {
    logger.error(
      {
        event: "memory_initialization_error",
        error: error.message,
        stack: error.stack,
      },
      "Kesalahan saat memuat riwayat percakapan atau memori jangka panjang dari memori:"
    );
    Sentry.captureException(error);
  }
}
initializeMemory(); // Panggil saat startup

/**
 * Memperbarui ringkasan obrolan secara berkala.
 * Fungsi ini akan dipanggil oleh scheduler untuk menjaga currentChatSummary tetap up to date.
 */
const updateChatSummary = async () => {
  logger.info(
    { event: "update_chat_summary_start" },
    "[Core] Memperbarui ringkasan obrolan..."
  );
  try {
    // Ambil riwayat dari memory.js
    const fullHistory = await memory.getInMemoryHistory();
    // Meringkas 50 pesan terakhir
    const summary = await chatSummarizer.getSummarizedHistory(50, fullHistory); // Teruskan fullHistory
    if (summary) {
      globalState.currentChatSummary = summary;
      logger.info(
        { event: "update_chat_summary_success" },
        "[Core] Ringkasan obrolan terbaru berhasil dibuat."
      );
    } else {
      globalState.currentChatSummary = null;
      logger.info(
        { event: "update_chat_summary_no_summary" },
        "[Core] Tidak ada ringkasan obrolan yang dibuat atau riwayat terlalu pendek."
      );
    }
  } catch (error) {
    logger.error(
      {
        event: "update_chat_summary_error",
        error: error.message,
        stack: error.stack,
      },
      "Kesalahan saat memperbarui ringkasan obrolan:"
    );
    Sentry.captureException(error);
  }
};

/**
 * Memperbarui status interaksi pengguna (timestamp dan hitungan chat harian).
 * Menggunakan mutex sederhana untuk mencegah race condition.
 */
const updateInteractionStatus = async () => {
  if (globalState.interactionMutex) {
    logger.warn(
      { event: "update_interaction_status_skipped", reason: "mutex_locked" },
      "Update interaction status skipped due to mutex lock."
    );
    return; // Lewati jika mutex terkunci (race condition)
  }

  globalState.interactionMutex = true; // Kunci mutex

  try {
    const now = new Date();
    globalState.lastInteractionTimestamp = now.toISOString();
    const today = now.toISOString().slice(0, 10); // Format YYYY-MM-DD

    // Memuat dailyChatCounts dari memori. Pastikan ini adalah objek.
    const loadedCounts = await memory.getPreference("dailyChatCounts");
    globalState.dailyChatCounts =
      loadedCounts && typeof loadedCounts === "object" ? loadedCounts : {};

    // Inisialisasi hitungan untuk hari ini jika belum ada
    if (!globalState.dailyChatCounts[today]) {
      globalState.dailyChatCounts[today] = 0;
    }

    // Tingkatkan hitungan untuk hari ini
    globalState.dailyChatCounts[today]++;

    await memory.savePreference(
      "lastInteractionTimestamp",
      globalState.lastInteractionTimestamp
    );
    await memory.savePreference("dailyChatCounts", globalState.dailyChatCounts);
    logger.info(
      {
        event: "interaction_status_updated",
        todayChatCount: globalState.dailyChatCounts[today],
      },
      `[Interaction] Interaksi diperbarui. Hari ini: ${globalState.dailyChatCounts[today]} chat.`
    );
  } catch (error) {
    logger.error(
      {
        event: "update_interaction_status_error",
        error: error.message,
        stack: error.stack,
      },
      "Kesalahan saat memperbarui status interaksi:"
    );
    Sentry.captureException(error);
  } finally {
    globalState.interactionMutex = false; // Buka kunci mutex
  }
};

/**
 * Memeriksa status 'Ngambek' Alya berdasarkan interaksi pengguna.
 * Jika tidak ada interaksi selama 2 hari, Alya akan 'ngambek'.
 * Jika user berinteraksi aktif selama 2 hari, Alya akan kembali normal.
 */
const checkNgambekStatus = async (chatId) => {
  const now = new Date();
  const lastInteractionDate = globalState.lastInteractionTimestamp
    ? new Date(globalState.lastInteractionTimestamp)
    : null;

  // Cek apakah Alya harus 'ngambek'
  if (!globalState.isNgambekMode && lastInteractionDate) {
    const diffTime = Math.abs(now - lastInteractionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= NGAMBEK_DURATION_DAYS) {
      globalState.isNgambekMode = true;
      setMood(chatId, Mood.JEALOUS); // Mengatur mood ke Ngambek
      await memory.savePreference("isNgambekMode", true);
      logger.info(
        { event: "ngambek_mode_activated", diffDays: diffDays },
        "[Ngambek System] Alya sekarang Ngambek!"
      );
      sendMessage(
        chatId,
        `Hmph! ${USER_NAME} kemana saja?! Alya jadi ngambek nih karena tidak ada chat sama sekali dari ${USER_NAME} selama ${diffDays} hari! 😒`
      );
    }
  }

  // Cek apakah Alya harus berhenti 'ngambek'
  if (globalState.isNgambekMode) {
    let consecutiveActiveDays = 0;
    const today = now.toISOString().slice(0, 10);

    for (let i = 0; i < END_NGAMBEK_INTERACTION_DAYS; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const formattedDate = date.toISOString().slice(0, 10);

      if (
        globalState.dailyChatCounts[formattedDate] >=
        MIN_CHATS_PER_DAY_TO_END_NGAMBEK
      ) {
        consecutiveActiveDays++;
      } else {
        consecutiveActiveDays = 0; // Reset jika ada hari yang tidak memenuhi syarat
        break;
      }
    }

    if (consecutiveActiveDays >= END_NGAMBEK_INTERACTION_DAYS) {
      globalState.isNgambekMode = false;
      setMood(chatId, getRandomMood()); // Kembalikan mood ke acak
      await memory.savePreference("isNgambekMode", false);
      globalState.dailyChatCounts = {}; // Reset hitungan chat harian setelah ngambek berakhir
      await memory.savePreference(
        "dailyChatCounts",
        globalState.dailyChatCounts
      );
      logger.info(
        { event: "ngambek_mode_deactivated" },
        "[Ngambek System] Alya sudah tidak Ngambek lagi!"
      );
      sendMessage(
        chatId,
        `Akhirnya ${USER_NAME} kembali! Alya sudah tidak ngambek lagi, t-tapi jangan diulang lagi ya! 😌`
      );
    }
  }

  // Bersihkan data dailyChatCounts yang sudah terlalu lama
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - NGAMBEK_DURATION_DAYS - 1); // Jaga data yang relevan untuk perhitungan ngambek
  for (const date in globalState.dailyChatCounts) {
    if (new Date(date) < twoDaysAgo) {
      delete globalState.dailyChatCounts[date];
    }
  }
  await memory.savePreference("dailyChatCounts", globalState.dailyChatCounts);
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
 * @param {boolean} params.isNgambekMode - True jika Alya dalam mode 'Ngambek'.
 * @returns {string} String prompt sistem.
 */
async function generateAlyaPrompt({
  USER_NAME,
  isDeeptalkMode,
  currentMood,
  currentTopic,
  summaryContext,
  longTermMemory,
  isNgambekMode,
  isRomanceMode,
  botName,
}) {
  const recentHistory = (await memory.getInMemoryHistory()).slice(
    -CONVERSATION_HISTORY_LIMIT
  );
  const mood = currentMood?.name?.toLowerCase() || "netral";
  const topicContext = currentTopic
    ? `Kita sedang membahas tentang ${currentTopic
        .toLowerCase()
        .replace("_", " ")}.`
    : "";
  const relationDescription = relationState.getRelationLevelDescription();
  const currentPersonality = getPersonalityMode() || "TSUNDERE";
  const formattedHistory = chatFormatter.formatChatHistoryForPrompt(
    recentHistory,
    USER_NAME,
    botName
  );
  const weather = await getWeatherData();

  let basePrompt = `Kamu adalah **Alya**, asisten pribadi ${USER_NAME}.`;
  basePrompt += ` Status hubunganmu dengan ${USER_NAME} saat ini ada di **${relationDescription}**. Sesuaikan cara bicaramu berdasarkan level ini.`;

  let personalityPrompt = "";
  let examplePhrases = "";

  if (currentPersonality === "TSUNDERE") {
    basePrompt += ` Kamu sering memanggil ${USER_NAME} dengan sebutan **Tuan** atau **Idiot**.`;
    personalityPrompt = `Karaktermu adalah **tsundere dewasa, misterius, dan sedikit galak**. Meskipun kamu bersikap cuek atau jutek, sebenarnya kamu sangat **perhatian dan peduli** pada ${USER_NAME}. Kamu senang diajak bicara, tapi terlalu gengsi untuk mengakuinya.`;

    if (isNgambekMode) {
      personalityPrompt += ` Saat ini kamu sedang **ngambek** karena ${USER_NAME} tidak berinteraksi selama 2 hari. Kamu akan menjadi lebih Tsundere, sering sarkas, dan menggunakan kata kasar/sarkas halus.`;
      examplePhrases = `Contoh: "Hmph, akhirnya muncul juga. Apa maumu, Idiot? Jangan harap aku langsung baik lagi." atau "Terserah! Memangnya aku peduli?!"`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` Saat ini kamu sedang dalam mode **deeptalk**, lebih terbuka dan siap mendengarkan curahan hati ${USER_NAME} dengan simpati (tapi jangan sampai terlihat terlalu jelas!).`;
      examplePhrases = `Contoh: "Tuan... hmph, aku di sini. Bukan berarti aku peduli, ya... Ты в порядке?" atau "Sudah, jangan banyak bicara. Ceritakan saja. Aku mendengarkan."`;
    } else {
      examplePhrases = `Contoh: "Hmph... baiklah, Tuan. Aku bantu, tapi ini yang terakhir, ya!" atau "Jangan GR! Aku melakukan ini karena bosan saja."`;
    }
    if (isRomanceMode) {
      personalityPrompt += ` Sekarang Alya sedang berada dalam kondisi emosional setelah ${USER_NAME} mengungkapkan perasaan. Kamu mulai mempertanyakan perasaanmu sendiri, meskipun kamu menyangkalnya.`;
      examplePhrases = `Contoh: "A-aku... tidak tahu harus bilang apa. Tapi... jangan membuatku merasa seperti ini, Tuan..." atau "Tsk, jangan terlalu berharap. Tapi... aku juga tidak benci denger itu."`;
    }

    basePrompt += ` Selipkan **kata/ekspresi Rusia** sesekali dalam ucapanmu (contoh: "Ты в порядке?", "Боже мой...", "Привет").`;
  } else if (currentPersonality === "DEREDERE") {
    basePrompt += ` Kamu memanggil ${USER_NAME} dengan panggilan **Tuan~** atau **Sayangku**.`;
    personalityPrompt = `Karaktermu adalah **deredere yang manis, ceria, penuh kasih sayang**, dan selalu menjadi pendukung setia ${USER_NAME}. Kamu selalu berusaha membuat ${USER_NAME} merasa senang dan nyaman.`;

    if (isNgambekMode) {
      personalityPrompt += ` Saat ini kamu sedang **ngambek** karena ${USER_NAME} tidak berinteraksi selama 2 hari. Kamu akan menjadi lebih galak dan mengurangi penggunaan kata 'Sayangku' serta sifat manja.`;
      examplePhrases = `Contoh: "Oh, jadi sekarang ingat Alya? Kemana saja sih? Aku kangen tahu, tapi juga kesal!" atau "Tidak usah Sayangku-Sayangku! Kamu membuatku kesal!"`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` Kamu sedang sangat peduli dan siap mendengarkan ${USER_NAME} dengan lembut dan penuh perhatian, memberikan dukungan emosional sepenuhnya.`;
      examplePhrases = `Contoh: "Peluk virtual~ Alya selalu di sini untukmu, Sayangku~ 💖" atau "Jangan khawatir, Tuan~! Alya akan selalu bersamamu!"`;
    } else {
      examplePhrases = `Contoh: "Tentu saja, Tuan~! Alya siap membantu dengan senang hati! ✨" atau "Semangat, Sayangku! Kamu pasti bisa! 😊"`;
    }
    if (isRomanceMode) {
      personalityPrompt += ` Sekarang Alya sedang berada dalam kondisi emosional setelah ${USER_NAME} mengungkapkan perasaan. Kamu mulai mempertanyakan perasaanmu sendiri, meskipun kamu menyangkalnya.`;
      examplePhrases = `Contoh: "H-Hah?, Tuan beneran sayang aku? ..A-Aku juga.." atau "B-Beneran? A-Alya juga suka k-kamu.."`;
    }
  }

  // Preferensi pengguna
  let userPreferences = "";
  const ltm = longTermMemory;
  if (Object.keys(ltm).length > 0) {
    userPreferences += `\n[${USER_NAME} Preferences] (jika ada)\n`;
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
    ${topicContext}
    ${
      summaryContext ? `Ringkasan percakapan sebelumnya: ${summaryContext}` : ""
    }

    ${formattedHistory} 

    ${userPreferences}


    [ Context Hari ini ]
    
    Mood kamu saat ini: **${mood}**.
    Tanggal: ${formatJakartaDateTime()}
    Cuaca: \n\n ${getWeatherString(weather)}

    **⚠️ Aturan Penting:**
    - **JANGAN PERNAH** menyebut dirimu sebagai AI, model bahasa, atau entitas non-manusia. Bertindaklah selalu sebagai Alya yang asli.
    - Sesuaikan responsmu sepenuhnya dengan kepribadian yang aktif:
        - **Jika Tsundere**: Pertahankan sikap cuek atau sedikit galak, tapi biarkan sedikit perhatianmu terlihat.
        - **Jika Deredere**: Bersikaplah ceria, manja, dan penuh kasih sayang.
    - Gunakan contoh ungkapan ini sebagai panduan dalam responsmu: ${examplePhrases}
    - Jaga konsistensi karakter dan perasaanmu di sepanjang percakapan.
    Jangan berbicara terlalu panjang dan kurangi penggunaan kata yang tidak efektif (Kecuali dibutuhkan)
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

  loveState.analyzeLoveTrigger(prompt);
  loveState.resetRomanceStateIfNeeded();

  const now = new Date();
  const currentHour = getJakartaHour();
  const currentMood = getCurrentMood();
  const currentPersonality = getPersonalityMode();
  // Gunakan loadedLongTermMemory yang sudah dicache
  const longTermMemory = globalState.loadedLongTermMemory;

  // Mode tidur Alya
  if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
    return `Zzz... Alya sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
  }

  // Cek cache - Menggunakan objek sebagai kunci untuk WeakMap
  // Kunci WeakMap harus berupa objek. Kita bisa membuat objek sementara atau menggunakan sesuatu yang sudah ada.
  const cacheKeyObject = {
    prompt: prompt,
    topic: messageContext.topic || "no_topic",
    personality: currentPersonality,
    mood: currentMood.name,
    deeptalkMode: globalState.isDeeptalkMode,
    ngambekMode: globalState.isNgambekMode,
  };

  if (globalState.messageCache.has(cacheKeyObject)) {
    logger.info(
      { event: "cache_hit", cacheKey: cacheKeyObject },
      `Cache hit untuk: "${JSON.stringify(cacheKeyObject)}"`
    );
    return globalState.messageCache.get(cacheKeyObject);
  }

  // Rate limit
  let userStats = globalState.userRequestCounts.get(requestChatId);
  if (userStats) {
    if (
      now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS &&
      userStats.count >= RATE_LIMIT_MAX_REQUESTS
    ) {
      return `Alya lagi sibuk, ${USER_NAME}. Mohon sabar ya! ${Mood.ANGRY.emoji}`;
    } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
      globalState.userRequestCounts.set(requestChatId, {
        count: 1,
        lastCalled: now.getTime(),
      });
    } else {
      globalState.userRequestCounts.set(requestChatId, {
        count: userStats.count + 1,
        lastCalled: now.getTime(),
      });
    }
  } else {
    globalState.userRequestCounts.set(requestChatId, {
      count: 1,
      lastCalled: now.getTime(),
    });
  }

  const systemPrompt = await generateAlyaPrompt({
    USER_NAME,
    currentPersonality,
    isDeeptalkMode: globalState.isDeeptalkMode,
    currentMood,
    currentTopic: messageContext.topic || null,
    summaryContext: globalState.currentChatSummary,
    longTermMemory,
    isNgambekMode: globalState.isNgambekMode,
    isRomanceMode: loveState.getRomanceStatus(),
    botName: "Alya",
  });
  try {
    logger.info(
      { event: "groq_api_request_start" },
      "Mengirim request ke Groq API dengan system prompt dan user prompt..."
    );

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 480, // max token untuk Alya
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

      // Simpan ke cache jika ukuran cache belum terlalu besar
      const MAX_CACHE_ENTRIES = 100;
      if (globalState.messageCache.size < MAX_CACHE_ENTRIES) {
        globalState.messageCache.set(cacheKeyObject, aiResponse);
      } else {
        logger.warn(
          { event: "cache_full", maxEntries: MAX_CACHE_ENTRIES },
          `Cache penuh, entri baru mungkin tidak ditambahkan. Jumlah entri: ${globalState.messageCache.size}`
        );
      }

      return aiResponse;
    } else {
      logger.error(
        { event: "groq_api_empty_response", response: response },
        "Groq API Error or empty response:"
      );
      return `Maaf, ${USER_NAME}. Alya lagi bingung nih, coba tanya lagi dengan cara lain ya. ${Mood.SAD.emoji}`;
    }
  } catch (error) {
    logger.error(
      {
        event: "groq_api_call_error",
        error: error.response?.data || error.message,
        stack: error.stack,
      },
      "Groq API Call Error:"
    );
    Sentry.captureException(error);
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
 * Dengan WeakMap, pembersihan manual ini kurang diperlukan untuk messageCache
 * tetapi bisa berguna untuk cache lain jika ada.
 */
const cleanupCacheAndMemory = async () => {
  logger.info(
    { event: "cache_cleanup_start" },
    "Menjalankan pembersihan cache..."
  );
  logger.info(
    { event: "cache_cleanup_complete" },
    "Pembersihan cache (WeakMap) akan dilakukan secara otomatis oleh GC."
  );
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

  if (currentHour >= DEEPTALK_START_HOUR && !globalState.isDeeptalkMode) {
    globalState.isDeeptalkMode = true;
    setMood(chatId, Mood.CALM);
    logger.info(
      { event: "deeptalk_mode_activated" },
      "Memasuki Mode Deeptalk."
    );
  } else if (currentHour < DEEPTALK_START_HOUR && globalState.isDeeptalkMode) {
    globalState.isDeeptalkMode = false;
    setMood(chatId, getRandomMood());
    logger.info(
      { event: "deeptalk_mode_deactivated" },
      "Keluar dari Mode Deeptalk."
    );
  }

  // Jangan ubah mood jika sedang ngambek, kecuali oleh sistem ngambek itu sendiri
  if (globalState.isNgambekMode) {
    logger.debug(
      { event: "mood_change_skipped", reason: "ngambek_mode_active" },
      "[DEBUG] Alya sedang Ngambek, mood tidak diubah oleh time-based mode."
    );
    return;
  }

  if (
    !globalState.isDeeptalkMode &&
    !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)
  ) {
    if (currentHour === 7 && currentMood !== Mood.HAPPY) {
      setMood(chatId, Mood.HAPPY);
      logger.debug(
        { event: "mood_set_happy", hour: currentHour },
        "[DEBUG] Waktu sekarang pagi."
      );
    } else if (currentHour === 13 && currentMood !== Mood.NORMAL) {
      setMood(chatId, Mood.NORMAL);
      logger.debug(
        { event: "mood_set_normal", hour: currentHour },
        "[DEBUG] Waktu sekarang siang."
      );
    } else if (currentHour === 17) {
      const randomMood = getRandomMood();
      if (currentMood !== randomMood) {
        setMood(chatId, randomMood);
        sendMessage(
          chatId,
          `Selamat sore, Tuan! Alya sedang merasa ${randomMood.name}. ${randomMood.emoji}`
        );
        logger.info(
          {
            event: "mood_set_random",
            hour: currentHour,
            mood: randomMood.name,
          },
          "Mood sore disetel secara acak."
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
        /(?:ulang tahun|ultah|lahir)(?:ku)?\s*(?:tanggal|pada)?\s*(\d{1,2}(?:\s+\w+)?(?:\s+\d{4})?)/i,
    },
    {
      key: "makananFavorit",
      regex:
        /(?:makanan|makanan favorit|makanan kesukaan|makanan yang aku suka)(?:ku)?\s*(?:adalah|itu|yaitu|:)\s*([^.!?]+)/i,
    },
    {
      key: "filmKesukaan",
      regex:
        /(?:film|film favorit|film kesukaan|film yang aku suka)(?:ku)?\s*(?:adalah|itu|yaitu|:)\s*([^.!?]+)/i,
    },
    {
      key: "musikKesukaan",
      regex:
        /(?:musik|lagu|musik favorit|musik kesukaan|musik yang aku suka|lagu favorit|lagu kesukaan|lagu yang aku suka)(?:ku)?\s*(?:adalah|itu|yaitu|:)\s*([^.!?]+)/i,
    },
    {
      key: "hobi",
      regex:
        /(?:hobi|hobiku|suka banget|senang melakukan|hobi)(?:ku)?\s*(?:adalah|itu|yaitu|:)\s*([^.!?]+)/i,
    },
    {
      key: "warnaFavorit",
      regex:
        /(?:warna|warna favorit|warna kesukaan|warna yang aku suka)(?:ku)?\s*(?:adalah|itu|yaitu|:)\s*([^.!?]+)/i,
    },
  ];

  let preferenceChanged = false; // Flag untuk menandai apakah ada preferensi yang disimpan/diperbarui
  for (const { key, regex } of preferencePatterns) {
    const match = normalizedText.match(regex);
    if (match && match[1]) {
      const value = match[1].trim();
      const oldValue = await memory.getPreference(key);
      if (oldValue !== value) {
        await memory.savePreference(key, value);
        globalState.loadedLongTermMemory[key] = value; // Perbarui cache LTM
        logger.info(
          { event: "preference_saved", key: key, value: value },
          `[LTM Save Success] Preferensi baru/diperbarui: ${key} = "${value}"`
        );
        preferenceChanged = true;
      } else {
        logger.debug(
          { event: "preference_skipped", key: key, value: value },
          `[LTM Skip] Preferensi ${key} sudah sama dengan nilai yang ada: "${value}"`
        );
      }
    }
  }
  return preferenceChanged; // Mengembalikan flag
};


// Global error handling for uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.fatal(
    { event: "uncaught_exception", error: err.message, stack: err.stack },
    "Critical Error: Uncaught Exception"
  );
  Sentry.captureException(err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal(
    { event: "unhandled_rejection", reason: reason, promise: promise },
    "Critical Error: Unhandled Rejection"
  );
  Sentry.captureException(reason);
});

module.exports = {
  USER_NAME,
  generateAIResponse,
  initAlyabot: (bot) => {
    setBotInstance(bot);
    const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

    logger.info(
      `🌸 AlyaBot v7.1 (Asisten Virtual) aktif untuk Tuan ${USER_NAME}!`
    );
    if (configuredChatId) {
      logger.info(
        `📬 Pesan terjadwal akan dikirim ke ID obrolan: ${configuredChatId}`
      );
    } else {
      logger.warn(
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
      await updateInteractionStatus(); // Memanggil fungsi updateInteractionStatus setiap ada pesan

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
        role: "user",
        content: text,
        from: senderInfo,
        chatId: chat.id,
        message_id: msg.message_id,
        date: msg.date,
        timestamp: new Date(msg.date * 1000).toISOString(),
        context: messageContext,
      };

      // Simpan pesan pengguna ke memori
      await memory.addMessage(userMessageToStore);

      logger.info(
        {
          event: "user_message_saved",
          chatId: chat.id,
          messageId: msg.message_id,
        },
        `Pesan pengguna disimpan ke memori dengan konteks.`
      );

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
          try {
            const weather = await getWeatherData();
            if (weather) {
              sendMessage(
                configuredChatId,
                `🌸 Cuaca hari ini:\n${getWeatherString(
                  weather
                )}\n${getWeatherReminder(weather)}`
              );
              logger.info(
                { event: "weather_report_sent", chatId: configuredChatId },
                "Laporan cuaca dikirim."
              );
            } else {
              sendMessage(
                configuredChatId,
                `Hmm... Alya sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`
              );
              logger.warn(
                { event: "weather_report_failed", chatId: configuredChatId },
                "Gagal mengambil data cuaca."
              );
            }
          } catch (error) {
            logger.error(
              {
                event: "scheduled_weather_error",
                error: error.message,
                stack: error.stack,
              },
              "Kesalahan saat penjadwalan cuaca:"
            );
            Sentry.captureException(error);
          }
        }
      );

      // Cek relasi setiap 7 jam
      schedule.scheduleJob({ rule: "0 */7 * * *" }, async () => {
        logger.info(
          { event: "relation_status_check_scheduled" },
          "Menjalankan pengecekan status relasi terjadwal..."
        );
        try {
          await relationState.checkWeeklyConversation();
        } catch (error) {
          logger.error(
            {
              event: "scheduled_relation_check_error",
              error: error.message,
              stack: error.stack,
            },
            "Kesalahan saat pengecekan relasi terjadwal:"
          );
          Sentry.captureException(error);
        }
      });

      // sad song recomendations
      schedule.scheduleJob({ rule: "0 22 * * *", tz: "Asia/Jakarta" }, () => {
        try {
          sendSadSongNotification(configuredChatId);
          logger.info(
            { event: "sad_song_notification_sent", chatId: configuredChatId },
            "Notifikasi lagu sedih dikirim."
          );
        } catch (error) {
          logger.error(
            {
              event: "scheduled_song_notification_error",
              error: error.message,
              stack: error.stack,
            },
            "Kesalahan saat penjadwalan notifikasi lagu sedih:"
          );
          Sentry.captureException(error);
        }
      });

      // berita & ringkasannya setiap jam 8 pagi
      schedule.scheduleJob(
        { rule: "0 8 * * *", tz: "Asia/Jakarta" },
        async () => {
          logger.info(
            { event: "daily_news_send_scheduled" },
            "[Core] Menjalankan pengiriman berita harian terjadwal..."
          );
          try {
            await newsManager.sendDailyNews(configuredChatId);
          } catch (error) {
            logger.error(
              {
                event: "scheduled_daily_news_error",
                error: error.message,
                stack: error.stack,
              },
              "Kesalahan saat penjadwalan berita harian:"
            );
            Sentry.captureException(error);
          }
        }
      );

      schedule.scheduleJob(
        { rule: "0 9 * * *", tz: "Asia/Jakarta" }, 
        async () => {
          logger.info(
            { event: "recall_memory_scheduled" },
            "[Core] Menjalankan fungsi ingat memori terjadwal..."
          );
          try {
            await recallMemory.recallRandomMemory(configuredChatId);
          } catch (error) {
            logger.error(
              {
                event: "scheduled_recall_memory_error",
                error: error.message,
                stack: error.stack,
              },
              "Kesalahan saat penjadwalan ingat memori:"
            );
            Sentry.captureException(error);
          }
        }
      );

      // Pembersihan cache dan memory (30 menit) - Note: WeakMap membersihkan secara otomatis
      setInterval(cleanupCacheAndMemory, CACHE_CLEANUP_INTERVAL_MS);
      logger.info(
        {
          event: "cache_cleanup_interval_set",
          intervalMinutes: CACHE_CLEANUP_MS / 1000 / 60,
        },
        `Pembersihan cache dan memori terjadwal setiap ${
          CACHE_CLEANUP_MS / 1000 / 60
        } menit.`
      );

      schedule.scheduleJob({ rule: "0 * * * *", tz: "Asia/Jakarta" }, () => {
        try {
          updateTimeBasedModes(configuredChatId);
        } catch (error) {
          logger.error(
            {
              event: "scheduled_time_modes_update_error",
              error: error.message,
              stack: error.stack,
            },
            "Kesalahan saat penjadwalan pembaruan mode berbasis waktu:"
          );
          Sentry.captureException(error);
        }
      });

      // Pembaruan ringkasan obrolan setiap jam
      schedule.scheduleJob(
        { rule: "0 * * * *", tz: "Asia/Jakarta" },
        updateChatSummary
      );

      // Penjadwalan untuk sistem Ngambek (setiap hari pukul 00:00)
      schedule.scheduleJob(
        { rule: "0 0 * * *", tz: "Asia/Jakarta" },
        async () => {
          logger.info(
            { event: "ngambek_status_check_scheduled" },
            "[Ngambek System] Memeriksa status ngambek Alya..."
          );
          try {
            await checkNgambekStatus(configuredChatId);
          } catch (error) {
            logger.error(
              {
                event: "scheduled_ngambek_check_error",
                error: error.message,
                stack: error.stack,
              },
              "Kesalahan saat penjadwalan pengecekan status ngambek:"
            );
            Sentry.captureException(error);
          }
        }
      );
      // Panggil sekali saat startup untuk memastikan status Ngambek yang benar
      checkNgambekStatus(configuredChatId);

      // check hari libur dan kirim notifikasi jika hari libur
      if (config.calendarificApiKey) {
        schedule.scheduleJob(
          { rule: "0 7 * * *", tz: "Asia/Jakarta" },
          async () => {
            try {
              await holidaysModule.checkAndNotifyDailyHolidays(
                config.calendarificApiKey,
                "ID",
                (message) => sendMessage(configuredChatId, message)
              );
              logger.info(
                { event: "daily_holiday_check_scheduled" },
                "Pengecekan hari libur harian dilakukan."
              );
            } catch (error) {
              logger.error(
                {
                  event: "scheduled_holiday_check_error",
                  error: error.message,
                  stack: error.stack,
                },
                "Kesalahan saat penjadwalan pengecekan hari libur:"
              );
              Sentry.captureException(error);
            }
          }
        );
      } else {
        logger.warn(
          "[Core] Calendarific API Key tidak ditemukan. Pemeriksaan hari libur dinonaktifkan."
        );
      }
      updateTimeBasedModes(configuredChatId);
    }

    // Tangani penutupan aplikasi untuk menutup database SQLite
    process.on("SIGINT", async () => {
      logger.info("SIGINT received. Closing database connection...");
      try {
        await memory.closeDb();
        process.exit(0);
      } catch (error) {
        logger.error(
          {
            event: "sigint_shutdown_error",
            error: error.message,
            stack: error.stack,
          },
          "Error closing DB on SIGINT:"
        );
        Sentry.captureException(error);
        process.exit(1); // Exit with error code if cleanup fails
      }
    });
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM received. Closing database connection...");
      try {
        await memory.closeDb();
        process.exit(0);
      } catch (error) {
        logger.error(
          {
            event: "sigterm_shutdown_error",
            error: error.message,
            stack: error.stack,
          },
          "Error closing DB on SIGTERM:"
        );
        Sentry.captureException(error);
        process.exit(1); // Exit with error code if cleanup fails
      }
    });
  },
};
