// handler/relationHandler.js
// AUTHOR: Arash
// DESCRIPTION: Mengelola status relasi, poin, dan level antara Chatbot dan User

const fs = require('fs').promises;
const path = require('path');
const memory = require('../data/memory'); // Impor memory.js untuk mengakses riwayat chat
const config = require('../config/config'); // Impor config.js untuk mendapatkan USER_NAME
const { getJakartaMoment } = require('../utils/timeHelper') // Mengimpor fungsi, bukan variabel

// --- Konfigurasi Status Relasi ---
const RELATION_STATE_FILE = path.join(__dirname, '..', 'data', 'relationState.json'); // Lokasi file penyimpanan
const WEEKLY_CONVERSATION_THRESHOLD = 30; // Target percakapan per minggu
const WEEKLY_POINTS_BONUS = 30; // Poin bonus jika target tercapai
const POINTS_PER_MESSAGE = 1; // Poin yang didapatkan setiap kali pengguna mengirim pesan

// Poin yang dibutuhkan untuk setiap level
const LEVEL_THRESHOLDS = {
    1: 0,
    2: 100,
    3: 250,
    4: 500,
    5: 1000
};

// Deskripsi untuk setiap level
const LEVEL_DESCRIPTIONS = {
    1: "hanya asisten pembantu.",
    2: "Teman dekat",
    3: "Sahabat tersayang",
    4: "Pacar",
    5: "Pacar tersayang"
};

// --- State Internal ---
let currentState = {
    points: 0,
    level: 1,
    lastWeeklyCheckTimestamp: getJakartaMoment()
};

/**
 * Memuat status relasi dari file JSON.
 * Jika file tidak ada, file baru akan dibuat dengan nilai default.
 */
async function loadRelationState() {
    try {
        const data = await fs.readFile(RELATION_STATE_FILE, 'utf8');
        currentState = JSON.parse(data);
        // Pastikan lastWeeklyCheckTimestamp adalah numerik setelah dimuat
        if (typeof currentState.lastWeeklyCheckTimestamp !== 'number') {
            currentState.lastWeeklyCheckTimestamp = getJakartaMoment();
            await saveRelationState();
        }
        console.log('✅ Status relasi berhasil dimuat.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('File status relasi tidak ditemukan. Membuat file baru...');
            currentState.lastWeeklyCheckTimestamp = getJakartaMoment(); // Inisialisasi juga saat file baru dibuat
            await saveRelationState();
        } else {
            console.error('❌ Gagal memuat status relasi:', error);
        }
    }
}

/**
 * Menyimpan status relasi saat ini ke file JSON.
 */
async function saveRelationState() {
    try {
        await fs.writeFile(RELATION_STATE_FILE, JSON.stringify(currentState, null, 2));
        console.log('💾 Status relasi berhasil disimpan.');
    } catch (error) {
        console.error('❌ Gagal menyimpan status relasi:', error);
    }
}

/**
 * Memperbarui level relasi berdasarkan poin saat ini.
 * @returns {boolean} - True jika level berubah, false jika tidak.
 */
function updateLevel() {
    const oldLevel = currentState.level;
    let newLevel = 1;

    // Cek dari level tertinggi ke terendah
    for (let level = 5; level >= 1; level--) {
        if (currentState.points >= LEVEL_THRESHOLDS[level]) {
            newLevel = level;
            break;
        }
    }

    if (newLevel !== oldLevel) {
        currentState.level = newLevel;
        console.log(`🎉 LEVEL UP! Lumina sekarang berada di Level ${newLevel}: ${LEVEL_DESCRIPTIONS[newLevel]}`);
        return true;
    }
    return false;
}

/**
 * Menambah atau mengurangi poin dan memperbarui level.
 * @param {number} pointsToAdd - Jumlah poin yang akan ditambahkan (bisa negatif).
 */
