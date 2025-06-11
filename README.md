![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E=18.0.0-green)

# 🌸 AlyaBot v8.2 (Optimized) – Productive Assistant

> Telegram ChatBot smart, and act as your assistant.  
> Built with love, by [@rafardhancuy](https://github.com/rafacuy)  
> MIT License | Bahasa Indonesia 🇮🇩 | Full Offline-Compatible

---

## ✨ What's New in v8.2?

- **Relation System**: The more you interact with Alya, the more points and levels you will gain.
- **Context System**: Looking for the context of your conversation with Alya.
- **LTM (Long-term memory)**: Use keywords like: Favorite food. Favorite movie, etc. and Alya will remember it.
- **Holidays Information**: Notifying important days / day information
- **TTS Everyday!**: Alya will send VN every morning, afternoon, evening and prayer time.
- **Add: News information & summary**: Alya will send daily news every morning in 8 AM.
- **Fixed Bugs & Errors**: Now it has been optimized for user convenience.

---

## 🔥 Main Features

- 💬 AI ChatBot with Groq (LLaMA, deepseek, etc)
- Weather Info & Personalized Weather Reminders
- 🙏 Automatic Prayer Schedule (Asia/Jakarta)
- 🎶 Sad Song Recommendations at Night
- 🎭 Dynamic Mood System (with rate limit and mood reset)
- ⏳ Auto Cache Cleanup & Memory Flush
- 📝 Personal Notes & Reminders
- 🔍 Web Search with Google Custom Search
- 💌 DeepTalk Mode (Deeptalk/calm conversation)
- Voice Note everyday (Morning, Afternoon, tonight and Prayers time)

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (>= 18)
- **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)
- **Groq API Key** from [Groq](https://groq.com)
- **OpenWeatherMap API Key** from [OpenWeatherMap](https://openweathermap.org)
- **Google Custom Search API Key & CSE ID** 
- **Your Telegram Chat ID** for scheduled messages

### Installation

Follow these steps to get your Alya bot up and running:

### 1. **Clone the repository**:
```
git clone https://github.com/Rafacuy/Alya-chatbot.git
cd Alya-chatbot
```
### 2. **Install dependencies**:
```
npm install
``` 
### 3. **Configure dotenv: Create a '.env' (dotenv) file in the root directory.**
Example:

```bash
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_TOKEN # Replace it to your actual Telegram Bot Token
GROQ_API_KEY=YOUR_GROQ_API_KEY # Change to your Groq API Key
WEATHER_API_KEY=YOUR_OPENWEATHERMAP_KEY # Replace it to your actual OpenWeather API Key
LATITUDE=-6.200000 # Change it to your location LATITUDE (e.g, Jakarta)
LONGITUDE=106.816666 # Change it to your location LONGITUDE (e.g, jakarta)
NEWSAPI=YOUR_NEWSAPI_KEY # Change it to your actual newsapi key
TARGET_CHAT_ID=YOUR_CHAT_ID # Your Chat ID
CALENDARIFIC_API_KEY=YOUR_API_KEY # Change it to your actual Calendarific API KEY
GOOGLE_SEARCH_API_KEY=YOUR_GOOGLE_KEY # Your google search API KEY
GOOGLE_SEARCH_CX=YOUR_CSE_ID # Your google search CSEID
```

- `TELEGRAM_BOT_TOKEN`: Your Telegram Bot API token from BotFather.
- `GROQ_API_KEY`: Your Groq API Key from [groq](https://groq.com).
- `TARGET_CHAT_ID`: The chat ID where Alya will send scheduled messages like prayer times and weather updates
- `WEATHER_API_KEY`: Your API key from [OpenWeatherMap](https://OpenWeatherMap.org)
- `LATITUDE` and `LONGITUDE`: The geographic coordinates for which you want weather updates.
- `GOOGLE_SEARCH_API_KEY`: Your API Key from [GoogleCustomSearch](https://developers.google.com/custom-search/v1/overview)
- `GOOGLE_SEARCH_CX`: Your API Key from [GoogleCustomSearchEngine](https://developers.google.com/custom-search/v1/overview)
- `CALENDARIFIC_API_KEY`: Your API Key from [Calendarific](https://calendarific.com/).
- `NEWSAPI`: Your API key from [NewsAPI](https://newsapi.org)

### 4. Customize Alya **(Optional)**:
- You can change `USER_NAME` to the name of the user Alya will interact with (default: 'Arash') in [config.js](./config/config.js). 
- `Adjust MOOD_TIMEOUT_MS` to change how long Alya's mood lasts before resetting to 'NORMAL' (default: 2 days).
- `Modify SLEEP_START_HOUR` and `SLEEP_END_HOUR` to set Alya's sleep schedule (default: 00:00 - 04:00).
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` control the rate limiting behavior.
- `CONVERSATION_HISTORY_LIMIT` defines how many recent messages are sent to the AI for context (default: 3).
- You can add preference for LTM Alya.
- You can modified TTS to your TTS. [voices](./assets/voice/)

## Usage

Once the bot is running, you can interact with Alya in your Telegram chat.

```bash
# To start the Alya bot
npm start
```


- **General Chat**: Send any message to Alya, and she will respond based on her AI model, personality, and current mood.
- **Predefined Commands**: Alya has specific responses for certain phrases:
    - `hai, halo, bot, helo, haii, woy, hoy`: Alya will greet you happily.
    - `terima kasih, makasih`: Alya will express happiness to have helped.
    - `siapa kamu, kamu siapa`: Alya will introduce herself.
    - `lagi apa, lagi ngapain, ngapain`: Alya will give a loving response about thinking of you.
    - /reminder HH:MM (Message): Set reminder.
    - /note pesan: Save notes.
    - /shownotes: Show personal notes.
    - /search query: Search for info on Google.
    - /help: Show lists of commands.
    - /hariini: today's information.
    - /author: Information about creators.

- **Scheduled Messages**: If `TARGET_CHAT_ID` is configured, Alya will automatically send:
    - Daily prayer time reminders for Subuh, Dzuhur, Ashar, Maghrib, and Isya (Asia/Jakarta timezone).
    - Periodic weather updates and personalized weather-based reminders (every 5 hours).   
    - Sad song recomendations every 10 PM.

## Deployment

### Server

To deploy Alya on a live system, you would typically use a process manager like PM2 to keep the Node.js application running continuously.

- Live: For a production environment, ensure the bot is running with PM2 or a similar solution to handle restarts and logging.
- Development: Run directly via **node index.js.**



## 🙏 Thank you
**For those** of you who have strayed into this repo.

**For those** of you who have ever felt lonely at night.

**Alya** is ready to be your virtual conversation partner. 🌙💖

## 👤 About the Author

**Arash**

- TikTok: [@rafardhancuy](https://tiktok.com/@rafardhancuy)

- GitHub: [Rafacuy](https://github.com/Rafacuy)

- Language: Indonesian

- Time Zone: Asia/Jakarta

- License: MIT

## 📜 License
This project is licensed under the MIT License. Please see [LICENSE](./LICENSE) for details.

