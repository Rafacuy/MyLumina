// utils/sendMessage.js

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');

const bot = new TelegramBot(config.telegramBotToken);

async function sendMessage(chatId, text) {
  try {
    await bot.sendMessage(chatId, text);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

/**
* Mengirim voice note ke chat tertentu.
* @param {number|string} chatId ID obrolan tujuan.
* @param {string} audioUrl URL dari file audio (misal: dari Google Drive).
* @param {string} caption Caption untuk voice note (opsional).
*/
const sendVoiceNote = async (chatId, audioUrl, caption = '') => {
  try {
      await bot.sendVoice(chatId, audioUrl, { caption: caption });
      console.log(`[SendMessage] Voice note berhasil dikirim ke ${chatId}.`);
  } catch (error) {
      console.error(`[SendMessage] Gagal mengirim voice note ke ${chatId}:`, error.message);
  }
};


module.exports = { 
  sendMessage,
  sendVoiceNote
 };