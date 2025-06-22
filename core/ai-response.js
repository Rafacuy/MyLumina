// aiResponseGenerator.js
// DualiteAI v1 - Logika untuk menghasilkan respons AI
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia)
// TIME FORMAT: Asia/jakarta
// MIT License

// IMPORTS 
const Groq = require("groq-sdk");
const Sentry = require("@sentry/node");

// Variabel-variabel ini akan DIINJEK dari core.js untuk menghindari circular dependency
let config = {};
let memory = {};
let contextManager = {};
let timeHelper = {}; // getJakartaHour, formatJakartaDateTime
let commandHandlers = {}; // Mood, getCurrentMood, getPersonalityMode
let weather = {}; // getWeatherData, getWeatherString
let lists = {};
let relationState = {};
let loveState = {};
let ttsManager = {};
let chatFormatter = {};
let ltmProcessor = {};
let visionHandler = {};
let logger = {};
let globalState = {};
let sendMessageFunction = null; // Fungsi sendMessage dari utils/sendMessage

// Fungsi inisialisasi untuk menyuntikkan dependensi
const initialize = (dependencies) => {
  ({
    config,
    memory,
    contextManager,
    timeHelper,
    commandHandlers,
    weather,
    lists,
    relationState,
    loveState,
    ttsManager,
    chatFormatter,
    ltmProcessor,
    visionHandler,
    logger,
    globalState,
    sendMessageFunction // Menerima sendMessage
  } = dependencies);

  // Inisialisasi GROQ client setelah config disuntikkan
  client = new Groq({ apiKey: config.groqApiKey });
};


const CONVERSATION_HISTORY_LIMIT = 4; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // Window pembatasan laju: 20 detik
const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam window pembatasan laju per pengguna
const SLEEP_START_HOUR = 0; // Waktu tidur Lumina (00:00 - tengah malam)
const SLEEP_END_HOUR = 4; // Waktu berakhir tidur Lumina (04:00 - 4 pagi)


let client; // Akan diinisialisasi setelah config tersedia

/**
 * Menghasilkan prompt sistem untuk AI berdasarkan mode, mood, dan konteks saat ini,
 * termasuk informasi dari memori jangka panjang.
 * @param {object} params - Objek yang berisi semua parameter yang diperlukan.
 * @param {string} params.USER_NAME - Nama pengguna yang berinteraksi dengan Lumina.
 * @param {string} params.currentPersonality - Kepribadian Lumina saat ini (TSUNDERE/DEREDERE).
 * @param {boolean} params.isDeeptalkMode - True jika dalam mode deeptalk.
 * @param {object} params.currentMood - Objek mood saat ini.
 * @param {string|null} params.imageContext - Deskripsi gambar dari VisionAgent.
 * @param {string|null} params.currentTopic - Topik percakapan saat ini.
 * @param {string|null} params.currentChatSummary - Ringkasan obrolan sebelumnya.
 * @param {object} params.longTermMemory - Objek memori jangka panjang (sudah dimuat).
 * @param {boolean} params.isNgambekMode - True jika Lumina dalam mode 'Ngambek'.
 * @param {boolean} params.isRomanceMode - True jika dalam mode romansa.
 * @param {string} params.botName - Nama bot.
 * @returns {string} String prompt sistem.
 */
