// core/core.js
// DualiteAI v1
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

// IMPORTS
const config = require("../config/config");
const { sendMessage } = require("../utils/sendMessage");
const memory = require("../data/memory");
const contextManager = require("../handler/contextHandler");
const timeHelper = require("../utils/timeHelper"); // Menggunakan seluruh objek timeHelper
const commandHandlers = require("../handler/commandHandlers"); // Menggunakan seluruh objek commandHandlers
const weather = require("../modules/weather"); // Menggunakan seluruh objek weather
const lists = require("../modules/commandLists");
const relationState = require("../handler/relationHandler");
const loveState = require("../modules/loveStateManager");
const initTtsSchedules = require("../modules/ttsManager").initTtsSchedules;
const chatFormatter = require("../utils/chatFormatter");
const ltmProcessor = require("../modules/ltmProcessor");
const visionHandler = require("../handler/visionHandler");
const ttsManager = require('../modules/ttsManager')

// Groq dan Sentry tidak lagi diimpor di sini, karena sudah di aiResponseGenerator.js
const Sentry = require("@sentry/node"); // Sentry tetap diperlukan untuk error handling lainnya di core.js

const logger = require("../utils/logger");
const globalState = require("../state/globalState");
const { setupCronJobs } = require("../schedules/cronSetup");
const updateTimeBasedModes = require("../schedules/updateTimeModes");
const { manageCache } = require("../utils/cacheHelper"); // Import manageCache

// Impor fungsi generateAIResponse dan inisialisasi dari file baru
const { generateAIResponse, initialize: initializeAIResponseGenerator } = require("./ai-response");


// Inisialisasi GlobalState dari memori saat startup
globalState.initializeFromMemory(memory, logger, commandHandlers.setPersonalityMode);
globalState.manageCache = manageCache; // Menyimpan manageCache di globalState agar dapat diakses dari aiResponseGenerator

// Konfigurasi Lumina
const USER_NAME = config.USER_NAME;
const MIN_CHATS_PER_DAY_TO_END_NGAMBEK = 6;
const NGAMBEK_DURATION_DAYS = 2; // Durasi Lumina ngambek jika tidak ada interaksi
const END_NGAMBEK_INTERACTION_DAYS = 2; // Durasi interaksi untuk mengakhiri ngambek

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
    return;
  }

  globalState.interactionMutex = true;

  try {
    const now = new Date();
    globalState.lastInteractionTimestamp = now.toISOString();
    const today = now.toISOString().slice(0, 10);

    const loadedCounts = await memory.getPreference("dailyChatCounts");
    globalState.dailyChatCounts =
      loadedCounts && typeof loadedCounts === "object" ? loadedCounts : {};

    if (!globalState.dailyChatCounts[today]) {
      globalState.dailyChatCounts[today] = 0;
    }

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
    globalState.interactionMutex = false;
  }
};

/**
 * Memeriksa status 'Ngambek' Lumina berdasarkan interaksi pengguna.
 * Jika tidak ada interaksi selama 2 hari, Lumina akan 'ngambek'.
 * Jika user berinteraksi aktif selama 2 hari, Lumina akan kembali normal.
 * @param {string} chatId - ID obrolan untuk mengirim notifikasi.
 */
const checkNgambekStatus = async (chatId) => {
  const now = new Date();
  const lastInteractionDate = globalState.lastInteractionTimestamp
    ? new Date(globalState.lastInteractionTimestamp)
    : null;

  // Cek apakah Lumina harus 'ngambek'
  if (!globalState.isNgambekMode && lastInteractionDate) {
    const diffTime = Math.abs(now - lastInteractionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= NGAMBEK_DURATION_DAYS) {
      globalState.isNgambekMode = true;
      commandHandlers.setMood(chatId, commandHandlers.Mood.JEALOUS); // Mengatur mood ke Ngambek
      await memory.savePreference("isNgambekMode", true);
      logger.info(
        { event: "ngambek_mode_activated", diffDays: diffDays },
        "[Ngambek System] Lumina sekarang Ngambek!"
      );
      sendMessage(
        chatId,
        `Hmph! ${USER_NAME} kemana saja?! Lumina jadi ngambek nih karena tidak ada chat sama sekali dari ${USER_NAME} selama ${diffDays} hari! 😒`
      );
    }
  }

  // Cek apakah Lumina harus berhenti 'ngambek'
  if (globalState.isNgambekMode) {
    let consecutiveActiveDays = 0;

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
      commandHandlers.setMood(chatId, commandHandlers.getRandomMood()); // Kembalikan mood ke acak
      await memory.savePreference("isNgambekMode", false);
      globalState.dailyChatCounts = {}; // Reset hitungan chat harian setelah ngambek berakhir
      await memory.savePreference(
        "dailyChatCounts",
        globalState.dailyChatCounts
      );
      logger.info(
        { event: "ngambek_mode_deactivated" },
        "[Ngambek System] Lumina sudah tidak Ngambek lagi!"
      );
      sendMessage(
        chatId,
        `Akhirnya ${USER_NAME} kembali! Lumina sudah tidak ngambek lagi, t-tapi jangan diulang lagi ya! 😌`
      );
    }
  }

  // Bersihkan data dailyChatCounts yang sudah terlalu lama
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - NGAMBEK_DURATION_DAYS - 1);
  for (const date in globalState.dailyChatCounts) {
    if (new Date(date) < twoDaysAgo) {
      delete globalState.dailyChatCounts[date];
    }
  }
  await memory.savePreference("dailyChatCounts", globalState.dailyChatCounts);
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
 * Menganalisis pesan pengguna untuk menyimpan preferensi ke long-term memory.
 * Ini versi modular dan fleksibel.
 * @param {string} text - Pesan dari user.
 */
