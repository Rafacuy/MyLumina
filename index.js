// index.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const hoshinoInteraction = require('./hoshino');

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

console.log("🧪 ENV Target Chat ID:", process.env.TARGET_CHAT_ID);
console.log("🧪 CONFIG Target Chat ID:", config.TARGET_CHAT_ID);

hoshinoInteraction(bot);