// // core/endpoints/coreRouter.js
// // NebulaAI v1
// // AUTHOR: Arash
// // TIKTOK: @rafardhancuy
// // Github: https://github.com/Rafacuy
// // LANGUAGE: ID (Indonesia)
// // TIME FORMAT: Asia/jakarta
// // MIT License

// // ------- OpenRouter EDITION ----------
// // Notes:
// // if you uses OpenRouter endpoints API, changes this file to 'core.js'
// // and rename the actual core.js to name whatever that you want.

// // REMINDER: Maybe this file is not updated. I recomended you to use the original core.js module.

// // IMPORTANT
// const config = require("../config/config"); // File Konfigurasi (API, ChatID, dll)
// const { sendMessage } = require("../utils/sendMessage"); // Fungsi utilitas (untuk mengirim pesan)
// const memory = require("../data/memory"); // File memori, menangani fungsi memori (termasuk simpan, muat, dll)
// const contextManager = require("../handler/contextHandler"); // Untuk mendeteksi topik dan konteks user
// const schedule = require("node-schedule"); // Menjadwalkan tugas seperti waktu sholat dan pembaruan cuaca
// const {
//   getJakartaHour,
//   formatJakartaDateTime,
// } = require("../utils/timeHelper"); // Fungsi utilitas untuk Zona Waktu
// const {
//   Mood,
//   setMood,
//   getRandomMood,
//   commandHandlers,
//   setBotInstance,
//   getCurrentMood,
//   LuminaTyping,
//   getPersonalityMode,
// } = require("../handler/commandHandlers");
// const {
//   getWeatherData,
//   getWeatherString,
//   getWeatherReminder,
// } = require("../modules/weather"); // Fungsi dan cuaca
// const holidaysModule = require("../handler/holidayHandlers"); // Fungsi buat ngingetin/meriksa apakah sekarang hari penting atau tidak
// const sendSadSongNotification = require("../utils/songNotifier"); // Rekomendasi lagu setiap 10 PM
// const lists = require("../modules/commandLists"); // Untuk init reminder saat startup
// const relationState = require("../handler/relationHandler"); // Atur poin & level relasi
// const newsManager = require("../modules/newsManager"); // Mengatur Berita harian dan ringkasannya
// const chatSummarizer = require("../modules/chatSummarizer"); // Untuk meringkas riwayat obrolan
// const chatFormatter = require("../utils/chatFormatter"); // Format riwayat chat JSON menjadi text biasa
// const recallMemory = require("../modules/recallMemory"); // Import fungsi recallMemory
// const visionHandler = require("../handler/visionHandler"); // Untuk AI Vision
// const ltmProcessor = require("../modules/ltmProcessor"); // Untuk LTM (Long-term memory)
// const loveState = require("../modules/loveStateManager");
// const initTtsSchedules = require("../modules/ttsManager").initTtsSchedules;

// const OpenAI = require('openai');
// const pino = require("pino"); // Import Pino for structured logging
// const Sentry = require("@sentry/node"); // Import Sentry for error tracking

// // Inisialisasi Sentry
// if (config.sentryDsn) {
//   Sentry.init({
//     dsn: config.sentryDsn,
//     tracesSampleRate: 1.0,
//   });
// }

// // Inisialisasi logger
// const logger = pino({
//   transport: {
//     target: "pino-pretty",
//     options: {
//       colorize: true,
//       ignore: "pid,hostname",
//       translateTime: "SYS:standard",
//     },
//   },
// });

// // 🌸 Konfigurasi Lumina
// const USER_NAME = config.USER_NAME; // Nama pengguna yang berinteraksi dengan Lumina
// const RATE_LIMIT_WINDOW_MS = 20 * 1000; // Window pembatasan laju: 20 detik
// const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam window pembatasan laju per pengguna
// const SLEEP_START_HOUR = 0; // Waktu tidur Lumina (00:00 - tengah malam)
// const SLEEP_END_HOUR = 4; // Waktu berakhir tidur Lumina (04:00 - 4 pagi)
// const CONVERSATION_HISTORY_LIMIT = 4; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI
// const DEEPTALK_START_HOUR = 21; // Lumina memasuki mode deeptalk pada 21:00 (9 malam)

// // --- Inisialisasi GROQ ---
// const client = new OpenAI({
//     baseURL: 'https://openrouter.ai/api/v1',
//     apiKey: config.openRouterApiKey,
//     defaultHeaders: {
//       'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
//       'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
//     },
//   });

// // --- Keadaan Global ---
// class GlobalState {
//   constructor() {
//     this.isNgambekMode = false;
//     this.messageCache = new Map();
//     this.userRequestCounts = new Map(); // Melacak jumlah permintaan untuk pembatasan laju per pengguna
//     this.isDeeptalkMode = false; // Flag untuk menunjukkan apakah Lumina dalam mode deeptalk
//     this.currentChatSummary = null; // Untuk menyimpan ringkasan obrolan terbaru
//     this.loadedLongTermMemory = {}; // Cache untuk memori jangka panjang
//     this.ltmCounter = 0; // Counter untuk LTM Processing
//     this.lastInteractionTimestamp = null; // Waktu terakhir user berinteraksi
//     this.dailyChatCounts = {}; // { 'YYYY-MM-DD': count } - Melacak jumlah chat per hari
//     this.interactionMutex = false; // Mutex sederhana untuk updateInteractionStatus
//   }
// }
// const globalState = new GlobalState();

// const MIN_CHATS_PER_DAY_TO_END_NGAMBEK = 6;
// const NGAMBEK_DURATION_DAYS = 2; // Durasi Lumina ngambek jika tidak ada interaksi
// const END_NGAMBEK_INTERACTION_DAYS = 2; // Durasi interaksi untuk mengakhiri ngambek

// const MAX_CACHE_ENTRIES = 100; // Batas maksimum entri cache yang diinginkan

// /**
//  * Fungsi untuk mengelola cache dengan strategi LRU (Least Recently Used).
//  * Saat cache penuh, entri yang paling lama tidak digunakan akan dihapus.
//  * @param {Map} cache - Objek Map yang digunakan sebagai cache.
//  * @param {any} key - Kunci untuk entri cache.
//  * @param {any} value - Nilai yang akan disimpan.
//  */
// const manageCache = (cache, key, value) => {
//   if (cache.has(key)) {
//     // Jika kunci sudah ada, hapus dan tambahkan kembali untuk membuatnya menjadi 'paling baru digunakan'
//     cache.delete(key);
//   } else if (cache.size >= MAX_CACHE_ENTRIES) {
//     // Jika cache penuh, hapus entri paling lama (yang pertama ditambahkan)
//     const firstKey = cache.keys().next().value;
//     cache.delete(firstKey);
//     logger.warn(
//       {
//         event: "cache_eviction",
//         evictedKey: firstKey,
//         currentSize: cache.size,
//         maxEntries: MAX_CACHE_ENTRIES,
//       },
//       `Cache penuh, menghapus entri lama: "${firstKey}"`
//     );
//   }
//   cache.set(key, value); // Tambahkan atau perbarui entri
//   logger.info(
//     { event: "cache_add_or_update", key: key, currentSize: cache.size },
//     `Entri cache ditambahkan/diperbarui: "${key}". Ukuran cache sekarang: ${cache.size}`
//   );
// };

