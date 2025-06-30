// core/core.js
// MyLumina v1
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia) - Core logic is designed for Indonesian context.
// TIME FORMAT: Asia/Jakarta - All time-based operations use Jakarta timezone.
// MIT License

// -------- Groq EDITION -----------
// This is an original file designed to interact with AI endpoints, specifically tailored for Groq.

// Notes:
// This file serves as the main entry point and message handling orchestrator for the MyLumina bot.
// It manages incoming messages, dispatches them to appropriate handlers (e.g., document, image, text),
// handles bot's internal state (like "mood" or "ngambek" mode), and interacts with various modules
// for features like AI response generation, reminders, and long-term memory.
// If you wish to use a different AI endpoint API, you might need to adjust the AI response generation
// logic in 'ai-response.js' and configuration in 'config/config.js'.

// ===== FILE IMPORTS =====

// Configuration Import
const config = require("../config/config"); // Imports configuration settings (API keys, tokens, chat IDs).

// Memory Import
const memory = require("../data/memory"); // Manages persistent data storage for the bot's memory.

// Modules Import
const weather = require("../modules/weather"); // Integrates weather fetching capabilities.
const lists = require("../modules/commandLists"); // Contains definitions for various bot commands (e.g., search, help).
const loveState = require("../modules/loveStateManager"); // Manages the bot's "romance mode" state and functions.
const initTtsSchedules = require("../modules/ttsManager").initTtsSchedules; // Initializes text-to-speech (TTS) schedules, particularly for reminders.
const ltmProcessor = require("../modules/ltmProcessor"); // Handles Long-Term Memory (LTM) processing and auto-detection.
const ttsManager = require("../modules/ttsManager"); // Provides general text-to-speech functionalities.
const Mood = require('../modules/mood')

// Utilities Import
const { sendMessage } = require("../utils/sendMessage"); // Utility for sending messages back to the user.
const timeHelper = require("../utils/timeHelper"); // Helper functions for handling time, specifically for the Jakarta time zone.
const chatFormatter = require("../utils/chatFormatter"); // Utility module for summarizing and formatting chat history.
const { getUserName } = require("../utils/telegramHelper"); // Utility functions for retrieving user names from Telegram messages.
const logger = require("../utils/logger"); // Logging utility based on the Pino library for structured logging.
const { manageCache } = require("../utils/cacheHelper"); // Utility module for cache management functions.

// Scheduler Imports
const { setupCronJobs } = require("../scheduler/cronSetup"); // Configures and sets up scheduled tasks (cron jobs) for the bot.
const updateTimeBasedModes = require("../scheduler/updateTimeModes"); // Module for updating bot's internal states like mood or time-based modes.

// State Import
const globalState = require("../state/globalState"); // Manages global state variables accessible across different modules.

// Handlers Import
const contextManager = require("../handler/contextHandler"); // Handler for detecting message context and topics.
const docHandler = require("../handler/docHandler"); // Handles incoming document messages.
const commandHandlers = require("../handler/commandHandlers"); // Manages regular expression-based auto-reply commands.
const relationState = require("../handler/relationHandler"); // Implements the bot's relationship system with the user.
const visionHandler = require("../handler/visionHandler"); // Handles AI vision capabilities for image processing.

// Core AI Import
const {
  generateAIResponse,
  initialize: initializeAIResponseGenerator,
} = require("./ai-response"); // Core module for generating AI responses based on prompts.

const Sentry = require("@sentry/node"); // Sentry library for error tracking and debugging.

// Initialize globalState from memory on startup.
// This ensures the bot's state is persistent across restarts.
globalState.initializeFromMemory(
  memory,
  logger,
  commandHandlers.setPersonalityMode
);
// Store manageCache function in globalState for access from aiResponseGenerator.
globalState.manageCache = manageCache;

// Lumina bot configuration parameters.
const MIN_CHATS_PER_DAY_TO_END_NGAMBEK = 6; // Minimum daily chats required to end "ngambek" (sulking) mode.
const NGAMBEK_DURATION_DAYS = 2; // Duration in days after which Lumina enters "ngambek" mode if inactive.
const END_NGAMBEK_INTERACTION_DAYS = 2; // Duration of active interaction (in days) required to end "ngambek" mode.

