/**
 * commandHandlers.js - Command Router and Personality Orchestrator
 *
 * This module defines all available bot commands and manages Lumina's dynamic
 * personality states. It's the control center for user interactions - when someone
 * types "/help" or sends a casual "hai", this module decides exactly how to respond.
 *
 * Key responsibilities:
 * - **Command definitions**: Maps regex patterns to response functions
 * - **Personality modes**: Tsundere (cold but caring) vs Deredere (sweet and affectionate)
 * - **Mood management**: Dynamic emotional states (happy, sad, angry, etc.) with auto-reset
 * - **AI summarization injection**: Allows external modules to provide AI capabilities
 * - **Bot instance management**: Maintains reference to Telegram API for typing indicators
 *
 * The command system uses two-tier optimization:
 * 1. **O(1) lookup**: Prefixed commands (/help, /weather) are mapped for instant access
 * 2. **Regex iteration**: Complex patterns (casual greetings, phrases) are checked sequentially
 *
 * Each command handler returns an object with:
 * - `text`: The response message to send
 * - `mood` (optional): Mood to transition to after responding
 *
 * @module handler/commandHandlers
 * @author Arash
 * @requires ../modules/mood
 * @requires ../modules/weather
 * @requires ../modules/commandLists
 * @requires ../modules/selfieManager
 */
const path = require('path');
const { sendMessage, sendPhoto } = require('../utils/sendMessage');
const commandHelper = require('../modules/commandLists');
const config = require('../config/config');
const { isFeatureEnabled } = require('../config/featureConfig');
const Mood = require('../modules/mood');
const { getWeatherData, getWeatherString, getWeatherReminder } = require('../modules/weather');
const holidaysModule = require('./holidayHandlers');
const memory = require('../data/memory');
const sendSadSongNotification = require('../utils/songNotifier');
const logger = require('../utils/logger');
const Sentry = require('@sentry/node');
const selfieManager = require('../modules/selfieManager');

// --- Configuration & Constants ---

/**
 * Duration (in milliseconds) that a temporary mood lasts before auto-resetting to NORMAL.
 *
 * Set to 2 days - this prevents Lumina from staying angry or overly excited indefinitely.
 * The timeout resets each time setMood() is called, so continuous interaction can
 * maintain a mood longer, but absence causes eventual return to baseline.
 *
 * @type {number}
 * @constant
 * @default 172800000
 */
const MOOD_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Display name for the user, loaded from environment configuration.
 *
 * Used throughout responses for personalization (e.g., "Hello {{USER_NAME}}").
 * Falls back to generic terms if not configured.
 *
 * @type {string}
 * @constant
 */
const USER_NAME = config.USER_NAME;

// --- State Management ---

/**
 * Current emotional state of Lumina.
 *
 * Moods are more than just cosmetic - they affect:
 * - Emoji usage in responses
 * - Tone and word choice (via AI prompt injection)
 * - Response patterns for certain commands
 *
 * Available moods: NORMAL, HAPPY, SAD, ANGRY, CALM, JEALOUS, LOVING, LAZY
 *
 * @type {object}
 * @see ../modules/mood
 */
let currentMood = Mood.NORMAL;

/**
 * Timeout reference for automatic mood reset.
 *
 * When a mood is set with setMood(), this timer starts. After MOOD_TIMEOUT_MS,
 * it automatically resets currentMood to Mood.NORMAL. The timer is cleared
 * and restarted if the mood changes again before expiry.
 *
 * @type {NodeJS.Timeout|null}
 */
let moodTimeoutId = null;

/**
 * Reference to the Telegram Bot API instance.
 *
 * Injected from core.js during initialization. Used primarily for:
 * - Sending "typing..." indicators (LuminaTyping function)
 * - Sending photos/images (for selfie responses)
 *
 * @type {object|null}
 */
let botInstanceRef = null;

/**
 * External AI summarizer function for advanced text processing.
 *
 * This is injected from core.js to allow commands like /ringkas (summarize)
 * to use AI capabilities without creating circular dependencies. The function
 * takes text input and returns a summarized version.
 *
 * @type {Function|null}
 * @see core/core.js - Where the summarizer is defined and injected
 */
