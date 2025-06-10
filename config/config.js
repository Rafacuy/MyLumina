// config/config.js

module.exports = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    openRouterApiKey: process.env.OPENROUTER_API_KEY, // OpenRouterAPI
    openRouterModel: process.env.OPENROUTER_MODEL || 'qwen/qwen3-4b:free',
    togetherAiApiKey: process.env.TOGETHER_API_KEY, // Together.ai API
    groqApiKey: process.env.GROQ_API_KEY, // Groq API Key
    newsApiKey: process.env.NEWSAPI,
    USER_NAME: 'Arash', // Username
    TARGET_CHAT_ID: process.env.TARGET_CHAT_ID,
    weatherApiKey: process.env.WEATHER_API_KEY,
    calendarificApiKey: process.env.CALENDARIFIC_API_KEY,
    GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_CX: process.env.GOOGLE_SEARCH_CX,
    latitude: process.env.LATITUDE || '-7.412904',
    longitude: process.env.LONGITUDE || '112.503495' 
};

