const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const hoshinoInteraction = require('./hoshino');

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

hoshinoInteraction(bot);