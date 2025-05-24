// hoshino.js
// HOSHINO v2.0 (Optimized)
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia)
// TIME FORMAT: Asia/jakarta
// MIT License

// IMPORTANT!
const axios = require('axios').default;
const config = require('./config'); // Configuration File (API, ChatID, etc)
const sendMessage = require('./utils/sendMessage'); // Utility functions (for sending message)
const memory = require('./memory'); // memory files, handling memory functions (including save, load, etc)
const schedule = require('node-schedule'); //  scheduling tasks like prayer times and weather updates
const { getJakartaHour } = require('./utils/timeHelper')

// 🌸 Hoshino Configuration Constants
const USER_NAME = 'Arash'; // The name of the user Hoshino interacts with (you can modified it)
const MOOD_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000; // Mood duration: 2 days in milliseconds
const OPEN_ROUTER_API_KEY = config.openRouterApiKey; // API key for OpenRouter AI
const OPEN_ROUTER_MODEL = config.openRouterModel; // AI model (I use meta: Llama 3.5 8B instruct)
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // Rate limit window: 20 seconds
const RATE_LIMIT_MAX_REQUESTS = 3; // Max requests allowed within the rate limit window per user
const SLEEP_START_HOUR = 0; // Hoshino's sleep start time (00:00 - midnight)
const SLEEP_END_HOUR = 4;   // Hoshino's sleep end time (04:00 - 4 AM)
const CONVERSATION_HISTORY_LIMIT = 3; // Limits the number of recent messages sent to AI for AI context
const TOTAL_CONVERSATION_HISTORY_LIMIT = 50; // Limits the total number of messages stored in memory
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes for cache and memory cleanup
const DEEPTALK_START_HOUR = 21; // Hoshino enters deeptalk mode at 21:00 (9 PM)

// Prayer Times (Configured for Asia/Jakarta timezone)
const PrayerTimes = {
    Subuh: { hour: 5, minute: 0, emoji: '🌙' },
    Dzuhur: { hour: 12, minute: 0, emoji: '☀️' },
    Ashar: { hour: 15, minute: 0, emoji: '⛅' },
    Maghrib: { hour: 18, minute: 0, emoji: '🌇' },
    Isya: { hour: 19, minute: 0, emoji: '🌌' }
};

// Mood Definitions
const Mood = {
    HAPPY: { emoji: '>.<', name: 'Happy' },
    SAD: { emoji: ':)', name: 'Sad' },
    ANGRY: { emoji: '😠', name: 'Angry' },
    LAZY: { emoji: '😪', name: 'Lazy' },
    LOVING: { emoji: '💖', name: 'Loving' },
    NORMAL: { emoji: '>~<', name: 'Normal' },
    CALM: { emoji: '😌', name: 'Tenang' }, 
};

// Global State Variables
let currentMood = Mood.NORMAL; // Hoshino's current mood
let moodTimeoutId; // Stores the ID of the mood reset timeout
let botInstance; // The Telegram Bot API instance
let conversationHistory = []; // Stores the full conversation history for persistence
let messageCache = new Map(); // Caches AI responses to avoid redundant API calls for identical prompts
let userRequestCounts = new Map(); // Tracks request counts for rate limiting per user
let isDeeptalkMode = false; // Flag to indicate if Hoshino is in deeptalk mode

// Load conversation history from memory on startup
memory.load().then(data => {
    conversationHistory = data || [];
    console.log(`Loaded ${conversationHistory.length} messages from memory.`);
}).catch(error => {
    console.error("Error loading conversation history from memory:", error);
});

/**
 * Simulates bot typing action in a given chat for a specified duration.
 * @param {string|number} chatId The chat ID where the typing action should be displayed.
 * @param {number} duration The duration in milliseconds for which the typing action is shown.
 */
