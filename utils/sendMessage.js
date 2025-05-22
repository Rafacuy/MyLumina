// utils/sendMessage.js

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');

const bot = new TelegramBot(config.telegramBotToken);

async function sendMessage(chatId, text) {
  try {
    await bot.sendMessage(chatId, text);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

module.exports = sendMessage;