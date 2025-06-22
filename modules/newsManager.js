// modules/newsManager.js
const NewsAPI = require('newsapi'); // Import library NewsAPI
const config = require('../config/config'); // Mengambil konfigurasi (untuk NewsAPI key)
const { sendMessage } = require('../utils/sendMessage'); // Fungsi utilitas untuk mengirim pesan
const Groq = require("groq-sdk"); // Import Groq SDK untuk AI summarizer
const logger = require('../utils/logger'); // Mengimpor logger yang sudah dikonfigurasi
const Sentry = require('@sentry/node'); // Mengimpor Sentry

// Inisialisasi NewsAPI 
const newsapi = new NewsAPI(config.newsApiKey);

// Inisialisasi Groq client 
const groq = new Groq({ apiKey: config.groqApiKey });

/**
 * Mengambil berita utama dari Indonesia.
 * @returns {Promise<Array<Object>>} Array berisi objek berita atau array kosong jika terjadi kesalahan.
 */
async function getTopNewsIndonesia() {
    try {
        logger.info("[NewsManager] Mengambil berita utama dari NewsAPI...");
        const response = await newsapi.v2.everything({
            q: 'indonesia',
            language: 'id',
            sortBy: 'publishedAt',
            pageSize: 5
        });
        

        if (response.status === 'ok' && response.articles.length > 0) {
            logger.info(`[NewsManager] Berhasil mengambil ${response.articles.length} berita.`);
            return response.articles;
        } else {
            logger.info("[NewsManager] Tidak ada berita yang ditemukan atau status bukan 'ok'.");
            return [];
        }
    } catch (error) {
        logger.error({
            event: "get_top_news_error",
            error: error.message,
            stack: error.stack,
            source: "NewsAPI"
        }, "[NewsManager] Kesalahan saat mengambil berita dari NewsAPI:");
        Sentry.captureException(error); // Laporkan kesalahan ke Sentry
        return [];
    }
}

/**
 * Meringkas teks menggunakan AI (Groq).
 * @param {string} textToSummarize Teks yang akan diringkas.
 * @returns {Promise<string>} Ringkasan teks atau pesan kesalahan jika gagal.
 */
async function summarizeText(textToSummarize) {
    if (!textToSummarize) {
        logger.warn("[NewsManager] Tidak ada teks untuk diringkas.");
        return "Tidak ada teks untuk diringkas.";
    }
    logger.info("[NewsManager] Meringkas teks menggunakan AI...");
    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", 
            messages: [
                {
                  role: "system",
                  content: "Kamu adalah sistem AI yang sangat ringkas dan langsung pada intinya."
                },
                {
                  role: "user",
                  content: `Ringkas teks berikut ke dalam 4-6 kalimat padat dan informatif dalam Bahasa Indonesia. 
              Jangan gunakan kalimat pembuka seperti 'Berikut adalah ringkasan...' atau 'Tentu, ini ringkasannya...'. 
              Langsung mulai ringkasan dengan isi berita tanpa frasa pembuka. Ini teksnya: "${textToSummarize}"`
                }
            ],              
            max_tokens: 200, 
            temperature: 0.7 
        });

        if (response?.choices?.[0]?.message?.content) {
            logger.info("[NewsManager] Ringkasan AI berhasil dibuat.");
            return response.choices[0].message.content.trim();
        } else {
            logger.error({
                event: "summarize_text_empty_response",
                response: response,
                source: "Groq"
            }, "[NewsManager] Respons AI kosong atau tidak valid.");
            Sentry.captureMessage("[NewsManager] Respons AI kosong atau tidak valid saat meringkas teks."); // Laporkan ke Sentry
            return "Maaf, Lumina tidak bisa meringkas berita ini.";
        }
    } catch (error) {
        logger.error({
            event: "summarize_text_error",
            error: error.message,
            stack: error.stack,
            source: "Groq"
        }, "[NewsManager] Kesalahan saat meringkas teks dengan AI:");
        Sentry.captureException(error); // Laporkan kesalahan ke Sentry
        return "Terjadi kesalahan saat meringkas berita.";
    }
}

/**
 * Mengambil berita harian, meringkasnya, dan mengirimkannya ke chat ID yang ditentukan.
 * @param {string|number} chatId ID obrolan tujuan untuk mengirim berita.
 */
async function sendDailyNews(chatId) {
    if (!chatId) {
        logger.warn("[NewsManager] Chat ID tidak ditentukan, tidak bisa mengirim berita harian.");
        return;
    }

    logger.info(`[NewsManager] Mengirim berita harian ke Chat ID: ${chatId}`);
    const articles = await getTopNewsIndonesia();

    if (articles.length === 0) {
        sendMessage(chatId, "Maaf, Lumina tidak dapat menemukan berita terbaru hari ini. Mungkin ada masalah dengan NewsAPI atau tidak ada berita yang tersedia.");
        logger.info("[NewsManager] Tidak ada berita untuk dikirim.");
        return;
    }

    let newsSummary = `📰 Berita Utama Hari Ini (${new Date().toLocaleDateString('id-ID')}):\n\n`;
    let hasValidNews = false;

    for (const article of articles) {
        try {
            if (article.title && article.description) {
                const summarizedDescription = await summarizeText(article.description);
                newsSummary += `* **${article.title}**\n`;
                newsSummary += `  Ringkasan: _${summarizedDescription}_\n`;
                if (article.url) {
                    newsSummary += `  Baca selengkapnya: ${article.url}\n\n`;
                } else {
                    newsSummary += `\n`;
                }
                hasValidNews = true;
            }
        } catch (articleError) {
            logger.error({
                event: "process_article_error",
                articleTitle: article.title,
                error: articleError.message,
                stack: articleError.stack
            }, "[NewsManager] Error processing individual article:");
            Sentry.captureException(articleError); // Laporkan kesalahan artikel ke Sentry
        }
    }

    if (hasValidNews) {
        await sendMessage(chatId, newsSummary);
        logger.info("[NewsManager] Berita harian berhasil dikirim.");
    } else {
        await sendMessage(chatId, "Lumina tidak dapat menemukan berita valid untuk diringkas hari ini.");
        logger.info("[NewsManager] Tidak ada berita valid yang bisa dikirim.");
    }
}

module.exports = {
    sendDailyNews
};
