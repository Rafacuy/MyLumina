// handler/contextHandler.js
// A simple context analysis module to determine the topic and tone of a user's message.
// This helps the bot to understand the intent behind the message and respond more appropriately.

/**
 * @const {object} TOPIC_KEYWORDS
 * @description A dictionary mapping conversation topics to an array of relevant keywords.
 * This is used by `detectTopic` to categorize user messages.
 * Note: The keyword matching is case-insensitive.
 */
const TOPIC_KEYWORDS = {
    FOOD: ['makanan', 'makan', 'kuliner', 'resto', 'lapar', 'haus', 'minum', 'resep'],
    MOVIE: ['film', 'nonton', 'bioskop', 'sinema', 'series', 'drama'],
    MUSIC: ['musik', 'lagu', 'band', 'penyanyi', 'konser', 'spotify'],
    GAME: ['game', 'main', 'mabar', 'gim', 'esports'],
    TRAVEL: [
        'liburan',
        'jalan-jalan',
        'wisata',
        'destinasi',
        'traveling',
        'hotel',
        'pantai',
        'gunung',
        'keliling dunia',
    ],
    TECH: ['teknologi', 'gadget', 'komputer', 'internet', 'aplikasi', 'software', 'hardware', 'coding', 'ngoding'],
    NEWS: ['berita', 'informasi', 'terkini', 'update', 'koran', 'artikel'],
    GENERAL_CHAT: ['halo', 'hai', 'apa kabar', 'kamu lagi apa', 'cerita dong'], // Keywords for general conversation
};

/**
 * Detects the main topic of a message based on its content.
 * It iterates through the TOPIC_KEYWORDS and returns the first topic that has a matching keyword.
 * @param {string} content - The user's message content.
 * @returns {string|null} The detected topic name (e.g., 'FOOD', 'MOVIE') or null if no specific topic is found.
 */
function detectTopic(content) {
    // Basic validation to ensure content is a non-empty string.
    if (!content || typeof content !== 'string') {
        return null;
    }
    const lowerContent = content.toLowerCase();

    // Logic: Sequentially search for any keyword from each topic.
    // This is a simple and effective approach for clear-cut cases.
    // For more complex analysis, a scoring system could be implemented.
    for (const topic in TOPIC_KEYWORDS) {
        if (TOPIC_KEYWORDS[topic].some((keyword) => lowerContent.includes(keyword))) {
            return topic;
        }
    }

    // Return null if no keywords match, indicating a general or unknown topic.
    return null;
}

/**
 * Analyzes the user's speaking style or tone (e.g., casual, rude, formal).
 * This uses simple regex to find common slang or profanity.
 * @param {string} content - The user's message content.
 * @returns {string} The detected tone category ('casual', 'rude', or 'normal').
 */
function detectTone(content) {
    if (!content || typeof content !== 'string') {
        return 'normal';
    }
    const lowerContent = content.toLowerCase();

    // Logic: Use regex with word boundaries (\b) to avoid partial matches (e.g., 'goblok' in 'goblokan').
    if (/\b(wkwk|haha|xixi|lol|anjay|mantap|keren)\b/.test(lowerContent)) {
        return 'casual';
    } else if (/\b(bangsat|kontol|anjing|asu|goblok|tolol)\b/.test(lowerContent)) {
        return 'rude';
    }

    return 'normal';
}

/**
 * A placeholder function to check for simple, direct auto-replies.
 * This can be expanded into a more complex system for FAQs or simple commands.
 * @param {string} content - The user's message content.
 * @returns {string|null} The auto-reply text or null if no match is found.
 */
function checkAutoReply(content) {
    // Example: A simple "ping-pong" auto-reply.
    // This is a good spot to handle very common, static queries without involving the AI model.
    if (content && content.toLowerCase() === 'ping') {
        return 'Pong!';
    }
    return null;
}

/**
 * Analyzes a message to extract a full set of contextual metadata.
 * This metadata can be stored alongside the message in memory.js for future reference or analytics.
 * @param {object} message - The message object (e.g., from the Telegram API, which has a 'text' property).
 * @returns {object} An object containing metadata: { topic, tone, autoReply }.
 */
function analyzeMessage(message) {
    // Safely extract text content from the message object.
    const content = message && (message.text || message.content);

    if (!content) {
        return {
            topic: null,
            tone: 'normal',
            autoReply: null,
        };
    }

    const topic = detectTopic(content);
    const tone = detectTone(content);
    const autoReply = checkAutoReply(content);

    return {
        topic,
        tone,
        autoReply,
    };
}

module.exports = {
    detectTopic,
    detectTone,
    analyzeMessage,
    checkAutoReply, // Exported for potential standalone use.
    TOPIC_KEYWORDS, // Exported in case other modules need access to the keyword list.
};