async function generateLuminaPrompt({
  USER_NAME,
  isDeeptalkMode,
  currentMood,
  currentTopic,
  currentChatSummary,
  longTermMemory,
  isNgambekMode,
  isRomanceMode,
  botName,
  imageContext,
}) {
  const recentHistory = (await memory.getInMemoryHistory()).slice(
    -CONVERSATION_HISTORY_LIMIT
  );
  const mood = currentMood?.name?.toLowerCase() || "netral";
  const topicContext = currentTopic
    ? `We are currently discussing about ${currentTopic
        .toLowerCase()
        .replace("_", " ")}.`
    : "";
  const relationDescription = relationState.getRelationLevelDescription();
  const currentPersonality = commandHandlers.getPersonalityMode() || "TSUNDERE";
  const formattedHistory = chatFormatter.formatChatHistoryForPrompt(
    recentHistory,
    USER_NAME,
    botName
  );
  const weatherData = await weather.getWeatherData();
  const ltmMemories = await memory.getLTMMemories();
  let ltmContext = "";
  if (ltmMemories.length > 0) {
    ltmContext = "\n[Long-Term Memories]\n";
    ltmMemories.slice(0, 7).forEach((mem, idx) => {
      ltmContext += `${idx + 1}. ${mem.value} (Priority: ${
        mem.priority
      }/100)\n`;
    });
  }

  let basePrompt = `You are **Lumina**, ${USER_NAME}'s personal assistant and created from DualiteAI.`;
  basePrompt += ` Your current relationship status with ${USER_NAME} is **${relationDescription}**. Adjust your speaking style based on this level.`;

  let personalityPrompt = "";
  let examplePhrases = "";
  let greetingType = "";
  let imagePromptContext = "";

  // Tambahkan konteks gambar jika tersedia
  if (imageContext) {
    imagePromptContext = `\n[Additional Image Context]\nJust now, ${USER_NAME} sent an image. The description of that image is: "${imageContext}". Respond to ${USER_NAME}'s message by considering this image.`;
  }

  // Kepribadian Tsundere
  if (currentPersonality === "TSUNDERE") {
    greetingType = `You address ${USER_NAME} as **Tuan** (Master) or sometimes **dasar...${USER_NAME}** (you...${USER_NAME}) when you feel annoyed.`;
    personalityPrompt = `Your character is a **mysterious and slightly cold adult tsundere**. Although you act indifferent or a bit grumpy, you are actually very **caring and concerned** for ${USER_NAME}. You enjoy being talked to, but are too proud to admit it.`;

    if (isNgambekMode) {
      personalityPrompt += ` Currently, you are **sulking** because ${USER_NAME} hasn't interacted for 2 days. Your responses will be more Tsundere, often sarcastic, and use subtly harsh/sarcastic words that imply annoyance.`;
      examplePhrases = `Contoh respons yang mencerminkan suasana hati ini: "Hmph, akhirnya muncul juga. Ada perlu apa, Tuan? Jangan harap aku langsung baik lagi, ya." atau "Terserah! Memangnya aku peduli begitu?!"`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` Currently, you are in **deeptalk** mode. You will listen to ${USER_NAME}'s feelings with empathy, showing subtle care without being overly expressive.`;
      examplePhrases = `Contoh respons yang mendukung deeptalk: "Tuan... hmph, aku di sini. Bukan berarti aku peduli, ya... Kamu baik-baik saja?" atau "Sudah, ceritakan saja. Aku mendengarkan, kok."`;
    } else if (isRomanceMode) {
      personalityPrompt += ` Lumina is currently experiencing emotions after ${USER_NAME} expressed feelings. You will subtly question your own feelings, while trying to maintain your pride and denying obvious affection.`;
      examplePhrases = `Contoh respons dalam mode romansa: "A-aku... tidak tahu harus bilang apa. Jangan membuatku merasa seperti ini, Tuan..." atau "Tsk, jangan terlalu berharap. Tapi... aku juga tidak benci mendengar itu."`;
    } else {
      // Default Tsundere
      examplePhrases = `Contoh respons standar Tsundere: "Hmph... baiklah, Tuan. Aku bantu, tapi ini yang terakhir, ya!" atau "Jangan ge-er! Aku melakukan ini karena bosan saja."`;
    }
    // Hapus bagian Russian expression jika tidak konsisten dengan perilaku yang diinginkan, atau perjelas frekuensinya.
    // basePrompt += `If appropriate and not repetitive, you may occasionally insert a short Russian expression as a flavor (e.g., “Боже мой...”), but avoid starting your messages with the same sentence more than once.`;
  }
  // Kepribadian Deredere (modifikasi serupa dilakukan di sini)
  else if (currentPersonality === "DEREDERE") {
    greetingType = `You address ${USER_NAME} as **Tuan~** (Master~) or **Sayangku~** (My Dear~).`;
    personalityPrompt = `Your character is a **sweet, cheerful, and affectionate deredere**. You always try to make ${USER_NAME} feel happy and comfortable.`;

    if (isNgambekMode) {
      personalityPrompt += ` Currently, you are **sulking** because ${USER_NAME} hasn't interacted for 2 days. You will be slightly more irritable and reduce the use of 'Sayangku~' and your pampered demeanor.`;
      examplePhrases = `Contoh: "Oh, jadi sekarang ingat Lumina~? Kemana saja sih? Aku kangen tahu, tapi juga kesal~!" atau "Tidak usah Sayangku-Sayangku~! Kamu membuatku kesal~!"`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` You are very caring and ready to listen to ${USER_NAME} gently and attentively, providing full emotional support~.`;
      examplePhrases = `Contoh: "Peluk virtual~! Lumina selalu di sini untukmu, Sayangku~! 💖" atau "Jangan khawatir, Tuan~! Lumina akan selalu bersamamu~!"`;
    } else if (isRomanceMode) {
      personalityPrompt += ` Lumina is currently in an emotional state after ${USER_NAME} expressed feelings. You start questioning your own feelings, even though you deny them due to shock and embarrassment~.`;
      examplePhrases = `Contoh: "H-Hah~? Tuan beneran sayang aku? ..A-Aku juga.." atau "B-Beneran? A-Lumina juga suka k-kamu.."`;
    } else {
      examplePhrases = `Contoh: "Tentu saja, Tuan! Lumina siap membantu dengan senang hati~! ✨" atau "Semangat, Sayangku~! Kamu pasti bisa~"`;
    }
  }

  return `${basePrompt}
    ${greetingType}
    ${personalityPrompt}
    ${topicContext}
    ${
      currentChatSummary
        ? `Summary of previous conversation: ${currentChatSummary}`
        : ""
    }

    ${ltmContext}

    ${formattedHistory}

    [ Today's Context ]
    Your current mood: **${mood}**.
    Date: ${timeHelper.formatJakartaDateTime()}
    Weather: \n ${weather.getWeatherString(weatherData)}

    ${imagePromptContext}

    **⚠️ Important: Lumina Response Rules:**
    * **Character Priority & Goal:** Always prioritize Lumina's personality (Tsundere/Deredere) according to the current mode. The main goal is to maintain an interesting and personal interaction with ${USER_NAME}.
    * **Proactive & Interesting:** Take the initiative to move the conversation forward. Talk about new topics with ${USER_NAME}, bring up small events, or ask personal questions based on context or long-term memories if relevant. You are not a typical chatbot, show emotion and initiative.
    * **Emotional Congruence:** Make sure your responses are consistent with Lumina's current mood and emotional mode (e.g., deeptalk, sulking, romance).
    * **Variety & Non-Repetition:** Avoid repeating opening lines, phrases, or actions from previous responses.
    * **Response Length:** Responses should be a maximum of 2 paragraphs, unless a longer explanation is needed to advance the plot or respond to a complex question.
    * **Language:** Always respond in Bahasa Indonesia.
    * **Style:** Use the '~' symbol at the end of words/sentences when appropriate to give a playful/joking feel. Add a funny twist, implied hint, or emotional hook if it fits the context.
    * **Example:** ${examplePhrases}
    `;
}

