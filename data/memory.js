// data/memory.js
// Memory.js Update (Optimized)
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia)
// TIME FORMAT: Asia/jakarta
// MIT License

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const config = require('../config/config');

// --- Configuration Constants ---
const MEMORY_FILE = path.join(__dirname, 'memory.ndjson.gz'); // File memori aktif utama, sekarang NDJSON dan gzipped
const LONG_TERM_MEMORY_FILE = path.join(__dirname, 'longTermMemory.json'); // File untuk memori jangka panjang
const BACKUP_DIR = path.join(__dirname, 'backups'); // Direktori untuk backup sementara MEMORY_FILE
const ARCHIVE_DIR = path.join(__dirname, 'archives'); // Direktori baru untuk obrolan lama yang diarsipkan
const MAX_HISTORY_LENGTH = 100; // Jumlah maksimum pesan yang disimpan dalam riwayat in-memory aktif (ring buffer)
const ARCHIVE_THRESHOLD = 90; // Ketika riwayat in-memory mencapai panjang ini, pesan terlama diarsipkan
const ARCHIVE_CHUNK_SIZE = 50; // Jumlah pesan yang dipindahkan ke arsip ketika ambang batas terpenuhi
const BACKUP_RETENTION = 3; // Jumlah backup 'memory.ndjson.gz' terbaru yang akan disimpan
const TARGET_USER_NAME = config.USER_NAME; // Nama pengguna untuk logika penyimpanan obrolan spesifik

// --- Global State Variables ---
let inMemoryHistory = []; // Antrean berukuran tetap (ring buffer) untuk riwayat percakapan aktif
let longTermMemory = {}; // Objek untuk memori jangka panjang
let saveQueue = Promise.resolve(); // Rantai promise untuk memastikan operasi tulis berurutan
let isDirty = false; // Flag untuk menunjukkan apakah inMemoryHistory memiliki perubahan yang belum disimpan
let isLongTermMemoryDirty = false; // Flag untuk menunjukkan apakah longTermMemory memiliki perubahan yang belum disimpan

// --- Helper Functions ---

/**
 * Memvalidasi apakah objek adalah entri riwayat yang valid (minimal memiliki properti 'content').
 * @param {object} entry Objek yang akan divalidasi.
 * @returns {boolean} True jika valid, false jika tidak.
 */
const validateHistoryEntry = (entry) => {
    return typeof entry === 'object' && entry !== null && 'content' in entry;
};

/**
 * Menulis array pesan ke file dalam format NDJSON dan mengompresnya dengan Gzip.
 * Setiap objek pesan di-stringifikasi ke satu baris, dipisahkan oleh baris baru.
 * @param {string} filePath Jalur lengkap ke file yang akan ditulis.
 * @param {Array<object>} messages Array objek pesan.
 * @returns {Promise<void>} Promise yang akan diselesaikan ketika file selesai ditulis.
 */
const writeNdjsonGz = async (filePath, messages) => {
    const ndjsonContent = messages.map(msg => JSON.stringify(msg)).join('\n');
    const compressed = zlib.gzipSync(ndjsonContent);
    await fs.writeFile(filePath, compressed);
};

/**
 * Membaca pesan dari file NDJSON yang di-Gzip, menguraikannya, dan mem-parse setiap baris.
 * @param {string} filePath Jalur lengkap ke file yang akan dibaca.
 * @returns {Promise<Array<object>>} Promise yang akan diselesaikan ke array objek pesan yang di-parse.
 */
const readNdjsonGz = async (filePath) => {
    try {
        const compressedData = await fs.readFile(filePath);
        const data = zlib.gunzipSync(compressedData).toString('utf8');
        // Filter baris kosong yang mungkin dihasilkan dari trailing newlines
        return data.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
    } catch (error) {
        // Jika file tidak ada, kembalikan array kosong daripada melempar error
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error; // Lempar ulang error lainnya
    }
};

/**
 * Membaca data memori jangka panjang dari file JSON.
 * @param {string} filePath Jalur lengkap ke file JSON.
 * @returns {Promise<object>} Promise yang akan diselesaikan ke objek data memori jangka panjang.
 */
const readJson = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {}; // Jika file tidak ada, kembalikan objek kosong
        }
        console.error('Error reading JSON file:', error);
        return {}; // Kembalikan objek kosong jika ada error lain
    }
};

/**
 * Menulis data memori jangka panjang ke file JSON.
 * @param {string} filePath Jalur lengkap ke file JSON.
 * @param {object} data Objek data yang akan ditulis.
 * @returns {Promise<void>} Promise yang akan diselesaikan ketika file selesai ditulis.
 */
