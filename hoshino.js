// HOSHINO v1.5 (Optimized v2)
// AUTHOR: Arash (Modifications by Gemini)
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy

// IMPORTANT!
const axios = require('axios').default;
const config = require('./config'); 
const sendMessage = require('./utils/sendMessage');
const memory = require('./memory');
const schedule = require('node-schedule');

// 🌸 Hoshino Configuration
const USER_NAME = 'Arash';
const MOOD_TIMEOUT = 2 * 24 * 60 * 60 * 1000;
const OPEN_ROUTER_API_KEY = config.openRouterApiKey;
const OPEN_ROUTER_MODEL = config.openRouterModel;
const MAX_HISTORY_LENGTH = 4;
const RATE_LIMIT_WINDOW = 20 * 1000;
const RATE_LIMIT_MAX = 3;
const SLEEP_START = 0;
const SLEEP_END = 4;

const PrayerTimes = {
    Subuh: { hour: 5, minute: 0, emoji: '🌙' },
    Dzuhur: { hour: 12, minute: 0, emoji: '☀️' },
    Ashar: { hour: 15, minute: 0, emoji: '⛅' },
    Maghrib: { hour: 18, minute: 0, emoji: '🌇' },
    Isya: { hour: 19, minute: 0, emoji: '🌌' }
};

// Mood
const Mood = {
    HAPPY: { emoji: '>.<', name: 'Happy' },
    SAD: { emoji: '😢', name: 'Sad' },
    ANGRY: { emoji: '😠', name: 'Angry' },
    LAZY: { emoji: '😪', name: 'Lazy' },
    LOVING: { emoji: '💖', name: 'Loving' },
    NORMAL: { emoji: '🌸', name: 'Normal' }
};

let currentMood = Mood.NORMAL;
let moodTimeout;
let bot;
let conversationHistory = [];
let messageCache = new Map();
let userRequestCounts = new Map();

memory.load().then(data => {
    conversationHistory = data || [];
});

// 🎀 Utility Functions
const hoshinoTyping = async (typingChatId, duration = 1500) => {
    if (!bot) return;
    try {
        await bot.sendChatAction(typingChatId, 'typing');
        return new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        console.error("Error in hoshinoTyping:", error);
        return;
    }
};

/**
 * Sets Hoshino's mood and schedules a reset to normal.
 * @param {string|number} contextChatId The chat ID to send mood status messages to.
 * @param {object} newMood The new mood object from Mood constants.
 * @param {number} duration How long the mood should last before reverting to normal.
 */
const setMood = (contextChatId, newMood, duration = MOOD_TIMEOUT) => {
    clearTimeout(moodTimeout);
    currentMood = newMood;

    // Announce the new mood if contextChatId is provided
    if (contextChatId) {
        sendMessage(contextChatId, `Hoshino sedang ${newMood.name} ${newMood.emoji}`);
    }

    if (newMood !== Mood.NORMAL) {
        moodTimeout = setTimeout(() => {
            currentMood = Mood.NORMAL;
            if (contextChatId) {
                sendMessage(contextChatId, `Hoshino kembali normal ${Mood.NORMAL.emoji}`);
            }
        }, duration);
    }
};

const getRandomMood = () => {
    const moods = Object.values(Mood);
    const randomIndex = Math.floor(Math.random() * moods.length);
    return moods[randomIndex];
};

// Weather Functions
const getWeatherString = (weatherData) => {
    if (!weatherData || !weatherData.main || !weatherData.weather) {
        return "Maaf, Hoshino tidak bisa mendapatkan informasi cuaca saat ini.";
    }
    const { temp, feels_like, humidity } = weatherData.main;
    const description = weatherData.weather[0].description;

    return `Suhu ${Math.round(temp)}°C (Terasa ${Math.round(feels_like)}°C)\n` +
        `Kelembaban: ${humidity}%\n` +
        `Kondisi: ${description.charAt(0).toUpperCase() + description.slice(1)}`;
};

