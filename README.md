![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E=18.0.0-green)

# 💖 HoshinoBot v3.0 – Memory of Love Edition

> Telegram ChatBot smart, spoiled, and mature virtual girlfriend

> Built with love, by [@rafardhancuy](https://github.com/rafacuy)

> MIT License | Bahasa Indonesia 🇮🇩 | Full Offline-Compatible

---

## ✨ What's New in v3.0?

🔥 **Big Update "Memory of Love"**
-  **Super Memory Module!**: Migrate to `.ndjson.gz` format, super light & scalable
- 💾 **Ring Buffer + Archival**: History is automatically archived, without RAM being broken
- ⏰ **Dynamic DeepTalk Mode**: Enter chat mode every 21.00 - 04.00
- 📦 **Cache, Limit, Schedule, Backup**: All are optimal & save free VPS resources
- 💬 **Automatic AI Context from `memory.js`**, no redundant state, no drama

---

##  Main Features

- 💬 AI ChatBot with OpenRouter (Meta, Claude, etc)
-  Weather Info & Weather Reminder
- 🙏 Automatic Prayer Schedule
- 🎶 Sad Song Recommendations
- 🎭 Dynamic Mood System
- ⏳ Auto Cache + Rate Limiter
- 🧠 Custom Memory Layer (Fully Open Source)
- 💌 Deep-Talk / Curhat Mode

---

## Getting Started

These instructions will guide you through setting up and running HOSHINO on your local machine for development and testing.

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js**: The bot is built with Node.js. Make sure you have it installed on your system.
- **Telegram Bot Token**: You'll need to create a new bot via BotFather on Telegram to obtain your unique API token.
- **OpenRouter API Key**: Hoshino uses OpenRouter for its AI capabilities. You'll need an API key from [OpenRouter](https://OpenRouter.ai)
- **OpenWeatherMap API Key**: For weather updates, Hoshino integrates with OpenWeatherMap. Obtain an API key from [OpenWeatherMap](https://OpenWeatherMap.org)
- **Your Telegram Chat ID**: This is required for Hoshino to send scheduled messages (prayer times, weather updates) to a specific chat.

## Installation

Follow these steps to get your HOSHINO bot up and running:

### 1. **Clone the repository**:
```
git clone https://github.com/Rafacuy/hoshino-chatbot.git
cd hoshino-chatbot
```
### 2. **Install dependencies**:
```
npm install
``` 
### 3. **Configure dotenv: Create a '.env' (dotenv) file in the root directory.**
Example:

```bash
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_TOKEN # Change it to your actual telegram bot token
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY # Change it to your actual OpenRouter API key
OPENROUTER_MODEL=meta-llama/llama-3.3-8b-instruct:free # Change it to model that you want to use
TARGET_CHAT_ID=YOUR_CHAT_ID # Change it to your ChatID
WEATHER_API_KEY=YOUR_WEATHER_KEY # Change it to your actual OpenWeatherMap API
LATITUDE=-6.200000 # Change it to your location LATITUDE (e.g, Jakarta)
LONGITUDE=106.816666 # Change it to your location LONGITUDE (e.g, Jakarta)
```

- `TELEGRAM_BOT_TOKEN`: Your Telegram Bot API token from BotFather.
- `OPENROUTER_API_KEY`: Your API key from [OpenRouter](https://openrouter.ai)
- `OPENROUTER_MODEL`: The specific AI model you want to use from OpenRouter (e.g., meta-llama/llama-3.1-8b-instruct).
- `TARGET_CHAT_ID`: The chat ID where Hoshino will send scheduled messages like prayer times and weather updates
- `WEATHER_API_KEY`: Your API key from [OpenWeatherMap](https://OpenWeatherMap.org)
- `LATITUDE` and `LONGITUDE`: The geographic coordinates for which you want weather updates.

### 4. Customize hoshino.js **(Optional)**:
- You can change `USER_NAME` to the name of the user Hoshino will interact with (default: 'Arash').
- `Adjust MOOD_TIMEOUT_MS` to change how long Hoshino's mood lasts before resetting to 'NORMAL' (default: 2 days).
- `Modify SLEEP_START_HOUR` and `SLEEP_END_HOUR` to set Hoshino's sleep schedule (default: 00:00 - 04:00).
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` control the rate limiting behavior.
- `CONVERSATION_HISTORY_LIMIT` defines how many recent messages are sent to the AI for context (default: 3).

## Usage

Once the bot is running, you can interact with Hoshino in your Telegram chat.

```bash
# To start the Hoshino bot
node index.js
```

- **General Chat**: Send any message to Hoshino, and she will respond based on her AI model, personality, and current mood.
- **Predefined Commands**: Hoshino has specific responses for certain phrases:
    - `hai, halo, bot, helo, haii, woy, hoy`: Hoshino will greet you happily.
    - `terima kasih, makasih`: Hoshino will express happiness to have helped.
    - `siapa kamu, kamu siapa`: Hoshino will introduce herself as your girlfriend.
    - `lagi apa, lagi ngapain, ngapain`: Hoshino will give a loving response about thinking of you.

- **Scheduled Messages**: If `TARGET_CHAT_ID` is configured, Hoshino will automatically send:
    - Daily prayer time reminders for Subuh, Dzuhur, Ashar, Maghrib, and Isya (Asia/Jakarta timezone).
    - Periodic weather updates and personalized weather-based reminders (every 3 hours).   


## Deployment

### Server

To deploy HOSHINO on a live system, you would typically use a process manager like PM2 to keep the Node.js application running continuously.

- Live: For a production environment, ensure the bot is running with PM2 or a similar solution to handle restarts and logging.
- Development: Run directly via **node index.js.**

---

## 🙏 Thank you
**For those** of you who have strayed into this repo.
**For those** who have ever felt alone at night.
**For all lovers** of cute and spoiled bots on Telegram.
This bot is for **you.**


## 📜 License
MIT License

Made with 💘 by @rafardhancuy