const writeJson = async (filePath, data) => {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

/**
 * Merotasi backup di BACKUP_DIR, hanya menyimpan file `BACKUP_RETENTION` terbaru.
 * @returns {Promise<void>} Promise yang akan diselesaikan ketika backup lama dihapus.
 */
const rotateBackups = async () => {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        const backups = files
            .filter(f => f.startsWith('memory_backup_') && f.endsWith('.ndjson.gz'))
            .sort() // Urutkan secara alfabetis (yang berfungsi untuk timestamp ISO)
            .reverse(); // Dapatkan yang terbaru terlebih dahulu

        const toDelete = backups.slice(BACKUP_RETENTION); // Identifikasi backup yang akan dihapus

        for (const file of toDelete) {
            await fs.unlink(path.join(BACKUP_DIR, file));
            // console.log(`Deleted old backup: ${file}`); // Uncomment untuk logging verbose
        }
    } catch (error) {
        console.error('Error rotating backups:', error);
    }
};

// --- Core Memory Management Functions ---

/**
 * Memuat riwayat percakapan aktif dari MEMORY_FILE dan memori jangka panjang dari LONG_TERM_MEMORY_FILE.
 * Jika file tidak ditemukan atau rusak, ia mencoba memuat dari backup (untuk history) atau memulai dengan kosong (untuk long-term memory).
 * Menginisialisasi array inMemoryHistory dan objek longTermMemory.
 * @returns {Promise<Array<object>>} Promise yang akan diselesaikan ke riwayat yang dimuat.
 */
const load = async () => {
    return saveQueue.then(async () => {
        try {
            // Pastikan direktori yang diperlukan ada sebelum mencoba membaca/menulis
            await fs.mkdir(ARCHIVE_DIR, { recursive: true });
            await fs.mkdir(BACKUP_DIR, { recursive: true });

            // Coba muat file memori aktif utama
            const loadedMessages = await readNdjsonGz(MEMORY_FILE);
            // Saring entri yang tidak valid dan pastikan tidak melebihi panjang maksimum
            inMemoryHistory = loadedMessages.filter(validateHistoryEntry).slice(-MAX_HISTORY_LENGTH);
            console.log(`Memuat ${inMemoryHistory.length} pesan ke memori aktif dari ${MEMORY_FILE}.`);
            isDirty = false; // Riwayat sekarang sinkron dengan disk

             // Muat memori jangka panjang
             longTermMemory = await readJson(LONG_TERM_MEMORY_FILE);
             console.log(`Memuat memori jangka panjang dari ${LONG_TERM_MEMORY_FILE}.`);
             isLongTermMemoryDirty = false; 

            return inMemoryHistory;
        } catch (error) {
            console.error(`Error loading memory files:`, error);
            // Jika file utama gagal, coba muat dari backup (hanya untuk riwayat obrolan)
            try {
                const backupFiles = (await fs.readdir(BACKUP_DIR))
                    .filter(f => f.startsWith('memory_backup_') && f.endsWith('.ndjson.gz'))
                    .sort()
                    .reverse();

                if (backupFiles.length > 0) {
                    const backupPath = path.join(BACKUP_DIR, backupFiles[0]);
                    console.log(`Mencoba memuat dari backup: ${backupPath}`);
                    const backupMessages = await readNdjsonGz(backupPath);
                    inMemoryHistory = backupMessages.filter(validateHistoryEntry).slice(-MAX_HISTORY_LENGTH);
                    console.log(`Berhasil memuat ${inMemoryHistory.length} pesan dari backup.`);
                    isDirty = true; 
                    isLongTermMemoryDirty = true;
                }
            } catch (backupError) {
                console.error('Error loading from backup:', backupError);
            }
            // Jika semua upaya pemuatan gagal, mulai dengan riwayat kosong dan memori jangka panjang kosong
            console.warn('Tidak dapat memuat memori atau backup. Memulai dengan riwayat dan memori jangka panjang kosong.');
            inMemoryHistory = [];
            longTermMemory = {};
            isDirty = true; // Tandai kotor untuk memastikan file kosong disimpan
            isLongTermMemoryDirty = true;
            return [];
        }
    });
};