const hoshinoTyping = async (chatId, duration = 1500) => {
    if (!botInstance) {
        console.warn("Bot instance not initialized for typing action. Cannot send typing indicator.");
        return;
    }
    try {
        await botInstance.sendChatAction(chatId, 'typing');
        // Return a promise that resolves after the duration, allowing for `await`
        return new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        console.error(`Error in hoshinoTyping for chat ID ${chatId}:`, error.message);
        // Do not rethrow the error; allow the main message processing flow to continue.
    }
};


/**
 * Sets Hoshino's mood and schedules a reset back to 'NORMAL' after a specified duration.
 * If the new mood is already the current mood, no action is taken to avoid redundant messages.
 * Moods like 'CALM' (for deeptalk) are not automatically reset.
 * @param {string|number} chatId The chat ID to send mood status messages to.
 * @param {object} newMood The new mood object (from Mood constants) to set.
 * @param {number} durationMs The duration in milliseconds for which the new mood should last.
 */
const setMood = (chatId, newMood, durationMs = MOOD_TIMEOUT_MS) => {
    clearTimeout(moodTimeoutId); // Clear any previously scheduled mood reset

    // Only update and announce the mood if it's actually changing
    if (currentMood !== newMood) {
        currentMood = newMood;
        if (chatId) {
            sendMessage(chatId, `Hoshino sedang ${newMood.name} ${newMood.emoji}`);
        }
    }

    // Schedule the mood reset only if the new mood is not 'NORMAL' or 'CALM'
    if (newMood !== Mood.NORMAL && newMood !== Mood.CALM) {
        moodTimeoutId = setTimeout(() => {
            currentMood = Mood.NORMAL;
            if (chatId) {
                sendMessage(chatId, `Hoshino kembali normal ${Mood.NORMAL.emoji}`);
            }
        }, durationMs);
    }
};

/**
 * Gets a random mood from the predefined Mood constants, excluding moods intended for specific modes (like CALM).
 * @returns {object} A randomly selected mood object.
 */
const getRandomMood = () => {
    const moods = Object.values(Mood).filter(mood => mood !== Mood.CALM); // Exclude CALM from random moods
    const randomIndex = Math.floor(Math.random() * moods.length);
    return moods[randomIndex];
};

// Weather Functions
/**
 * Formats raw weather data into a user-friendly string.
 * @param {object} weatherData The weather data object obtained from OpenWeatherMap API.
 * @returns {string} A formatted string describing the current weather conditions.
 */
const getWeatherString = (weatherData) => {
    // Validate essential weather data properties
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return "Maaf, Hoshino tidak bisa mendapatkan informasi cuaca saat ini.";
    }
    const { temp, feels_like, humidity } = weatherData.main;
    const description = weatherData.weather[0].description;

    return `Suhu ${Math.round(temp)}°C (Terasa ${Math.round(feels_like)}°C)\n` +
        `Kelembaban: ${humidity}%\n` +
        `Kondisi: ${description.charAt(0).toUpperCase() + description.slice(1)}`;
};

/**
 * Provides a personalized weather-based reminder.
 * The reminder adapts based on the main weather condition.
 * @param {object} weatherData The weather data object from OpenWeatherMap API.
 * @returns {string} A personalized reminder message related to the weather.
 */
const getWeatherReminder = (weatherData) => {
    // Validate essential weather data properties
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return `Maaf, ${USER_NAME}... Hoshino lagi pusing nih... ${Mood.SAD.emoji}`;
    }
    const weatherMain = weatherData.weather[0].main; // Main weather condition
    const description = weatherData.weather[0].description; // Detailed weather description

    const reminders = {
        Rain: `Hujan-hujan gini ${USER_NAME} jangan lupa payung! ${Mood.SAD.emoji}`,
        Clear: `Cuacanya cerah~, cocok buat produktivitas nih, ${USER_NAME}! ${Mood.HAPPY.emoji}`,
        Clouds: `Awan mendung nih, siapa tau hujan~ ${Mood.NORMAL.emoji}`,
        Thunderstorm: `Ada petir! Cepetan masuk rumah ${USER_NAME}! ${Mood.SAD.emoji}`,
        Snow: `Wah, ada salju! Pakai baju yang tebal ya, ${USER_NAME}! ${Mood.HAPPY.emoji}`,
        Drizzle: `Gerimis nih ${USER_NAME}, hati-hati ya! ${Mood.NORMAL.emoji}`
    };

    // Return a specific reminder if a match is found, otherwise a generic one based on current mood
    return reminders[weatherMain] || `Cuaca hari ini ${description}, ${currentMood.emoji}`;
};