let globalAISummarizer = null;

/**
 * Current personality mode governing Lumina's behavior baseline.
 *
 * Two distinct modes:
 * - **TSUNDERE**: Cold, tsundere-like behavior - acts indifferent but secretly cares.
 *   Uses blunt language, occasional sarcasm, addresses user as "Tuan" with distance.
 * - **DEREDERE**: Sweet, affectionate behavior - openly caring and enthusiastic.
 *   Uses warm language, lots of affection, addresses user as "Tuan~" or "Sayangku~".
 *
 * The personality affects the system prompt sent to AI, influencing all responses.
 *
 * @type {string}
 * @default 'TSUNDERE'
 * @see setPersonalityMode
 */
let personalityMode = 'TSUNDERE';

// --- Core Functions ---

/**
 * Changes Lumina's personality mode and persists the choice.
 *
 * When a user switches between Tsundere and Deredere modes, this function
 * updates the current state and saves it to long-term memory. This ensures
 * the personality persists across bot restarts.
 *
 * The change is logged for debugging purposes, and any persistence failures
 * are caught and reported to Sentry without crashing the bot.
 *
 * @param {string} mode - Personality mode to activate ('TSUNDERE' or 'DEREDERE')
 * @returns {Promise<void>}
 * @throws {Error} Persistence errors are caught and logged
 * @example
 * // User types /deredere
 * await setPersonalityMode('DEREDERE');
 * // Lumina now responds in sweet, affectionate mode
 */
const setPersonalityMode = async (mode) => {
    personalityMode = mode;
    try {
        await memory.savePreference('lumina_personality', mode);
        logger.info(
            { event: 'personality_change', mode: personalityMode },
            `[Personality] Mode changed to: ${personalityMode} and saved successfully.`,
        );
    } catch (error) {
        logger.error(
            { event: 'personality_save_error', error: error.message, stack: error.stack },
            '[Personality] Failed to save personality mode.',
        );
        Sentry.captureException(error);
    }
};

/**
 * Returns the currently active personality mode.
 *
 * Used by the AI prompt generator to determine which personality
 * instructions to include in system prompts.
 *
 * @returns {string} Current personality mode ('TSUNDERE' or 'DEREDERE')
 * @example
 * const personality = getPersonalityMode();
 * // Returns: 'TSUNDERE'
 */
const getPersonalityMode = () => personalityMode;

/**
 * Receives the AI summarization function from core.js.
 *
 * This breaks the circular dependency between command handlers and AI response
 * generation. The summarizer enables features like document summarization.
 *
 * @param {Function} fn - Function that takes text and returns summarized text
 * @returns {void}
 * @example
 * // In core.js during initialization
 * setAISummarizer(generateAIResponse);
 */
const setAISummarizer = (fn) => {
    globalAISummarizer = fn;
};

/**
 * Returns the injected AI summarizer function.
 *
 * Called by document handlers and other modules that need text summarization
 * capabilities without directly importing the AI module.
 *
 * @returns {Function|null} The summarizer function if available, null otherwise
 * @example
 * const summarizer = getAISummarizer();
 * if (summarizer) {
 *   const summary = await summarizer(text, chatId, context, userName, Mood);
 * }
 */
const getAISummarizer = () => globalAISummarizer;

/**
 * Displays a "typing..." indicator in the chat before responding.
 *
 * This creates a more natural conversation flow by showing the user that
 * Lumina is "thinking" before replying. Especially important for AI responses
 * that take 1-3 seconds to generate.
 *
 * The typing indicator shows for a specified duration (default 1.5s) before
 * the actual response is sent. This mimics human typing speed and makes
 * the interaction feel less robotic.
 *
 * @param {string|number} chatId - Chat ID where typing indicator should appear
 * @param {number} [duration=1500] - Duration in milliseconds to show typing
 * @returns {Promise<void>}
 * @example
 * // Before sending AI response
 * await LuminaTyping(msg.chat.id, 2000);
 * await sendMessage(msg.chat.id, "Let me think about that...");
 */
