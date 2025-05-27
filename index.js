// index.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/config');
const lyraInteraction = require('./Lyra');

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

lyraInteraction(bot);