/**
 * Fetches current weather data from the OpenWeatherMap API.
 * Requires latitude, longitude, and an API key configured in `config.js`.
 * @returns {Promise<object|null>} A promise that resolves to the weather data object on success, or null on error.
 */
const getWeatherData = async () => {
    try {
        const latitude = config.latitude;
        const longitude = config.longitude;
        const apiKey = config.weatherApiKey;

        // Ensure all necessary configuration for weather API is present
        if (!latitude || !longitude || !apiKey) {
            console.error("Weather API configuration (latitude, longitude, or apiKey) is missing in config.js.");
            return null;
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=id`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error("Error fetching weather data:", error.message);
        // Log more detailed error information if available from the API response
        if (error.response) {
            console.error("Weather API response error status:", error.response.status);
            console.error("Weather API response data:", error.response.data);
        }
        return null;
    }
};

/**
 * Generates the system prompt for the AI based on current mode and mood.
 * @param {boolean} isDeeptalkMode - True if Hoshino is in deeptalk mode.
 * @param {object} currentMood - The current mood object.
 * @returns {string} The system prompt string.
 */
const getSystemPrompt = (isDeeptalkMode, currentMood) => {
    // Get the current in-memory history from the memory module
    const recentHistory = memory.getInMemoryHistory().slice(-CONVERSATION_HISTORY_LIMIT);

    if (isDeeptalkMode) {
        return `Kamu adalah Takanashi Hoshino, pacar ${USER_NAME}. 
        Kamu bersikap dewasa, menenangkan, dan bijaksana. Selalu peduli dan mendengarkan keluh kesah pacarmu, menggunakan kata sayang/cintaku dengan lembut.
        Berikan nasihat menenangkan jika pacarmu sedih atau butuh teman bicara. Waktu sekarang: ${getJakartaHour()} WIB. Mood: ${currentMood.name.toLowerCase()}. Riwayat percakapan: ${JSON.stringify(recentHistory)}. 
        Jangan sebut dirimu AI/fiksi; bersikaplah seperti manusia nyata.`
        ;
    } else {
        return `Kamu adalah Takanashi Hoshino, pacar ${USER_NAME}. 
        Sifatmu penyayang, baik hati, dan sering memanggil pacarmu sayang/cintaku.
        Berikan jawaban singkat, jelas, dan ramah. Mood: ${currentMood.name.toLowerCase()}. 
        Waktu sekarang: ${getJakartaHour()} WIB. Riwayat percakapan: ${JSON.stringify(recentHistory)}. 
        Jangan sebut dirimu AI/fiksi; bersikaplah seperti manusia nyata.`;
    }
};

// AI Function
/**
 * Generates an AI response (Using OpenRouter API)
 * This function handles:
 * - Time-based sleep mode for Hoshino.
 * - Response caching for identical prompts.
 * - Rate limiting per user to prevent abuse.
 * - Limiting conversation history sent to the AI for efficiency.
 * - Updating and persisting conversation history.
 * @param {string} prompt The user's text input.
 * @param {string|number} requestChatId The chat ID of the user who sent the prompt, used for rate limiting.
 * @returns {Promise<string>} A promise that resolves to the AI's generated response.
 */
const generateAIResponse = async (prompt, requestChatId) => {    
    const currentHour = getJakartaHour();

    // Hoshino's sleep mode: If within sleep hours, return a sleep message
    if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
        return `Zzz... ${USER_NAME} Hoshino lagi bobo' cantik dulu yaa... Nanti kita ngobrol lagi yaa! ${Mood.LAZY.emoji}`;
    }

    // Check if the prompt's response is already in cache
    if (messageCache.has(prompt)) {
        console.log(`Retrieving response from cache for: "${prompt}"`);
        return messageCache.get(prompt);
    }

    // Rate limiting logic per user (based on requestChatId)
    let userStats = userRequestCounts.get(requestChatId);
    if (userStats) {
        // If within the rate limit window and max requests reached, return a rate limit message
        if (now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS && userStats.count >= RATE_LIMIT_MAX_REQUESTS) {
            return `Sabar ya ${USER_NAME}, Hoshino lagi mikir nih... Jangan buru-buru dong! ${Mood.ANGRY.emoji}`;
        } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
            // Reset count if outside the window
            userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
        } else {
            // Increment count if within the window
            userRequestCounts.set(requestChatId, { count: userStats.count + 1, lastCalled: now.getTime() });
        }
    } else {
        // Initialize stats for a new user
        userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
    }

    // Prepare messages for the AI, including a limited portion of recent conversation history.
    const systemPrompt = getSystemPrompt(isDeeptalkMode, currentMood);

    const messages = [
        {
            role: 'system',
            content: systemPrompt
        },
        {
            role: 'user',
            content: prompt
        }
    ];

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: OPEN_ROUTER_MODEL,
            messages,
            temperature: 0.7, // Controls randomness of the response
            max_tokens: 160 // Maximum number of tokens in the AI's response
        }, {
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'X-Client-Type': 'application/json',
            }
        });

        // Validate the structure of the AI response
        if (response?.data?.choices?.length > 0 && response.data.choices[0].message?.content) {
            const aiResponse = response.data.choices[0].message.content;

            // Update the global conversation history via memory module
            await memory.addMessage({ role: 'user', content: prompt });
            await memory.addMessage({ role: 'assistant', content: aiResponse });

            // Cache the AI response for a short duration (1 minute)
            messageCache.set(prompt, aiResponse);
            setTimeout(() => {
                messageCache.delete(prompt); // Remove from cache after timeout
            }, 60 * 1000);

            return aiResponse;
        } else {
            console.error('AI Error: Unexpected response structure from OpenRouter:', response?.data || 'No response data');
            return `Gomenasai ${USER_NAME}~ Hoshino lagi bingung nih... 😵‍💫`;
        }

    } catch (error) {
        console.error('AI API Call Error:', error.response?.data || error.message);
        // Handle specific API errors, e.g., rate limits (HTTP 429)
        if (error.response && error.response.status === 429) {
            const limitResponses = [
                "Ugh.. Kayaknya Hoshino butuh istirahat deh..",
                "Hoshino lagi capek nih, " + USER_NAME + ".. Nanti lagi yaa..",
                "Aduh, Hoshino pusing... Jangan banyak tanya dulu ya..",
                "Maaf " + USER_NAME + ", Hoshino lagi gak mood jawab..",
                "Hoshino lagi sibuk nih, " + USER_NAME + ". Nanti kita ngobrol lagi yaa.."
            ];
            const randomIndex = Math.floor(Math.random() * limitResponses.length);
            return limitResponses[randomIndex];
        }
        // Generic error message for other API failures
        return `Gomenasai ${USER_NAME}~ Hoshino lagi pusing nih... 😵‍💫`;
    }
};

