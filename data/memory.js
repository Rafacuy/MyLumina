// data/memory.js
// Handles persistence-data memory for the Lumina bot using LokiJS.
// Optimized for performance, memory efficiency, and scalability.

const path = require("path");
const Loki = require("lokijs");

// --- Configuration Constants ---
const DB_PATH =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "data", "Lumina_memory.json")
    : path.join(__dirname, "memory.json");

const MAX_HISTORY_LENGTH = 100;
const FLUSH_THRESHOLD = MAX_HISTORY_LENGTH + 20;
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 1 week
const LTM_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const LTM_CLEANUP_BATCH_SIZE = 50;
const COMPACTION_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
const QUERY_CACHE_TTL = 5000; // 5 seconds
const MAX_CACHE_SIZE = 1000; // Cache size limit

// --- LTM Cleanup Configuration ---
const LTM_CLEANUP_RULES = {
  highPriority: { minPriority: 100, maxAgeDays: 60 },
  mediumPriority: { minPriority: 91, maxPriority: 99, maxAgeDays: 14 },
  lowPriority: { minPriority: 0, maxPriority: 90, maxAgeDays: 3 },
};

// --- Database and Cache Setup ---
let dbInstance = null;
let initializationPromise = null;
let queryCache = new Map(); // Use Map for better performance

// --- Cache Helper Functions ---
const addToCache = (key, data) => {
  if (queryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = queryCache.keys().next().value;
    queryCache.delete(oldestKey);
  }
  queryCache.set(key, { data, timestamp: Date.now() });
};

const getFromCache = (key) => {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.timestamp < QUERY_CACHE_TTL) {
    return cached.data;
  }
  queryCache.delete(key);
  return null;
};

const invalidateCache = (prefix) => {
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) {
      queryCache.delete(key);
    }
  }
};

// --- Database Lazy Initialization ---
const getDbInstance = () => {
  if (!initializationPromise) {
    initializationPromise = new Promise((resolve, reject) => {
      console.log(`Initializing LokiJS database at ${DB_PATH}...`);
      const db = new Loki(DB_PATH, {
        adapter: new Loki.LokiFsAdapter(),
        autoload: true,
        autoloadCallback: () => {
          const history =
            db.getCollection("history") ||
            db.addCollection("history", {
              indices: ["timestamp", "chatId"],
              adaptiveBinaryIndices: true,
            });

          const preferences =
            db.getCollection("preferences") ||
            db.addCollection("preferences", { unique: ["key"] });

          const ltm =
            db.getCollection("ltm") ||
            db.addCollection("ltm", {
              indices: ["createdAt", "priority", "lastAccessed", "chatId", "type"],
            });

          dbInstance = { db, history, preferences, ltm };
          console.log("LokiJS database and collections are ready.");
          resolve(dbInstance);
        },
        autosave: true,
        autosaveInterval: 10000,
        throttledSaves: false,
      });
    }).catch((err) => {
      console.error("Fatal error during LokiJS database initialization:", err);
      process.exit(1);
    });
  }
  return initializationPromise;
};

// --- Core Memory Management Functions ---

/**
 * Load conversation history with caching and user-specific filter.
 * @param {string} chatId - Optional, filter by chatId.
 * @returns {Promise<Array<Object>>}
 */
const load = async (chatId = null) => {
  const { history } = await getDbInstance();
  const cacheKey = chatId ? `history_${chatId}` : "history_all";
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    let query = history.chain().simplesort("timestamp", true);
    if (chatId) query = query.find({ chatId });
    const recentHistory = query.limit(MAX_HISTORY_LENGTH).data();
    const chronologicalHistory = recentHistory.reverse();
    addToCache(cacheKey, chronologicalHistory);
    return chronologicalHistory;
  } catch (error) {
    console.error("Error loading history:", error);
    return [];
  }
};

/**
 * Add a new message to history.
 * @param {object} message - Message object to add.
 */
const addMessage = async (message) => {
  const { history } = await getDbInstance();
  if (!message || typeof message.content !== "string" || message.content.trim() === "") {
    console.warn("Attempted to add invalid message:", message);
    return;
  }

  try {
    const messageToStore = {
      role: message.role || "user",
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      chatId: message.chatId || "",
      context: message.context || {},
    };
    history.insert(messageToStore);
    invalidateCache("history");
  } catch (error) {
    console.error("Error adding message to history:", error);
  }
};

/**
 * Save or update a preference with caching.
 * @param {string} key - Unique preference key.
 * @param {any} value - Value to store.
 */
