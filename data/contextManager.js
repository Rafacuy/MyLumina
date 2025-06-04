// contextManager.js
// Gawe Alya iso lebih ngerti konteks mu

const TOPIC_KEYWORDS = {
    FOOD: ['makanan', 'makan', 'kuliner', 'resto', 'lapar', 'haus', 'minum', 'resep'],
    MOVIE: ['film', 'nonton', 'bioskop', 'sinema', 'series', 'drama'],
    MUSIC: ['musik', 'lagu', 'band', 'penyanyi', 'konser', 'spotify'],
    GAME: ['game', 'main', 'mabar', 'gim', 'esports'],
    TRAVEL: ['liburan', 'jalan-jalan', 'wisata', 'destinasi', 'traveling', 'hotel', 'pantai', 'gunung'],
    TECH: ['teknologi', 'gadget', 'komputer', 'internet', 'aplikasi', 'software', 'hardware'],
    NEWS: ['berita', 'informasi', 'terkini', 'update', 'koran', 'artikel'],
    GENERAL_CHAT: ['halo', 'hai', 'apa kabar', 'kamu lagi apa', 'cerita dong'], // Untuk percakapan umum
};

/**
 * Mendeteksi topik utama berdasarkan konten pesan.
 * @param {string} content Konten pesan dari pengguna.
 * @returns {string|null} Nama topik yang terdeteksi (misalnya, 'FOOD', 'MOVIE') atau null jika tidak ada topik spesifik yang terdeteksi.
 */
function detectTopic(content) {
    if (!content || typeof content !== 'string') {
        return null;
    }
    const lowerContent = content.toLowerCase();
    for (const topic in TOPIC_KEYWORDS) {
        if (TOPIC_KEYWORDS[topic].some(keyword => lowerContent.includes(keyword))) {
            return topic;
        }
    }
    return null; 
}

/**
 * Menganalisis gaya bicara pengguna (misalnya, santai, kasar, formal).
 * @param {string} content Konten pesan dari pengguna.
 * @returns {string} Kategori nada bicara ('santai', 'kasar', 'normal').
 */
function detectTone(content) {
    if (!content || typeof content !== 'string') {
        return 'normal';
    }
    const lowerContent = content.toLowerCase();
    if (/\b(wkwk|haha|xixi|lol|anjay|mantap|keren)\b/.test(lowerContent)) {
        return "santai";
    } else if (/\b(bangsat|kontol|anjing|asu|goblok|tolol)\b/.test(lowerContent)) {
        return "kasar";
    }
    return "normal";
}

/**
 * Fungsi placeholder untuk memeriksa apakah ada balasan otomatis yang cocok.
 * @param {string} content Konten pesan dari pengguna.
 * @returns {string|null} Teks balasan otomatis atau null jika tidak ada.
 */
function checkAutoReply(content) {
    // Logika untuk auto-reply bisa ditambahkan di sini.
    // e.g, jika content === "ping", return "pong".
    // hehe males nambahin :v (tambahin mandiri!)
    if (content && content.toLowerCase() === "ping") {
        return "Pong!";
    }
    return null;
}

/**
 * Menganalisis pesan secara keseluruhan untuk mendapatkan metadata kontekstual.
 * Metadata ini dapat disimpan bersama pesan di memory.js.
 * @param {object} message Objek pesan (misalnya, dari Telegram API, yang memiliki properti 'text' atau 'content').
 * @returns {object} Objek metadata yang berisi topik, nada, dan potensi balasan otomatis.
 */
function analyzeMessage(message) {
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
        autoReply
    };
}

module.exports = {
    detectTopic,
    detectTone,
    analyzeMessage,
    checkAutoReply, // Diekspor jika ingin digunakan secara terpisah
    TOPIC_KEYWORDS // Diekspor jika dibutuhkan di modul lain
};
