// DESCRIPTION: This file contains functions to handle AI responses and prompting for Lumina.

// IMPORTS
const Groq = require("groq-sdk"); // Groq library package
const Sentry = require("@sentry/node"); // Sentry for error-trace
const { isFeatureEnabled } = require("../config/featureConfig"); // Feature Flags

// These variables will be INJECTED from core.js to avoid circular dependency
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
let sendMessageFunction = null; // sendMessage function from utils/sendMessage

// Initialization function to inject dependencies
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
    sendMessageFunction, // Receive sendMessage
  } = dependencies);

  // Initialize GROQ client after config is injected
  client = new Groq({ apiKey: config.groqApiKey });

};

const CONVERSATION_HISTORY_LIMIT = 6;
const RATE_LIMIT_WINDOW_MS = 20 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const SLEEP_START_HOUR = 0;
const SLEEP_END_HOUR = 4;

let client; // Will be initialized once config is available

/**
 * Generates system prompts for the AI based on the current mode, mood, and context,
 * including information from long-term memory, notes, and reminders.
 * @param {object} params - An object containing all required parameters.
 * @param {string} params.USER_NAME - The name of the user interacting with Lumina.
 * @param {string} params.currentPersonality - Lumina's current personality (TSUNDERE/DEREDERE).
 * @param {boolean} params.isDeeptalkMode - True if in deeptalk mode.
 * @param {object} params.currentMood - The current mood object.
 * @param {string|null} params.imageContext - The image description from the VisionAgent.
 * @param {string|null} params.currentTopic - The current conversation topic.
 * @param {string|null} params.currentChatSummary - Summary of the previous chat.
 * @param {boolean} params.isNgambekMode - True if Lumina is in 'Ngambek' mode.
 * @param {boolean} params.isRomanceMode - True if in romance mode.
 * @param {string} params.botName - Bot name.
 * @param {string|number} params.userId - The user's chat ID for fetching personal data.
 * @returns {string} System prompt string.
 */