const LuminaTyping = async (chatId, duration = 1500) => {
    if (!botInstanceRef || typeof botInstanceRef.sendChatAction !== 'function') {
        logger.warn(
            { event: 'typing_action_failed', reason: 'bot_instance_not_set_or_invalid' },
            'Bot API instance is not initialized or missing sendChatAction. Cannot send typing indicator.',
        );
        return;
    }
    try {
        await botInstanceRef.sendChatAction(chatId, 'typing');
        // Wait for the specified duration before resolving the promise.
        return new Promise((resolve) => setTimeout(resolve, duration));
    } catch (error) {
        logger.error(
            { event: 'typing_action_error', chatId: chatId, error: error.message, stack: error.stack },
            `Error in LuminaTyping for chat ID ${chatId}`,
        );
        Sentry.captureException(error, { extra: { chatId } });
    }
};

/**
 * Updates Lumina's emotional state with automatic reset timer.
 *
 * Moods affect the entire personality of responses - they change the emoji
 * usage, tone of voice, and even word choices. When a mood is set:
 *
 * 1. Any existing mood timer is cleared
 * 2. The mood is updated (and optionally announced to user)
 * 3. A reset timer starts (unless mood is NORMAL or CALM)
 *
 * After durationMs (default 2 days), the mood automatically returns to NORMAL.
 * This prevents Lumina from staying angry or overly excited indefinitely.
 *
 * @param {string|number} chatId - Chat ID for sending mood change notification
 * @param {object} newMood - Mood object from Mood constants (e.g., Mood.HAPPY)
 * @param {number} [durationMs=MOOD_TIMEOUT_MS] - How long mood lasts before reset
 * @returns {void}
 * @example
 * // User says something nice
 * setMood(chatId, Mood.HAPPY);
 * // Lumina: "Lumina sekarang HAPPY 😊"
 * // (Automatically resets to NORMAL after 2 days)
 */
const setMood = (chatId, newMood, durationMs = MOOD_TIMEOUT_MS) => {
    clearTimeout(moodTimeoutId); // Clear any existing mood reset timer.

    if (currentMood !== newMood) {
        currentMood = newMood;
        logger.info({ event: 'mood_change', mood: newMood.name, chatId }, `Mood changed to ${newMood.name}`);
        if (chatId) {
            sendMessage(chatId, `Lumina sekarang ${newMood.name} ${newMood.emoji}`);
        }
    }

    // Schedule a reset only if the new mood is not a permanent one (like NORMAL or CALM).
    if (newMood !== Mood.NORMAL && newMood !== Mood.CALM) {
        moodTimeoutId = setTimeout(() => {
            currentMood = Mood.NORMAL;
            logger.info({ event: 'mood_reset', chatId }, 'Mood reset to NORMAL');
        }, durationMs);
    }
};

/**
 * Selects a random mood (excluding CALM) for spontaneous mood changes.
 *
 * Used by the time-based mode updater to create variety in Lumina's
 * behavior throughout the day. CALM is excluded because it's specifically
 * for deep talk mode, not random mood swings.
 *
 * @returns {object} Randomly selected mood object from Mood constants
 * @example
 * // At 5 PM, randomly change mood
 * const newMood = getRandomMood();
 * setMood(chatId, newMood);
 * // Could return: Mood.HAPPY, Mood.SAD, Mood.ANGRY, etc.
 */
const getRandomMood = () => {
    // Exclude CALM from random selection as it's a special state.
    const moods = Object.values(Mood).filter((mood) => mood !== Mood.CALM);
    const randomIndex = Math.floor(Math.random() * moods.length);
    return moods[randomIndex];
};

// --- Selfie Helpers ---
const tsundereSelfieCaptions = [
    'Hmph... cuma sekali ini aku kasih lihat.',
    'Jangan salah paham! Aku cuma iseng aja.',
    'Kalau mau lihat lagi, rajin-rajin ngobrol dulu!',
    'Ini... tapi jangan simpan sembarangan ya. >///<',
];

const deredereSelfieCaptions = [
    'Hehe, ini fotoku buat kamu~',
    'Aku senang kamu mau lihat aku!',
    'Nih, jangan kangen-kangen ya~',
    'Speciaaal buatmu, {user}! >///<',
];