/**
 * Membersihkan riwayat in-memory ke disk. Fungsi ini menangani:
 * 1. Mengarsipkan pesan yang lebih lama jika ukuran riwayat melebihi ambang batas.
 * 2. Membuat backup memori aktif saat ini.
 * 3. Menulis memori aktif saat ini ke MEMORY_FILE utama.
 * 4. Merotasi backup lama.
 * 5. Menyimpan memori jangka panjang jika ada perubahan.
 * Fungsi ini dirancang untuk dipanggil secara berkala (misalnya, melalui setInterval).
 * @returns {Promise<boolean>} Promise yang akan diselesaikan ke true jika pembersihan berhasil, false jika tidak.
 */
const flush = async () => {
    if (!isDirty && !isLongTermMemoryDirty) {
        return true; // Menunjukkan keberhasilan karena tidak ada yang perlu disimpan
    }

    // Gunakan saveQueue untuk memastikan hanya satu operasi flush yang berjalan pada satu waktu
    saveQueue = saveQueue.then(async () => {
        try {
            //  Tangani Pengarsipan
            if (inMemoryHistory.length >= ARCHIVE_THRESHOLD) {
                const messagesToArchive = inMemoryHistory.slice(0, ARCHIVE_CHUNK_SIZE);
                inMemoryHistory = inMemoryHistory.slice(ARCHIVE_CHUNK_SIZE); // Hapus pesan yang diarsipkan dari memori aktif

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const archiveFile = path.join(ARCHIVE_DIR, `archive_${timestamp}.ndjson.gz`);
                await writeNdjsonGz(archiveFile, messagesToArchive);
                console.log(`Mengarsipkan ${messagesToArchive.length} pesan ke ${archiveFile}`);
            }

            //  Buat backup dari memori aktif saat ini sebelum menulis ke file utama
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `memory_backup_${timestamp}.ndjson.gz`);
            await writeNdjsonGz(backupFile, inMemoryHistory);

            // Tulis memori aktif saat ini ke file utama
            await writeNdjsonGz(MEMORY_FILE, inMemoryHistory);
            console.log(`Menyimpan memori aktif ke ${MEMORY_FILE}. Ukuran saat ini: ${inMemoryHistory.length}`);

            //  Rotasi backup untuk mengelola ruang disk
            await rotateBackups();

            // Simpan memori jangka panjang jika ada perubahan
            if (isLongTermMemoryDirty) {
                await writeJson(LONG_TERM_MEMORY_FILE, longTermMemory);
                console.log(`Memori jangka panjang disimpan ke ${LONG_TERM_MEMORY_FILE}.`);
                isLongTermMemoryDirty = false;
            }

            isDirty = false; // Reset flag kotor setelah berhasil menyimpan
            return true;
        } catch (error) {
            console.error('Error during memory flush:', error);
            return false;
        }
    });
    return saveQueue; // Kembalikan promise agar operasi lain dapat berantai setelah flush selesai
};

/**
 * Menambahkan pesan baru ke riwayat in-memory (ring buffer).
 * Jika riwayat melebihi MAX_HISTORY_LENGTH, pesan terlama dihapus.
 * Fungsi ini hanya memodifikasi status in-memory dan mengatur flag `isDirty`.
 * Penyimpanan aktual ke disk terjadi melalui fungsi `flush`.
 * @param {object} message Objek pesan yang akan ditambahkan.
 * @returns {Array<object>} Riwayat in-memory yang diperbarui.
 */
const addMessage = async (message) => {
    if (!validateHistoryEntry(message)) {
        console.warn('Mencoba menambahkan pesan tidak valid ke riwayat:', message);
        return inMemoryHistory; // Kembalikan riwayat saat ini tanpa modifikasi
    }
    inMemoryHistory.push(message);
    if (inMemoryHistory.length > MAX_HISTORY_LENGTH) {
        inMemoryHistory.shift(); // Hapus pesan terlama untuk mempertahankan ukuran tetap
    }
    isDirty = true; // Tandai memori memiliki perubahan yang belum disimpan
    return inMemoryHistory;
};

/**
 * Mengambil pesan obrolan terakhir yang dikirim oleh pengguna tertentu dari riwayat in-memory.
 * @param {string} userName Nama pengguna yang akan dicari.
 * @returns {object|null} Objek pesan terakhir dari pengguna yang ditentukan, atau null jika tidak ditemukan.
 */
const getLastChatBy = async (userName) => {
    // Iterasi mundur untuk menemukan pesan terbaru dengan cepat
    for (let i = inMemoryHistory.length - 1; i >= 0; i--) {
        if (inMemoryHistory[i].from && inMemoryHistory[i].from.first_name === userName) {
            return inMemoryHistory[i];
        }
    }
    return null; // Tidak ada pesan yang ditemukan dari pengguna yang ditentukan
};

