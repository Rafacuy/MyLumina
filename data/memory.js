// data/memory.js (Refactored to use LokiJS)
const fs = require("fs").promises;
const path = require("path");
const Loki = require("lokijs");
const config = require("../config/config");

// --- Configuration Constants ---
const DB_PATH =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "data", "Lumina_memory.json") // File DB untuk produksi, sekarang formatnya .json
    : path.join(__dirname, "memory.json"); // File DB untuk development

const MAX_HISTORY_LENGTH = 100; // Batas pesan dalam memori aktif
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // Interval pembersihan otomatis: 1 minggu
const LTM_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // Interval pembersihan LTM: 6 jam

// --- LokiJS Database Initialization ---
let db;
let history; // Collection untuk history chat
let preferences; // Collection untuk preferences (key-value)

// Promise yang menandakan database sudah siap digunakan
const initializationPromise = new Promise((resolve, reject) => {
  console.log(`Initializing LokiJS database at ${DB_PATH}...`);
  db = new Loki(DB_PATH, {
    adapter: new Loki.LokiFsAdapter(),
    autoload: true,
    autoloadCallback: () => {
      // Inisialisasi collection jika belum ada
      history = db.getCollection("history");
      if (history === null) {
        history = db.addCollection("history", { indices: ["timestamp"] });
      }

      preferences = db.getCollection("preferences");
      if (preferences === null) {
        preferences = db.addCollection("preferences", { unique: ["key"] });
      }
      
      console.log("LokiJS database and collections are ready.");
      resolve();
    },
    autosave: true,
    autosaveInterval: 4000, // Simpan otomatis setiap 4 detik
    throttledSaves: true,
  });
}).catch(err => {
    console.error("Fatal error during LokiJS database initialization:", err);
    // Jika DB gagal load, proses tidak bisa lanjut
    process.exit(1); 
});

// --- Core Memory Management Functions ---

/**
 * Memuat riwayat percakapan terbaru dari database.
 * Mengambil pesan sesuai dengan MAX_HISTORY_LENGTH.
 * @returns {Promise<Array<Object>>} Array objek pesan.
 */
const load = async () => {
  await initializationPromise; // Pastikan DB sudah siap
  try {
    // Ambil pesan terbaru sejumlah MAX_HISTORY_LENGTH, urutkan dari yang terlama ke terbaru
    const recentHistory = history
      .chain()
      .simplesort("timestamp", true) // Sort descending (terbaru dulu)
      .limit(MAX_HISTORY_LENGTH)
      .data();
    
    // Kembalikan urutan menjadi ascending (sesuai urutan chat)
    return recentHistory.reverse();
  } catch (error) {
    console.error("Error loading history:", error);
    return [];
  }
};

/**
 * Menambahkan pesan baru ke riwayat.
 * Melakukan pembersihan (flush) otomatis jika riwayat melebihi batas.
 * @param {object} message Objek pesan yang akan ditambahkan.
 */
const addMessage = async (message) => {
  await initializationPromise; // Pastikan DB sudah siap
  if (!message || typeof message.content !== 'string' || message.content.trim() === '') {
    console.warn("Attempted to add invalid message: content is missing or empty.", message);
    return;
  }

  try {
    // Menyiapkan object message dengan nilai default untuk mencegah undefined
    const messageToStore = {
      role: message.role || "user",
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      chatId: message.chatId || "",
      context: message.context || {}, // LokiJS bisa simpan object secara native
    };

    history.insert(messageToStore);
    
    // Langsung panggil flush setelah menambah pesan
    await flush(); 
  } catch (error) {
    console.error("Error adding message to history:", error);
  }
};

/**
 * Mengelola ukuran history agar tidak melebihi MAX_HISTORY_LENGTH.
 * Pesan paling lama akan dihapus. Logika arsip disederhanakan karena LokiJS menyimpan semua di satu file.
 * @returns {Promise<boolean>} True jika flush berhasil.
 */
const flush = async () => {
  await initializationPromise;
  try {
    const currentHistoryCount = history.count();

    if (currentHistoryCount > MAX_HISTORY_LENGTH) {
      const messagesToRemoveCount = currentHistoryCount - MAX_HISTORY_LENGTH;
      
      // Ambil dokumen paling lama untuk dihapus
      const oldMessages = history
        .chain()
        .simplesort("timestamp") // Sort ascending (paling lama dulu)
        .limit(messagesToRemoveCount)
        .data();

      if (oldMessages.length > 0) {
        console.log(`Trimming ${oldMessages.length} old messages from history...`);
        history.remove(oldMessages);
      }
    }
    return true;
  } catch (error) {
    console.error("Error during memory flush (trimming):", error);
    return false;
  }
};

/**
 * Menyimpan atau memperbarui preferensi.
 * @param {string} key Kunci preferensi.
 * @param {any} value Nilai preferensi (bisa string, object, array, dll).
 */
const savePreference = async (key, value) => {
  await initializationPromise;
  try {
    // Pola "upsert": update jika ada, insert jika tidak ada.
    const existingPref = preferences.findOne({ key: key });
    if (existingPref) {
      existingPref.value = value;
      preferences.update(existingPref);
    } else {
      preferences.insert({ key: key, value: value });
    }
    // console.log(`Preference saved: ${key} =`, value); // Bisa di-uncomment untuk debugging
  } catch (error) {
    console.error("Error saving preference:", error);
  }
};

/**
 * Mendapatkan nilai preferensi berdasarkan kunci.
 * @param {string} key Kunci preferensi.
 * @returns {Promise<any|undefined>} Nilai preferensi atau undefined jika tidak ditemukan.
 */