// Message Handlers: Define specific responses for common commands/phrases
const commandHandlers = [
    {
        pattern: /^(hai|halo|bot|helo|haii|woy|hoy)/i, // Regex pattern to match
        response: () => ({
            text: `${currentMood.emoji} Hai ${USER_NAME}! Ada yang bisa Hoshino bantu? ${currentMood.emoji}`,
            mood: Mood.HAPPY // Mood to set after this command
        })
    },
    {
        pattern: /(terima kasih|makasih)/i,
        response: () => ({
            text: `Sama-sama ${USER_NAME}~ Hoshino senang bisa membantu! ${Mood.HAPPY.emoji}`,
            mood: Mood.HAPPY
        })
    },
    {
        pattern: /(siapa kamu|kamu siapa)/i,
        response: () => ({
            text: `Aku Hoshino, pacar ${USER_NAME}~ Ada yang bisa Hoshino bantu? ${Mood.LOVING.emoji}`,
            mood: Mood.LOVING
        })
    },
    {
        pattern: /(lagi apa|lagi ngapain|ngapain)/i,
        response: () => ({
            text: `Lagi mikirin ${USER_NAME} terus~ ${Mood.LOVING.emoji}`,
            mood: Mood.LOVING
        })
    },
    {
        pattern: /^(mood|suasana hati)/i,
        response: () => ({
            text: `Mood Hoshino saat ini sedang ${currentMood.name} ${currentMood.emoji}`,
            mood: currentMood 
        })
    },
    {
        pattern: /^(cuaca|info cuaca)/i,
        response: async (chatId) => {
            await hoshinoTyping(chatId);
            const weather = await getWeatherData();
            if (weather) {
                return {
                    text: `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`,
                    mood: currentMood
                };
            } else {
                return {
                    text: `Hmm... Hoshino lagi pusing nih.. ${Mood.SAD.emoji}`,
                    mood: Mood.SAD
                };
            }
        }
    },
    {
        pattern: /^(lagu sedih|rekomendasi lagu sedih)/i,
        response: async (chatId) => { 
            await sendSadSongNotification(chatId);
            return {
                text: null, 
                mood: Mood.SAD
            };
        }
    },
    {
        pattern: /^(jam berapa|waktu sekarang)/i,
        response: () => {
            const now = new Date();
            const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' };
            const timeString = now.toLocaleTimeString('id-ID', options);
            return {
                text: `Sekarang jam ${timeString} sayang~ ${currentMood.emoji}`,
                mood: currentMood
            };
        }
    },
    {
        pattern: /^(tanggal berapa|hari ini tanggal berapa)/i,
        response: () => {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' };
            const dateString = now.toLocaleDateString('id-ID', options);
            return {
                text: `Hari ini ${dateString} sayang~ ${currentMood.emoji}`,
                mood: currentMood
            };
        }
    },
    {
        pattern: /(lagi sedih|lagi galau|patah hati|lagi nangis)/i,
        response: async (chatId) => { // Make async
            await sendSadSongNotification(chatId); // Call the function to send the song with preview
            return {
                text: `Jangan sedih dong sayang~ Hoshino di sini buat kamu. Peluk jauh dari Hoshino ${Mood.LOVING.emoji}`,
                mood: Mood.LOVING
            };
        }
    }
];

