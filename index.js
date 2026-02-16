// index.js
// Entry-point for MyLumina bot project.
// Initializes grammY bot with long-polling and sets up graceful shutdown.

require('dotenv').config();
const express = require('express');
const Sentry = require('@sentry/node');

const config = require('./config/config');
const { initLuminabot } = require('./core/core');
const memory = require('./data/memory');
const logger = require('./utils/logger');
const telegramClient = require('./utils/telegramClient');
const { handlePollingError, setupGlobalErrorHandlers } = require('./utils/pollingErrorHandler');

// === Sentry Initialization ===
if (config.sentryDsn) {
    Sentry.init({
        dsn: config.sentryDsn,
        tracesSampleRate: 1.0,
    });
    logger.info('[Sentry] Sentry error tracking initialized.');
}

// === Setup global error handlers ===
setupGlobalErrorHandlers();

// === Express app initialization for keep-alive system ===
const app = express();

app.get('/', (req, res) => {
    res.send('🌸 MyLumina bot is alive and running!');
});

// === Initialize Telegram Client and Bot ===
let bot;

async function initializeBot() {
    try {
        // Initialize the Telegram client
        await telegramClient.initialize();
        bot = telegramClient.getBot();

        // Initialize core bot logic
        initLuminabot(bot);

        logger.info('[Bot] MyLumina bot initialized successfully.');
        return bot;
    } catch (error) {
        logger.error(
            {
                event: 'bot_initialization_error',
                error: error.message,
                stack: error.stack,
            },
            '[Bot] Failed to initialize bot',
        );
        Sentry.captureException(error);
        throw error;
    }
}

// === Graceful Shutdown Handler ===
const gracefulShutdown = async (signal) => {
    logger.info(`[Shutdown] ${signal} received. Initiating graceful shutdown...`);

    try {
        // Stop the bot polling/webhooks
        if (bot) {
            await telegramClient.stop();
            logger.info('[Bot] Bot stopped gracefully.');
        }

        // Close database connection
        await memory.closeDb();
        logger.info('[DB] Database connection closed.');

        logger.info('[Shutdown] Graceful shutdown completed successfully.');
        process.exit(0);
    } catch (error) {
        logger.error(
            {
                event: 'shutdown_error',
                error: error.message,
                stack: error.stack,
            },
            '[Shutdown] Error during graceful shutdown',
        );
        Sentry.captureException(error);
        process.exit(1);
    }
};

// === Register signal handlers ===
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// === Error handler for bot long-polling ===
telegramClient.getBot().catch((error) => {
    handlePollingError(error);
});

// === Main startup function ===
async function start() {
    try {
        // Initialize and start the bot
        await initializeBot();

        // Start long-polling
        await bot.start({
            // Optional: Configure polling parameters
            allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result'],
            timeout: 30, // Long-polling timeout in seconds
            drop_pending_updates: false, // Keep pending updates
        });

        logger.info('[Startup] Bot started successfully with long-polling.');
    } catch (error) {
        logger.error(
            {
                event: 'startup_error',
                error: error.message,
                stack: error.stack,
            },
            '[Startup] Failed to start bot',
        );
        Sentry.captureException(error);
        process.exit(1);
    }
}

// === Start Express server for keep-alive ===
app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, `[Server] Keep-alive server running on port ${config.PORT}`);
});

// === Initialize bot and start polling ===
start().catch((error) => {
    logger.error({ error: error.message }, '[Startup] Fatal error during startup');
    process.exit(1);
});