const getPreference = async (key) => {
  await initializationPromise;
  try {
    const pref = preferences.findOne({ key: key });
    // Jika pref ditemukan, kembalikan nilainya, jika tidak, undefined.
    return pref ? pref.value : undefined;
  } catch (error) {
    console.error("Error getting preference:", error);
    return undefined;
  }
};

/**
 * Menghapus preferensi berdasarkan kunci.
 * @param {string} key Kunci preferensi yang akan dihapus.
 */
const deletePreference = async (key) => {
  await initializationPromise;
  try {
    preferences.findAndRemove({ key: key });
    console.log(`Preference deleted: ${key}`);
  } catch (error) {
    console.error("Error deleting preference:", error);
  }
};

// --- Auto-cleanup Functions ---

/**
 * Membersihkan pesan yang sangat lama dari tabel history.
 */
const cleanupOldMessages = async () => {
  await initializationPromise;
  try {
    const oneWeekAgo = new Date(Date.now() - CLEANUP_INTERVAL).toISOString();
    
    // Cari dan hapus pesan di history yang lebih lama dari satu minggu
    const oldDocs = history.find({ 'timestamp': { '$lt': oneWeekAgo } });
    const count = oldDocs.length;

    if (count > 0) {
      history.remove(oldDocs);
      console.log(`Auto-cleanup: Removed ${count} old messages from history.`);
    } else {
      console.log("Auto-cleanup: No old messages to clean up.");
    }
  } catch (error) {
    console.error("Auto-cleanup error:", error);
  }
};

/**
 * Mengambil semua memori jangka panjang dengan prefix 'ltm_'.
 * @returns {Promise<Array<Object>>} Array memori LTM.
 */
const getLTMMemories = async () => {
  await initializationPromise;
  try {
    const ltmPrefs = preferences.find({ 'key': { '$regex': /^ltm_/ } });
    
    const ltmMemories = ltmPrefs.map(pref => ({
      key: pref.key,
      // Pastikan value adalah object, jika tidak, return object kosong
      ...(typeof pref.value === 'object' && pref.value !== null ? pref.value : {})
    }));

    // Urutkan memori: prioritas tertinggi di atas
    ltmMemories.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return ltmMemories;
  } catch (error) {
    console.error("Error getting LTM memories:", error);
    return [];
  }
};

/**
 * Membersihkan LTM lama berdasarkan prioritas dan waktu pembuatan.
 */
const cleanupOldLTMs = async () => {
    // Fungsi ini tidak perlu banyak diubah karena logikanya bekerja pada data
    // yang diambil dari getLTMMemories. Kita hanya memastikan getLTMMemories dan deletePreference
    // bekerja dengan benar menggunakan LokiJS.
    console.log("Auto-cleanup LTM: Starting cleanup process...");
    try {
        const allLtm = await getLTMMemories();
        const now = new Date();
        let deletedCount = 0;

        const MS_PER_DAY = 1000 * 60 * 60 * 24;
        const FIVE_DAYS = 5;
        const TWO_WEEKS = 14;
        const TWO_MONTHS = 60;

        for (const mem of allLtm) {
            if (!mem.createdAt || typeof mem.priority === 'undefined') {
                continue;
            }

            const creationDate = new Date(mem.createdAt);
            const ageInDays = (now - creationDate) / MS_PER_DAY;

            let shouldDelete = false;
            if (mem.priority === 100 && ageInDays > TWO_MONTHS) shouldDelete = true;
            else if (mem.priority > 90 && mem.priority < 100 && ageInDays > TWO_WEEKS) shouldDelete = true;
            else if (mem.priority <= 90 && ageInDays > FIVE_DAYS) shouldDelete = true;

            if (shouldDelete) {
                await deletePreference(mem.key);
                console.log(`Auto-cleanup LTM: Deleted memory '${mem.value}' (Priority: ${mem.priority}, Age: ${ageInDays.toFixed(1)} days)`);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            console.log(`Auto-cleanup LTM: Finished. Removed ${deletedCount} old LTM entries.`);
        } else {
            console.log("Auto-cleanup LTM: No old LTM entries to clean up.");
        }
    } catch (error) {
        console.error("Auto-cleanup LTM error:", error);
    }
};

// --- Scheduling and Startup ---
(async () => {
    await initializationPromise; // Tunggu DB siap sebelum menjadwalkan
    console.log("Scheduling cleanup jobs...");
    setInterval(cleanupOldMessages, CLEANUP_INTERVAL);
    setInterval(cleanupOldLTMs, LTM_CLEANUP_INTERVAL);
    
    // Jalankan pembersihan pertama kali saat startup
    cleanupOldMessages();
    cleanupOldLTMs();
})();


// --- Module Exports (Public API) ---
// API dijaga tetap sama agar tidak ada breaking changes di core.js
module.exports = {
  // Functions
  load,
  save: flush, // Alias flush sebagai save untuk konsistensi API
  addMessage,
  getPreference,
  savePreference,
  deletePreference,
  getLTMMemories,
  cleanupOldLTMs,

  // Helper/Diagnostic functions
  getInMemoryHistory: async () => {
    await initializationPromise;
    return history.chain().simplesort("timestamp").data();
  },
  
  getLongTermMemory: async () => {
    await initializationPromise;
    const prefs = preferences.find();
    return prefs.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  },
  
  searchHistory: async (keyword, limit = 5) => {
    await initializationPromise;
    return history.chain()
      .find({ 'content': { '$contains': keyword } })
      .simplesort("timestamp", true) // Terbaru dulu
      .limit(limit)
      .data();
  },

  // Lifecycle function
  closeDb: async () => {
    await initializationPromise;
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log("LokiJS Database connection closed.");
          resolve();
        }
      });
    });
  },
};
