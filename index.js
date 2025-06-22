// index.js

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express"); // Import Express
const bodyParser = require("body-parser"); // Untuk parsing body JSON
const memory = require("./data/memory");
const config = require("./config/config");
const { initLuminabot, generateAIResponse } = require("./core/core");
const command = require("./handler/commandHandlers");
const Sentry = require("@sentry/node");
const logger = require("./utils/logger");

// Inisialisasi Sentry
Sentry.init({
  dsn: config.sentryDsn,
  tracesSampleRate: 1.0,
});

command.setAISummarizer(generateAIResponse);

// instance Express app
const app = express();
app.use(bodyParser.json()); // Middleware untuk parsing body JSON

// instance bot
const bot = new TelegramBot(config.telegramBotToken);

// Inisialisasi Luminabot
initLuminabot(bot);

// Setel webhook untuk bot
const webhookUrl = `${config.WEBHOOK_URL}/bot${config.telegramBotToken}`;
bot
  .setWebHook(webhookUrl)
  .then(() => {
    logger.info(`[Webhook] Webhook berhasil diatur ke: ${webhookUrl}`);
  })
  .catch((error) => {
    logger.error(
      {
        event: "set_webhook_error",
        error: error.message,
        stack: error.stack,
      },
      "[Webhook] Gagal mengatur webhook:"
    );
    Sentry.captureException(error);
    process.exit(1); // Keluar jika webhook gagal diatur
  });

// pembaruan dari Telegram melalui webhook
app.post(`/bot${config.telegramBotToken}`, (req, res) => {
  bot.processUpdate(req.body); // Proses pembaruan menggunakan metode bot.processUpdate
  res.sendStatus(200);
});

// Mulai server Express
app.listen(config.PORT, () => {
  logger.info(`[Server] Server berjalan di port ${config.PORT}`);
});

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
    process.exit(1);
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
    process.exit(1);
  }
});