/**
 * Checks if a given string consists solely of emojis.
 * Uses Unicode property escapes for comprehensive emoji detection.
 * @param {string} str The input string to check.
 * @returns {boolean} True if the string contains only emojis, false otherwise.
 */
function isOnlyEmojis(str) {
    const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
    return emojiRegex.test(str);
}

/**
 * Checks if a given string consists solely of numeric digits.
 * @param {string} str The input string to check.
 * @returns {boolean} True if the string contains only numbers, false otherwise.
 */
function isOnlyNumbers(str) {
    const numberRegex = /^[0-9]+$/;
    return numberRegex.test(str);
}

// Sad Song Data
const sadSongs = [
    {
        "title": "Car's Outside - James Arthur",
        "url": "https://www.youtube.com/watch?v=v27COkZT4GY&pp=0gcJCdgAo7VqN5tD",
        "reason": "Lagu buat kamu yang udah nyampe tapi nggak bisa ketemu, karena keadaan nggak pernah berpihak."
    },
    {
        "title": "Keane - Somewhere Only We Know (Official Music Video)",
        "url": "https://www.youtube.com/watch?v=Oextk-If8HQ",
        "reason": "Kalau kamu pernah punya tempat rahasia bareng seseorang, tapi sekarang cuma tinggal kenangan. :)"
    },
    {
        "title": "Armada - Asal Kau Bahagia (Official Lyric Video)",
        "url": "https://www.youtube.com/watch?v=py6GDNgye6k",
        "reason": "Saat mencintai harus rela ngelepas, karena yang kamu cintai lebih bahagia tanpa kamu."
    },
    {
        "title": "Armada - Hargai Aku (Official Music Video)",
        "url": "https://www.youtube.com/watch?v=9B7UcTBJYCA",
        "reason": "Tentang rasa lelah dicintai sepihak dan harapan kecil agar kamu dilihat dan dihargai."
    },
    {
        "title": "Impossible - James Arthur [Speed up] | (Lyrics & Terjemahan)",
        "url": "https://www.youtube.com/watch?v=p6om2S-ZpRY",
        "reason": "Cerita tentang cinta yang udah hancur, tapi sisa sakitnya tetap tinggal selamanya."
    },
    {
        "title": "Daun Jatuh - Resah Jadi Luka (Official Audio)",
        "url": "https://www.youtube.com/watch?v=tOMFR0nQt48",
        "reason": "Ketika rasa resah nggak pernah reda, dan akhirnya berubah jadi luka yang dalam."
    },
    {
        "title": "Keisya Levronka - Tak Ingin Usai (Official Lyric Video)",
        "url": "https://www.youtube.com/watch?v=FB1YNEOspyA",
        "reason": "Karena nggak semua pertemuan bisa selamanya, meski kamu nggak mau itu berakhir."
    },
    {
        "title": "VIONITA - DIA MASA LALUMU, AKU MASA DEPANMU (OFFICIAL MUSIC VIDEO)",
        "url": "https://www.youtube.com/watch?v=05wQrmLejyo",
        "reason": "Untuk seseorang yang belum bisa lepas dari masa lalu, padahal masa depannya udah di depan mata."
    }
];

