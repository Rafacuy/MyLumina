// modules/relationState.js
// AUTHOR: Arash 
// DESCRIPTION: Mengelola status relasi, poin, dan level antara Alya dan Pengguna.

const fs = require('fs').promises;
const path = require('path');
const memory = require('../data/memory'); // Impor memory untuk mengakses riwayat chat
const config = require('../config/config'); // Impor config untuk mendapatkan USER_NAME
const { getJakartaMoment } = require('../utils/timeHelper')

// --- Konfigurasi Status Relasi ---
const RELATION_STATE_FILE = path.join(__dirname, '..', 'data', 'relationState.json'); // Lokasi file penyimpanan
const WEEKLY_CONVERSATION_THRESHOLD = 30; // Target percakapan per minggu
const WEEKLY_POINTS_BONUS = 30; // Poin bonus jika target tercapai

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
    1: "Hanya sebatas teman dengan respon cuek. (Level 1)",
    2: "Respon sekarang rada nggak cuek dan juga mulai menunjukkan kepedulian. (Level 2)",
    3: "Alya jadi sabar dan peduli ke tuan. (Level 3)",
    4: "Alya jadi lebih sayang dan cinta ke Tuan. (Level 4)",
    5: "Alya jadi makin sayang dan sangat peduli ke Tuan. (Level 5)"
};

// --- State Internal ---
let currentState = {
    points: 0,
    level: 1,
    lastWeeklyCheckTimestamp: getJakartaMoment
};

/**
 * Memuat status relasi dari file JSON.
 * Jika file tidak ada, file baru akan dibuat dengan nilai default.
 */
async function loadRelationState() {
    try {
        const data = await fs.readFile(RELATION_STATE_FILE, 'utf8');
        currentState = JSON.parse(data);
        console.log('✅ Status relasi berhasil dimuat.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('File status relasi tidak ditemukan. Membuat file baru...');
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
        console.log(`🎉 LEVEL UP! Alya sekarang berada di Level ${newLevel}: ${LEVEL_DESCRIPTIONS[newLevel]}`);
        return true;
    }
    return false;
}

/**
 * Menambah atau mengurangi poin dan memperbarui level.
 * @param {number} pointsToAdd - Jumlah poin yang akan ditambahkan (bisa negatif).
 */
async function addPoints(pointsToAdd) {
    currentState.points += pointsToAdd;
    console.log(`✨ Poin relasi diubah sebesar ${pointsToAdd}. Total poin sekarang: ${currentState.points}`);
    updateLevel();
    await saveRelationState();
}

/**
 * Memeriksa jumlah percakapan dalam seminggu terakhir.
 * Jika lebih dari threshold, tambahkan poin bonus.
 * Fungsi ini harus dipanggil secara berkala (misalnya, setiap beberapa jam) dari core.js.
 */
async function checkWeeklyConversation() {
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    const now = getJakartaMoment;

    // Cek apakah sudah lebih dari seminggu sejak pengecekan terakhir
    if (now - currentState.lastWeeklyCheckTimestamp > oneWeekInMs) {
        console.log('⏳ Melakukan pengecekan percakapan mingguan...');
        const history = memory.getInMemoryHistory();
        const lastWeekDate = new Date(currentState.lastWeeklyCheckTimestamp);

        // Filter pesan dari user target dalam seminggu terakhir
        const userMessagesLastWeek = history.filter(msg =>
            msg.role === 'user' &&
            msg.from &&
            msg.from.first_name === config.USER_NAME &&
            new Date(msg.timestamp) > lastWeekDate
        );

        console.log(`Total percakapan dari ${config.USER_NAME} dalam seminggu terakhir: ${userMessagesLastWeek.length}`);

        if (userMessagesLastWeek.length > WEEKLY_CONVERSATION_THRESHOLD) {
            console.log(`🏆 Target percakapan mingguan terlampaui! Memberikan ${WEEKLY_POINTS_BONUS} poin.`);
            await addPoints(WEEKLY_POINTS_BONUS);
        }

        // Reset timestamp pengecekan ke waktu sekarang
        currentState.lastWeeklyCheckTimestamp = now;
        await saveRelationState();
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

// Inisialisasi: Muat status relasi saat modul pertama kali dijalankan.
loadRelationState();

module.exports = {
    loadRelationState,
    addPoints,
    checkWeeklyConversation,
    getRelationLevel,
    getRelationLevelDescription,
    getCurrentPoints
};