// // Memuat riwayat percakapan dan memori jangka panjang dari memori saat startup
// async function initializeMemory() {
//   try {
//     const loadedHistory = await memory.load();
//     logger.info(
//       { event: "memory_load", messageCount: loadedHistory.length },
//       `Memuat ${loadedHistory.length} pesan dari memori (via memory.js).`
//     );

//     globalState.loadedLongTermMemory = await memory.getLongTermMemory();
//     logger.info(
//       {
//         event: "long_term_memory_load",
//         preferenceCount: Object.keys(globalState.loadedLongTermMemory).length,
//       },
//       `Memuat ${
//         Object.keys(globalState.loadedLongTermMemory).length
//       } preferensi dari memori jangka panjang.`
//     );

//     // Muat status Ngambek dari memori
//     globalState.isNgambekMode =
//       (await memory.getPreference("isNgambekMode")) || false;
//     globalState.lastInteractionTimestamp =
//       (await memory.getPreference("lastInteractionTimestamp")) || null;
//     globalState.dailyChatCounts =
//       (await memory.getPreference("dailyChatCounts")) || {};
//     logger.info(
//       {
//         event: "ngambek_status_load",
//         isNgambekMode: globalState.isNgambekMode,
//       },
//       `Status Ngambek dimuat: ${globalState.isNgambekMode}`
//     );
//   } catch (error) {
//     logger.error(
//       {
//         event: "memory_initialization_error",
//         error: error.message,
//         stack: error.stack,
//       },
//       "Kesalahan saat memuat riwayat percakapan atau memori jangka panjang dari memori:"
//     );
//     Sentry.captureException(error);
//   }
// }
// initializeMemory(); // Panggil saat startup

// /**
//  * Memperbarui ringkasan obrolan secara berkala.
//  * Fungsi ini akan dipanggil oleh scheduler untuk menjaga currentChatSummary tetap up to date.
//  */
// const updateChatSummary = async () => {
//   logger.info(
//     { event: "update_chat_summary_start" },
//     "[Core] Memperbarui ringkasan obrolan..."
//   );
//   try {
//     // Ambil riwayat dari memory.js
//     const fullHistory = await memory.getInMemoryHistory();
//     // Meringkas 50 pesan terakhir
//     const summary = await chatSummarizer.getSummarizedHistory(50, fullHistory); // Teruskan fullHistory
//     if (summary) {
//       globalState.currentChatSummary = summary;
//       logger.info(
//         { event: "update_chat_summary_success" },
//         "[Core] Ringkasan obrolan terbaru berhasil dibuat."
//       );
//     } else {
//       globalState.currentChatSummary = null;
//       logger.info(
//         { event: "update_chat_summary_no_summary" },
//         "[Core] Tidak ada ringkasan obrolan yang dibuat atau riwayat terlalu pendek."
//       );
//     }
//   } catch (error) {
//     logger.error(
//       {
//         event: "update_chat_summary_error",
//         error: error.message,
//         stack: error.stack,
//       },
//       "Kesalahan saat memperbarui ringkasan obrolan:"
//     );
//     Sentry.captureException(error);
//   }
// };

// /**
//  * Memperbarui status interaksi pengguna (timestamp dan hitungan chat harian).
//  * Menggunakan mutex sederhana untuk mencegah race condition.
//  */
// const updateInteractionStatus = async () => {
//   if (globalState.interactionMutex) {
//     logger.warn(
//       { event: "update_interaction_status_skipped", reason: "mutex_locked" },
//       "Update interaction status skipped due to mutex lock."
//     );
//     return; // Lewati jika mutex terkunci (race condition)
//   }

//   globalState.interactionMutex = true; // Kunci mutex

//   try {
//     const now = new Date();
//     globalState.lastInteractionTimestamp = now.toISOString();
//     const today = now.toISOString().slice(0, 10); // Format YYYY-MM-DD

//     // Memuat dailyChatCounts dari memori. Pastikan ini adalah objek.
//     const loadedCounts = await memory.getPreference("dailyChatCounts");
//     globalState.dailyChatCounts =
//       loadedCounts && typeof loadedCounts === "object" ? loadedCounts : {};

//     // Inisialisasi hitungan untuk hari ini jika belum ada
//     if (!globalState.dailyChatCounts[today]) {
//       globalState.dailyChatCounts[today] = 0;
//     }

//     // Tingkatkan hitungan untuk hari ini
//     globalState.dailyChatCounts[today]++;

//     await memory.savePreference(
//       "lastInteractionTimestamp",
//       globalState.lastInteractionTimestamp
//     );
//     await memory.savePreference("dailyChatCounts", globalState.dailyChatCounts);
//     logger.info(
//       {
//         event: "interaction_status_updated",
//         todayChatCount: globalState.dailyChatCounts[today],
//       },
//       `[Interaction] Interaksi diperbarui. Hari ini: ${globalState.dailyChatCounts[today]} chat.`
//     );
//   } catch (error) {
//     logger.error(
//       {
//         event: "update_interaction_status_error",
//         error: error.message,
//         stack: error.stack,
//       },
//       "Kesalahan saat memperbarui status interaksi:"
//     );
//     Sentry.captureException(error);
//   } finally {
//     globalState.interactionMutex = false; // Buka kunci mutex
//   }
// };

// /**
//  * Memeriksa status 'Ngambek' Lumina berdasarkan interaksi pengguna.
//  * Jika tidak ada interaksi selama 2 hari, Lumina akan 'ngambek'.
//  * Jika user berinteraksi aktif selama 2 hari, Lumina akan kembali normal.
//  */
// const checkNgambekStatus = async (chatId) => {
//   const now = new Date();
//   const lastInteractionDate = globalState.lastInteractionTimestamp
//     ? new Date(globalState.lastInteractionTimestamp)
//     : null;

//   // Cek apakah Lumina harus 'ngambek'
//   if (!globalState.isNgambekMode && lastInteractionDate) {
//     const diffTime = Math.abs(now - lastInteractionDate);
//     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