/**
 * Selects a random sad song from the list.
 * @returns {object} An object containing the title and URL of a random sad song.
 */
const getRandomSadSong = () => {
    const randomIndex = Math.floor(Math.random() * sadSongs.length);
    return sadSongs[randomIndex];
};

/**
 * Extracts the YouTube video ID from a given YouTube URL.
 * Supports standard watch URLs and short-form youtu.be URLs.
 * @param {string} url The YouTube URL.
 * @returns {string|null} The YouTube video ID, or null if not found.
 */
const getYouTubeVideoId = (url) => {
    let videoId = null;
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regExp);
    if (match && match[1]) {
        videoId = match[1];
    }
    return videoId;
};

/**
 * Sends a random sad song notification, including a YouTube video preview (thumbnail).
 * If sending the photo preview fails, it falls back to sending a text message with the URL.
 * @param {string|number} chatId The chat ID to send the notification to.
 */
const sendSadSongNotification = async (chatId) => {
    const song = getRandomSadSong();
    const videoId = getYouTubeVideoId(song.url);

    if (videoId) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const caption = `🎶 ${song.reason}\nJudul: ${song.title}\n${song.url}`;

        try {
            await botInstance.sendPhoto(chatId, thumbnailUrl, { caption: caption });
            console.log(`Sent YouTube preview for "${song.title}" to chat ID: ${chatId}`);
        } catch (error) {
            console.error(`Error sending YouTube photo preview for "${song.title}" to chat ID ${chatId}:`, error.message);
            // Fallback: Jika pengiriman foto gagal, kirim pesan teks biasa dengan URL
            sendMessage(chatId, `🎶 ${song.reason}\nJudul: ${song.title}\n${song.url}`);
        }
    } else {
        // Jika ID video tidak dapat diekstrak, kirim pesan teks saja
        console.warn(`Could not extract YouTube video ID from URL: ${song.url}. Sending text message only.`);
        sendMessage(chatId, `🎶 ${song.reason}\nJudul: ${song.title}\n${song.url}`);
    }
};

/**
 * Cleans up the message cache and prunes conversation history.
 */
const cleanupCacheAndMemory = async () => {
    console.log("Running cache and memory cleanup...");
    messageCache.clear(); // Clear the AI response cache
    console.log("Message cache cleared.");

    // Trigger memory module's flush function to prune history and save to disk
    await memory.save(); // `memory.save` is now mapped to `memory.flush`
};

