// modules/newsManager.js
const NewsAPI = require('newsapi'); // Import library NewsAPI
const config = require('../config/config'); // Mengambil konfigurasi (untuk NewsAPI key)
const { sendMessage } = require('../utils/sendMessage'); // Fungsi utilitas untuk mengirim pesan
const { getJakartaHour } = require('../utils/timeHelper'); // Fungsi utilitas untuk zona waktu
const Groq = require("groq-sdk"); // Import Groq SDK untuk AI summarizer

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
        console.log("[NewsManager] Mengambil berita utama dari NewsAPI...");
        const response = await newsapi.v2.topHeadlines({
            country: 'id', // Negara: Indonesia
            language: 'id', // Bahasa: Indonesia
            pageSize: 5 // Mengambil 5 berita teratas
        });

        if (response.status === 'ok' && response.articles.length > 0) {
            console.log(`[NewsManager] Berhasil mengambil ${response.articles.length} berita.`);
            return response.articles;
        } else {
            console.log("[NewsManager] Tidak ada berita yang ditemukan atau status bukan 'ok'.");
            return [];
        }
    } catch (error) {
        console.error("[NewsManager] Kesalahan saat mengambil berita dari NewsAPI:", error.message);
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
        return "Tidak ada teks untuk diringkas.";
    }
    console.log("[NewsManager] Meringkas teks menggunakan AI...");
    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", 
            messages: [
                {
                    role: "system",
                    content: "Anda adalah asisten yang ahli dalam meringkas berita. Ringkaslah teks berikut ke dalam 4-6 kalimat yang padat dan informatif dalam Bahasa Indonesia."
                },
                {
                    role: "user",
                    content: `Tolong ringkas berita ini: "${textToSummarize}"`
                }
            ],
            max_tokens: 200, 
            temperature: 0.7 
        });

        if (response?.choices?.[0]?.message?.content) {
            console.log("[NewsManager] Ringkasan AI berhasil dibuat.");
            return response.choices[0].message.content.trim();
        } else {
            console.error("[NewsManager] Respons AI kosong atau tidak valid.");
            return "Maaf, Alya tidak bisa meringkas berita ini.";
        }
    } catch (error) {
        console.error("[NewsManager] Kesalahan saat meringkas teks dengan AI:", error.message);
        return "Terjadi kesalahan saat meringkas berita.";
    }
}

/**
 * Mengambil berita harian, meringkasnya, dan mengirimkannya ke chat ID yang ditentukan.
 * @param {string|number} chatId ID obrolan tujuan untuk mengirim berita.
 */
async function sendDailyNews(chatId) {
    if (!chatId) {
        console.warn("[NewsManager] Chat ID tidak ditentukan, tidak bisa mengirim berita harian.");
        return;
    }

    console.log(`[NewsManager] Mengirim berita harian ke Chat ID: ${chatId}`);
    const articles = await getTopNewsIndonesia();

    if (articles.length === 0) {
        sendMessage(chatId, "Maaf, Alya tidak dapat menemukan berita terbaru hari ini. Mungkin ada masalah dengan NewsAPI atau tidak ada berita yang tersedia.");
        return;
    }

    let newsSummary = `📰 Berita Utama Hari Ini (${new Date().toLocaleDateString('id-ID')}):\n\n`;
    let hasValidNews = false;

    for (const article of articles) {
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
    }

    if (hasValidNews) {
        sendMessage(chatId, newsSummary);
        console.log("[NewsManager] Berita harian berhasil dikirim.");
    } else {
        sendMessage(chatId, "Alya tidak dapat menemukan berita valid untuk diringkas hari ini.");
        console.log("[NewsManager] Tidak ada berita valid yang bisa dikirim.");
    }
}

module.exports = {
    sendDailyNews
};