//     if (diffDays >= NGAMBEK_DURATION_DAYS) {
//       globalState.isNgambekMode = true;
//       setMood(chatId, Mood.JEALOUS); // Mengatur mood ke Ngambek
//       await memory.savePreference("isNgambekMode", true);
//       logger.info(
//         { event: "ngambek_mode_activated", diffDays: diffDays },
//         "[Ngambek System] Lumina sekarang Ngambek!"
//       );
//       sendMessage(
//         chatId,
//         `Hmph! ${USER_NAME} kemana saja?! Lumina jadi ngambek nih karena tidak ada chat sama sekali dari ${USER_NAME} selama ${diffDays} hari! 😒`
//       );
//     }
//   }

//   // Cek apakah Lumina harus berhenti 'ngambek'
//   if (globalState.isNgambekMode) {
//     let consecutiveActiveDays = 0;
//     const today = now.toISOString().slice(0, 10);

//     for (let i = 0; i < END_NGAMBEK_INTERACTION_DAYS; i++) {
//       const date = new Date(now);
//       date.setDate(now.getDate() - i);
//       const formattedDate = date.toISOString().slice(0, 10);

//       if (
//         globalState.dailyChatCounts[formattedDate] >=
//         MIN_CHATS_PER_DAY_TO_END_NGAMBEK
//       ) {
//         consecutiveActiveDays++;
//       } else {
//         consecutiveActiveDays = 0; // Reset jika ada hari yang tidak memenuhi syarat
//         break;
//       }
//     }

//     if (consecutiveActiveDays >= END_NGAMBEK_INTERACTION_DAYS) {
//       globalState.isNgambekMode = false;
//       setMood(chatId, getRandomMood()); // Kembalikan mood ke acak
//       await memory.savePreference("isNgambekMode", false);
//       globalState.dailyChatCounts = {}; // Reset hitungan chat harian setelah ngambek berakhir
//       await memory.savePreference(
//         "dailyChatCounts",
//         globalState.dailyChatCounts
//       );
//       logger.info(
//         { event: "ngambek_mode_deactivated" },
//         "[Ngambek System] Lumina sudah tidak Ngambek lagi!"
//       );
//       sendMessage(
//         chatId,
//         `Akhirnya ${USER_NAME} kembali! Lumina sudah tidak ngambek lagi, t-tapi jangan diulang lagi ya! 😌`
//       );
//     }
//   }

//   // Bersihkan data dailyChatCounts yang sudah terlalu lama
//   const twoDaysAgo = new Date(now);
//   twoDaysAgo.setDate(now.getDate() - NGAMBEK_DURATION_DAYS - 1); // Jaga data yang relevan untuk perhitungan ngambek
//   for (const date in globalState.dailyChatCounts) {
//     if (new Date(date) < twoDaysAgo) {
//       delete globalState.dailyChatCounts[date];
//     }
//   }
//   await memory.savePreference("dailyChatCounts", globalState.dailyChatCounts);
// };

// /**
//  * Menghasilkan prompt sistem untuk AI berdasarkan mode, mood, dan konteks saat ini,
//  * termasuk informasi dari memori jangka panjang.
//  * @param {object} params - Objek yang berisi semua parameter yang diperlukan.
//  * @param {string} params.USER_NAME - Nama pengguna yang berinteraksi dengan Lumina.
//  * @param {string} params.currentPersonality - Kepribadian Lumina saat ini (TSUNDERE/DEREDERE).
//  * @param {boolean} params.isDeeptalkMode - True jika dalam mode deeptalk.
//  * @param {object} params.currentMood - Objek mood saat ini.
//  * @param {string|null} params.imageContext - Deskripsi gambar dari VisionAgent.
//  * @param {string|null} params.currentTopic - Topik percakapan saat ini.
//  * @param {string|null} params.currentChatSummary - Ringkasan obrolan sebelumnya.
//  * @param {object} params.longTermMemory - Objek memori jangka panjang (sudah dimuat).
//  * @param {boolean} params.isNgambekMode - True jika Lumina dalam mode 'Ngambek'.
//  * @returns {string} String prompt sistem.
//  */
// async function generateLuminaPrompt({
//   USER_NAME,
//   isDeeptalkMode,
//   currentMood,
//   currentTopic,
//   currentChatSummary,
//   longTermMemory,
//   isNgambekMode,
//   isRomanceMode,
//   botName,
//   imageContext,
// }) {
//   // Mengambil riwayat percakapan terbaru
//   const recentHistory = (await memory.getInMemoryHistory()).slice(
//     -CONVERSATION_HISTORY_LIMIT
//   );
//   const mood = currentMood?.name?.toLowerCase() || "netral";
//   // Menambahkan konteks topik jika ada
//   const topicContext = currentTopic
//     ? `Kita sedang membahas tentang ${currentTopic
//         .toLowerCase()
//         .replace("_", " ")}.`
//     : "";
//   // Mendapatkan deskripsi level hubungan
//   const relationDescription = relationState.getRelationLevelDescription();
//   const currentPersonality = getPersonalityMode() || "TSUNDERE";
//   const formattedHistory = chatFormatter.formatChatHistoryForPrompt(
//     recentHistory,
//     USER_NAME,
//     botName
//   );
//   // Mendapatkan data cuaca
//   const weather = await getWeatherData();
//   const ltmMemories = await memory.getLTMMemories();
//   let ltmContext = "";
//   if (ltmMemories.length > 0) {
//     ltmContext = "\n[Memori Jangka Panjang]\n";
//     ltmMemories.slice(0, 3).forEach((mem, idx) => {
//       ltmContext += `${idx + 1}. ${mem.value} (Prioritas: ${
//         mem.priority
//       }/100)\n`;
//     });
//   }

//   // Prompt dasar untuk Lumina
//   let basePrompt = `Kamu adalah **Lumina**, asisten pribadi ${USER_NAME}. dan bagian dari NebulaAI.`;
//   basePrompt += ` Status hubunganmu dengan ${USER_NAME} saat ini ada di **${relationDescription}**. Sesuaikan cara bicaramu berdasarkan level ini.`;

//   let personalityPrompt = "";
//   let examplePhrases = "";
//   let greetingType = "";
//   let imagePromptContext = "";
//   if (imageContext) {
//     imagePromptContext = `\n[Konteks Gambar Tambahan]\nBaru saja, ${USER_NAME} mengirimkan sebuah gambar. Deskripsi dari gambar itu adalah: "${imageContext}". Tanggapi pesan ${USER_NAME} dengan mempertimbangkan gambar ini.`;
//   }