/**
 * Updates the user's interaction status (timestamp and daily chat count).
 * Uses a simple mutex to prevent race conditions during concurrent updates.
 */
const updateInteractionStatus = async () => {
  // Check if the mutex is locked to prevent simultaneous updates.
  if (globalState.interactionMutex) {
    logger.warn(
      { event: "update_interaction_status_skipped", reason: "mutex_locked" },
      "Update interaction status skipped due to mutex lock."
    );
    return;
  }

  // Acquire the mutex lock.
  globalState.interactionMutex = true;

  try {
    const now = new Date();
    // Update the last interaction timestamp to the current time.
    globalState.lastInteractionTimestamp = now.toISOString();
    // Get today's date in YYYY-MM-DD format for daily chat counts.
    const today = now.toISOString().slice(0, 10);

    // Load existing daily chat counts from memory.
    const loadedCounts = await memory.getPreference("dailyChatCounts");
    // Ensure dailyChatCounts is an object, initialize if not.
    globalState.dailyChatCounts =
      loadedCounts && typeof loadedCounts === "object" ? loadedCounts : {};

    // Initialize today's chat count if it doesn't exist.
    if (!globalState.dailyChatCounts[today]) {
      globalState.dailyChatCounts[today] = 0;
    }

    // Increment today's chat count.
    globalState.dailyChatCounts[today]++;

    // Save the updated interaction timestamp and daily chat counts to memory.
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
      `[Interaction] Interaction status updated. Today's chats: ${globalState.dailyChatCounts[today]}.`
    );
  } catch (error) {
    logger.error(
      {
        event: "update_interaction_status_error",
        error: error.message,
        stack: error.stack,
      },
      "Error updating interaction status:"
    );
    Sentry.captureException(error); // Capture error with Sentry for monitoring.
  } finally {
    // Release the mutex lock.
    globalState.interactionMutex = false;
  }
};

/**
 * Checks Lumina's "Ngambek" (sulking/annoyed) status based on user interaction.
 * If there's no interaction for NGAMBEK_DURATION_DAYS, Lumina will enter "ngambek" mode.
 * If the user actively interacts for END_NGAMBEK_INTERACTION_DAYS, Lumina will return to normal.
 * @param {string} chatId - The chat ID to send notifications to.
 */
const checkNgambekStatus = async (chatId) => {
  const now = new Date();
  const lastInteractionDate = globalState.lastInteractionTimestamp
    ? new Date(globalState.lastInteractionTimestamp)
    : null;

  // --- Check if Lumina should enter 'ngambek' mode ---
  if (!globalState.isNgambekMode && lastInteractionDate) {
    const diffTime = Math.abs(now - lastInteractionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Calculate difference in days.

    if (diffDays >= NGAMBEK_DURATION_DAYS) {
      globalState.isNgambekMode = true; // Set ngambek mode to true.
      commandHandlers.setMood(chatId, Mood.JEALOUS); // Set bot's mood to jealous (implies ngambek).
      await memory.savePreference("isNgambekMode", true); // Persist ngambek mode state.
      logger.info(
        { event: "ngambek_mode_activated", diffDays: diffDays },
        "[Ngambek System] Lumina is now in Ngambek mode!"
      );
      sendMessage(
        chatId,
        `Hmph! Kamu kemana aja?! Lumina sekarang ngambek karena kamu tidak mendengarkan Lumina selama ${diffDays} hari! 😒`
      );
    }
  }

  // --- Check if Lumina should stop 'ngambek' mode ---
  if (globalState.isNgambekMode) {
    let consecutiveActiveDays = 0;

    // Iterate through recent days to check for active interaction.
    for (let i = 0; i < END_NGAMBEK_INTERACTION_DAYS; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() - i); // Go back i days from now.
      const formattedDate = date.toISOString().slice(0, 10); // Format date as YYYY-MM-DD.

      // Check if daily chat count for this day meets the minimum requirement.
      if (
        globalState.dailyChatCounts[formattedDate] >=
        MIN_CHATS_PER_DAY_TO_END_NGAMBEK
      ) {
        consecutiveActiveDays++;
      } else {
        consecutiveActiveDays = 0; // Reset if any day doesn't meet the criteria.
        break; // Exit loop if a non-qualifying day is found.
      }
    }

    // If enough consecutive active days are met, deactivate ngambek mode.
    if (consecutiveActiveDays >= END_NGAMBEK_INTERACTION_DAYS) {
      globalState.isNgambekMode = false; // Deactivate ngambek mode.
      commandHandlers.setMood(chatId, commandHandlers.getRandomMood()); // Restore a random mood.
      await memory.savePreference("isNgambekMode", false); // Persist ngambek mode state.
      globalState.dailyChatCounts = {}; // Reset daily chat counts after ngambek ends.
      await memory.savePreference(
        "dailyChatCounts",
        globalState.dailyChatCounts
      );
      logger.info(
        { event: "ngambek_mode_deactivated" },
        "[Ngambek System] Lumina is no longer sulking!"
      );
      sendMessage(
        chatId,
        `Akhirnya kamu kembali! Lumina tidak ngambek sekarang, t-tapi jangan buat itu lagi, oke! 😌`
      );
    }
  }

  // --- Clean up old dailyChatCounts data ---
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - NGAMBEK_DURATION_DAYS - 1); // Define cutoff date for old data.
  for (const date in globalState.dailyChatCounts) {
    if (new Date(date) < twoDaysAgo) {
      delete globalState.dailyChatCounts[date]; // Remove old entries.
    }
  }
  await memory.savePreference("dailyChatCounts", globalState.dailyChatCounts); // Save cleaned data.
};