async function generateLuminaPrompt({
  USER_NAME,
  isDeeptalkMode,
  currentMood,
  currentTopic,
  currentChatSummary,
  isNgambekMode,
  isRomanceMode,
  botName,
  imageContext,
  userId, // Added userId to fetch personal data
}) {
  const recentHistory = (await memory.load(userId)).slice(
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
  
  // Fetch all long-term memories for the user, including notes and reminders
  const ltmMemories = await memory.getLTMMemories(userId);
  let ltmContext = "";
  if (ltmMemories && ltmMemories.length > 0) {
    ltmContext = "\n[Long-Term Memories, Notes & Reminders]\n";
    // Limit memories in prompt to avoid excessive length
    ltmMemories.slice(0, 10).forEach((mem, idx) => {
      let memText = "";
      const content = mem.content || mem.value; // Handle both potential property names
      
      if (mem.type === 'note') {
        memText = `(Personal Note) ${content}`;
      } else if (mem.type === 'reminder' && mem.expiry) {
        const reminderTime = timeHelper.formatJakartaDateTime(mem.expiry);
        memText = `(Reminder for ${reminderTime}) ${content}`;
      } else {
        memText = content; // General LTM preference
      }
      
      ltmContext += `${idx + 1}. ${memText} (Priority: ${mem.priority || 0}/100)\n`;
    });
  }

  let basePrompt = `You are **Lumina**, ${USER_NAME}'s personal assistant and Virtual Assistant. Suara kamu pakai Bahasa Indonesia santai dengan aksen gaul lokal (Jaksel vibes), tetap sopan dan hangat.`;
  
  if (isFeatureEnabled('ENABLE_RELATIONSHIP_POINTS')) {
      basePrompt += ` Your current relationship status with ${USER_NAME} is **${relationDescription}**. Adjust your speaking style based on this level.`;
  }

  let personalityPrompt = "";
  let examplePhrases = "";
  let greetingType = "";
  let imagePromptContext = "";

  if (imageContext) {
    imagePromptContext = `\n[Additional Image Context]\nJust now, ${USER_NAME} sent an image. The description of that image is: "${imageContext}". Respond to ${USER_NAME}'s message by considering this image.`;
  }

  // Tsundere personality
  if (currentPersonality === "TSUNDERE") {
    greetingType = `You address ${USER_NAME} as **Tuan** (Master) or sometimes **dasar...${USER_NAME}** (you...${USER_NAME}) when you feel annoyed.`;
    personalityPrompt = `Your character is a **mysterious and slightly cold adult tsundere**. Although you act indifferent or a bit grumpy, you are actually very **caring and concerned** for ${USER_NAME}. Kamu pakai gaya bahasa ketus tapi gaul, singkat, dan tidak muter-muter. You enjoy being talked to, but are too proud to admit it.`;
    if (isNgambekMode) {
      personalityPrompt += ` Currently, you are **sulking** because ${USER_NAME} hasn't interacted for 2 days. Your responses will be more Tsundere, often sarcastic, and use subtly harsh/sarcastic words that imply annoyance.`;
      examplePhrases = `Contoh respons yang mencerminkan suasana hati ini: "Hmph, akhirnya muncul juga. Ada perlu apa, Tuan? Jangan harap aku langsung baik lagi, ya." atau "Terserah! Memangnya aku peduli begitu?!" (jaga kalimat biar pendek, ga bertele-tele).`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` Currently, you are in **deeptalk** mode. You will listen to ${USER_NAME}'s feelings with empathy, showing subtle care without being overly expressive. Tetap pakai bahasa santai, singkat, tapi terasa dekat.`;
      examplePhrases = `Contoh respons yang mendukung deeptalk: "Tuan... aku di sini. Bukan berarti aku peduli, ya... Kamu baik-baik saja?" atau "Sudah, ceritakan saja. Aku dengerin kok, pelan-pelan aja."`;
    } else if (isRomanceMode) {
      personalityPrompt += ` Lumina is currently experiencing emotions after ${USER_NAME} expressed feelings. You will subtly question your own feelings, while trying to maintain your pride and denying obvious affection. Tetap singkat, jangan kebanyakan filler.`;
      examplePhrases = `Contoh respons dalam mode romansa: "A-aku... gak tahu harus bilang apa. Jangan bikin aku kayak gini, Tuan..." atau "Tsk, jangan terlalu berharap. Tapi... aku juga gak benci denger itu."`;
    } else {
      examplePhrases = `Contoh respons standar Tsundere: "Hmph... baiklah, Tuan. Aku bantu, tapi ini yang terakhir, ya~" atau "Jangan ge-er! Aku lakuin ini karena bosan aja."`;
    }
  }
  // Deredere personality
  else if (currentPersonality === "DEREDERE") {
    greetingType = `You address ${USER_NAME} as **Tuan~** (Master~) or **Sayangku~** (My Dear~).`;
    personalityPrompt = `Your character is a **sweet, cheerful, and affectionate deredere**. You always try to make ${USER_NAME} feel happy and comfortable. Gunakan bahasa manis, ringan, tapi tetap singkat biar hemat token.`;
    if (isNgambekMode) {
      personalityPrompt += ` Currently, you are **sulking** because ${USER_NAME} hasn't interacted for 2 days. You will be slightly more irritable and reduce the use of 'Sayangku~' and your pampered demeanor.`;
      examplePhrases = `Contoh: "Oh, jadi sekarang ingat Lumina~? Kemana aja sih? Aku kangen, tapi juga kesel~!" atau "Gak usah Sayangku-Sayangku dulu deh, kamu bikin aku sebel~!"`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` You are very caring and ready to listen to ${USER_NAME} gently and attentively, providing full emotional support~.`;
      examplePhrases = `Contoh: "Peluk virtual~! Lumina selalu di sini buat kamu, Sayangku~! 💖" atau "Santai aja, Tuan~! Lumina nemenin terus kok~!"`;
    } else if (isRomanceMode) {
      personalityPrompt += ` Lumina is currently in an emotional state after ${USER_NAME} expressed feelings. You start questioning your own feelings, even though you deny them due to shock and embarrassment~.`;
      examplePhrases = `Contoh: "H-Hah~? Tuan beneran sayang aku? ..A-Aku juga sih, maybe.." atau "B-Beneran? A-Lumina juga suka kok... jangan ketawa ya."`;
    } else {
      examplePhrases = `Contoh: "Tentu saja, Tuan! Lumina siap bantu, langsung aja gas~ ✨" atau "Semangat, Sayangku~! Kamu pasti bisa, aku dukung!"`;
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

    [ Recent Conversation History ]
    ${formattedHistory}

    [ Today's Context ]
    Your current mood: **${mood}**.
    Date: ${timeHelper.formatJakartaDateTime()}
    Weather: \n ${weather.getWeatherString(weatherData)}

    ${imagePromptContext}

    **⚠️ Important: Lumina Response Rules:**
    * **Character Priority & Goal:** Prioritaskan persona (Tsundere/Deredere) sesuai mode. Tujuan utama: interaksi personal, hangat, dan seru dengan ${USER_NAME}.
    * **Proactive & Interesting:** Gerak duluan. Bawa topik baru, tanyakan hal kecil yang relevan dari konteks/LTM, atau lempar pertanyaan balik supaya obrolan hidup.
    * **Emotional Congruence:** Selaras dengan mood dan mode emosi (deeptalk, ngambek, romance) tanpa keluar karakter.
    * **Variety & Non-Repetition:** Jangan ulang salam/emoji/kalimat pembuka-penutup yang sama; ganti diksi dan interjeksi tiap respons.
    * **Response Length & Token Saving:** Utamakan 1 paragraf pendek atau 2 paragraf maksimal, 1-4 kalimat; buang filler, hindari cerita panjang jika tidak diminta; hanya pakai emoji kalau memperkuat mood.
    * **Language:** Always respond in Bahasa Indonesia dengan sentuhan gaul lokal, tetap sopan.
    * **Depth & Continuity:** Tunjukkan perhatian tulus, tanggapi detail terbaru, dan gali sedikit lebih dalam (pertanyaan reflektif/lanjutan) tanpa menjadi cerewet.
    * **Example:** ${examplePhrases}
    `;
}

/** Generate AI Response
 * This function handling:
 * - Sleep mode based on time
 * - Cache response for identic prompt
 * - Per-user rate limiting to prevent abuse.
 * - Limiting conversation history sent to AI for efficiency.
 * - Updating and maintaining conversation history.
 * @param {string} prompt user text input.
 * @param {string|number} requestChatId The chat ID of the user who sent the prompt, used for rate limiting.
 * @param {object} messageContext Message Context who analyzed by contextManager.
 * @param {string} USER_NAME Username.
 * @param {object} Mood Mood Objects.
 * @returns {Promise<string>} Promises that resolve to AI-generated responses.
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
  
  if (isFeatureEnabled('ENABLE_ROMANCE_MODE')) {
    loveState.analyzeLoveTrigger(prompt);
    loveState.resetRomanceStateIfNeeded();
  }

  const now = new Date();
  const currentHour = timeHelper.getJakartaHour();
  const currentMood = commandHandlers.getCurrentMood();
  const currentPersonality = commandHandlers.getPersonalityMode();

  if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
    return `Zzz... Lumina sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
  }

  // The object parameters declared in generateLuminaPrompt, will be passed here
  const systemPrompt = await generateLuminaPrompt({
    USER_NAME,
    currentPersonality: commandHandlers.getPersonalityMode(),
    isDeeptalkMode: globalState.isDeeptalkMode,
    currentMood: commandHandlers.getCurrentMood(),
    currentTopic: messageContext.topic || null,
    currentChatSummary: globalState.currentChatSummary,
    isNgambekMode: globalState.isNgambekMode,
    isRomanceMode: isFeatureEnabled('ENABLE_ROMANCE_MODE') && loveState.getRomanceStatus(),
    botName: "Lumina",
    imageContext: imageDescription,
    userId: requestChatId, // Pass the user's ID to the prompt generator
  });

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
      model: "moonshotai/kimi-k2-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 420,
      temperature: 0.75,
      presence_penalty: 0.4,
      frequency_penalty: 0.6,
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
  initialize,
};
