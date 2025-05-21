# HOSHINO ChatBot v2.0 (Optimized)

HOSHINO is a personalized AI companion Telegram bot designed to act as your "girlfriend," Takanashi Hoshino. She is characterized by a lazy, affectionate, kind, and cute personality, with her conversations dynamically influenced by her current mood. The bot provides personalized reminders, AI-powered chat responses, and is optimized for efficient API usage through rate limiting and response caching.

## Getting Started

These instructions will guide you through setting up and running HOSHINO on your local machine for development and testing.

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js**: The bot is built with Node.js. Make sure you have it installed on your system.
- **Telegram Bot Token**: You'll need to create a new bot via BotFather on Telegram to obtain your unique API token.
- **OpenRouter API Key**: Hoshino uses OpenRouter for its AI capabilities. You'll need an API key from OpenRouter.ai.
- **OpenWeatherMap API Key**: For weather updates, Hoshino integrates with OpenWeatherMap. Obtain an API key from [OpenWeatherMap](OpenWeatherMap.org)
- **Your Telegram Chat ID**: This is required for Hoshino to send scheduled messages (prayer times, weather updates) to a specific chat.

## Installation

Follow these steps to get your HOSHINO bot up and running:

### 1. **Clone the repository**:
```
git clone https://www.google.com/search?q=https://github.com/Rafacuy/HOSHINO-v2.0-Optimized.git
cd HOSHINO-v2.0-Optimized 
```
### 2. **Install dependencies**:
```
npm install
``` 
### 3. **Configure config.js: Create a config.js file in the root directory.**
Example:

```js
// config.js
module.exports = {
    telegramBotToken: 'YOUR_TELEGRAM_BOT_TOKEN', // Your Telegram Bot API token
    openRouterApiKey: 'YOUR_OPENROUTER_API_KEY', // API key for OpenRouter AI
    openRouterModel: 'meta-llama/llama-3.1-8b-instruct', // The AI model (e.g., meta-llama/llama-3.1-8b-instruct)
    weatherApiKey: 'YOUR_OPENWEATHERMAP_API_KEY', // API key for OpenWeatherMap
    latitude: -6.2088, // Latitude for weather updates (Example: Jakarta)
    longitude: 106.8456, // Longitude for weather updates (Example: Jakarta)
    TARGET_CHAT_ID: 'YOUR_TARGET_CHAT_ID', // The Telegram chat ID for scheduled messages
    chatId: 'YOUR_TARGET_CHAT_ID' // Redundant, but kept for compatibility. TARGET_CHAT_ID is preferred.
};
```

- telegramBotToken: Your Telegram Bot API token from BotFather.
- openRouterApiKey: Your API key from OpenRouter.
- openRouterModel: The specific AI model you want to use from OpenRouter (e.g., meta-llama/llama-3.1-8b-instruct).
- weatherApiKey: Your API key from OpenWeatherMap.
- latitude and longitude: The geographic coordinates for which you want weather updates.
- TARGET_CHAT_ID: The chat ID where Hoshino will send scheduled messages like prayer times and weather updates.

### 4. Customize hoshino.js **(Optional)**:
- You can change `USER_NAME` to the name of the user Hoshino will interact with (default: 'Arash').
- `Adjust MOOD_TIMEOUT_MS` to change how long Hoshino's mood lasts before resetting to 'NORMAL' (default: 2 days).
- `Modify SLEEP_START_HOUR` and `SLEEP_END_HOUR` to set Hoshino's sleep schedule (default: 00:00 - 04:00).
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` control the rate limiting behavior.
- `CONVERSATION_HISTORY_LIMIT` defines how many recent messages are sent to the AI for context (default: 10).

## Usage

Once the bot is running, you can interact with Hoshino in your Telegram chat.

```bash
# To start the Hoshino bot
node index.js
```

- General Chat: Send any message to Hoshino, and she will respond based on her AI model, personality, and current mood.
- Predefined Commands: Hoshino has specific responses for certain phrases:
    - `hai, halo, bot, helo, haii, woy, hoy`: Hoshino will greet you happily.
    - `terima kasih, makasih`: Hoshino will express happiness to have helped.
    - `siapa kamu, kamu siapa`: Hoshino will introduce herself as your girlfriend.
    - `lagi apa, lagi ngapain, ngapain`: Hoshino will give a loving response about thinking of you.

- Scheduled Messages: If `TARGET_CHAT_ID` is configured, Hoshino will automatically send:
    - Daily prayer time reminders for Subuh, Dzuhur, Ashar, Maghrib, and Isya (Asia/Jakarta timezone).
    - Periodic weather updates and personalized weather-based reminders (every 3 hours).   


## Deployment

### Server

To deploy HOSHINO on a live system, you would typically use a process manager like PM2 to keep the Node.js application running continuously.

- Live: For a production environment, ensure the bot is running with PM2 or a similar solution to handle restarts and logging.
- Development: Run directly via **node index.js.**


---

### Author

- Develop by: Arash
- TikTok: @rafardhancuy
- Github: https://github.com/Rafacuy

- **License**: This project is licensed under the MIT License.

