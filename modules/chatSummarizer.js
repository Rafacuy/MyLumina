// modules/chatSummarizer.js
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: EN (English)
// MIT License

const Groq = require('groq-sdk'); // Import Groq SDK
const config = require('../config/config'); // Load configuration (including Groq API key)
const memory = require('../data/memory'); // Load memory module to access chat history

const client = new Groq({ apiKey: config.groqApiKey });

/**
 * Summarizes the given chat history using Groq API.
 * This module is designed to reduce token usage by summarizing long conversation histories.
 *
 * @param {Array<object>} chatHistory Chat history to be summarized. Each object must have 'role' and 'content' properties.
 * @param {number} [maxTokens=150] Maximum token limit for the generated summary.
 * @returns {Promise<string|null>} Promise that resolves to the summary string, or null if an error occurs.
 */
const summarizeChatHistory = async (chatHistory, maxTokens = 150) => {
    // Ensure chat history is an array and not empty
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
        console.warn('[ChatSummarizer] Chat history is empty or invalid.');
        return null;
    }

    // Filter history to only include relevant roles and content
    const formattedHistory = chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content || msg.text,
    }));

    const systemPrompt = `You are an assistant task to summarize conversations.
    Summarize the following conversation into one coherent and concise paragraph, focusing on the main points and topics discussed.
    The goal of this summary is to save tokens and provide brief context for future conversations.
    Do not add greetings or closings. Just the pure summary.`;

    try {
        console.log('[ChatSummarizer] Sending chat history to Groq API for summarization...');

        const response = await client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(formattedHistory) },
            ],
            max_tokens: maxTokens,
            temperature: 0.3,
        });

        if (response?.choices?.[0]?.message?.content) {
            const summary = response.choices[0].message.content.trim();
            console.log('[ChatSummarizer] Summary successfully received.');
            return summary;
        } else {
            console.error('[ChatSummarizer] Groq API Error or empty response:', response.data);
            return null;
        }
    } catch (error) {
        console.error(
            '[ChatSummarizer] Error calling Groq API for summarization:',
            error.response?.data || error.message || error,
        );
        return null;
    }
};

/**
 * Function to trigger chat history summarization from memory.js.
 * Can be called periodically or when history reaches a certain size.
 *
 * @param {number} [historyLimit=50] Number of recent messages from history to summarize.
 * @returns {Promise<string|null>} Promise that resolves to the latest summary string, or null if no summary.
 */
const getSummarizedHistory = async (historyLimit = 50) => {
    // Get chat history from memory.js
    const fullHistory = await memory.load();
    // Take a portion of the latest chat history to summarize
    const historyToSummarize = fullHistory.slice(-historyLimit);

    if (historyToSummarize.length < 3) {
        // Do not summarize if history is too short
        console.log('[ChatSummarizer] Chat history is too short to summarize.');
        return null;
    }

    const summary = await summarizeChatHistory(historyToSummarize);
    return summary;
};

module.exports = {
    summarizeChatHistory,
    getSummarizedHistory,
};