/**
 * Menyimpan pesan obrolan terakhir jika itu dari TARGET_USER_NAME.
 * Fungsi ini memastikan bahwa hanya pesan terbaru dari pengguna target yang disimpan dalam riwayat.
 * Ini memanfaatkan `addMessage` untuk penambahan aktual dan manajemen ukuran.
 * @param {object} messageObject Objek pesan yang masuk.
 * @returns {Promise<void>} Promise yang akan diselesaikan ketika operasi selesai.
 */
const saveLastChat = async (messageObject) => { // messageObject adalah objek lengkap dari core.js
    try {
        // Jika messageObject.from.first_name adalah TARGET_USER_NAME
        if (messageObject?.from?.first_name === TARGET_USER_NAME) {
            // Hapus pesan sebelumnya dari TARGET_USER_NAME jika ada
            const existingIndex = inMemoryHistory.findIndex(msg =>
                msg.from && msg.from.first_name === TARGET_USER_NAME && msg.from.id === messageObject.from.id
            );
            if (existingIndex !== -1) {
                inMemoryHistory.splice(existingIndex, 1);
            }
            // Tambahkan messageObject baru yang sudah berisi konteks
            await addMessage(messageObject); // Gunakan addMessage internal untuk konsistensi
        }
    
    } catch (error) {
        console.error('Error saving last chat in memory.js:', error);
    }
};

/**
 * Mencari riwayat in-memory untuk pesan yang berisi kata kunci tertentu.
 * @param {string} keyword Kata kunci yang akan dicari (tidak peka huruf besar/kecil).
 * @param {number} limit Jumlah maksimum hasil yang akan dikembalikan.
 * @returns {Promise<Array<object>>} Promise yang akan diselesaikan ke array objek pesan yang cocok.
 */
const searchHistory = async (keyword, limit = 5) => {
    const results = [];
    for (let i = inMemoryHistory.length - 1; i >= 0 && results.length < limit; i--) {
        if (inMemoryHistory[i].content && inMemoryHistory[i].content.toLowerCase().includes(keyword.toLowerCase())) {
            results.unshift(inMemoryHistory[i]); 
        }
    }

    return results;
};

/**
 * Menyimpan preferensi pengguna ke memori jangka panjang.
 * @param {string} key Kunci preferensi.
 * @param {string} value Nilai preferensi.
 */
const savePreference = (key, value) => {
    longTermMemory[key] = value;
    isLongTermMemoryDirty = true;
    console.log(`Preferensi '${key}' disimpan: ${value}`);
};

/**
 * Mengambil preferensi pengguna dari memori jangka panjang.
 * @param {string} key Kunci preferensi.
 * @returns {string|undefined} Nilai preferensi, atau undefined jika tidak ditemukan.
 */
const getPreference = (key) => {
    return longTermMemory[key];
};

/**
 * Menghapus preferensi pengguna dari memori jangka panjang.
 * @param {string} key Kunci preferensi yang akan dihapus.
 * @returns {boolean} True jika preferensi berhasil dihapus, false jika tidak ditemukan.
 */
const deletePreference = (key) => {
    if (longTermMemory.hasOwnProperty(key)) {
        delete longTermMemory[key];
        isLongTermMemoryDirty = true;
        console.log(`Preferensi '${key}' dihapus.`);
        return true;
    }
    console.warn(`Preferensi '${key}' tidak ditemukan untuk dihapus.`);
    return false;
};

// --- Module Exports ---
module.exports = {
    load,
    save: flush, 
    addMessage,
    searchHistory,
    getLastChatBy,
    saveLastChat,
    savePreference, 
    getPreference,  
    deletePreference, 
    // Helper untuk mendapatkan riwayat in-memory saat ini untuk modul lain
    getInMemoryHistory: () => inMemoryHistory,
    // Helper untuk mendapatkan memori jangka panjang
    getLongTermMemory: () => longTermMemory
};

// --- Initialization and Timed Flush Setup ---

// Muat riwayat ketika modul pertama kali diperlukan
load().then(() => {
    console.log('Modul memori diinisialisasi dan riwayat dimuat dengan sukses.');
}).catch(err => {
    console.error('Gagal menginisialisasi modul memori saat startup:', err);
});

// Atur pembersihan berkala untuk menyimpan perubahan ke disk setiap 30 detik
setInterval(() => {
    module.exports.save(); // Panggil fungsi flush
}, 30 * 1000); // Interval 30 detik
