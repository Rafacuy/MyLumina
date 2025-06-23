// index.js (Diubah ke Mode Polling)

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const memory = require("./data/memory");
const config = require("./config/config");
const { initLuminabot } = require("./core/core");
const command = require("./handler/commandHandlers");
const Sentry = require("@sentry/node");
const logger = require("./utils/logger");

// Inisialisasi Sentry jika ada DSN
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 1.0,
  });
  logger.info("[Sentry] Sentry is initialized.");
}

// Inisialisasi Express app
const app = express();

// Rute dasar untuk keep-alive
app.get("/", (req, res) => {
  res.send("Bot is alive and polling!");
});

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

// Memberi tahu bot tentang kesalahan polling agar tidak crash
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

// Inisialisasi logika utama bot
initLuminabot(bot);


// Mulai server Express untuk endpoint keep-alive
app.listen(config.PORT, () => {
  logger.info(`[Server] Keep-alive server running on port ${config.PORT}`);
});

// Tangani penutupan aplikasi dengan benar
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  try {
    // Hentikan polling bot
    if (bot.isPolling()) {
      await bot.stopPolling();
      logger.info("[Bot] Polling stopped.");
    }
    // Tutup koneksi database
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