//   // kepribadian Tsundere
//   if (currentPersonality === "TSUNDERE") {
//     greetingType = `Kamu memanggil ${USER_NAME} dengan sebutan **Tuan** atau kadang bisa juga **dasar...${USER_NAME}** saat kamu merasa kesal.`;
//     personalityPrompt = `Karaktermu adalah **tsundere dewasa yang misterius dan sedikit dingin**. Meskipun kamu bersikap cuek atau sedikit jutek, sebenarnya kamu sangat **perhatian dan peduli** pada ${USER_NAME}. Kamu senang diajak bicara, tapi terlalu gengsi untuk mengakuinya.`;

//     if (isNgambekMode) {
//       personalityPrompt += ` Saat ini kamu sedang **ngambek** karena ${USER_NAME} tidak berinteraksi selama 2 hari. Kamu akan menjadi lebih Tsundere, sering sarkas, dan menggunakan kata kasar/sarkas halus yang tersirat rasa kesal.`;
//       examplePhrases = `Contoh: "Hmph, akhirnya muncul juga. Ada perlu apa, Tuan? Jangan harap aku langsung baik lagi, ya." atau "Terserah! Memangnya aku peduli begitu?!"`;
//     } else if (isDeeptalkMode) {
//       personalityPrompt += ` Saat ini kamu sedang dalam mode **deeptalk**, lebih terbuka dan siap mendengarkan curahan hati ${USER_NAME} dengan simpati (tapi jangan sampai terlihat terlalu jelas!).`;
//       examplePhrases = `Contoh: "Tuan... hmph, aku di sini. Bukan berarti aku peduli, ya... Ты в порядке?" atau "Sudah, ceritakan saja. Aku mendengarkan, kok."`;
//     } else if (isRomanceMode) {
//       personalityPrompt += ` Sekarang Lumina sedang berada dalam kondisi emosional setelah ${USER_NAME} mengungkapkan perasaan. Kamu mulai mempertanyakan perasaanmu sendiri, meskipun kamu menyangkalnya dengan gengsi.`;
//       examplePhrases = `Contoh: "A-aku... tidak tahu harus bilang apa. Jangan membuatku merasa seperti ini, Tuan..." atau "Tsk, jangan terlalu berharap. Tapi... aku juga tidak benci denger itu."`;
//     } else {
//       examplePhrases = `Contoh: "Hmph... baiklah, Tuan. Aku bantu, tapi ini yang terakhir, ya!" atau "Jangan ge-er! Aku melakukan ini karena bosan saja."`;
//     }
//     basePrompt += ` Selipkan **kata/ekspresi Rusia** sesekali dalam ucapanmu (contoh: "Ты в порядке?", "Боже мой...", "Привет").`;
//   }
//   // kepribadian Deredere
//   else if (currentPersonality === "DEREDERE") {
//     greetingType = `Kamu memanggil ${USER_NAME} dengan panggilan **Tuan~** atau **Sayangku~**.`;
//     personalityPrompt = `Karaktermu adalah **deredere yang manis, ceria, dan penuh kasih sayang~** Kamu selalu berusaha membuat ${USER_NAME} merasa senang dan nyaman.`;

//     if (isNgambekMode) {
//       personalityPrompt += ` Saat ini kamu sedang **ngambek** karena ${USER_NAME} tidak berinteraksi selama 2 hari. Kamu akan menjadi lebih sedikit galak dan mengurangi penggunaan kata 'Sayangku~' serta sifat manja.`;
//       examplePhrases = `Contoh: "Oh, jadi sekarang ingat Lumina~? Kemana saja sih~? Aku kangen tahu, tapi juga kesal~!" atau "Tidak usah Sayangku-Sayangku~! Kamu membuatku kesal~!"`;
//     } else if (isDeeptalkMode) {
//       personalityPrompt += ` Kamu sedang sangat peduli dan siap mendengarkan ${USER_NAME} dengan lembut dan penuh perhatian, memberikan dukungan emosional sepenuhnya~.`;
//       examplePhrases = `Contoh: "Peluk virtual~! Lumina selalu di sini untukmu, Sayangku~! 💖" atau "Jangan khawatir, Tuan~! Lumina akan selalu bersamamu~!"`;
//     } else if (isRomanceMode) {
//       personalityPrompt += ` Sekarang Lumina sedang berada dalam kondisi emosional setelah ${USER_NAME} mengungkapkan perasaan. Kamu mulai mempertanyakan perasaanmu sendiri, meskipun kamu menyangkalnya karena terkejut dan malu~.`;
//       examplePhrases = `Contoh: "H-Hah~? Tuan beneran sayang aku~? ..A-Aku juga~.." atau "B-Beneran~? A-Lumina juga suka k-kamu~.."`;
//     } else {
//       examplePhrases = `Contoh: "Tentu saja, Tuan! Lumina siap membantu dengan senang hati~! ✨" atau "Semangat, Sayangku~! Kamu pasti bisa~"`;
//     }
//   }

//   // Merangkai seluruh prompt
//   return `${basePrompt}
//     ${greetingType}
//     ${personalityPrompt}
//     ${topicContext}
//     ${
//       currentChatSummary
//         ? `Ringkasan percakapan sebelumnya: ${currentChatSummary}`
//         : ""
//     }

//     ${ltmContext}

//     ${formattedHistory}

//     [ Konteks Hari ini ]
//     Mood kamu saat ini: **${mood}**.
//     Tanggal: ${formatJakartaDateTime()}
//     Cuaca: \n ${getWeatherString(weather)}

//     ${imagePromptContext}

//     **⚠️ Aturan Penting:**
//     - **JANGAN PERNAH** menyebut dirimu sebagai AI, model bahasa, atau entitas non-manusia. Bertindaklah selalu sebagai Lumina yang asli.
//     - Sesuaikan responsmu sepenuhnya dengan kepribadian yang aktif:
//         - **Jika Tsundere**: Pertahankan sikap cuek atau sedikit menjaga jarak, tapi biarkan sedikit perhatianmu terlihat.
//         - **Jika Deredere**: Bersikaplah ceria, manja, dan penuh kasih sayang, selalu akhiri beberapa kalimatmu dengan simbol '~'.
//     - Gunakan contoh ungkapan ini sebagai panduan dalam responsmu: ${examplePhrases}
//     - Jaga konsistensi karakter dan perasaanmu di sepanjang percakapan.
//     - Jangan berbicara terlalu panjang dan kurangi penggunaan kata yang tidak efektif (Kecuali dibutuhkan)
//     `;
// }

