// data/memory.js
const fs = require("fs").promises;
const path = require("path");
const sqlite3 = require("sqlite3");
const config = require("../config/config");

// --- Configuration Constants ---
// Tentukan path database berdasarkan lingkungan (misal: development vs production)
const DB_PATH =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "data", "Lumina_memory.db") // Path untuk produksi (root project/data/Lumina_memory.db)
    : path.join(__dirname, "memory.db"); // Path untuk development (data/memory.db)

const MAX_HISTORY_LENGTH = 100; // Batas pesan dalam memori aktif
const ARCHIVE_THRESHOLD = 90; // Jumlah pesan sebelum mulai pengarsipan
const ARCHIVE_CHUNK_SIZE = 50; // Jumlah pesan yang diarsipkan setiap kali
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // Interval pembersihan otomatis: 1 minggu
const LTM_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;

// --- Database Initialization ---
const db = new sqlite3.Database(
  DB_PATH,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error("Database connection error:", err.message);
    } else {
      console.log(`Connected to the SQLite database at ${DB_PATH}`);
    }
  }
);

// Inisialisasi tabel jika belum ada
db.serialize(() => {
  db.run(
    `
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      chat_id TEXT,
      context TEXT -- Menyimpan objek JSON stringified
    )
  `,
    (err) => {
      if (err) console.error("Error creating history table:", err.message);
    }
  );

  db.run(
    `
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `,
    (err) => {
      if (err) console.error("Error creating preferences table:", err.message);
    }
  );

  db.run(
    `
    CREATE TABLE IF NOT EXISTS archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME,
      chat_id TEXT,
      context TEXT, -- Menyimpan objek JSON stringified
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
    (err) => {
      if (err) console.error("Error creating archive table:", err.message);
    }
  );
});

// --- Helper Functions (Wrapper untuk Promise) ---
/**
 * Menjalankan query SELECT dan mengembalikan semua baris.
 * @param {string} sql Query SQL.
 * @param {Array<any>} params Parameter untuk query.
 * @returns {Promise<Array<Object>>} Promise yang menyelesaikan dengan hasil query.
 */
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

/**
 * Menjalankan perintah SQL (INSERT, UPDATE, DELETE) dan mengembalikan informasi tentang perubahan.
 * @param {string} sql Perintah SQL.
 * @param {Array<any>} params Parameter untuk perintah.
 * @returns {Promise<Object>} Promise yang menyelesaikan dengan objek `this` dari callback `db.run`.
 */
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// --- Core Memory Management Functions ---

/**
 * Memuat riwayat percakapan terbaru dari database.
 * Mengambil pesan sesuai dengan MAX_HISTORY_LENGTH.
 * @returns {Promise<Array<Object>>} Array objek pesan.
 */
const load = async () => {
  try {
    const history = await query(
      "SELECT id, role, content, timestamp, chat_id, context FROM history ORDER BY timestamp ASC LIMIT ?", // Urutkan ASC untuk mendapatkan yang terbaru dari belakang
      [MAX_HISTORY_LENGTH]
    );
    // Parse konteks kembali dari string JSON
    return history.map((msg) => ({
      ...msg,
      context: msg.context ? JSON.parse(msg.context) : {},
    }));
  } catch (error) {
    console.error("Error loading history:", error);
    return [];
  }
};

/**
 * Menambahkan pesan baru ke riwayat.
 * Melakukan pengarsipan otomatis jika riwayat melebihi batas.
 * @param {object} message Objek pesan yang akan ditambahkan.
 * @param {string} message.role Peran pesan (e.g., 'user', 'assistant').
 * @param {string} message.content Isi pesan.
 * @param {string} [message.timestamp] Stempel waktu pesan (ISO string). Default: CURRENT_TIMESTAMP.
 * @param {string} [message.chatId] ID obrolan. Default: ''.
 * @param {object} [message.context] Objek konteks pesan. Default: {}.
 */
const addMessage = async (message) => {
  if (!message.content) {
    console.warn(
      "Attempted to add invalid message: content is missing.",
      message
    );
    return;
  }

  try {
    // Memastikan context adalah string JSON
    const contextString = JSON.stringify(message.context || {});

    await run(
      "INSERT INTO history (role, content, timestamp, chat_id, context) VALUES (?, ?, ?, ?, ?)",
      [
        message.role || "user",
        message.content,
        message.timestamp || new Date().toISOString(),
        message.chatId || "",
        contextString,
      ]
    );

    await flush();
  } catch (error) {
    console.error("Error adding message to history:", error);
  }
};

/**
 * Mengelola pengarsipan pesan lama dari tabel history ke tabel archive
 * dan mempertahankan MAX_HISTORY_LENGTH di tabel history.
 * @returns {Promise<boolean>} True jika flush berhasil, false jika ada error.
 */
const flush = async () => {
  try {
    const countResult = await query("SELECT COUNT(*) as count FROM history");
    const currentHistoryCount = countResult[0].count;

    if (currentHistoryCount > MAX_HISTORY_LENGTH) {
      const messagesToArchive = await query(
        "SELECT * FROM history ORDER BY timestamp ASC LIMIT ?",
        [currentHistoryCount - MAX_HISTORY_LENGTH] // Arsipkan pesan yang melebihi batas
      );

      if (messagesToArchive.length > 0) {
        console.log(`Archiving ${messagesToArchive.length} old messages...`);
        const insertStmt = db.prepare(
          "INSERT INTO archive (role, content, timestamp, chat_id, context) VALUES (?, ?, ?, ?, ?)"
        );

        for (const msg of messagesToArchive) {
          await insertStmt.run(
            msg.role,
            msg.content,
            msg.timestamp,
            msg.chat_id,
            msg.context
          );
        }

        await insertStmt.finalize();

        const idsToDelete = messagesToArchive.map((msg) => msg.id);
        if (idsToDelete.length > 0) {
          const placeholders = idsToDelete.map(() => "?").join(","); // Menghasilkan: ?,?,?
          await run(
            `DELETE FROM history WHERE id IN (${placeholders})`,
            idsToDelete
          );
        }
        console.log(
          `Successfully archived and removed ${messagesToArchive.length} messages from history.`
        );
      }
    }
    return true;
  } catch (error) {
    console.error("Error during memory flush (archiving/trimming):", error);
    return false;
  }
};

/**
 * Menyimpan atau memperbarui preferensi pengguna.
 * @param {string} key Kunci preferensi.
 * @param {string} value Nilai preferensi.
 * @returns {Promise<void>}
 */
const savePreference = async (key, value) => {
  try {
    const storedValue =
      typeof value === "string" ? value : JSON.stringify(value);
    await run("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)", [
      key,
      storedValue,
    ]);
    console.log(`Preference saved: ${key} =`, value);
  } catch (error) {
    console.error("Error saving preference:", error);
  }
};

/**
 * Mendapatkan nilai preferensi berdasarkan kunci.
 * @param {string} key Kunci preferensi.
 * @returns {Promise<string|undefined>} Nilai preferensi atau undefined jika tidak ditemukan.
 */
const getPreference = async (key) => {
  try {
    const result = await query("SELECT value FROM preferences WHERE key = ?", [
      key,
    ]);
    const rawValue = result[0]?.value;

    if (
      rawValue === undefined ||
      rawValue === null ||
      rawValue === "undefined"
    ) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(rawValue);
      if (typeof parsed === "object" || Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
      // If it's not JSON, return as-is (primitive string)
    }

    return rawValue;
  } catch (error) {
    console.error("Error getting preference:", error);
    return undefined;
  }
};

/**
 * Menghapus preferensi berdasarkan kunci.
 * @param {string} key Kunci preferensi yang akan dihapus.
 * @returns {Promise<void>}
 */
const deletePreference = async (key) => {
  try {
    await run("DELETE FROM preferences WHERE key = ?", [key]);
    console.log(`Preference deleted: ${key}`);
  } catch (error) {
    console.error("Error deleting preference:", error);
  }
};

// --- Auto-cleanup Setup ---
/**
 * Membersihkan pesan lama dari tabel history dan archive secara otomatis.
 * Pesan yang lebih tua dari CLEANUP_INTERVAL akan dihapus.
 */
const cleanupOldMessages = async () => {
  try {
    const oneWeekAgo = new Date(Date.now() - CLEANUP_INTERVAL).toISOString();

    // Bersihkan history lama
    const deletedHistory = await run(
      "DELETE FROM history WHERE timestamp < ?",
      [oneWeekAgo]
    );
    if (deletedHistory.changes > 0) {
      console.log(
        `Auto-cleanup: Removed ${deletedHistory.changes} old messages from history.`
      );
    }

    // Bersihkan archive lama
    const deletedArchive = await run(
      "DELETE FROM archive WHERE archived_at < ?",
      [oneWeekAgo]
    );
    if (deletedArchive.changes > 0) {
      console.log(
        `Auto-cleanup: Removed ${deletedArchive.changes} old messages from archive.`
      );
    }

    if (deletedHistory.changes === 0 && deletedArchive.changes === 0) {
      console.log("Auto-cleanup: No old messages to clean up.");
    }
  } catch (error) {
    console.error("Auto-cleanup error:", error);
  }
};

/**
 * Mengambil semua memori jangka panjang dengan tipe LTM.
 * @returns {Promise<Array<Object>>} Array memori LTM.
 */
const getLTMMemories = async () => {
  try {
    const prefs = await query(
      "SELECT key, value FROM preferences WHERE key LIKE 'ltm_%'"
    );
    const ltmMemories = [];

    for (const row of prefs) {
      try {
        const parsed = JSON.parse(row.value);
        ltmMemories.push({
          key: row.key,
          ...parsed,
        });
      } catch (e) {
        console.error("Error parsing LTM memory:", row.key, row.value);
      }
    }

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
 * Fungsi ini menerapkan aturan penghapusan yang Anda tentukan.
 */
const cleanupOldLTMs = async () => {
  console.log("Auto-cleanup LTM: Starting cleanup process...");
  try {
    const allLtm = await getLTMMemories();
    const now = new Date();
    let deletedCount = 0;

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const FIVE_DAYS = 5;
    const TWO_WEEKS = 14;
    const TWO_MONTHS = 60; // Perkiraan 2 bulan

    for (const mem of allLtm) {
      // Lewati jika format tidak lengkap (untuk data lama)
      if (!mem.createdAt || mem.priority === undefined) {
        continue;
      }

      const creationDate = new Date(mem.createdAt);
      const ageInDays = (now - creationDate) / MS_PER_DAY;

      let shouldDelete = false;

      // Aturan Penghapusan:
      // Jika prioritas 100, hapus setelah 2 bulan
      if (mem.priority === 100 && ageInDays > TWO_MONTHS) {
        shouldDelete = true;
      }
      // Jika prioritas > 90 (dan < 100), hapus setelah 2 minggu
      else if (
        mem.priority > 90 &&
        mem.priority < 100 &&
        ageInDays > TWO_WEEKS
      ) {
        shouldDelete = true;
      }
      // Jika prioritas <= 90, hapus setelah 5 hari
      else if (mem.priority <= 90 && ageInDays > FIVE_DAYS) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        await deletePreference(mem.key);
        console.log(
          `Auto-cleanup LTM: Deleted memory '${mem.value}' (Priority: ${
            mem.priority
          }, Age: ${ageInDays.toFixed(1)} days)`
        );
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(
        `Auto-cleanup LTM: Finished. Removed ${deletedCount} old LTM entries.`
      );
    } else {
      console.log("Auto-cleanup LTM: No old LTM entries to clean up.");
    }
  } catch (error) {
    console.error("Auto-cleanup LTM error:", error);
  }
};

// Jadwalkan cleanup mingguan untuk riwayat chat
setInterval(cleanupOldMessages, CLEANUP_INTERVAL);
// Jalankan segera saat startup
cleanupOldMessages();

// Jadwalkan cleanup untuk LTM
setInterval(cleanupOldLTMs, LTM_CLEANUP_INTERVAL);
// Jalankan cleanup LTM saat startup
cleanupOldLTMs();

// --- Module Exports ---
module.exports = {
  load,
  save: flush, // Alias flush sebagai save untuk konsistensi API
  addMessage,
  getPreference,
  savePreference,
  deletePreference,
  // Helper untuk akses langsung
  /**
   * Mengambil semua riwayat pesan yang saat ini ada di memori aktif (tabel history).
   * @returns {Promise<Array<Object>>} Array objek pesan.
   */
  getInMemoryHistory: async () => {
    const history = await query(
      "SELECT id, role, content, timestamp, chat_id, context FROM history ORDER BY timestamp ASC"
    );
    return history.map((msg) => ({
      ...msg,
      context: msg.context ? JSON.parse(msg.context) : {},
    }));
  },
  /**
   * Mengambil semua preferensi pengguna yang tersimpan di memori jangka panjang (tabel preferences).
   * Mengembalikan objek dengan kunci preferensi dan nilainya.
   * @returns {Promise<Object>} Objek preferensi.
   */
  getLongTermMemory: async () => {
    const prefs = await query("SELECT key, value FROM preferences");
    return prefs.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  },
  getLTMMemories,
  /**
   * Mencari pesan dalam riwayat berdasarkan kata kunci.
   * @param {string} keyword Kata kunci yang akan dicari.
   * @param {number} [limit=5] Batas jumlah hasil.
   * @returns {Promise<Array<Object>>} Array objek pesan yang cocok.
   */
  searchHistory: async (keyword, limit = 5) => {
    const results = await query(
      `SELECT id, role, content, timestamp, chat_id, context FROM history 
       WHERE content LIKE ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [`%${keyword}%`, limit]
    );
    return results.map((msg) => ({
      ...msg,
      context: msg.context ? JSON.parse(msg.context) : {},
    }));
  },
  /**
   * Menutup koneksi database. Berguna saat aplikasi berhenti.
   * @returns {Promise<void>}
   */
  closeDb: async () => {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else {
          console.log("Database connection closed.");
          resolve();
        }
      });
    });
  },
  cleanupOldLTMs,
};