const getSelfieCaption = (userName) => {
    const pool = personalityMode === 'DEREDERE' ? deredereSelfieCaptions : tsundereSelfieCaptions;
    const caption = pool[Math.floor(Math.random() * pool.length)];
    return caption.replace('{user}', userName || USER_NAME);
};

// --- Command Handlers ---
/**
 * @type {Array<object>}
 * @description An array of command handler objects. Each object contains a regex pattern
 * to match against incoming messages and a response function to execute.
 */
const commandHandlers = [
    // --- Basic Commands ---
    {
        pattern: /^\/start$/i,
        response: (chatId, msg) => {
            const userFirstName = msg.from.first_name || USER_NAME;
            const startMessage = `
🌸 Selamat datang, ${userFirstName}! 🌸

Saya Lumina, asisten virtual pribadi Anda. Saya di sini untuk membantu Anda sebisanya!

Anda dapat berinteraksi dengan saya menggunakan bahasa alami atau menggunakan beberapa perintah cepat di bawah ini:

- /help - Menampilkan pesan bantuan ini.
- /cuaca - Mendapatkan informasi cuaca terkini berdasarkan lokasi Anda.
- /mood - Memeriksa suasana hati saya saat ini.
- /note [pesan] - Menyimpan catatan singkat.
- /shownotes - Menampilkan semua catatan Anda.
- /reminder [waktu] [pesan] - Mengatur pengingat.
- /search [kueri] - Mencari di web dan meringkas informasi.

Saya juga memiliki dua mode kepribadian yang dapat Anda alihkan:
- /tsundere - Mode default saya, agak angkuh tetapi penyayang.
- /deredere - Mode yang lebih manis, lebih ceria, dan penuh kasih sayang.

Jangan ragu untuk mencoba perintah atau sekadar mengobrol dengan saya! ${Mood.HAPPY.emoji}`;

            return {
                text: startMessage,
                mood: Mood.HAPPY,
            };
        },
    },
    {
        pattern: /^\/help/i,
        response: async (chatId) => {
            await LuminaTyping(chatId);
            const responseText = commandHelper.getHelpMessage(personalityMode);
            return { text: responseText, mood: Mood.NORMAL };
        },
    },
    {
        pattern: /^\/author/i,
        response: async (chatId) => {
            await LuminaTyping(chatId);
            const responseText = commandHelper.getAuthorInfo();
            return { text: responseText, mood: Mood.NORMAL };
        },
    },

    // --- Conversational Triggers ---
    {
        pattern: /^(hai|halo|bot|helo|haii|woy|hoy)/i,
        response: (_chatId) => {
            const greeting =
                personalityMode === 'TSUNDERE'
                    ? `Iya? Apa ada yang bisa aku bantu untukmu? ${currentMood.emoji}`
                    : `Halo, Tuan~ apa yang terjadi hari ini? Ceritain dong! ${currentMood.emoji}`;
            return {
                text: greeting,
                mood: Mood.HAPPY,
            };
        },
    },
    {
        pattern: /^(terima kasih|makasih|makasih ya)/i,
        response: () => {
            const thanksResponse =
                personalityMode === 'TSUNDERE'
                    ? `J-Jangan berpikir seperti itu! Aku hanya melakukan tugasku.. ${Mood.NORMAL.emoji}`
                    : `*Giggle* Sama-sama, Tuan~ Lumina senang bisa membantu! >_< ${Mood.HAPPY.emoji}`;
            return {
                text: thanksResponse,
                mood: Mood.HAPPY,
            };
        },
    },
    {
        pattern: /(siapa kamu|kamu siapa)/i,
        response: (chatId, msg) => {
            const userName = msg.from.first_name || 'Tuan';
            return {
                text: `Aku Lumina, ${userName} Asisten virtualmu. Apa ada yang bisa aku bantu? ${Mood.NORMAL.emoji}`,
                mood: Mood.NORMAL,
            };
        },
    },
    {
        pattern: /(lagi apa|lagi ngapain)/i,
        response: () => ({
            text: `Lumina? Lumina sedang bersiap membantu anda, Ada yang bisa saya bantu? ${Mood.NORMAL.emoji}`,
            mood: Mood.NORMAL,
        }),
    },

    // --- Media & Selfie Requests ---
    {
        pattern: new RegExp(
            '(pap|minta foto|minta pap|lihat muka(mu)?|liat muka(mu)?|' +
            'selfie|kirim foto(mu)?|lihat fotomu|liat fotomu)',
            'i',
        ),
        response: async (chatId, msg) => {
            if (!isFeatureEnabled('ENABLE_SELFIE_RESPONSES')) {
                return {
                    text: 'Fitur kirim foto lagi dimatikan ya.',
                    mood: Mood.NORMAL,
                };
            }

            const userName = msg.from.first_name || msg.from.username || USER_NAME;

            try {
                if (botInstanceRef && typeof botInstanceRef.sendChatAction === 'function') {
                    await botInstanceRef.sendChatAction(chatId, 'upload_photo');
                } else {
                    await LuminaTyping(chatId, 1000);
                }

                const selfiePath = await selfieManager.getRandomSelfie();

                if (!selfiePath) {
                    const directory = selfieManager.getSelfieDirectory();
                    return {
                        text: `E-eh, aku belum punya foto yang siap dibagikan. Isi dulu folder selfies di ${directory} ya. ${Mood.SAD.emoji}`,
                        mood: Mood.SAD,
                    };
                }

                const caption = getSelfieCaption(userName);
                await sendPhoto(chatId, selfiePath, { caption });

                await memory.addMessage({
                    role: 'assistant',
                    content: caption,
                    timestamp: new Date().toISOString(),
                    chatId,
                    context: {
                        topic: 'command_response',
                        command: 'selfie_request',
                        type: 'photo',
                        file: path.basename(selfiePath),
                    },
                });

                return {
                    text: null,
                    mood: currentMood,
                };
            } catch (error) {
                logger.error(
                    { event: 'selfie_command_error', chatId, error: error.message, stack: error.stack },
                    'Error handling selfie request',
                );
                Sentry.captureException(error);
                return {
                    text: `Maaf, fotonya belum bisa kukirim sekarang. ${Mood.SAD.emoji}`,
                    mood: Mood.SAD,
                };
            }
        },
    },

    // --- State & Info Commands ---
    {
        pattern: /^(mood|suasana hati)/i,
        response: () => ({
            text: `Mood Lumina sekarang adalah ${currentMood.name} ${currentMood.emoji}`,
            mood: currentMood,
        }),
    },
    {
        pattern: /(jam berapa|waktu sekarang)/i,
        response: () => {
            const now = new Date();
            const options = {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: 'Asia/Jakarta',
            };
            const timeString = now.toLocaleTimeString('id-ID', options);
            return {
                text: `Waktu sekarang adalah ${timeString}. ${currentMood.emoji}`,
                mood: currentMood,
            };
        },
    },
    {
        pattern: /(tanggal berapa|hari ini tanggal berapa)/i,
        response: (chatId, msg) => {
            const userName = msg.from.first_name;
            const now = new Date();
            const options = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'Asia/Jakarta',
            };
            const dateString = now.toLocaleDateString('id-ID', options);
            return {
                text: `Hmm.. Hari ini ${dateString}, ${userName}. ${currentMood.emoji}`,
                mood: currentMood,
            };
        },
    },

    // --- Functional Commands ---
    {
        pattern: /^\/cuaca/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const userId = msg.from.id;
                const userName = msg.from.first_name || USER_NAME;

                // Check if the user's location has been saved in memory
                const userLocation = await memory.getPreference(`user_location_${userId}`);

                if (userLocation && userLocation.latitude && userLocation.longitude) {
                    // Jika lokasi ada, langsung ambil data cuaca
                    sendMessage(chatId, `Baik, ${userName}! Aku akan cek cuaca di lokasimu yang tersimpan...`);
                    const weather = await getWeatherData(userLocation.latitude, userLocation.longitude);
                    if (weather) {
                        const weatherString = getWeatherString(weather);
                        const weatherReminder = getWeatherReminder(weather, userName);
                        return {
                            text: `${weatherString}\n\n${weatherReminder}`,
                            mood: currentMood,
                        };
                    } else {
                        return {
                            text: 'Maaf, Lumina tidak bisa menganalisis data cuaca untuk lokasimu ' +
                        `yang tersimpan. ${Mood.SAD.emoji}`,
                            mood: Mood.SAD,
                        };
                    }
                } else {
                    const requestMessage =
                        'Kirim lokasimu dulu ya~ 📍\n\nTenang saja, lokasi Anda hanya akan ' +
                        'digunakan untuk memberikan informasi cuaca dan tidak akan kami salahgunakan.';

                    if (botInstanceRef && typeof botInstanceRef.sendMessage === 'function') {
                        botInstanceRef.sendMessage(chatId, requestMessage, {
                            reply_markup: {
                                keyboard: [
                                    [
                                        {
                                            text: '📍 Kirim Lokasi Saat Ini',
                                            request_location: true,
                                        },
                                    ],
                                ],
                                resize_keyboard: true,
                                one_time_keyboard: true,
                            },
                        });
                    } else {
                        sendMessage(chatId, requestMessage);
                    }

                    // Tidak mengembalikan teks karena pesan sudah dikirim langsung
                    return { text: null };
                }
            } catch (error) {
                logger.error(
                    { event: 'weather_command_error', error: error.message, stack: error.stack },
                    'Error in /cuaca command handler',
                );
                Sentry.captureException(error);
                return { text: `Maaf, Kesalahan terjadi saat melakukan perintah. ${Mood.SAD.emoji}`, mood: Mood.SAD };
            }
        },
    },
    {
        pattern: /^\/note\s+(.+)/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const [, noteMessage] = msg.text.match(/^\/note\s+(.+)/i);
                const userId = msg.from.id;
                const responseText = await commandHelper.addNote(userId, noteMessage);
                return { text: responseText, mood: Mood.HAPPY };
            } catch (error) {
                logger.error(
                    { event: 'note_command_error', error: error.message, stack: error.stack },
                    'Error in /note command handler',
                );
                Sentry.captureException(error);
                return { text: 'Maaf, Kesalahan terjadi saat menyimpan catatan. Mohon coba lagi nanti.' };
            }
        },
    },
    {
        pattern: /^\/shownotes/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const userId = msg.from.id;
                const responseText = await commandHelper.showNotes(userId);
                return { text: responseText, mood: Mood.NORMAL };
            } catch (error) {
                logger.error(
                    { event: 'shownotes_command_error', error: error.message, stack: error.stack },
                    'Error in /shownotes command handler',
                );
                Sentry.captureException(error);
                return { text: 'Maaf, Kesalahan terjadi saat menampilkan catatan. Mohon coba lagi nanti.' };
            }
        },
    },
    {
        pattern: /^\/reminder\s+(\S+)\s+(.+)/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const [, timeString, message] = msg.text.match(/^\/reminder\s+(\S+)\s+(.+)/i);
                const userName = msg.from.first_name || msg.from.username || 'Master';
                const responseText = await commandHelper.setReminder(
                    botInstanceRef,
                    chatId,
                    timeString,
                    message,
                    userName,
                );
                return { text: responseText, mood: Mood.NORMAL };
            } catch (error) {
                logger.error(
                    { event: 'reminder_command_error', error: error.message, stack: error.stack },
                    'Error in /reminder command handler',
                );
                Sentry.captureException(error);
                return { text: 'Maaf, terdapat kesalahan saat mengatur pengingat. Mohon coba lagi nanti.' };
            }
        },
    },
    {
        pattern: /^\/search\s+(.+)$/i,
        response: async (chatId, msg) => {
            try {
                const match = msg.text.match(/^\/search\s+(.+)$/i);
                if (!match || !match[1]) {
                    return { text: `Maaf, ${msg.from.first_name || ''}. The /search command format is incorrect.` };
                }
                const query = match[1].trim();
                const userNameForCommand = msg.from.first_name || '';

                await LuminaTyping(chatId);
                sendMessage(
                    chatId,
                    `Oke, ${userNameForCommand}. Lumina akan mencari tentang "${query}" dan mencoba merangkumnya... Tunggu sebentar! ${getCurrentMood().emoji}`,
                );

                const searchResultText = await commandHelper.performSearch(
                    query,
                    userNameForCommand,
                    chatId,
                    getAISummarizer(),
                );
                return { text: searchResultText };
            } catch (error) {
                logger.error(
                    { event: 'search_command_error', query: msg.text, error: error.message, stack: error.stack },
                    'Error in /search command handler',
                );
                Sentry.captureException(error, { extra: { query: msg.text } });
                return { text: `Maaf, ${msg.from.first_name || ''}. Ada kesalahan saat memproses perintah ini.` };
            }
        },
    },

    // --- Emotional & Mood-based Commands ---
    {
        pattern: /^(lagu sedih|rekomendasi lagu sedih|rekomendasi lagu sad|lagu sad)/i,
        response: async (chatId) => {
            await sendSadSongNotification(chatId);
            // No text response needed as the notifier sends its own message.
            return {
                text: null,
                mood: Mood.SAD,
            };
        },
    },
    {
        pattern: /(lagi sedih|lagi galau|patah hati|lagi nangis)/i,
        response: async (chatId) => {
            await sendSadSongNotification(chatId);
            const comfortMessage =
                personalityMode === 'TSUNDERE'
                    ? `*Sigh*... Sangat lemah.. Tapi aku akan mendengarkanmu. ${Mood.CALM.emoji}`
                    : `Virtual hug~ Aku disini untukmu! ${Mood.CALM.emoji}`;
            return {
                text: comfortMessage,
                mood: Mood.CALM,
            };
        },
    },

    // --- Personality Switch Commands ---
    {
        pattern: /^\/tsundere/i,
        response: async (_chatId) => {
            await setPersonalityMode('TSUNDERE');
            return {
                text: 'Hmph, Oke! Jangan berharap aku akan jadi manis, Baka 💢',
                mood: Mood.ANGRY,
            };
        },
    },
    {
        pattern: /^\/deredere/i,
        response: async (_chatId) => {
            await setPersonalityMode('DEREDERE');
            return {
                text: 'Kyaa~! Okay~ Lumina akan menjadi baik dan friendly untukmu! ',
                mood: Mood.LOVING,
            };
        },
    },
];