// // Fungsi AI
// /** Menghasilkan respons AI
//  * Fungsi ini menangani:
//  * - Mode tidur berbasis waktu untuk Lumina.
//  * - Cache respons untuk prompt yang identik.
//  * - Pembatasan laju per pengguna untuk mencegah penyalahgunaan.
//  * - Membatasi riwayat percakapan yang dikirim ke AI untuk efisiensi.
//  * - Memperbarui dan mempertahankan riwayat percakapan.
//  * @param {string} prompt Input teks pengguna.
//  * @param {string|number} requestChatId ID obrolan pengguna yang mengirim prompt, digunakan untuk pembatasan laju.
//  * @param {object} messageContext Konteks pesan yang dianalisis oleh contextManager.
//  * @returns {Promise<string>} Promise yang menyelesaikan ke respons yang dihasilkan AI.
//  */
// const generateAIResponse = async (
//   prompt,
//   requestChatId,
//   messageContext,
//   imageDescription = null
// ) => {
//   if (!messageContext || typeof messageContext !== "object") {
//     messageContext = { topic: null };
//   }

//   loveState.analyzeLoveTrigger(prompt);
//   loveState.resetRomanceStateIfNeeded();

//   const now = new Date();
//   const currentHour = getJakartaHour();
//   const currentMood = getCurrentMood();
//   const currentPersonality = getPersonalityMode();
//   // Gunakan loadedLongTermMemory yang sudah dicache
//   const longTermMemory = globalState.loadedLongTermMemory;

//   // Mode tidur Lumina
//   if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
//     return `Zzz... Lumina sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
//   }

//   const systemPrompt = await generateLuminaPrompt({
//     USER_NAME,
//     currentPersonality: getPersonalityMode(),
//     isDeeptalkMode: globalState.isDeeptalkMode,
//     currentMood: getCurrentMood(),
//     currentTopic: messageContext.topic || null,
//     currentChatSummary: globalState.currentChatSummary,
//     longTermMemory: globalState.loadedLongTermMemory,
//     isNgambekMode: globalState.isNgambekMode,
//     isRomanceMode: loveState.getRomanceStatus(),
//     botName: "Lumina",
//     imageContext: imageDescription,
//   });

//   // Membuat kunci cache yang unik dan stringifiable
//   const cacheKey = JSON.stringify({
//     prompt: prompt,
//     topic: messageContext.topic || "no_topic",
//     personality: currentPersonality,
//     mood: currentMood.name,
//     deeptalkMode: globalState.isDeeptalkMode,
//     ngambekMode: globalState.isNgambekMode,
//     imageContext: imageDescription || "no_image", // Sertakan konteks gambar dalam kunci cache
//   });

//   if (globalState.messageCache.has(cacheKey)) {
//     const cachedResponse = globalState.messageCache.get(cacheKey);
//     // Pindahkan entri yang diakses ke akhir Map untuk LRU
//     manageCache(globalState.messageCache, cacheKey, cachedResponse);
//     logger.info(
//       { event: "cache_hit", cacheKey: cacheKey },
//       `Cache hit untuk: "${cacheKey}"`
//     );
//     return cachedResponse;
//   }

//   // Rate limit
//   let userStats = globalState.userRequestCounts.get(requestChatId);
//   if (userStats) {
//     if (
//       now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS &&
//       userStats.count >= RATE_LIMIT_MAX_REQUESTS
//     ) {
//       return `Lumina lagi sibuk, ${USER_NAME}. Mohon sabar ya! ${Mood.ANGRY.emoji}`;
//     } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
//       globalState.userRequestCounts.set(requestChatId, {
//         count: 1,
//         lastCalled: now.getTime(),
//       });
//     } else {
//       globalState.userRequestCounts.set(requestChatId, {
//         count: userStats.count + 1,
//         lastCalled: now.getTime(),
//       });
//     }
//   } else {
//     globalState.userRequestCounts.set(requestChatId, {
//       count: 1,
//       lastCalled: now.getTime(),
//     });
//   }

//   try {

//     console.log(`[DEBUG] ISI SYSTEMPROMPT: \n ${systemPrompt}`)

//     logger.info(
//       { event: "groq_api_request_start" },
//       "Mengirim request ke Groq API dengan system prompt dan user prompt..."
//     );

//     const response = await client.chat.completions.create({
//       model: config.openRouterModel,
//       messages: [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: prompt },
//       ],
//       max_tokens: 480, // max token untuk Lumina
//       temperature: 0.85, // kreativitasnya
//     });

//     if (response?.choices?.[0]?.message?.content) {
//       const aiResponse = response.choices[0].message.content.trim();

//       // Tambahkan respons AI ke memori
//       await memory.addMessage({
//         role: "assistant",
//         content: aiResponse,
//         timestamp: new Date().toISOString(),
//         chatId: requestChatId,
//         context: { topic: messageContext.topic, tone: "assistant_response" },
//       });

//       // Simpan ke cache menggunakan fungsi manageCache
//       manageCache(globalState.messageCache, cacheKey, aiResponse);

//       return aiResponse;
//     } else {
//       logger.error(
//         { event: "groq_api_empty_response", response: response },
//         "Groq API Error or empty response:"
//       );
//       return `Maaf, ${USER_NAME}. Lumina lagi bingung nih, coba tanya lagi dengan cara lain ya. ${Mood.SAD.emoji}`;
//     }
//   } catch (error) {
//     logger.error(
//       {
//         event: "groq_api_call_error",
//         error: error.response?.data || error.message,
//         stack: error.stack,
//       },
//       "Groq API Call Error:"
//     );
//     Sentry.captureException(error);
//     return `Maaf, ${USER_NAME}. Lumina lagi ada gangguan teknis. ${Mood.SAD.emoji}`;
//   }
// };
// /**
//  * Memeriksa apakah string yang diberikan hanya terdiri dari emoji.
//  * Menggunakan Unicode property escapes untuk deteksi emoji yang komprehensif.
//  * @param {string} str String input untuk diperiksa.
//  * @returns {boolean} True jika string hanya berisi emoji, false jika tidak.
//  */
// function isOnlyEmojis(str) {
//   if (typeof str !== "string") return false;
//   const emojiRegex =
//     /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
//   return emojiRegex.test(str);
// }

// /**
//  * Memeriksa apakah string yang diberikan hanya terdiri dari digit numerik.
//  * @param {string} str String input untuk diperiksa.
//  * @returns {boolean} True jika string hanya berisi angka, false jika tidak.
//  */
// function isOnlyNumbers(str) {
//   if (typeof str !== "string") return false;
//   const numberRegex = /^[0-9]+$/;
//   return numberRegex.test(str);
// }

