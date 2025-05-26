![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E=18.0.0-green)

# 🌸 HoshinoBot v4.0 – Productive Assistant

> Telegram ChatBot smart, and act as your assistant.  
> Built with love, by [@rafardhancuy](https://github.com/rafacuy)  
> MIT License | Bahasa Indonesia 🇮🇩 | Full Offline-Compatible

---

## ✨ What's New in v4.0?

- 🧠 **Super Memory Module!**: Migrate to `.ndjson.gz` format, super light & scalable
- 💾 **Ring Buffer + Archival**: History auto-archive, no RAM overload
- 🌙 **Dynamic DeepTalk Mode**: Curhat mode active between 21:00 - 04:00
- 📦 **Cache, Limit, Schedule, Backup**: Optimize VPS usage & resources
- 💬 **Custom Command Additions**: More interactive commands (reminder, note, search)
- 🌐 **Improved Web Search**: Now supports Google Custom Search with your API key

---

## 🔥 Main Features

- 💬 AI ChatBot with OpenRouter (LLaMA, Claude, etc)
- 🌦️ Weather Info & Personalized Weather Reminders
- 🙏 Automatic Prayer Schedule (Asia/Jakarta)
- 🎶 Sad Song Recommendations at Night
- 🎭 Dynamic Mood System (with rate limit and mood reset)
- ⏳ Auto Cache Cleanup & Memory Flush
- 📝 Personal Notes & Reminders
- 🔍 Web Search with Google Custom Search
- 💌 DeepTalk Mode (Deeptalk/calm conversation)

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (>= 18)
- **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)
- **OpenRouter API Key** from [OpenRouter](https://OpenRouter.ai)
- **OpenWeatherMap API Key** from [OpenWeatherMap](https://openweathermap.org)
- **Google Custom Search API Key & CSE ID** (Optional)
- **Your Telegram Chat ID** for scheduled messages

### Installation

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
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_TOKEN # Replace it to your actual Telegram Bot Token
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY # Replace it to your OpenRouter API key
OPENROUTER_MODEL=meta-llama/llama-3.5-8b-instruct # (Optional) Change it to model that you want
WEATHER_API_KEY=YOUR_OPENWEATHERMAP_KEY # Replace it to your actual OpenWeather API Key
LATITUDE=-6.200000 # Change it to your location LATITUDE (e.g, Jakarta)
LONGITUDE=106.816666 # Change it to your location LONGITUDE (e.g, jakarta)
TARGET_CHAT_ID=YOUR_CHAT_ID # Your Chat ID
GOOGLE_SEARCH_API_KEY=YOUR_GOOGLE_KEY # Your google search API KEY
GOOGLE_SEARCH_CX=YOUR_CSE_ID # Your google search CSEID
```

- `TELEGRAM_BOT_TOKEN`: Your Telegram Bot API token from BotFather.
- `OPENROUTER_API_KEY`: Your API key from [OpenRouter](https://openrouter.ai)
- `OPENROUTER_MODEL`: The specific AI model you want to use from OpenRouter (e.g., meta-llama/llama-3.1-8b-instruct).
- `TARGET_CHAT_ID`: The chat ID where Hoshino will send scheduled messages like prayer times and weather updates
- `WEATHER_API_KEY`: Your API key from [OpenWeatherMap](https://OpenWeatherMap.org)
- `LATITUDE` and `LONGITUDE`: The geographic coordinates for which you want weather updates.
- `GOOGLE_SEARCH_API_KEY`: Your API Key from [GoogleCustomSearch](https://developers.google.com/custom-search/v1/overview)
- `GOOGLE_SEARCH_CX`: Your API Key from [GoogleCustomSearchEngine](https://developers.google.com/custom-search/v1/overview)

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
    - /reminder HH:MM (Message): Set reminder.
    - /note pesan: Save notes.
    - /shownotes: Show personal notes.
    - /search query: Search for info on Google.
    - /help: Show lists of commands.
    - /author: Information about creators.

- **Scheduled Messages**: If `TARGET_CHAT_ID` is configured, Hoshino will automatically send:
    - Daily prayer time reminders for Subuh, Dzuhur, Ashar, Maghrib, and Isya (Asia/Jakarta timezone).
    - Periodic weather updates and personalized weather-based reminders (every 5 hours).   
    - Sad song recomendations every 10 PM.

## Deployment

### Server

To deploy HOSHINO on a live system, you would typically use a process manager like PM2 to keep the Node.js application running continuously.

- Live: For a production environment, ensure the bot is running with PM2 or a similar solution to handle restarts and logging.
- Development: Run directly via **node index.js.**


## 📂 Directory Structure
```bash
hoshino-chatbot/
├── config/
│   └── config.js          # Manual config (if not using .env)
├── utils/
│   ├── sendMessage.js     # Telegram message sending
│   ├── timeHelper.js      # Jakarta time format
│   └── commandHelper.js   # Reminder, Note, Search
├── data/
│   ├── reminders.json     # Reminder storage
│   └── notes.json         # Note storage
├── hoshino.js             # Core HoshinoBot logic
├── index.js               # Bot entry point
└── README.md              # This documentation
```

## 🙏 Thank you
**For those** of you who have strayed into this repo.

**For those** of you who have ever felt lonely at night.

**Hoshino** is ready to be your virtual conversation partner. 🌙💖

## 👤 About the Author

**Arash**

- TikTok: [@rafardhancuy](https://tiktok.com/@rafardhancuy)

- GitHub: [Rafacuy](https://github.com/Rafacuy)

- Language: Indonesian

- Time Zone: Asia/Jakarta

- License: MIT

## 📜 License
This project is licensed under the MIT License. Please see [LICENSE](./LICENSE) for details.

