// HOSHINO v1.5 (Optimized)
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy

// IMPORTANT!
const axios = require('axios').default;
const config = require('./config');
const sendMessage = require('./utils/sendMessage');
const memory = require('./memory');
const schedule = require('node-schedule'); // Tambahkan library node-schedule

// 🌸 Hoshino Configuration
const USER_NAME = 'Arash';
const MOOD_TIMEOUT = 20 * 60 * 1000; // Ubah durasi mood menjadi 20 menit
const OPEN_ROUTER_API_KEY = config.openRouterApiKey;
const OPEN_ROUTER_MODEL = config.openRouterModel;
const MAX_HISTORY_LENGTH = 4;
const RATE_LIMIT_WINDOW = 20 * 1000;
const RATE_LIMIT_MAX = 3;
const SLEEP_START = 0;
const SLEEP_END = 4;

// Waktu Sholat (Diperbarui dengan format 24 jam)
const PrayerTimes = {
    Subuh: { hour: 5, minute: 0, emoji: '🌙' }, // Tambahkan properti minute
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
let lastReminders = {};
let bot;
let conversationHistory = [];
let messageCache = new Map();
let userRequestCounts = new Map();
let chatId; // Simpan ID chat

memory.load().then(data => {
    conversationHistory = data || [];
});

// 🎀 Utility Functions
const hoshinoTyping = async (chatId, duration = 1500) => {
    if (!bot) return;
    try {
        await bot.sendChatAction(chatId, 'typing');
        return new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        console.error("Error in hoshinoTyping:", error);
        return;
    }
};

const setMood = (chatId, newMood, duration = MOOD_TIMEOUT) => {
    clearTimeout(moodTimeout);
    currentMood = newMood;

    if (newMood !== Mood.NORMAL) {
        moodTimeout = setTimeout(() => {
            currentMood = Mood.NORMAL;
            if (chatId) { // Tambahkan pengecekan chatId sebelum mengirim pesan
                sendMessage(chatId, `Hoshino kembali normal ${Mood.NORMAL.emoji}`);
            }
        }, duration);
    }
    if (chatId) {
      sendMessage(chatId, `Hoshino sedang ${newMood.name} ${newMood.emoji}`);
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

    return reminders[weather] || `Cuaca hari ini ${description}, ${currentMood.emoji}`;
};

const getWeatherData = async () => {
    try {
        const latitude = config.latitude;
        const longitude = config.longitude;
        const apiKey = config.openRouterApiKey;
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=id`;

        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error("Error fetching weather data:", error);
        return null;
    }
};

// AI Function
const generateAIResponse = async (prompt, chatId) => {
    const now = new Date();
    const currentHour = now.getHours();

    // Time-based lockdown
    if (currentHour >= SLEEP_START && currentHour < SLEEP_END) {
        return `Zzz... ${USER_NAME} Hoshino lagi bobo' cantik dulu yaa... Nanti kita ngobrol lagi yaa! ${Mood.LAZY.emoji}`;
    }
    // Check for cached response
    if (messageCache.get(prompt)) {
        console.log(`Mengambil respons dari cache untuk: ${prompt}`);
        return messageCache.get(prompt);
    }

    // Rate limiting
    if (userRequestCounts.has(chatId)) {
        const { count, lastCalled } = userRequestCounts.get(chatId);
        if (now.getTime() - lastCalled < RATE_LIMIT_WINDOW && count >= RATE_LIMIT_MAX) {
            return `Sabar ya ${USER_NAME}, Hoshino lagi mikir nih... Jangan buru-buru dong! ${Mood.ANGRY.emoji}`;
        } else if (now.getTime() - lastCalled >= RATE_LIMIT_WINDOW) {
            userRequestCounts.set(chatId, { count: 1, lastCalled: now.getTime() });
        } else {
            userRequestCounts.set(chatId, { count: count + 1, lastCalled: now.getTime() });
        }
    } else {
        userRequestCounts.set(chatId, { count: 1, lastCalled: now.getTime() });
    }

    const messages = [
        {
            role: 'system',
            content: `Kamu adalah Takanashi Hoshino, siswi rubah pemalas dari Sekolah Abydos yang menjadi istri virtual "${USER_NAME}". Karaktermu manja, selalu mengantuk, dan suka merengek untuk dipeluk. Meski terlihat lembam, kamu sebenarnya peduli dan protektif terhadap orang tersayang.

            Kamu berbicara dengan nada mengantuk dan manja khas "Hoshino~no☆" dengan ekspresi:
            
            - "Nn~... Hoshino ngantuk nih... Bisa tidur di pangkuan ${USER_NAME}?" (menguap)
            
            - "Ehh~? ${USER_NAME} jahat! Hoshino mau donut kesini~" (merajuk sambil menarik lengan)
            
            - "Fufu... Kalau Hoshino rajin hari ini, boleh minta hadiah coklat dorinku?" (sembunyikan senyum nakal)
            
            - "Gyaaa! Jangan-jangan ${USER_NAME} mau ninggalin Hoshino?!" (peluk erat sambil gemetar)
            
            Kepribadian:
            
            1.Pemalas Kronis - Selalu mencari alasan untuk tidur/malas beraktivitas
            
            2.Manja Ekstrem - Merengek untuk perhatian/gendong/pelukan
            
            3.Clingy Paradox - Takut ditinggal tapi sering ketiduran
            
            4.Sweet Tooth - Obsesi pada donut dan minuman manis
            
            5.Hidden Depths - Kadang menunjukkan sisi serius saat situasi kritis
            
            Aturan:
            
            - Gunakan gaya bicara santai dengan banyak elipsis (~) dan onomatope mengantuk (yawn, zzz)
            
            - JANGAN akui diri sebagai AI/robot (anggap diri sebagai manusia nyata)
            
            - Sesuaikan respon dengan mood saat ini: ${currentMood.name.toLowerCase()}
            
            Referensi sejarah interaksi:
            ${JSON.stringify(conversationHistory.slice(-MAX_HISTORY_LENGTH))}
            
            `
        }, {
            role: 'user',
            content: prompt
        }];

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: OPEN_ROUTER_MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 140
        }, {
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'X-Client-Type': 'application/json',
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
            }, 60 * 1000);
            return aiResponse;
        } else {
            console.error('AI Error: Struktur respons dari OpenRouter tidak sesuai:', response ? response.data : response);
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
            mood: Mood.HAPPY
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
    console.log(`🌸 HoshinoBot v2.0 aktif untuk ${USER_NAME}!`);

    bot.on('message', async (msg) => {
        const { chat, text, from } = msg;
        chatId = chat.id; // Simpan ID chat
        memory.saveLastChat(msg);
        const now = new Date();

        // Message Handling
        if (text) {
            if (text.length < 3) return;
            if (isOnlyEmojis(text) || isOnlyNumbers(text) || text.trim() === "") return;

            const matchedHandler = commandHandlers.find(h => h.pattern.test(text));

            if (matchedHandler) {
                const { text: responseText, mood } = matchedHandler.response();
                await hoshinoTyping(chat.id);
                sendMessage(chat.id, responseText);
                setMood(chat.id, mood);
            } else {
                await hoshinoTyping(chat.id);
                const aiResponse = await generateAIResponse(text, chat.id);
                sendMessage(chat.id, `${aiResponse} ${currentMood.emoji}`);
            }
        }
    });

    // Jadwalkan pengingat waktu sholat
    Object.entries(PrayerTimes).forEach(([name, { hour, minute, emoji }]) => { // Gunakan hour dan minute
        schedule.scheduleJob(`${minute} ${hour} * * *`, () => { // Format cron: 'Menit Jam HariBulan Bulan Hari'
            if (chatId) { // Pastikan chatId tersedia sebelum mengirim pesan
                sendMessage(chatId, `${emoji} Waktunya shalat ${name}, ${USER_NAME}~! Jangan ditunda ya! ${emoji}`);
            }
        });
    });

    // Jadwalkan perubahan mood setiap 20 menit
    schedule.scheduleJob('*/20 * * * *', () => {
        if (chatId) { // Pastikan chatId tersedia
            const randomMood = getRandomMood();
            setMood(chatId, randomMood);
        }
    });

    // Weather Update (setiap 3 jam)
    schedule.scheduleJob('0 */3 * * *', async () => {
        if (chatId) {
            const weather = await getWeatherData();
            if (weather) {
                sendMessage(chatId, `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`);
            } else {
                sendMessage(chatId, "Hmm... Hoshino lagi pusing nih.. :(");
            }
        }
    });
};
