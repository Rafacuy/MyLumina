// config/config.js
// This file mantains configurations of API Key, Tokens, etc

const path = require('path');

module.exports = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN, // Telegram bot token
    openRouterApiKey: process.env.OPENROUTER_API_KEY, // OpenRouterAPI
    openRouterModel: process.env.OPENROUTER_MODEL || 'qwen/qwen3-4b:free',
    togetherAiApiKey: process.env.TOGETHER_API_KEY, // Together.ai API
    groqApiKey: process.env.GROQ_API_KEY, // Groq API Key
    PORT: process.env.PORT || 3000, // PORT For express app (default 3000 for development)
    newsApiKey: process.env.NEWSAPI, // NEWSAPI Key
    ocrSpaceApiKey: process.env.OCR_API_KEY, // ocr.space API KEY
    imaggaApiKey: process.env.IMAGGA_API_KEY, // Imagga API KEY
    imaggaApiSecret: process.env.IMAGGA_API_SECRET, // Imagga API Secret
    TARGET_CHAT_ID: process.env.TARGET_CHAT_ID, // ChatId
    USER_NAME: process.env.USER_NAME || 'Tuan', // User Name
    sentryDsn: process.env.DSN_KEY, // DSN Key for sentry
    weatherApiKey: process.env.WEATHER_API_KEY, // OpenWeather API Key
    calendarificApiKey: process.env.CALENDARIFIC_API_KEY, // Calendarific API Key
    GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY, // Google search API key
    GOOGLE_SEARCH_CX: process.env.GOOGLE_SEARCH_CX, // Google search CX
    latitude: process.env.LATITUDE || '-7.412904', // Latitude (Default Jakarta)
    longitude: process.env.LONGITUDE || '112.503495', // Longitude (Default Jakarta)
    selfieDirectory: process.env.SELFIE_DIRECTORY || path.join(__dirname, '..', 'assets', 'selfies'),
};