const analyzeAndSavePreferences = async (text) => {
  if (typeof text !== "string" || text.length < 10) {
    return;
  }

  try {
    const analysis = await ltmProcessor.processForLTM(text);

    if (analysis.should_save_preferences) {
      await ltmProcessor.saveLTMResult(analysis, text);
      logger.info(
        {
          priority: analysis.priorities_level,
          summary: analysis.query_preferences,
        },
        "LTM preference detected and saved"
      );
    }
  } catch (error) {
    logger.error(
      { event: "ltm_processing_error", error: error.message },
      "Error in LTM processing pipeline"
    );
    Sentry.captureException(error);
  }
};

/**
 * Menyiapkan listener pesan bot Telegram.
 * Fungsi ini dipisahkan agar dapat dipanggil setelah server webhook siap.
 * @param {object} bot - Instance bot Telegram.
 */
const setupMessageListener = (bot) => {
  bot.on("message", async (msg) => {
    const { chat, text, photo, caption, from: senderInfo } = msg;
    const currentMessageChatId = chat.id;
    const userPromptText = text || caption || "";

    if (photo && photo.length > 0) {
      const fileId = photo[photo.length - 1].file_id;
      try {
        const fileLink = await bot.getFileLink(fileId);
        logger.info(
          { event: "image_received", fileId },
          `Gambar diterima, memulai alur VisionAgent...`
        );

        const visionResult = await visionHandler.handleVisionRequest(
          fileLink,
          currentMessageChatId
        );

        if (visionResult && visionResult.description) {
          logger.info(
            {
              event: "vision_success",
              description: visionResult.description,
            },
            "VisionAgent berhasil menghasilkan deskripsi."
          );

          await memory.addMessage({
            role: "user",
            content: `[GAMBAR DIKIRIM] ${userPromptText}`.trim(),
            from: senderInfo,
            chatId: chat.id,
            timestamp: new Date(msg.date * 1000).toISOString(),
            context: {
              type: "image_input",
              visionOutput: visionResult.description,
            },
          });

          await commandHandlers.LuminaTyping(currentMessageChatId);

          const messageContext = contextManager.analyzeMessage(msg);
          const aiResponse = await generateAIResponse(
            userPromptText,
            currentMessageChatId,
            messageContext,
            USER_NAME, // Teruskan USER_NAME
            commandHandlers.Mood, // Teruskan objek Mood
            visionResult.description
          );
          sendMessage(currentMessageChatId, aiResponse);
        } else {
          logger.warn(
            { event: "vision_failed" },
            "VisionAgent tidak menghasilkan deskripsi."
          );
        }

        return;
      } catch (error) {
        logger.error(
          { event: "process_image_error", error: error.message },
          "Gagal memproses gambar di alur utama."
        );
        Sentry.captureException(error);
        await commandHandlers.LuminaTyping(currentMessageChatId);
        sendMessage(
          currentMessageChatId,
          `Maaf, Tuan. Lumina tidak bisa memproses gambar itu. ${commandHandlers.Mood.SAD.emoji}`
        );
        return;
      }
    }

    if (!text || text.trim() === "") return;
    if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text)))
      return;

    await relationState.addPointOnMessage();
    await updateInteractionStatus();

    await analyzeAndSavePreferences(text);

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
      await commandHandlers.LuminaTyping(currentMessageChatId);
      sendMessage(currentMessageChatId, messageContext.autoReply);
      await memory.addMessage({
        role: "assistant",
        content: messageContext.autoReply,
        timestamp: new Date().toISOString(),
        chatId: currentMessageChatId,
        context: { topic: messageContext.topic, tone: "auto_reply" },
      });
      return;
    }

    for (const handler of commandHandlers.commandHandlers) { // Mengakses commandHandlers dari objek commandHandlers
      if (handler.pattern.test(text)) {
        const result = await handler.response(currentMessageChatId, msg);
        await commandHandlers.LuminaTyping(currentMessageChatId);
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
        if (result.mood) commandHandlers.setMood(currentMessageChatId, result.mood);
        return;
      }
    }

    await commandHandlers.LuminaTyping(currentMessageChatId);
    const aiResponse = await generateAIResponse(
      text,
      currentMessageChatId,
      messageContext,
      USER_NAME, // Teruskan USER_NAME
      commandHandlers.Mood // Teruskan objek Mood
    );
    sendMessage(currentMessageChatId, aiResponse);
  });
};

// ==== Module Exports & Bot Instance ====

module.exports = {
  USER_NAME,
  generateAIResponse, 
  initLuminabot: (bot) => {
    commandHandlers.setBotInstance(bot);
    const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

    logger.info(`🌸 NebulaAI v1 (Asisten Virtual) sedang berjalan.`);

    initializeAIResponseGenerator({
      config,
      memory,
      contextManager,
      timeHelper,
      commandHandlers, // Teruskan seluruh objek commandHandlers
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
      sendMessageFunction: sendMessage // Teruskan fungsi sendMessage
    });


    lists.rescheduleReminders(bot); // Reschedule reminder
    initTtsSchedules(bot); // Inisialisasi ttsManager

    checkNgambekStatus(configuredChatId);
    updateTimeBasedModes(configuredChatId);

    // Setup semua cron jobs
    setupCronJobs(bot, updateTimeBasedModes, checkNgambekStatus, USER_NAME, Sentry);

    // setupMessageListener setelah initLuminabot dipanggil
    setupMessageListener(bot);
  },
};