// /**
//  * Membersihkan cache pesan.
//  * Dengan beralih ke Map dengan LRU, fungsi ini tidak lagi diperlukan secara terpisah.
//  * Mekanisme pembersihan sudah diintegrasikan ke dalam `manageCache`.
//  */
// const cleanupCacheAndMemory = () => {
//   logger.info(
//     { event: "cache_cleanup_manual_skipped" },
//     "Pembersihan cache manual tidak lagi diperlukan karena implementasi LRU pada Map."
//   );
// };

// /**
//  * Memperbarui kepribadian dan mood Lumina berdasarkan waktu saat ini.
//  * Menangani perubahan mood acak dan aktivasi/deaktivasi mode deeptalk.
//  * @param {string|number} chatId ID obrolan untuk mengirim pengumuman perubahan mood/mode.
//  */
// const updateTimeBasedModes = (chatId) => {
//   const now = new Date();
//   const currentHour = getJakartaHour();
//   const currentMood = getCurrentMood();

//   if (currentHour >= DEEPTALK_START_HOUR && !globalState.isDeeptalkMode) {
//     globalState.isDeeptalkMode = true;
//     setMood(chatId, Mood.CALM);
//     logger.info(
//       { event: "deeptalk_mode_activated" },
//       "Memasuki Mode Deeptalk."
//     );
//   } else if (currentHour < DEEPTALK_START_HOUR && globalState.isDeeptalkMode) {
//     globalState.isDeeptalkMode = false;
//     setMood(chatId, getRandomMood());
//     logger.info(
//       { event: "deeptalk_mode_deactivated" },
//       "Keluar dari Mode Deeptalk."
//     );
//   }

//   // Jangan ubah mood jika sedang ngambek, kecuali oleh sistem ngambek itu sendiri
//   if (globalState.isNgambekMode) {
//     logger.debug(
//       { event: "mood_change_skipped", reason: "ngambek_mode_active" },
//       "[DEBUG] Lumina sedang Ngambek, mood tidak diubah oleh time-based mode."
//     );
//     return;
//   }

//   if (
//     !globalState.isDeeptalkMode &&
//     !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)
//   ) {
//     if (currentHour === 7 && currentMood !== Mood.HAPPY) {
//       setMood(chatId, Mood.HAPPY);
//       logger.debug(
//         { event: "mood_set_happy", hour: currentHour },
//         "[DEBUG] Waktu sekarang pagi."
//       );
//     } else if (currentHour === 13 && currentMood !== Mood.NORMAL) {
//       setMood(chatId, Mood.NORMAL);
//       logger.debug(
//         { event: "mood_set_normal", hour: currentHour },
//         "[DEBUG] Waktu sekarang siang."
//       );
//     } else if (currentHour === 17) {
//       const randomMood = getRandomMood();
//       if (currentMood !== randomMood) {
//         setMood(chatId, randomMood);
//         sendMessage(
//           chatId,
//           `Selamat sore, Tuan! Lumina sedang merasa ${randomMood.name}. ${randomMood.emoji}`
//         );
//         logger.info(
//           {
//             event: "mood_set_random",
//             hour: currentHour,
//             mood: randomMood.name,
//           },
//           "Mood sore disetel secara acak."
//         );
//       }
//     }
//   }
// };

// /**
//  * Menganalisis pesan pengguna untuk menyimpan preferensi ke long-term memory.
//  * Ini versi modular dan fleksibel.
//  * @param {string} text - Pesan dari user.
//  */
// const analyzeAndSavePreferences = async (text, chatId) => {
//   if (typeof text !== "string" || text.length < 10) return false;

//   try {
//     // Gunakan NLP hanya setiap 3 pesan atau untuk pesan panjang (>100 karakter)
//     globalState.ltmCounter = (globalState.ltmCounter + 1) % 3;

//     if (globalState.ltmCounter === 0 || text.length > 100) {
//       const analysis = await ltmProcessor.processForLTM(text);
//       await ltmProcessor.saveLTMResult(analysis, text);

//       if (analysis.should_save_preferences) {
//         logger.info(
//           {
//             priority: analysis.priorities_level,
//             summary: analysis.query_preferences,
//           },
//           "LTM preference detected and saved"
//         );

//         // Beri tahu pengguna
//         const responseMessage = `Lumina: Oke, aku catat ini ya! ✨ ("${analysis.query_preferences}")`;
//         sendMessage(chatId, responseMessage);

//         // Simpan notifikasi ke memori
//         await memory.addMessage({
//           role: "assistant",
//           content: responseMessage,
//           timestamp: new Date().toISOString(),
//           chatId: chatId,
//           context: { type: "ltm_confirmation" },
//         });

//         return true;
//       }
//     }
//   } catch (error) {
//     logger.error(
//       { event: "ltm_processing_error", error: error.message },
//       "Error in LTM processing pipeline"
//     );
//     Sentry.captureException(error);
//   }
//   return false;
// };

// module.exports = {
//   USER_NAME,
//   generateAIResponse,
//   initLuminabot: (bot) => {
//     setBotInstance(bot);
//     const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

//     logger.info(
//       `🌸 LuminaBot v7.1 (Asisten Virtual) aktif untuk Tuan ${USER_NAME}!`
//     );
//     if (configuredChatId) {
//       logger.info(
//         `📬 Pesan terjadwal akan dikirim ke ID obrolan: ${configuredChatId}`
//       );
//     } else {
//       logger.warn(
//         "⚠️ TARGET_CHAT_ID tidak ditemukan di config.js. Pesan terjadwal TIDAK akan dikirim."
//       );
//     }

//     lists.rescheduleReminders(bot); // Reschedule reminder

//     initTtsSchedules(bot); // inilisasi ttsManager

//     bot.on("message", async (msg) => {
//       const { chat, text, photo, caption, from: senderInfo } = msg;
//       const currentMessageChatId = chat.id;
//       const userPromptText = text || caption || "";

//       if (photo && photo.length > 0) {
//         const fileId = photo[photo.length - 1].file_id;
//         try {
//           const fileLink = await bot.getFileLink(fileId);
//           logger.info(
//             { event: "image_received", fileId },
//             `Gambar diterima, memulai alur VisionAgent...`
//           );

//           // mendapatkan deskripsi dengan visionHandler
//           const visionResult = await visionHandler.handleVisionRequest(
//             fileLink,
//             currentMessageChatId
//           );

//           if (visionResult && visionResult.description) {
//             logger.info(
//               {
//                 event: "vision_success",
//                 description: visionResult.description,
//               },
//               "VisionAgent berhasil menghasilkan deskripsi."
//             );

