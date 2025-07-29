// modules/chatSummarizer.js
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia)
// MIT License

const Groq = require('groq-sdk'); // Import Groq SDK
const config = require('../config/config'); // Memuat konfigurasi (termasuk API key Groq)
const memory = require('../data/memory'); // Memuat modul memory untuk mengakses riwayat obrolan

const client = new Groq({ apiKey: config.groqApiKey });

/**
 * Meringkas riwayat obrolan yang diberikan menggunakan Groq API.
 * Modul ini dirancang untuk mengurangi penggunaan token dengan meringkas riwayat percakapan yang panjang.
 *
 * @param {Array<object>} chatHistory Riwayat obrolan yang akan diringkas. Setiap objek harus memiliki properti 'role' dan 'content'.
 * @param {number} [maxTokens=150] Batas token maksimum untuk ringkasan yang dihasilkan.
 * @returns {Promise<string|null>} Promise yang menyelesaikan ke string ringkasan, atau null jika terjadi kesalahan.
 */
const summarizeChatHistory = async (chatHistory, maxTokens = 150) => {
    // Memastikan riwayat obrolan adalah array dan tidak kosong
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
        console.warn("[ChatSummarizer] Riwayat obrolan kosong atau tidak valid.");
        return null;
    }

    // Memfilter riwayat untuk hanya menyertakan role dan content yang relevan
    const formattedHistory = chatHistory.map(msg => ({
        role: msg.role,
        content: msg.content || msg.text 
    }));

    const systemPrompt = `Kamu adalah asisten yang bertugas meringkas percakapan.
    Ringkas percakapan berikut ini menjadi satu paragraf yang koheren dan ringkas, fokus pada poin-poin utama dan topik yang dibahas.
    Tujuan ringkasan ini adalah untuk menghemat token dan menyediakan konteks singkat untuk percakapan di masa mendatang.
    Jangan tambahkan salam atau penutup. Hanya ringkasan murni.`;

    try {
        console.log("[ChatSummarizer] Mengirim riwayat obrolan untuk diringkas ke Groq API...");

        const response = await client.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(formattedHistory) }
            ],
            max_tokens: maxTokens, 
            temperature: 0.3 
        });

        if (response?.choices?.[0]?.message?.content) {
            const summary = response.choices[0].message.content.trim();
            console.log("[ChatSummarizer] Ringkasan berhasil diterima.");
            return summary;
        } else {
            console.error('[ChatSummarizer] Groq API Error atau respons kosong:', response.data);
            return null;
        }
    } catch (error) {
        console.error('[ChatSummarizer] Error saat memanggil Groq API untuk peringkasan:', error.response?.data || error.message || error);
        return null;
    }
};

/**
 * Fungsi untuk memicu peringkasan riwayat obrolan dari memory.js.
 * Dapat dipanggil secara berkala atau ketika riwayat mencapai ukuran tertentu.
 *
 * @param {number} [historyLimit=50] Jumlah pesan terakhir dari riwayat yang akan diringkas.
 * @returns {Promise<string|null>} Promise yang menyelesaikan ke string ringkasan terbaru, atau null jika tidak ada ringkasan.
 */
const getSummarizedHistory = async (historyLimit = 50) => {
    // Ambil riwayat obrolan dari memory.js
    const fullHistory = await memory.load(); 
    // Ambil sebagian dari riwayat obrolan terbaru untuk diringkas
    const historyToSummarize = fullHistory.slice(-historyLimit);

    if (historyToSummarize.length < 3) { // Jangan meringkas jika riwayat terlalu pendek
        console.log("[ChatSummarizer] Riwayat obrolan terlalu pendek untuk diringkas.");
        return null;
    }

    const summary = await summarizeChatHistory(historyToSummarize);
    return summary;
};

module.exports = {
    summarizeChatHistory,
    getSummarizedHistory
};