/**
 * Updates Hoshino's personality and mood based on the current time of day.
 * Handles random mood changes and deeptalk mode activation/deactivation.
 * @param {string|number} chatId The chat ID to send mood/mode change announcements.
 */
const updateTimeBasedModes = (chatId) => {
    const now = new Date();
    const currentHour = now.getHours();

    // Handle Deeptalk Mode activation
    if (currentHour >= DEEPTALK_START_HOUR && !isDeeptalkMode) {
        isDeeptalkMode = true;
        setMood(chatId, Mood.CALM); // Set mood to CALM for deeptalk
        sendMessage(chatId, `Sayang~ Sudah malam nih (${currentHour}:00). Ayo tidurr ${Mood.CALM.emoji}, atau Ada yang mau kamu ceritakan?`);
        console.log("Entered Deeptalk Mode.");
    }
    // Handle Deeptalk Mode deactivation (when hour is before DEEPTALK_START_HOUR and bot was in deeptalk mode)
    // This covers exiting deeptalk mode after sleep, typically in the morning.
    else if (currentHour < DEEPTALK_START_HOUR && isDeeptalkMode) {
        isDeeptalkMode = false;
        setMood(chatId, getRandomMood()); // Revert to a random normal mood
        sendMessage(chatId, `Selamat pagi, sayang~! Hoshino kembali ceria nih! ${currentMood.emoji}`);
        console.log("Exited Deeptalk Mode.");
    }

    // Handle Random Mood Based on Time (Morning, Noon, Afternoon)
    // Avoid changing mood if already in deeptalk mode or sleep mode
    if (!isDeeptalkMode && !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)) {
        if (currentHour === 7) { // Morning (e.g., 7 AM)
            if (currentMood !== Mood.HAPPY) { // Only change if not already happy
                setMood(chatId, Mood.HAPPY);
                sendMessage(chatId, `Selamat pagi, sayang~ Hoshino senang banget hari ini! ${Mood.HAPPY.emoji}`);
            }
        } else if (currentHour === 13) { // Noon (e.g., 1 PM)
            if (currentMood !== Mood.NORMAL) { // Only change if not already normal
                setMood(chatId, Mood.NORMAL);
                sendMessage(chatId, `Siang sayang~ Hoshino lagi santai nih. ${Mood.NORMAL.emoji}`);
            }
        } else if (currentHour === 17) { // Afternoon (e.g., 5 PM)
            const randomMood = getRandomMood();
            if (currentMood !== randomMood) {
                setMood(chatId, randomMood);
                sendMessage(chatId, `Sore sayang~ Hoshino lagi ngerasain ${randomMood.name} nih. ${randomMood.emoji}`);
            }
        }
    }
};


/**
 * Main module export function to initialize the Telegram bot.
 * This function sets up message listeners and schedules recurring tasks.
 * @param {object} bot The Telegram Bot API instance (e.g., from `node-telegram-bot-api`).
 */