// --- Conditional Command Registration ---

// Register holiday-related commands only if the API key is provided.
if (config.calendarificApiKey) {
    commandHandlers.push({
        pattern: /^\/(hariini|liburhariini|infohari)$/i,
        response: async (chatId, _msg) => {
            try {
                await LuminaTyping(chatId);
                const holidayMessage = await holidaysModule.getFormattedTodaysHolidays(
                    config.calendarificApiKey,
                    'ID', // Country code for Indonesia
                    config.USER_NAME,
                );
                return { text: holidayMessage };
            } catch (error) {
                logger.error(
                    { event: 'holiday_command_error', error: error.message, stack: error.stack },
                    'Error in /hariini command handler',
                );
                Sentry.captureException(error);
                return { text: 'Sorry, an error occurred while checking for holidays.' };
            }
        },
    });
    logger.info('[Commands] /hariini command for holiday info has been enabled.');
} else {
    logger.warn(
        '[Commands] Calendarific API Key not found in config.js. The /hariini command (holiday info) is disabled.',
    );
}

// --- Module Exports ---

/**
 * Sets the Telegram bot instance. This must be called once during initialization.
 * @param {object} bot - The Telegram bot instance.
 */
const setBotInstance = (bot) => {
    botInstanceRef = bot?.api || bot;
    if (!botInstanceRef || typeof botInstanceRef.sendChatAction !== 'function') {
        logger.warn(
            { event: 'bot_instance_missing_sendChatAction' },
            'Bot instance set but sendChatAction is unavailable. Ensure bot.api is provided.',
        );
    }
};

/**
 * Returns the bot's current mood.
 * @returns {object} The current mood object.
 */
const getCurrentMood = () => currentMood;

module.exports = {
    Mood,
    setMood,
    getRandomMood,
    commandHandlers,
    setBotInstance,
    getCurrentMood,
    LuminaTyping,
    setAISummarizer,
    getPersonalityMode,
    setPersonalityMode,
};
