require('dotenv').config();

module.exports = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL || 'qwen/qwen3-4b:free',
    weatherApiKey: process.env.WEATHER_API_KEY,
    latitude: process.env.LATITUDE || '-7.412904',
    longitude: process.env.LONGITUDE || '112.503495' 
};