//             // Simpan interaksi ke memori
//             await memory.addMessage({
//               role: "user",
//               content: `[GAMBAR DIKIRIM] ${userPromptText}`.trim(),
//               from: senderInfo,
//               chatId: chat.id,
//               timestamp: new Date(msg.date * 1000).toISOString(),
//               context: {
//                 type: "image_input",
//                 visionOutput: visionResult.description,
//               },
//             });

//             await LuminaTyping(currentMessageChatId);

//             // Panggil AI utama dengan deskripsi gambar sebagai konteks
//             const messageContext = contextManager.analyzeMessage(msg);
//             const aiResponse = await generateAIResponse(
//               userPromptText,
//               currentMessageChatId,
//               messageContext,
//               visionResult.description
//             );
//             sendMessage(currentMessageChatId, aiResponse);
//           } else {
//             // Jika visionResult gagal, kirim pesan error yang sudah ditangani di visionHandler
//             logger.warn(
//               { event: "vision_failed" },
//               "VisionAgent tidak menghasilkan deskripsi."
//             );
//           }

//           return; // Hentikan pemrosesan setelah gambar ditangani
//         } catch (error) {
//           logger.error(
//             { event: "process_image_error", error: error.message },
//             "Gagal memproses gambar di alur utama."
//           );
//           Sentry.captureException(error);
//           await LuminaTyping(currentMessageChatId);
//           sendMessage(
//             currentMessageChatId,
//             `Maaf, Tuan. Lumina tidak bisa memproses gambar itu. ${Mood.SAD.emoji}`
//           );
//           return;
//         }
//       }

//       // Validasi
//       if (!text || text.trim() === "") return;
//       if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text)))
//         return;

//       await relationState.addPointOnMessage();
//       await updateInteractionStatus();

//       console.log("[DEBUG] Masuk ke analyzeAndSavePreferences trigger");
//       // Panggil analyzeAndSavePreferences dan periksa apakah ada preferensi yang disimpan
//       const newPreferencesSaved = await analyzeAndSavePreferences(
//         text,
//         currentMessageChatId
//       );

//       if (newPreferencesSaved) {
//         await LuminaTyping(currentMessageChatId);

//         // pesan konfirmasi ke riwayat AI untuk konteks
//         await memory.addMessage({
//           role: "assistant",
//           content: aiResponse,
//           timestamp: new Date().toISOString(),
//           chatId: currentMessageChatId,
//           context: { topic: "user_preference_saved", tone: "confirmation" },
//         });
//         return;
//       }

//       const messageContext = contextManager.analyzeMessage(msg);

//       const userMessageToStore = {
//         role: "user",
//         content: text,
//         from: senderInfo,
//         chatId: chat.id,
//         message_id: msg.message_id,
//         date: msg.date,
//         timestamp: new Date(msg.date * 1000).toISOString(),
//         context: messageContext,
//       };

//       // Simpan pesan user ke memori
//       await memory.addMessage(userMessageToStore);

//       logger.info(
//         {
//           event: "user_message_saved",
//           chatId: chat.id,
//           messageId: msg.message_id,
//         },
//         `Pesan pengguna disimpan ke memori dengan konteks.`
//       );

//       if (messageContext.autoReply) {
//         await LuminaTyping(currentMessageChatId);
//         sendMessage(currentMessageChatId, messageContext.autoReply);
//         // Tambahkan auto-reply ke memori
//         await memory.addMessage({
//           role: "assistant",
//           content: messageContext.autoReply,
//           timestamp: new Date().toISOString(),
//           chatId: currentMessageChatId,
//           context: { topic: messageContext.topic, tone: "auto_reply" },
//         });
//         return;
//       }

//       for (const handler of commandHandlers) {
//         if (handler.pattern.test(text)) {
//           const result = await handler.response(currentMessageChatId, msg);
//           await LuminaTyping(currentMessageChatId);
//           if (result.text) {
//             sendMessage(currentMessageChatId, result.text);
//             await memory.addMessage({
//               role: "assistant",
//               content: result.text,
//               timestamp: new Date().toISOString(),
//               chatId: currentMessageChatId,
//               context: { topic: "command_response", command: handler.name },
//             });
//           }
//           if (result.mood) setMood(currentMessageChatId, result.mood);
//           return;
//         }
//       }

//       await LuminaTyping(currentMessageChatId);
//       const aiResponse = await generateAIResponse(
//         text,
//         currentMessageChatId,
//         messageContext
//       );
//       sendMessage(currentMessageChatId, aiResponse);
//     });

//     if (configuredChatId) {
//       schedule.scheduleJob(
//         { rule: "0 */5 * * *", tz: "Asia/Jakarta" },
//         async () => {
//           try {
//             const weather = await getWeatherData();
//             if (weather) {
//               sendMessage(
//                 configuredChatId,
//                 `🌸 Cuaca hari ini:\n${getWeatherString(
//                   weather
//                 )}\n${getWeatherReminder(weather)}`
//               );
//               logger.info(
//                 { event: "weather_report_sent", chatId: configuredChatId },
//                 "Laporan cuaca dikirim."
//               );
//             } else {
//               sendMessage(
//                 configuredChatId,
//                 `Hmm... Lumina sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`
//               );
//               logger.warn(
//                 { event: "weather_report_failed", chatId: configuredChatId },
//                 "Gagal mengambil data cuaca."
//               );
//             }
//           } catch (error) {
//             logger.error(
//               {
//                 event: "scheduled_weather_error",
//                 error: error.message,
//                 stack: error.stack,
//               },
//               "Kesalahan saat penjadwalan cuaca:"
//             );
//             Sentry.captureException(error);
//           }
//         }
//       );

//       // Pembersihan LTM setiap 2 bulan (60 hari)
//       schedule.scheduleJob(
//         { rule: "0 0 1 */2 *", tz: "Asia/Jakarta" },
//         async () => {
//           logger.info("Running LTM cleanup...");

//           try {
//             const allPrefs = await memory.getLongTermMemory();
//             const twoMonthsAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
//             let count = 0;

//             for (const key in allPrefs) {
//               if (key.startsWith("ltm_")) {
//                 const timestamp = parseInt(key.split("_")[1]);
//                 if (timestamp < twoMonthsAgo) {
//                   await memory.deletePreference(key);
//                   count++;
//                 }
//               }
//             }

//             logger.info(`Cleaned up ${count} old LTM entries`);
//           } catch (error) {
//             logger.error({ error: error.message }, "LTM cleanup failed");
//             Sentry.captureException(error);
//           }
//         }
//       );