/**
 * Checks if the given string consists only of emojis.
 * Uses Unicode property escapes for comprehensive emoji detection.
 * @param {string} str - The input string to check.
 * @returns {boolean} True if the string contains only emojis, false otherwise.
 */
function isOnlyEmojis(str) {
  if (typeof str !== "string") return false;
  // Regex to match one or more Unicode emoji characters.
  const emojiRegex =
    /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
  return emojiRegex.test(str);
}

/**
 * Checks if the given string consists only of numeric digits.
 * @param {string} str - The input string to check.
 * @returns {boolean} True if the string contains only numbers, false otherwise.
 */
function isOnlyNumbers(str) {
  if (typeof str !== "string") return false;
  // Regex to match one or more digits from 0-9.
  const numberRegex = /^[0-9]+$/;
  return numberRegex.test(str);
}

/**
 * Analyzes the user's message to save preferences to long-term memory.
 * This is a modular and flexible version of LTM processing.
 * @param {string} text - The message text from the user.
 */
const analyzeAndSavePreferences = async (text) => {
  // Skip analysis if text is not a string or too short.
  if (typeof text !== "string" || text.length < 10) {
    return;
  }

  try {
    // Process the text for LTM (Long-Term Memory) insights.
    const analysis = await ltmProcessor.processForLTM(text);

    // If the analysis indicates that preferences should be saved.
    if (analysis.should_save_preferences) {
      await ltmProcessor.saveLTMResult(analysis, text); // Save the LTM analysis result.
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
    Sentry.captureException(error); // Capture error with Sentry.
  }
};

/**
 * Sets up the Telegram bot's message listener.
 * This function is separated to be called after the webhook server is ready,
 * ensuring all necessary components are initialized.
 * @param {object} bot - The Telegram bot instance.
 */
const setupMessageListener = (bot) => {
  // Listen for all incoming messages from Telegram.
  bot.on("message", async (msg) => {
    const { chat, text, photo, caption, from: senderInfo, document } = msg;
    const currentMessageChatId = chat.id; // Get the ID of the current chat.
    // Combine text and caption for user prompt, trim whitespace.
    const userPromptText = (text || caption || "").trim();

    const USER_NAME = getUserName(msg); // Get the user's display name.

    // --- Handle documents as a primary priority if present ---
    if (document) {
      try {
        await updateInteractionStatus(); // Log this as an interaction.
        
        const aiDependencies = {
          generateAIResponse,
          USER_NAME: getUserName(msg),
          Mood: commandHandlers.Mood,
        };

        await docHandler.handleDocument(msg, bot, aiDependencies); // Teruskan dependensi
      } catch (error) {
        logger.error(
          { event: "document_core_handler_error", error: error.message },
          "Error in core.js document handling block."
        );
        Sentry.captureException(error);
        sendMessage(
          currentMessageChatId,
          "Oops, Sepertinya ada kesalahan saat saya menganalisis dokumen, Tuan."
        );
      }
      return; // Stop further processing for this message if it's a document.
    }

    // --- Handle photos (images) if present ---
    if (photo && photo.length > 0) {
      // Get the file ID of the largest photo (usually the last in the array).
      const fileId = photo[photo.length - 1].file_id;
      try {
        // Get the downloadable link for the file.
        const fileLink = await bot.getFileLink(fileId);
        logger.info(
          { event: "image_received", fileId },
          `Image received, initiating VisionAgent flow...`
        );

        // Process the image using the VisionHandler.
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
            "VisionAgent successfully generated a description."
          );

          // Add the message to memory, including the vision output.
          await memory.addMessage({
            role: "user",
            content: `[IMAGE SENT] ${userPromptText}`.trim(),
            from: senderInfo,
            chatId: chat.id,
            timestamp: new Date(msg.date * 1000).toISOString(),
            context: {
              type: "image_input",
              visionOutput: visionResult.description, // Store the AI-generated image description.
            },
          });

          await commandHandlers.LuminaTyping(currentMessageChatId); // Simulate typing.

          const messageContext = contextManager.analyzeMessage(msg); // Analyze message context.
          // Generate AI response, passing vision description.
          const aiResponse = await generateAIResponse(
            userPromptText,
            currentMessageChatId,
            messageContext,
            USER_NAME, // Pass the user's name.
            Mood, // Pass the Mood object.
            visionResult.description // Pass the image description from VisionAgent.
          );
          sendMessage(currentMessageChatId, aiResponse); // Send the AI response.
        } else {
          logger.warn(
            { event: "vision_failed" },
            "VisionAgent did not generate a description."
          );
          sendMessage(
            currentMessageChatId,
            `Maaf, tuan. Lumina sepertinya kesusahan untuk menganalisis gamabr tersebut. ${Mood.SAD.emoji}`
          );
        }

        return; // Stop further processing for image messages.
      } catch (error) {
        logger.error(
          { event: "process_image_error", error: error.message },
          "Failed to process image in main flow."
        );
        Sentry.captureException(error);
        await commandHandlers.LuminaTyping(currentMessageChatId);
        sendMessage(
          currentMessageChatId,
          `Maaf, Tuan. Sepertinya Lumina terdapat kesalahan saat menganalisis gambar. ${Mood.SAD.emoji}`
        );
        return;
      }
    }

    // --- General text message handling ---

    // Ignore messages if there's no actual text content after trimming.
    if (!userPromptText) return;

    // Ignore messages that consist only of a single emoji or a single number.
    if (
      userPromptText.length === 1 &&
      (isOnlyEmojis(userPromptText) || isOnlyNumbers(userPromptText))
    )
      return;

    await relationState.addPointOnMessage(); // Add relationship points for interaction.
    await updateInteractionStatus(); // Update interaction status.
    await analyzeAndSavePreferences(userPromptText); // Analyze and save user preferences to LTM.

    const messageContext = contextManager.analyzeMessage(msg); // Analyze the message for its context.

    // Prepare user message object for storage.
    const userMessageToStore = {
      role: "user",
      content: userPromptText,
      from: senderInfo,
      chatId: chat.id,
      message_id: msg.message_id,
      date: msg.date,
      timestamp: new Date(msg.date * 1000).toISOString(),
      context: messageContext,
    };

    await memory.addMessage(userMessageToStore); // Save the user message to memory.

    logger.info(
      {
        event: "user_message_saved",
        chatId: chat.id,
        messageId: msg.message_id,
      },
      `User message saved to memory with context.`
    );

    // --- Handle auto-reply messages ---
    if (messageContext.autoReply) {
      await commandHandlers.LuminaTyping(currentMessageChatId); // Simulate typing.
      sendMessage(currentMessageChatId, messageContext.autoReply); // Send the auto-reply.
      await memory.addMessage({
        role: "assistant",
        content: messageContext.autoReply,
        timestamp: new Date().toISOString(),
        chatId: currentMessageChatId,
        context: { topic: messageContext.topic, tone: "auto_reply" },
      });
      return; // Stop further processing after an auto-reply.
    }

    // --- Loop through custom command handlers ---
    for (const handler of commandHandlers.commandHandlers) {
      // Check if the user's message matches any defined command pattern.
      if (handler.pattern.test(userPromptText)) {
        await updateInteractionStatus(); // Mark as activity to prevent bot from "sulking".

        // Execute the command handler's response function.
        const result = await handler.response(currentMessageChatId, msg);

        // If the handler returns text, send it and save to memory.
        if (result && result.text) {
          await commandHandlers.LuminaTyping(currentMessageChatId);
          sendMessage(currentMessageChatId, result.text);
          await memory.addMessage({
            role: "assistant",
            content: result.text,
            timestamp: new Date().toISOString(),
            chatId: currentMessageChatId,
            context: {
              topic: "command_response",
              command: handler.name || handler.pattern.source, // Log command name or regex pattern.
            },
          });
        }

        // If the handler suggests a mood change, set it.
        if (result && result.mood) {
          commandHandlers.setMood(currentMessageChatId, result.mood);
        }
        return; // Stop processing after a command is handled.
      }
    }

    // --- Default AI response generation if no specific handlers apply ---
    await commandHandlers.LuminaTyping(currentMessageChatId); // Simulate typing.
    const aiResponse = await generateAIResponse(
      userPromptText,
      currentMessageChatId,
      messageContext,
      USER_NAME,
      commandHandlers.Mood // Pass the Mood object for AI context.
    );
    sendMessage(currentMessageChatId, aiResponse); // Send the AI-generated response.
  });
};

