// modules/newsManager.js
const NewsAPI = require('newsapi'); // Import NewsAPI library
const config = require('../config/config'); // Load configuration (for NewsAPI key)
const { sendMessage } = require('../utils/sendMessage'); // Utility function to send messages
const Groq = require('groq-sdk'); // Import Groq SDK for AI summarizer
const logger = require('../utils/logger'); // Import configured logger
const Sentry = require('@sentry/node'); // Import Sentry

// Initialize NewsAPI
const newsapi = new NewsAPI(config.newsApiKey);

// Initialize Groq client
const groq = new Groq({ apiKey: config.groqApiKey });

/**
 * Fetches top news headlines from Indonesia.
 * @returns {Promise<Array<Object>>} Array of news objects or an empty array if an error occurs.
 */
async function getTopNewsIndonesia() {
    try {
        logger.info('[NewsManager] Fetching top news from NewsAPI...');
        const response = await newsapi.v2.everything({
            q: 'indonesia',
            language: 'id',
            sortBy: 'publishedAt',
            pageSize: 5,
        });

        if (response.status === 'ok' && response.articles.length > 0) {
            logger.info(`[NewsManager] Successfully fetched ${response.articles.length} news articles.`);
            return response.articles;
        } else {
            logger.info("[NewsManager] No news articles found or status is not 'ok'.");
            return [];
        }
    } catch (error) {
        logger.error(
            {
                event: 'get_top_news_error',
                error: error.message,
                stack: error.stack,
                source: 'NewsAPI',
            },
            '[NewsManager] Error fetching news from NewsAPI:',
        );
        Sentry.captureException(error); // Report error to Sentry
        return [];
    }
}

/**
 * Summarizes text using AI (Groq).
 * @param {string} textToSummarize The text to be summarized.
 * @returns {Promise<string>} Text summary or an error message if it fails.
 */
async function summarizeText(textToSummarize) {
    if (!textToSummarize) {
        logger.warn('[NewsManager] No text provided for summarization.');
        return 'No text provided for summarization.';
    }
    logger.info('[NewsManager] Summarizing text using AI...');
    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: 'You are a highly concise AI system that gets straight to the point.',
                },
                {
                    role: 'user',
                    content: `Summarize the following text into 4-6 concise and informative sentences in Indonesian. 
              Do not use introductory phrases like 'Here is the summary...' or 'Sure, here is the summary...'. 
              Start the summary immediately with the news content without any introductory phrases. Here is the text: "${textToSummarize}"`,
                },
            ],
            max_tokens: 200,
            temperature: 0.7,
        });

        if (response?.choices?.[0]?.message?.content) {
            logger.info('[NewsManager] AI summary successfully generated.');
            return response.choices[0].message.content.trim();
        } else {
            logger.error(
                {
                    event: 'summarize_text_empty_response',
                    response: response,
                    source: 'Groq',
                },
                '[NewsManager] AI response is empty or invalid.',
            );
            Sentry.captureMessage('[NewsManager] AI response empty or invalid during text summarization.'); // Report to Sentry
            return 'Sorry, Lumina could not summarize this news.';
        }
    } catch (error) {
        logger.error(
            {
                event: 'summarize_text_error',
                error: error.message,
                stack: error.stack,
                source: 'Groq',
            },
            '[NewsManager] Error summarizing text with AI:',
        );
        Sentry.captureException(error); // Report error to Sentry
        return 'An error occurred during news summarization.';
    }
}

/**
 * Fetches daily news, summarizes them, and sends them to the specified chat ID.
 * @param {string|number} chatId Target chat ID to send the news.
 */
async function sendDailyNews(chatId) {
    if (!chatId) {
        logger.warn('[NewsManager] Chat ID not specified, cannot send daily news.');
        return;
    }

    logger.info(`[NewsManager] Sending daily news to Chat ID: ${chatId}`);
    const articles = await getTopNewsIndonesia();

    if (articles.length === 0) {
        sendMessage(
            chatId,
            'Sorry, Lumina could not find any latest news today. There might be an issue with NewsAPI or no news available.',
        );
        logger.info('[NewsManager] No news to send.');
        return;
    }

    let newsSummary = `📰 Today's Top News (${new Date().toLocaleDateString('id-ID')}):\n\n`;
    let hasValidNews = false;

    for (const article of articles) {
        try {
            if (article.title && article.description) {
                const summarizedDescription = await summarizeText(article.description);
                newsSummary += `* **${article.title}**\n`;
                newsSummary += `  Summary: _${summarizedDescription}_\n`;
                if (article.url) {
                    newsSummary += `  Read more: ${article.url}\n\n`;
                } else {
                    newsSummary += '\n';
                }
                hasValidNews = true;
            }
        } catch (articleError) {
            logger.error(
                {
                    event: 'process_article_error',
                    articleTitle: article.title,
                    error: articleError.message,
                    stack: articleError.stack,
                },
                '[NewsManager] Error processing individual article:',
            );
            Sentry.captureException(articleError); // Report article error to Sentry
        }
    }

    if (hasValidNews) {
        await sendMessage(chatId, newsSummary);
        logger.info('[NewsManager] Daily news successfully sent.');
    } else {
        await sendMessage(chatId, 'Lumina could not find any valid news to summarize today.');
        logger.info('[NewsManager] No valid news available to send.');
    }
}

module.exports = {
    sendDailyNews,
};