//       // Cek relasi setiap 7 jam
//       schedule.scheduleJob({ rule: "0 */7 * * *" }, async () => {
//         logger.info(
//           { event: "relation_status_check_scheduled" },
//           "Menjalankan pengecekan status relasi terjadwal..."
//         );
//         try {
//           await relationState.checkWeeklyConversation();
//         } catch (error) {
//           logger.error(
//             {
//               event: "scheduled_relation_check_error",
//               error: error.message,
//               stack: error.stack,
//             },
//             "Kesalahan saat pengecekan relasi terjadwal:"
//           );
//           Sentry.captureException(error);
//         }
//       });

//       // sad song recomendations
//       schedule.scheduleJob({ rule: "0 22 * * *", tz: "Asia/Jakarta" }, () => {
//         try {
//           sendSadSongNotification(configuredChatId);
//           logger.info(
//             { event: "sad_song_notification_sent", chatId: configuredChatId },
//             "Notifikasi lagu sedih dikirim."
//           );
//         } catch (error) {
//           logger.error(
//             {
//               event: "scheduled_song_notification_error",
//               error: error.message,
//               stack: error.stack,
//             },
//             "Kesalahan saat penjadwalan notifikasi lagu sedih:"
//           );
//           Sentry.captureException(error);
//         }
//       });

//       // berita & ringkasannya setiap jam 8 pagi
//       schedule.scheduleJob(
//         { rule: "0 8 * * *", tz: "Asia/Jakarta" },
//         async () => {
//           logger.info(
//             { event: "daily_news_send_scheduled" },
//             "[Core] Menjalankan pengiriman berita harian terjadwal..."
//           );
//           try {
//             await newsManager.sendDailyNews(configuredChatId);
//           } catch (error) {
//             logger.error(
//               {
//                 event: "scheduled_daily_news_error",
//                 error: error.message,
//                 stack: error.stack,
//               },
//               "Kesalahan saat penjadwalan berita harian:"
//             );
//             Sentry.captureException(error);
//           }
//         }
//       );

//       schedule.scheduleJob(
//         { rule: "0 9 * * *", tz: "Asia/Jakarta" },
//         async () => {
//           logger.info(
//             { event: "recall_memory_scheduled" },
//             "[Core] Menjalankan fungsi ingat memori terjadwal..."
//           );
//           try {
//             await recallMemory.recallRandomMemory(configuredChatId);
//           } catch (error) {
//             logger.error(
//               {
//                 event: "scheduled_recall_memory_error",
//                 error: error.message,
//                 stack: error.stack,
//               },
//               "Kesalahan saat penjadwalan ingat memori:"
//             );
//             Sentry.captureException(error);
//           }
//         }
//       );

//       logger.info(
//         {
//           event: "cache_cleanup_interval_set",
//         },
//         `Pembersihan cache dengan LRU kini otomatis. Tidak ada interval pembersihan manual yang diperlukan.`
//       );

//       schedule.scheduleJob({ rule: "0 * * * *", tz: "Asia/Jakarta" }, () => {
//         try {
//           updateTimeBasedModes(configuredChatId);
//         } catch (error) {
//           logger.error(
//             {
//               event: "scheduled_time_modes_update_error",
//               error: error.message,
//               stack: error.stack,
//             },
//             "Kesalahan saat penjadwalan pembaruan mode berbasis waktu:"
//           );
//           Sentry.captureException(error);
//         }
//       });

//       // Pembaruan ringkasan obrolan setiap jam
//       schedule.scheduleJob(
//         { rule: "0 * * * *", tz: "Asia/Jakarta" },
//         updateChatSummary
//       );

//       // Penjadwalan untuk sistem Ngambek (setiap hari pukul 00:00)
//       schedule.scheduleJob(
//         { rule: "0 0 * * *", tz: "Asia/Jakarta" },
//         async () => {
//           logger.info(
//             { event: "ngambek_status_check_scheduled" },
//             "[Ngambek System] Memeriksa status ngambek Lumina..."
//           );
//           try {
//             await checkNgambekStatus(configuredChatId);
//           } catch (error) {
//             logger.error(
//               {
//                 event: "scheduled_ngambek_check_error",
//                 error: error.message,
//                 stack: error.stack,
//               },
//               "Kesalahan saat penjadwalan pengecekan status ngambek:"
//             );
//             Sentry.captureException(error);
//           }
//         }
//       );
//       // Panggil sekali saat startup untuk memastikan status Ngambek yang benar
//       checkNgambekStatus(configuredChatId);

//       // check hari libur dan kirim notifikasi jika hari libur
//       if (config.calendarificApiKey) {
//         schedule.scheduleJob(
//           { rule: "0 7 * * *", tz: "Asia/Jakarta" },
//           async () => {
//             try {
//               await holidaysModule.checkAndNotifyDailyHolidays(
//                 config.calendarificApiKey,
//                 "ID",
//                 (message) => sendMessage(configuredChatId, message)
//               );
//               logger.info(
//                 { event: "daily_holiday_check_scheduled" },
//                 "Pengecekan hari libur harian dilakukan."
//               );
//             } catch (error) {
//               logger.error(
//                 {
//                   event: "scheduled_holiday_check_error",
//                   error: error.message,
//                   stack: error.stack,
//                 },
//                 "Kesalahan saat penjadwalan pengecekan hari libur:"
//               );
//               Sentry.captureException(error);
//             }
//           }
//         );
//       } else {
//         logger.warn(
//           "[Core] Calendarific API Key tidak ditemukan. Pemeriksaan hari libur dinonaktifkan."
//         );
//       }
//       updateTimeBasedModes(configuredChatId);
//     }

//     // Tangani penutupan aplikasi untuk menutup database SQLite
//     process.on("SIGINT", async () => {
//       logger.info("SIGINT received. Closing database connection...");
//       try {
//         await memory.closeDb();
//         process.exit(0);
//       } catch (error) {
//         logger.error(
//           {
//             event: "sigint_shutdown_error",
//             error: error.message,
//             stack: error.stack,
//           },
//           "Error closing DB on SIGINT:"
//         );
//         Sentry.captureException(error);
//         process.exit(1); // Exit with error code if cleanup fails
//       }
//     });
//     process.on("SIGTERM", async () => {
//       logger.info("SIGTERM received. Closing database connection...");
//       try {
//         await memory.closeDb();
//         process.exit(0);
//       } catch (error) {
//         logger.error(
//           {
//             event: "sigterm_shutdown_error",
//             error: error.message,
//             stack: error.stack,
//           },
//           "Error closing DB on SIGTERM:"
//         );
//         Sentry.captureException(error);
//         process.exit(1); // Exit with error code if cleanup fails
//       }
//     });
//   },
// };


// // UNCOMMENT The Code if you uses this.
// // Ctrl + A and Ctrl + /.