const savePreference = async (key, value) => {
  const { preferences } = await getDbInstance();
  try {
    const existingPref = preferences.findOne({ key });
    if (existingPref) {
      existingPref.value = value;
      preferences.update(existingPref);
    } else {
      preferences.insert({ key, value });
    }
    invalidateCache(`pref_${key}`);
  } catch (error) {
    console.error(`Error saving preference for key "${key}":`, error);
  }
};

/**
 * Get preference value by key with caching.
 * @param {string} key - Preference key.
 * @returns {Promise<any|undefined>}
 */
const getPreference = async (key) => {
  const cacheKey = `pref_${key}`;
  const cached = getFromCache(cacheKey);
  if (cached !== null) return cached;

  const { preferences } = await getDbInstance();
  try {
    const pref = preferences.findOne({ key });
    const value = pref ? pref.value : undefined;
    addToCache(cacheKey, value);
    return value;
  } catch (error) {
    console.error(`Error getting preference for key "${key}":`, error);
    return undefined;
  }
};

// --- LTM Specific Functions ---

/**
 * Get LTM memories with optional user filter and relevance sorting.
 * @param {string} chatId - Optional, filter by chatId.
 * @returns {Promise<Array<Object>>}
 */
const getLTMMemories = async (chatId = null) => {
  const cacheKey = chatId ? `ltm_${chatId}` : "ltm_all";
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const { ltm } = await getDbInstance();
  try {
    let query = ltm.chain();
    if (chatId) {
        query = query.find({ 'chatId': chatId });
    }
    // Sort by priority (descending), then by creation date (descending)
    const memories = query.simplesort("priority", true).simplesort("createdAt", true).data();
    addToCache(cacheKey, memories);
    return memories;
  } catch (error) {
    console.error("Error getting LTM memories:", error);
    return [];
  }
};

/**
 * Save LTM with validation and lastAccessed tracking.
 * @param {string} key - Unique LTM key.
 * @param {object} ltmData - LTM data (content, priority, etc.).
 */
const saveLTMMemory = async (key, ltmData) => {
  const { ltm } = await getDbInstance();
  if (!key || !ltmData || (typeof ltmData.content !== "string" && typeof ltmData.value !== "string") || !ltmData.priority) {
    console.warn("Invalid LTM data:", { key, ltmData });
    return;
  }

  try {
    const existingLtm = ltm.findOne({ key });
    const dataToStore = {
      ...ltmData,
      key,
      priority: Math.max(0, Math.min(100, ltmData.priority)), // Validate priority
      createdAt: ltmData.createdAt || new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
    };
    if (existingLtm) {
      Object.assign(existingLtm, dataToStore);
      ltm.update(existingLtm);
    } else {
      ltm.insert(dataToStore);
    }
    invalidateCache("ltm");
  } catch (error) {
    console.error(`Error saving LTM for key "${key}":`, error);
  }
};

/**
 * Batch cleanup of old LTMs with configurable rules.
 */
const cleanupOldLTMs = async () => {
  console.log("Auto-cleanup LTM: Starting batch cleanup process...");
  const { ltm } = await getDbInstance();
  const now = new Date();
  let deletedCount = 0;

  try {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const criteria = {
      $or: [
        {
          priority: LTM_CLEANUP_RULES.highPriority.minPriority,
          createdAt: { $lt: new Date(now - LTM_CLEANUP_RULES.highPriority.maxAgeDays * MS_PER_DAY).toISOString() },
        },
        {
          priority: {
            $between: [
              LTM_CLEANUP_RULES.mediumPriority.minPriority,
              LTM_CLEANUP_RULES.mediumPriority.maxPriority,
            ],
          },
          createdAt: { $lt: new Date(now - LTM_CLEANUP_RULES.mediumPriority.maxAgeDays * MS_PER_DAY).toISOString() },
        },
        {
          priority: {
            $between: [
              LTM_CLEANUP_RULES.lowPriority.minPriority,
              LTM_CLEANUP_RULES.lowPriority.maxPriority,
            ],
          },
          createdAt: { $lt: new Date(now - LTM_CLEANUP_RULES.lowPriority.maxAgeDays * MS_PER_DAY).toISOString() },
        },
      ],
    };

    let hasMore = true;
    while (hasMore) {
      const oldDocs = ltm.chain().find(criteria).limit(LTM_CLEANUP_BATCH_SIZE).data();
      if (oldDocs.length > 0) {
        ltm.remove(oldDocs);
        deletedCount += oldDocs.length;
        console.log(`Auto-cleanup LTM: Batch removed ${oldDocs.length} entries.`);
      } else {
        hasMore = false;
      }
    }

    if (deletedCount > 0) {
      console.log(`Auto-cleanup LTM: Finished. Removed ${deletedCount} old LTM entries in total.`);
    } else {
      console.log("Auto-cleanup LTM: No old LTM entries to clean up.");
    }
    invalidateCache("ltm");
  } catch (error) {
    console.error("Auto-cleanup LTM error:", error);
  }
};