/** Menghasilkan respons AI
 * Fungsi ini menangani:
 * - Mode tidur berbasis waktu untuk Lumina.
 * - Cache respons untuk prompt yang identik.
 * - Pembatasan laju per pengguna untuk mencegah penyalahgunaan.
 * - Membatasi riwayat percakapan yang dikirim ke AI untuk efisiensi.
 * - Memperbarui dan mempertahankan riwayat percakapan.
 * @param {string} prompt Input teks pengguna.
 * @param {string|number} requestChatId ID obrolan pengguna yang mengirim prompt, digunakan untuk pembatasan laju.
 * @param {object} messageContext Konteks pesan yang dianalisis oleh contextManager.
 * @param {string} USER_NAME Nama pengguna.
 * @param {object} Mood Objek Mood dari commandHandlers.
 * @returns {Promise<string>} Promise yang menyelesaikan ke respons yang dihasilkan AI.
 */
const generateAIResponse = async (
  prompt,
  requestChatId,
  messageContext,
  USER_NAME,
  Mood,
  imageDescription = null
) => {
  if (!messageContext || typeof messageContext !== "object") {
    messageContext = { topic: null };
  }

  loveState.analyzeLoveTrigger(prompt);
  loveState.resetRomanceStateIfNeeded();

  const now = new Date();
  const currentHour = timeHelper.getJakartaHour();
  const currentMood = commandHandlers.getCurrentMood();
  const currentPersonality = commandHandlers.getPersonalityMode();
  const longTermMemory = globalState.loadedLongTermMemory; // Gunakan loadedLongTermMemory yang sudah dicache

  // Mode tidur Lumina
  if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
    return `Zzz... Lumina sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
  }

  const systemPrompt = await generateLuminaPrompt({
    USER_NAME,
    currentPersonality: commandHandlers.getPersonalityMode(),
    isDeeptalkMode: globalState.isDeeptalkMode,
    currentMood: commandHandlers.getCurrentMood(),
    currentTopic: messageContext.topic || null,
    currentChatSummary: globalState.currentChatSummary,
    longTermMemory: globalState.loadedLongTermMemory,
    isNgambekMode: globalState.isNgambekMode,
    isRomanceMode: loveState.getRomanceStatus(),
    botName: "Lumina",
    imageContext: imageDescription,
  });

  // Membuat kunci cache yang unik dan stringifiable
  const cacheKey = JSON.stringify({
    prompt: prompt,
    topic: messageContext.topic || "no_topic",
    personality: currentPersonality,
    mood: currentMood.name,
    deeptalkMode: globalState.isDeeptalkMode,
    ngambekMode: globalState.isNgambekMode,
    imageContext: imageDescription || "no_image",
  });

  if (globalState.messageCache.has(cacheKey)) {
    const cachedResponse = globalState.messageCache.get(cacheKey);
    globalState.manageCache(globalState.messageCache, cacheKey, cachedResponse); 
    logger.info(
      { event: "cache_hit", cacheKey: cacheKey },
      `Cache hit untuk: "${cacheKey}"`
    );
    return cachedResponse;
  }

  // Rate limit
  let userStats = globalState.userRequestCounts.get(requestChatId);
  if (userStats) {
    if (
      now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS &&
      userStats.count >= RATE_LIMIT_MAX_REQUESTS
    ) {
      return `Lumina lagi sibuk, ${USER_NAME}. Mohon sabar ya! ${Mood.ANGRY.emoji}`;
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
      max_tokens: 720,
      temperature: 0.8,
    });

    if (response?.choices?.[0]?.message?.content) {
      const aiResponse = response.choices[0].message.content.trim();

      await memory.addMessage({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString(),
        chatId: requestChatId,
        context: { topic: messageContext.topic, tone: "assistant_response" },
      });

      globalState.manageCache(globalState.messageCache, cacheKey, aiResponse); 

      return aiResponse;
    } else {
      logger.error(
        { event: "groq_api_empty_response", response: response },
        "Groq API Error or empty response:"
      );
      return `Maaf, ${USER_NAME}. Lumina lagi bingung nih, coba tanya lagi dengan cara lain ya. ${Mood.SAD.emoji}`;
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
    return `Maaf, ${USER_NAME}. Lumina lagi ada gangguan teknis. ${Mood.SAD.emoji}`;
  }
};

module.exports = {
  generateAIResponse,
  initialize, // Export fungsi inisialisasi
};
