// modules/ltmProcessor.js
const Groq = require('groq-sdk');
const config = require('../config/config');
const memory = require('../data/memory');
const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

//  ---- Groq API ----
const client = new Groq({ apiKey: config.groqApiKey });

// --- Cache Management ---
// Cache to reduce repeated calls to LLM or Regex
const ltmCache = new Map();
const MAX_LTM_CACHE_SIZE = 1000; // Set maximum cache limit

/**
 * Adds data to cache with size management.
 * If cache is full, the oldest entry will be deleted.
 * @param {string} key - Cache key (input text).
 * @param {Object} data - Analysis result data to store.
 */
function addToLtmCache(key, data) {
    if (ltmCache.size >= MAX_LTM_CACHE_SIZE) {
        // Delete the first (oldest) entry if the cache is full
        const oldestKey = ltmCache.keys().next().value;
        ltmCache.delete(oldestKey);
        logger.info({ event: 'ltm_cache_purged', key: oldestKey }, 'Oldest LTM cache entry purged.');
    }
    ltmCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Detects general preferences using Regex.
 * If a pattern matches, this function returns the same data structure as AI output.
 * @param {string} text - User input text.
 * @returns {Promise<Object|null>} Analysis result object if matched, or null if not.
 */
async function detectWithRegex(text) {
    const patterns = [
        // Pattern for preferences (likes/hates) or habits (always/often)
        {
            pattern: /aku\s+(suka|benci|selalu|sering)\s+(.+)/i,
            priority: 80,
            formatter: (match) => `User ${match[1]} ${match[2]}.`,
        },
        // Pattern for ongoing or completed activities
        {
            pattern: /aku\s+(lagi|sedang|sudah|baru saja)\s+(.+)/i,
            priority: 83,
            formatter: (match) => `User is working on or has completed: ${match[2]}.`,
        },
        // Pattern for personal facts (name, origin, job)
        {
            pattern: /nama\s+aku\s+adalah\s+(.+)/i,
            priority: 98,
            formatter: (match) => `User's name is ${match[1]}.`,
        },
        {
            pattern: /aku\s+tinggal\s+di\s+(.+)/i,
            priority: 95,
            formatter: (match) => `User lives in ${match[1]}.`,
        },
    ];

    for (const { pattern, priority, formatter } of patterns) {
        const match = text.match(pattern);
        if (match) {
            const query_preferences = formatter(match);
            logger.info({ event: 'ltm_regex_hit', pattern: pattern.source }, 'LTM preference detected via Regex.');
            return {
                should_save_preferences: true,
                priorities_level: priority,
                query_preferences,
            };
        }
    }

    // If no patterns match
    return null;
}

/**
 * Processes text to determine if it is worth saving as LTM.
 * Uses a hybrid system: Regex (fast-path) followed by AI (slow-path).
 * @param {string} text - User input text.
 * @returns {Promise<Object>} Analysis result object.
 */
async function processForLTM(text) {
    // Check cache first
    if (ltmCache.has(text)) {
        logger.debug({ event: 'ltm_cache_hit', text }, 'LTM analysis result retrieved from cache.');
        return ltmCache.get(text).data;
    }

    // Try detecting with Regex
    const regexResult = await detectWithRegex(text);
    if (regexResult) {
        // If Regex is successful, save to cache and return the result
        addToLtmCache(text, regexResult);
        return regexResult;
    }

    // If Regex fails, proceed to AI
    logger.info({ event: 'ltm_ai_fallback', text }, 'Regex did not match, falling back to AI processing.');

    try {
        const response = await client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: `
          You are the “Long-Term Memory (LTM) gatekeeper” for MyLumina, the Indonesian-language Telegram assistant.
          Your task is 100% pure: DECIDE whether a user's sentence contains facts, preferences, or habits that will STILL BE RELEVANT 30 days from now.
          
          STRONG RULES:
          1. Ignore fleeting expressions like “gabut,” “bosan,” “capek,” “laper,” “pengen tidur,” “lagi malas.”
          2. Ignore questions, short feedback, or insults without context.
          3. Ignore emoji-only or sentences less than 4 words.
          4. Save only if the information is permanent: name, address, job, hobbies, favorite food, fears, life goals, etc.
          5. Priority 1-100; use ≥ 80 only for important personal facts (name, birthplace, beliefs).
          6. If in doubt, even 1%, return should_save_preferences = false.
          
          Reject example:
          - "I'm bored, dude" → false
          - "I'm busy" → false
          - "Why are you taking so long to reply?" → false
          
          Accept example:
          - "My name is Rizky, but you can just call me Riz." → true, priority 98
          - "I'm allergic to peanuts." → true, priority 90
          - "Every weekend I play badminton with my office friends." → true, priority 75
          
          Required JSON output without comments:
          {
            "should_save_preferences":boolean,
            "priorities_level":number,
            "query_preferences":"Short sentence, max 8 words"
          }
          
          Sentence: ${text}
            `,
                },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 200,
            temperature: 0.6,
        });

        const content = response.choices[0].message.content;
        let result;
        try {
            result = JSON.parse(content);
        } catch {
            logger.error({ event: 'ltm_json_parse_error', content }, 'Failed to parse LTM analysis result from AI.');
            throw new Error('Invalid JSON response from LLM');
        }

        // Validate AI result
        if (typeof result.should_save_preferences !== 'boolean') {
            throw new Error('Invalid should_save_preferences value from AI');
        }

        // Save AI result to cache
        addToLtmCache(text, result);

        return result;
    } catch (error) {
        logger.error(
            { event: 'ltm_processing_error', error: error.message, text },
            'Error processing text for LTM with AI:',
        );
        if (config.sentryDsn) {
            Sentry.captureException(error);
        }
        // Return default values if an error occurs
        return {
            should_save_preferences: false,
            priorities_level: 0,
            query_preferences: '',
        };
    }
}

/**
 * Saves LTM analysis results to the database using the LTM collection.
 * @param {Object} analysisResult - Result from processForLTM()
 * @param {string} originalText - Original user text
 */
async function saveLTMResult(analysisResult, originalText) {
    if (!analysisResult.should_save_preferences) {
        return;
    }

    try {
        const ltmData = {
            content: analysisResult.query_preferences,
            priority: analysisResult.priorities_level,
            source: originalText, // Store original text as source
            createdAt: new Date().toISOString(),
            lastAccessed: new Date().toISOString(), // Initialize lastAccessed
        };

        // Use saveLTMMemory function to save to 'ltm' collection
        await memory.saveLTMMemory(
            `ltm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique key
            ltmData,
        );

        logger.info(
            {
                event: 'ltm_saved',
                priority: analysisResult.priorities_level,
                summary: analysisResult.query_preferences,
            },
            'LTM saved to database',
        );
    } catch (error) {
        logger.error({ event: 'ltm_save_error', error: error.message }, 'Failed to save LTM to database');
        Sentry.captureException(error);
    }
}

module.exports = {
    processForLTM,
    saveLTMResult,
};