/**
 * Periodic database compaction.
 */
const compactDatabase = async () => {
  console.log("Performing periodic database compaction...");
  const { db } = await getDbInstance();
  db.saveDatabase((err) => {
    if (err) {
      console.error("Error during periodic compaction:", err);
    } else {
      console.log("Database compaction successful.");
    }
  });
};

/**
 * Clean up old history messages.
 */
const cleanupOldMessages = async () => {
  const { history } = await getDbInstance();
  try {
    const oneWeekAgo = new Date(Date.now() - CLEANUP_INTERVAL).toISOString();
    const oldDocs = history.find({ timestamp: { $lt: oneWeekAgo } });
    if (oldDocs.length > 0) {
      history.remove(oldDocs);
      console.log(`Auto-cleanup: Removed ${oldDocs.length} old messages from history.`);
      invalidateCache("history");
    }
  } catch (error) {
    console.error("Auto-cleanup error (history):", error);
  }
};

// --- Flush as Scheduled Job ---
const flushHistory = async () => {
  const { history } = await getDbInstance();
  try {
    const currentHistoryCount = history.count();
    if (currentHistoryCount > FLUSH_THRESHOLD) {
      const excessCount = currentHistoryCount - MAX_HISTORY_LENGTH;
      const oldMessages = history
        .chain()
        .simplesort("timestamp")
        .limit(excessCount)
        .data();
      if (oldMessages.length > 0) {
        console.log(`Trimming ${oldMessages.length} old messages from history...`);
        history.remove(oldMessages);
        invalidateCache("history");
      }
    }
    return true;
  } catch (error) {
    console.error("Error during memory flush (trimming):", error);
    return false;
  }
};

// --- Scheduling and Startup ---
(async () => {
  await getDbInstance();
  console.log("Scheduling maintenance jobs...");
  setInterval(cleanupOldMessages, CLEANUP_INTERVAL);
  setInterval(cleanupOldLTMs, LTM_CLEANUP_INTERVAL);
  setInterval(compactDatabase, COMPACTION_INTERVAL);
  setInterval(flushHistory, 30 * 60 * 1000); // Flush every 30 mins
  console.log("Running initial cleanup on startup...");
  cleanupOldMessages();
  cleanupOldLTMs();
  flushHistory();
})();

// --- Module Exports ---
module.exports = {
  load,
  addMessage,
  getPreference,
  savePreference,
  deletePreference: async (key) => {
    const { preferences } = await getDbInstance();
    preferences.findAndRemove({ key });
    invalidateCache(`pref_${key}`);
  },
  getLTMMemories,
  saveLTMMemory,
  /**
   * Deletes a single LTM entry by its unique key.
   * @param {string} key - The unique key of the LTM entry to delete.
   */
  deleteLTMMemory: async (key) => {
    const { ltm } = await getDbInstance();
    try {
      ltm.findAndRemove({ key: key });
      invalidateCache("ltm");
      console.log(`LTM entry with key "${key}" deleted.`);
    } catch (error) {
      console.error(`Error deleting LTM for key "${key}":`, error);
    }
  },
  /**
   * Retrieves all notes for a specific user.
   * @param {string|number} userId - The user's ID.
   * @returns {Promise<Array<Object>>} An array of note objects.
   */
  getNotesForUser: async (userId) => {
    const { ltm } = await getDbInstance();
    try {
      return ltm.chain().find({ 'chatId': userId, 'type': 'note' }).simplesort('createdAt', true).data();
    } catch (error) {
      console.error(`Error getting notes for user ${userId}:`, error);
      return [];
    }
  },
  /**
   * Retrieves all active (non-expired) reminders from memory.
   * @returns {Promise<Array<Object>>} An array of reminder objects.
   */
  getAllActiveReminders: async () => {
    const { ltm } = await getDbInstance();
    try {
      const now = new Date().toISOString();
      return ltm.chain().find({ 'type': 'reminder', 'expiry': { '$gte': now } }).data();
    } catch (error) {
      console.error(`Error getting all active reminders:`, error);
      return [];
    }
  },
  closeDb: async () => {
    if (!dbInstance) return;
    const { db } = await getDbInstance();
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else {
          console.log("LokiJS Database connection closed.");
          resolve();
        }
      });
    });
  },
};