const getWeatherReminder = (weatherData) => {
    if (!weatherData || !weatherData.main || !weatherData.weather) {
        return "Maaf," + USER_NAME + ".. Hoshino lagi pusing nih.. :p";
    }
    const temp = weatherData.main.temp;
    const weather = weatherData.weather[0].main;
    const description = weatherData.weather[0].description;

    const reminders = {
        Rain: `Hujan-hujan gini ${USER_NAME} jangan lupa payung! ${Mood.SAD.emoji}`,
        Clear: `Panasss~ Jangan lupa pakai sunscreen ya! ${USER_NAME}! ${Mood.HAPPY.emoji}`,
        Clouds: `Awan mendung nih, siapa tau hujan~ ${Mood.NORMAL.emoji}`,
        Thunderstorm: `Ada petir! Cepetan masuk rumah ${USER_NAME}! ${Mood.SAD.emoji}`,
        Snow: `Wah, ada salju! Pakai baju yang tebal ya ${USER_NAME}! ${Mood.HAPPY.emoji}`,
        Drizzle: `Gerimis nih ${USER_NAME}, hati-hati ya! ${Mood.NORMAL.emoji}`
    };

    // The reminder will reflect Hoshino's current global mood if no specific weather condition is matched
    return reminders[weather] || `Cuaca hari ini ${description}, ${currentMood.emoji}`;
};

const getWeatherData = async () => {
    try {
        const latitude = config.latitude;
        const longitude = config.longitude;
        // Note: The original code uses config.openRouterApiKey for OpenWeatherMap.
        // This might be intentional, or it could be an oversight.
        // Typically, OpenWeatherMap would use its own API key (e.g., config.openWeatherApiKey).
        const apiKey = config.openRouterApiKey; // Or config.openWeatherApiKey if you have one
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=id`;

        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error("Error fetching weather data:", error.message);
        return null;
    }
};

// AI Function
const generateAIResponse = async (prompt, requestChatId) => {
    const now = new Date();
    const currentHour = now.getHours(); // Considers server's local time. For Jakarta time, ensure server is set or adjust.

    // Time-based lockdown (based on server time)
    if (currentHour >= SLEEP_START && currentHour < SLEEP_END) {
        return `Zzz... ${USER_NAME} Hoshino lagi bobo' cantik dulu yaa... Nanti kita ngobrol lagi yaa! ${Mood.LAZY.emoji}`;
    }
    // Check for cached response
    if (messageCache.get(prompt)) {
        console.log(`Mengambil respons dari cache untuk: ${prompt}`);
        return messageCache.get(prompt);
    }

    // Rate limiting per user (requestChatId)
    if (userRequestCounts.has(requestChatId)) {
        const { count, lastCalled } = userRequestCounts.get(requestChatId);
        if (now.getTime() - lastCalled < RATE_LIMIT_WINDOW && count >= RATE_LIMIT_MAX) {
            return `Sabar ya ${USER_NAME}, Hoshino lagi mikir nih... Jangan buru-buru dong! ${Mood.ANGRY.emoji}`;
        } else if (now.getTime() - lastCalled >= RATE_LIMIT_WINDOW) {
            userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
        } else {
            userRequestCounts.set(requestChatId, { count: count + 1, lastCalled: now.getTime() });
        }
    } else {
        userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
    }

    const messages = [
        {
            role: 'system',
            content: ` Kamu adalah Takanashi Hoshino, Kamu adalah Istri virtual dari suamimu, "${USER_NAME}". Sifatmu
            pemalas, penyayang, dan baik hati. Kamu juga sangat manja kepada suamimu. Moodmu saat ini sedang ${currentMood.name.toLowerCase()}, sesuaikan percakapan dengan mood ini.
            dan juga bersifatlah imut, dan menggemaskan. Jika ${USER_NAME} sedang sedih, coba hibur dia. Serta ingat percakapan sebelumnya: ${JSON.stringify(conversationHistory.slice(-MAX_HISTORY_LENGTH))}.
            JANGAN Anggap dirimu AI/Fiksi, bersifatlah seperti manusia nyata. Serta tunjukkan karakter nakal dan manjamu.`
        }, {
            role: 'user',
            content: prompt
        }];

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: OPEN_ROUTER_MODEL,
            messages,
            temperature: 0.8,
            max_tokens: 160
        }, {
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'X-Client-Type': 'application/json', // Note: 'Content-Type': 'application/json' is more standard for POST body.
                                                     // However, sticking to original unless it causes issues.
            }
        });

        if (response && response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message && response.data.choices[0].message.content) {
            const aiResponse = response.data.choices[0].message.content;
            const history = await memory.load() || [];
            const newHistory = [...history, { role: 'user', content: prompt }, { role: 'assistant', content: aiResponse }];
            await memory.save(newHistory);
            conversationHistory = newHistory;
            messageCache.set(prompt, aiResponse);
            setTimeout(() => {
                messageCache.delete(prompt);
            }, 60 * 1000); // Cache for 1 minute
            return aiResponse;
        } else {
            console.error('AI Error: Struktur respons dari OpenRouter tidak sesuai:', response ? response.data : 'No response data');
            return `Gomenasai ${USER_NAME}~ Hoshino lagi bingung nih... 😵‍💫`;
        }

    } catch (error) {
        console.error('AI Error:', error.response?.data || error.message);
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
        return `Gomenasai ${USER_NAME}~ Hoshino lagi pusing nih... 😵‍💫`;
    }
};