// ==== Module Exports & Bot Instance Management ====

module.exports = {
  // Export the generateAIResponse function for external use if needed.
  generateAIResponse,
  /**
   * Initializes the MyLumina bot. This is the main entry point for starting the bot's operations.
   * @param {object} bot - The instance of the Telegram bot client.
   */
  initLuminabot: (bot) => {
    commandHandlers.setBotInstance(bot); // Set the bot instance in command handlers for sending messages.
    // Determine the target chat ID from config, falling back to general chatId.
    const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

    logger.info(`🌸 MyNebula v1 (Virtual Assistant) is now running.`);

    // Initialize the AI response generator with all necessary dependencies.
    initializeAIResponseGenerator({
      config, // Configuration settings.
      memory, // Bot's memory module.
      contextManager, // Context detection handler.
      timeHelper, // Time utility functions.
      commandHandlers, // Command execution handlers.
      weather, // Weather module.
      lists, // Command lists and other utilities.
      relationState, // Relationship management system.
      loveState, // Romance mode state.
      ttsManager, // Text-to-speech manager.
      chatFormatter, // Chat history formatter.
      ltmProcessor, // Long-term memory processor.
      visionHandler, // AI vision handler.
      logger, // Logging utility.
      globalState, // Global state variables.
      sendMessageFunction: sendMessage, // Function to send messages.
    });

    lists.rescheduleReminders(bot); // Reschedule any pending reminders on bot startup.
    initTtsSchedules(bot); // Initialize TTS schedules for proactive announcements.

    checkNgambekStatus(configuredChatId); // Perform initial check for "ngambek" status.
    updateTimeBasedModes(configuredChatId); // Update time-based modes (e.g., daily greetings, mood changes).

    // Set up all recurring cron jobs for background tasks.
    setupCronJobs(
      bot, // Pass the bot instance.
      updateTimeBasedModes, // Function to update time-based modes.
      checkNgambekStatus, // Function to check ngambek status periodically.
      Sentry // Sentry for error reporting within cron jobs.
    );

    // Set up the message listener after all other initializations are complete.
    setupMessageListener(bot);
  },
};