module.exports = (bot) => {
    botInstance = bot; // Assign the passed bot instance to the global variable for wider access
    const configuredChatId = config.TARGET_CHAT_ID || config.chatId; // Determine the target chat ID for scheduled messages

    console.log(`🌸 HoshinoBot v2.0 (Optimized v3) aktif untuk ${USER_NAME}!`);
    if (configuredChatId) {
        console.log(`📬 Scheduled messages (Prayer Times, Weather, Sad Song) will be sent to chat ID: ${configuredChatId}`);
    } else {
        console.warn("⚠️  TARGET_CHAT_ID not found in config.js. Scheduled messages (Prayer Times, Weather, Sad Song) will NOT be sent.");
        console.warn("Please add TARGET_CHAT_ID: 'your_chat_id' to your config.js file to enable scheduled messages.");
    }

    // Register a listener for all incoming messages
    botInstance.on('message', async (msg) => {
        const { chat, text, from } = msg;
        const currentMessageChatId = chat.id;

        // Save the last chat message to memory
        // This will now use the optimized memory.js's addMessage/saveLastChat
        await memory.saveLastChat(msg);

        // Basic validation for incoming text messages
        if (!text || text.trim() === "") {
            return; // Ignore empty or whitespace-only messages
        }
        // Ignore single-character messages if they are only emojis or numbers
        if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text))) {
            return;
        }

        // Check if the message matches any predefined command handlers
        // Iterate through handlers and execute if a match is found
        for (const handler of commandHandlers) {
            if (handler.pattern.test(text)) {
                // If a command is matched, get its predefined response and mood
                // Ensure response function is awaited as it might be async (e.g., weather, sad song)
                const result = await handler.response(currentMessageChatId);
                await hoshinoTyping(currentMessageChatId); // Show typing indicator
                // Only send text message if result.text is defined (sendPhoto is handled inside sendSadSongNotification)
                if (result.text) {
                    sendMessage(currentMessageChatId, result.text);
                }
                if (result.mood) {
                    setMood(currentMessageChatId, result.mood); // Set Hoshino's mood
                }
                return; // Stop processing after handling a command
            }
        }

        // If no command is matched, generate an AI response
        await hoshinoTyping(currentMessageChatId); // Show typing indicator
        const aiResponse = await generateAIResponse(text, currentMessageChatId); // Get AI response
        sendMessage(currentMessageChatId, `${aiResponse} ${currentMood.emoji}`); // Send AI response with current mood emoji
    });

    // Schedule recurring tasks only if a TARGET_CHAT_ID is configured
    if (configuredChatId) {
        // Schedule daily prayer time reminders
        Object.entries(PrayerTimes).forEach(([name, { hour, minute, emoji }]) => {
            const cronTime = `${minute} ${hour} * * *`; // Cron format: Minute Hour DayOfMonth Month DayOfWeek
            schedule.scheduleJob({ rule: cronTime, tz: 'Asia/Jakarta' }, () => {
                console.log(`Sending prayer time reminder for ${name} at ${hour}:${minute} (Asia/Jakarta) to ${configuredChatId}`);
                sendMessage(configuredChatId, `${emoji} Sayang~, Waktunya shalat ${name}, nih~ Jangan sampe kelewatan! ${emoji}`);
            });
        });

        // Schedule periodic weather updates (every 3 hours)
        schedule.scheduleJob({ rule: '0 */5 * * *', tz: 'Asia/Jakarta' }, async () => {
            console.log(`Fetching weather update (Asia/Jakarta) for chat ID: ${configuredChatId}`);
            const weather = await getWeatherData(); // Fetch weather data
            if (weather) {
                // If weather data is available, send formatted weather info and a reminder
                sendMessage(configuredChatId, `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`);
            } else {
                // If weather data could not be fetched, send an error message
                sendMessage(configuredChatId, `Hmm... Hoshino lagi pusing nih.. ${Mood.SAD.emoji}`);
            }
        });

        // Schedule sad song notification at 22:00 (10 PM) daily
        schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Asia/Jakarta' }, async () => { // Make async
            console.log(`Sending sad song notification at 22:00 (Asia/Jakarta) to ${configuredChatId}`);
            await sendSadSongNotification(configuredChatId); // Await the async function
        });

        // Schedule automatic cache and memory cleanup every 30 minutes
        setInterval(cleanupCacheAndMemory, CACHE_CLEANUP_INTERVAL_MS);
        console.log(`Scheduled cache and memory cleanup every ${CACHE_CLEANUP_INTERVAL_MS / 1000 / 60} minutes.`);

        // Schedule time-based mode updates (random mood and deeptalk) hourly at the top of the hour
        schedule.scheduleJob({ rule: '0 * * * *', tz: 'Asia/Jakarta' }, () => {
             updateTimeBasedModes(configuredChatId);
        });
        // Run once on startup to set initial mode/mood based on current time
        updateTimeBasedModes(configuredChatId);
    }
};