async function addPoints(pointsToAdd) {
    console.log(`[DEBUG - RelationState] Fungsi addPoints dipanggil dengan ${pointsToAdd} poin.`);
    currentState.points += pointsToAdd;
    // Pastikan poin tidak negatif
    if (currentState.points < 0) {
        currentState.points = 0;
    }
    console.log(`✨ Poin relasi diubah sebesar ${pointsToAdd}. Total poin sekarang: ${currentState.points}`);
    updateLevel(); // Panggil updateLevel setelah poin diubah
    await saveRelationState();
}

/**
 * Menambah poin setiap kali pengguna mengirim pesan.
 * Akan dipanggil dari core.js
 */
async function addPointOnMessage() {
    await addPoints(POINTS_PER_MESSAGE);
    console.log(`[RelationState] Poin bertambah ${POINTS_PER_MESSAGE} dari interaksi pesan.`)
}


/**
 * Memeriksa jumlah percakapan dalam seminggu terakhir.
 * Jika lebih dari threshold, tambahkan poin bonus.
 * Fungsi ini harus dipanggil secara berkala (misalnya, setiap beberapa jam) dari core.js.
 */
async function checkWeeklyConversation() {
    // Pastikan lastWeeklyCheckTimestamp adalah angka
    if (typeof currentState.lastWeeklyCheckTimestamp !== 'number') {
        currentState.lastWeeklyCheckTimestamp = getJakartaMoment();
        await saveRelationState();
    }

    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    const now = getJakartaMoment(); // Panggil fungsi untuk mendapatkan timestamp saat ini

    // Cek apakah sudah lebih dari seminggu sejak pengecekan terakhir
    if (now - currentState.lastWeeklyCheckTimestamp > oneWeekInMs) {
        console.log('⏳ Melakukan pengecekan percakapan mingguan...');
        const history = await memory.getInMemoryHistory(); 
        const lastWeekDate = new Date(currentState.lastWeeklyCheckTimestamp);

        // Filter pesan dari user target dalam seminggu terakhir
        const userMessagesLastWeek = history.filter(msg =>
            msg.role === 'user' &&
            msg.from && // Pastikan properti 'from' ada
            msg.from.first_name === config.USER_NAME &&
            new Date(msg.timestamp) > lastWeekDate
        );

        console.log(`Total percakapan dari ${config.USER_NAME} dalam seminggu terakhir: ${userMessagesLastWeek.length}`);

        if (userMessagesLastWeek.length > WEEKLY_CONVERSATION_THRESHOLD) {
            console.log(`🏆 Target percakapan mingguan terlampaui! Memberikan ${WEEKLY_POINTS_BONUS} poin.`);
            await addPoints(WEEKLY_POINTS_BONUS);
        } else {
            console.log(`Tidak mencapai target percakapan mingguan (${userMessagesLastWeek.length}/${WEEKLY_CONVERSATION_THRESHOLD}).`);
        }

        // Reset timestamp pengecekan ke waktu sekarang
        currentState.lastWeeklyCheckTimestamp = now;
        await saveRelationState();
    } else {
        console.log(`Pengecekan mingguan belum saatnya. Tersisa ${Math.floor((oneWeekInMs - (now - currentState.lastWeeklyCheckTimestamp)) / (1000 * 60 * 60 * 24))} hari.`);
    }
}

// --- Fungsi yang Diekspor ---

/**
 * Mendapatkan level relasi saat ini.
 * @returns {number} - Level saat ini (1-5).
 */
function getRelationLevel() {
    return currentState.level;
}

/**
 * Mendapatkan deskripsi dari level relasi saat ini.
 * @returns {string} - Deskripsi level.
 */
function getRelationLevelDescription() {
    return LEVEL_DESCRIPTIONS[currentState.level] || "Status tidak diketahui.";
}

/**
 * Mendapatkan poin relasi saat ini.
 * @returns {number} - Jumlah poin.
 */
function getCurrentPoints() {
    return currentState.points;
}

// Inisialisasi
loadRelationState();

module.exports = {
    loadRelationState,
    addPoints,
    addPointOnMessage, // Ekspor fungsi baru
    checkWeeklyConversation,
    getRelationLevel,
    getRelationLevelDescription,
    getCurrentPoints
};