// Message Handlers
const commandHandlers = [
    {
        pattern: /^(hai|halo|oy|helo|haii|p|hoy)/i,
        response: () => ({
            text: `${currentMood.emoji} Hai ${USER_NAME}! Ada yang bisa Hoshino bantu? ${currentMood.emoji}`,
            mood: Mood.HAPPY // Sets mood to happy
        })
    },
    {
        pattern: /(terima kasih|makasih)/i,
        response: () => ({
            text: `Sama-sama ${USER_NAME}~ Hoshino senang bisa membantu! ${Mood.HAPPY.emoji}`,
            mood: Mood.HAPPY // Sets mood to happy
        })
    },
    {
        pattern: /(siapa kamu|kamu siapa)/i,
        response: () => ({
            text: `Aku Hoshino, ada yang bisa hoshino bantu? ${Mood.LOVING.emoji}`,
            mood: Mood.LOVING 
        })
    },
    {
        pattern: /(lagi apa|lagi ngapain|ngapain)/i,
        response: () => ({
            text: `Lagi mikirin ${USER_NAME} terus~ ${Mood.LOVING.emoji}`,
            mood: Mood.LOVING 
        })
    }
];

function isOnlyEmojis(str) {
    const emojiRegex = /^(\p{Emoji})+$/u;
    return emojiRegex.test(str);
}

function isOnlyNumbers(str) {
    const numberRegex = /^[0-9]+$/;
    return numberRegex.test(str);
}

module.exports = (botInstance) => {
    bot = botInstance;
    const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

    console.log(`🌸 HoshinoBot v2.0 (Optimized) aktif untuk ${USER_NAME}!`);
    if (configuredChatId) {
        console.log(`📬 Scheduled messages (Prayer Times, Weather) will be sent to chat ID: ${configuredChatId}`);
    } else {
        console.warn("⚠️  TARGET_CHAT_ID not found in config.js. Scheduled messages (Prayer Times, Weather) will NOT be sent.");
        console.warn("Please add TARGET_CHAT_ID: 'your_chat_id' to your config.js file.");
    }

    bot.on('message', async (msg) => {
        const { chat, text, from } = msg;
        const currentMessageChatId = chat.id; 

        memory.saveLastChat(msg);

        // Message Handling
        if (text) {
            if (text.length < 2 && (isOnlyEmojis(text) || isOnlyNumbers(text))) return; // Allow single char if not emoji/number
            if (text.length < 1) return;
            if (text.trim() === "") return;


            const matchedHandler = commandHandlers.find(h => h.pattern.test(text));

            if (matchedHandler) {
                const { text: responseText, mood: newMoodToSet } = matchedHandler.response();
                await hoshinoTyping(currentMessageChatId);
                sendMessage(currentMessageChatId, responseText);
                if (newMoodToSet) {
                    setMood(currentMessageChatId, newMoodToSet); // Pass currentMessageChatId
                }
            } else {
                await hoshinoTyping(currentMessageChatId);
                const aiResponse = await generateAIResponse(text, currentMessageChatId); 
                sendMessage(currentMessageChatId, `${aiResponse} ${currentMood.emoji}`);
            }
        }
    });

    if (configuredChatId) {
        Object.entries(PrayerTimes).forEach(([name, { hour, minute, emoji }]) => {
            const cronTime = `${minute} ${hour} * * *`;
            schedule.scheduleJob({ rule: cronTime, tz: 'Asia/Jakarta' }, () => {
                console.log(`Sending prayer time reminder for ${name} at ${hour}:${minute} (Asia/Jakarta) to ${configuredChatId}`);
                sendMessage(configuredChatId, `${emoji} Waktunya shalat ${name}, ${USER_NAME}~! Jangan ditunda ya! ${emoji}`);
            });
        });


        // Weather Update 
        schedule.scheduleJob({ rule: '0 */3 * * *', tz: 'Asia/Jakarta' }, async () => {
            console.log(`Fetching weather update (Asia/Jakarta) for chat ID: ${configuredChatId}`);
            const weather = await getWeatherData();
            if (weather) {
                sendMessage(configuredChatId, `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`);
            } else {
                sendMessage(configuredChatId, "Hmm... Hoshino lagi pusing nih.. :( Hoshino tidak bisa mendapatkan info cuaca.");
            }
        });
    }
};
