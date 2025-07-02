// data/memory.js
// Handles persistence-data memory for the Lumina bot using LokiJS.
// This module manages chat history, user preferences, and long-term memory (LTM),
// including automatic data cleanup routines.


const path = require("path");
const Loki = require("lokijs"); // LokiJS is used for in-file database management.

// --- Configuration Constants ---

/**
 * @const {string} DB_PATH
 * @description The file path for the LokiJS database. It changes based on the environment.
 */
const DB_PATH =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "data", "Lumina_memory.json") // Production DB path
    : path.join(__dirname, "memory.json"); // Development DB path

/**
 * @const {number} MAX_HISTORY_LENGTH
 * @description The maximum number of recent messages to keep in active memory.
 */
const MAX_HISTORY_LENGTH = 100;

/**
 * @const {number} CLEANUP_INTERVAL
 * @description The interval for cleaning up old chat history messages (1 week).
 */
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000;

/**
 * @const {number} LTM_CLEANUP_INTERVAL
 * @description The interval for cleaning up old Long-Term Memories (6 hours).
 */
const LTM_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;

// --- Database Initialization ---

let db; // The main LokiJS database instance.
let history; // LokiJS collection for storing chat history.
let preferences; // LokiJS collection for storing key-value preferences and LTM.

/**
 * @type {Promise<void>}
 * @description A promise that resolves when the database has been successfully initialized and is ready for operations.
 * It handles the creation of the database file and its collections if they don't exist.
 */
const initializationPromise = new Promise((resolve, reject) => {
  console.log(`Initializing LokiJS database at ${DB_PATH}...`);
  db = new Loki(DB_PATH, {
    adapter: new Loki.LokiFsAdapter(),
    autoload: true,
    autoloadCallback: () => {
      // Initialize the 'history' collection if it doesn't exist.
      history = db.getCollection("history");
      if (history === null) {
        history = db.addCollection("history", { indices: ["timestamp"] });
      }

      // Initialize the 'preferences' collection if it doesn't exist.
      preferences = db.getCollection("preferences");
      if (preferences === null) {
        preferences = db.addCollection("preferences", { unique: ["key"] });
      }

      console.log("LokiJS database and collections are ready.");
      resolve();
    },
    autosave: true,
    autosaveInterval: 4000, // Autosave every 4 seconds to persist data.
    throttledSaves: true,
  });
}).catch((err) => {
  console.error("Fatal error during LokiJS database initialization:", err);
  // The application cannot run without the database, so exit on failure.
  process.exit(1);
});

// --- Core Memory Management Functions ---

/**
 * Loads the most recent conversation history from the database.
 * The number of messages is limited by MAX_HISTORY_LENGTH.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of message objects, sorted chronologically.
 */
const load = async () => {
  await initializationPromise; // Ensure the DB is ready before proceeding.
  try {
    // Chain commands to sort by timestamp descending, limit results, and get the data.
    const recentHistory = history
      .chain()
      .simplesort("timestamp", true) // Sort newest first to get the latest messages.
      .limit(MAX_HISTORY_LENGTH)
      .data();

    // Reverse the array to restore chronological order (oldest to newest).
    return recentHistory.reverse();
  } catch (error) {
    console.error("Error loading history:", error);
    return []; // Return an empty array on error.
  }
};

/**
 * Adds a new message to the history collection and trims the history if it exceeds the limit.
 * @param {object} message - The message object to add. Must contain a 'content' property.
 * @property {string} message.role - The role of the sender (e.g., 'user', 'assistant').
 * @property {string} message.content - The text content of the message.
 * @property {string} [message.timestamp] - ISO string timestamp. Defaults to now.
 * @property {string} [message.chatId] - The chat ID associated with the message.
 * @property {object} [message.context] - Any additional context.
 */
const addMessage = async (message) => {
  await initializationPromise;
  // Validate the message to ensure it has content.
  if (
    !message ||
    typeof message.content !== "string" ||
    message.content.trim() === ""
  ) {
    console.warn(
      "Attempted to add invalid message: content is missing or empty.",
      message
    );
    return;
  }

  try {
    // Sanitize the message object with default values to prevent undefined properties.
    const messageToStore = {
      role: message.role || "user",
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      chatId: message.chatId || "",
      context: message.context || {},
    };

    history.insert(messageToStore);

    // Immediately trigger a flush to trim the history if necessary.
    await flush();
  } catch (error) {
    console.error("Error adding message to history:", error);
  }
};

/**
 * Trims the history collection to ensure it does not exceed MAX_HISTORY_LENGTH.
 * It removes the oldest messages to make space for new ones.
 * @returns {Promise<boolean>} A promise that resolves to true if the flush was successful, false otherwise.
 */
