// index.js 
// Entry-point for this project.

require("dotenv").config(); // Dotenv import for config.js
const TelegramBot = require("node-telegram-bot-api"); // Telegram Bot API Library 
const express = require("express"); // Express.js import for keep-alive functions
const memory = require("./data/memory"); // Contains persistent-data memory for Lumina
const config = require("./config/config"); // Contains API Key, Token, etc secured with dotenv
const { initLuminabot } = require("./core/core"); // Core module for LuminaBot
const Sentry = require("@sentry/node"); // Sentry for error trace
const logger = require("./utils/logger"); // Logger utility based on pino lubrary for structured logging

// Sentry Initialization
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 1.0,
  });
  logger.info("[Sentry] Sentry is initialized.");
}

// Express app initialization
const app = express();

// Basic route for keep-alive system
app.get("/", (req, res) => {
  res.send("Bot is alive and polling!");
});

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

// Notify the bot about polling errors to prevent it from crashing.
bot.on("polling_error", (error) => {
    logger.error(
      {
        event: "polling_error",
        code: error.code,
        message: error.message,
      },
      "[Polling] Polling error:"
    );
    Sentry.captureException(error);
});

// Initialize core logics for the bot
initLuminabot(bot);


// Start a Express server for keep-alive system endpoint
app.listen(config.PORT, () => {
  logger.info(`[Server] Keep-alive server running on port ${config.PORT}`);
});

// Handle application closing properly
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  try {
    // Stops bot polling procedure
    if (bot.isPolling()) {
      await bot.stopPolling();
      logger.info("[Bot] Polling stopped.");
    }
    // Close connection database
    await memory.closeDb();
    logger.info("[DB] Database connection closed.");
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        event: "shutdown_error",
        error: error.message,
        stack: error.stack,
      },
      "Error during graceful shutdown:"
    );
    Sentry.captureException(error);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