const flush = async () => {
  await initializationPromise;
  try {
    const currentHistoryCount = history.count();

    if (currentHistoryCount > MAX_HISTORY_LENGTH) {
      const messagesToRemoveCount = currentHistoryCount - MAX_HISTORY_LENGTH;

      // Find the oldest documents to remove.
      const oldMessages = history
        .chain()
        .simplesort("timestamp") // Sort ascending (oldest first).
        .limit(messagesToRemoveCount)
        .data();

      if (oldMessages.length > 0) {
        console.log(
          `Trimming ${oldMessages.length} old messages from history...`
        );
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
 * Saves or updates a preference in the database.
 * This function uses an "upsert" pattern: it updates if the key exists, or inserts if it doesn't.
 * @param {string} key - The unique key for the preference.
 * @param {any} value - The value to store (can be a string, object, array, etc.).
 */
const savePreference = async (key, value) => {
  await initializationPromise;
  try {
    const existingPref = preferences.findOne({ key: key });
    if (existingPref) {
      // If preference exists, update its value.
      existingPref.value = value;
      preferences.update(existingPref);
    } else {
      // Otherwise, insert a new preference document.
      preferences.insert({ key: key, value: value });
    }
  } catch (error) {
    console.error(`Error saving preference for key "${key}":`, error);
  }
};

/**
 * Retrieves a preference value by its key.
 * @param {string} key - The key of the preference to retrieve.
 * @returns {Promise<any|undefined>} A promise that resolves to the preference value, or undefined if not found.
 */
const getPreference = async (key) => {
  await initializationPromise;
  try {
    const pref = preferences.findOne({ key: key });
    return pref ? pref.value : undefined;
  } catch (error) {
    console.error(`Error getting preference for key "${key}":`, error);
    return undefined;
  }
};

/**
 * Deletes a preference from the database by its key.
 * @param {string} key - The key of the preference to delete.
 */
const deletePreference = async (key) => {
  await initializationPromise;
  try {
    preferences.findAndRemove({ key: key });
    console.log(`Preference deleted: ${key}`);
  } catch (error) {
    console.error(`Error deleting preference for key "${key}":`, error);
  }
};

// --- Auto-cleanup Functions ---

/**
 * Periodically removes very old messages from the history collection to keep the database size manageable.
 */
const cleanupOldMessages = async () => {
  await initializationPromise;
  try {
    const oneWeekAgo = new Date(Date.now() - CLEANUP_INTERVAL).toISOString();

    // Find and remove messages in history older than one week.
    const oldDocs = history.find({ timestamp: { $lt: oneWeekAgo } });
    const count = oldDocs.length;

    if (count > 0) {
      history.remove(oldDocs);
      console.log(`Auto-cleanup: Removed ${count} old messages from history.`);
    } else {
      console.log("Auto-cleanup: No old messages to clean up from history.");
    }
  } catch (error) {
    console.error("Auto-cleanup error (history):", error);
  }
};

/**
 * Retrieves all Long-Term Memories (LTMs), which are preferences prefixed with 'ltm_'.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of LTM objects, sorted by priority.
 */
const getLTMMemories = async () => {
  await initializationPromise;
  try {
    // Find all preferences where the key starts with 'ltm_'.
    const ltmPrefs = preferences.find({ key: { $regex: /^ltm_/ } });

    // Map the results to a more usable format.
    const ltmMemories = ltmPrefs.map((pref) => ({
      key: pref.key,
      ...(typeof pref.value === "object" && pref.value !== null
        ? pref.value
        : {}),
    }));

    // Sort memories by priority, descending (highest priority first).
    ltmMemories.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return ltmMemories;
  } catch (error) {
    console.error("Error getting LTM memories:", error);
    return [];
  }
};

/**
 * Cleans up old Long-Term Memories (LTMs) based on their priority and creation date.
 * - High priority memories are kept longer.
 * - Low priority memories are deleted sooner.
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
    const TWO_MONTHS = 60;

    for (const mem of allLtm) {
      if (!mem.createdAt || typeof mem.priority === "undefined") {
        continue; // Skip memories without creation date or priority.
      }

      const creationDate = new Date(mem.createdAt);
      const ageInDays = (now - creationDate) / MS_PER_DAY;

      let shouldDelete = false;
      // Define deletion logic based on priority and age.
      if (mem.priority === 100 && ageInDays > TWO_MONTHS) shouldDelete = true;
      else if (mem.priority > 90 && mem.priority < 100 && ageInDays > TWO_WEEKS)
        shouldDelete = true;
      else if (mem.priority <= 90 && ageInDays > FIVE_DAYS) shouldDelete = true;

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

// --- Scheduling and Startup ---

/**
 * IIFE (Immediately Invoked Function Expression) to schedule cleanup jobs after DB initialization.
 */
(async () => {
  await initializationPromise; // Wait for the DB to be ready.
  console.log("Scheduling cleanup jobs...");
  // Set up recurring cleanup tasks.
  setInterval(cleanupOldMessages, CLEANUP_INTERVAL);
  setInterval(cleanupOldLTMs, LTM_CLEANUP_INTERVAL);

  // Run cleanup once on startup.
  console.log("Running initial cleanup on startup...");
  cleanupOldMessages();
  cleanupOldLTMs();
})();

// --- Module Exports (Public API) ---

module.exports = {
  // Core Functions
  load,
  save: flush, // Alias 'flush' as 'save' for API consistency with previous versions.
  addMessage,
  getPreference,
  savePreference,
  deletePreference,
  getLTMMemories,
  cleanupOldLTMs,

  // Helper/Diagnostic functions
  /**
   * Gets the entire chat history from memory for diagnostic purposes.
   * @returns {Promise<Array<Object>>}
   */
  getInMemoryHistory: async () => {
    await initializationPromise;
    return history.chain().simplesort("timestamp").data();
  },

  /**
   * Gets all key-value preferences from memory.
   * @returns {Promise<Object>}
   */
  getLongTermMemory: async () => {
    await initializationPromise;
    const prefs = preferences.find();
    return prefs.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  },

  /**
   * Searches the history for messages containing a specific keyword.
   * @param {string} keyword - The keyword to search for.
   * @param {number} [limit=5] - The maximum number of results to return.
   * @returns {Promise<Array<Object>>}
   */
  searchHistory: async (keyword, limit = 5) => {
    await initializationPromise;
    return history
      .chain()
      .find({ content: { $contains: keyword } })
      .simplesort("timestamp", true) // Newest first
      .limit(limit)
      .data();
  },

  // Lifecycle function
  /**
   * Closes the database connection gracefully.
   * @returns {Promise<void>}
   */
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
