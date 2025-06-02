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
const config = require('../config/config')

// --- Configuration Constants ---
const MEMORY_FILE = path.join(__dirname, 'memory.ndjson.gz'); // Main active memory file, now NDJSON and gzipped
const BACKUP_DIR = path.join(__dirname, 'backups'); // Directory for temporary backups of MEMORY_FILE
const ARCHIVE_DIR = path.join(__dirname, 'archives'); // New directory for older, archived chats
const MAX_HISTORY_LENGTH = 100; // Maximum number of messages to keep in active in-memory history (ring buffer)
const ARCHIVE_THRESHOLD = 90; // When in-memory history reaches this length, oldest messages are archived
const ARCHIVE_CHUNK_SIZE = 50; // Number of messages to move to archive when threshold is met
const BACKUP_RETENTION = 3; // Number of recent 'memory.ndjson.gz' backups to keep
const TARGET_USER_NAME = config.USER_NAME; // Username for specific chat saving logic

// --- Global State Variables ---
let inMemoryHistory = []; // The fixed-size queue (ring buffer) for active conversation history
let saveQueue = Promise.resolve(); // A promise chain to ensure sequential write operations
let isDirty = false; // Flag to indicate if inMemoryHistory has unsaved changes, triggering a flush

// --- Helper Functions ---

/**
 * Validates if an object is a valid history entry (minimally, has a 'content' property).
 * @param {object} entry The object to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
const validateHistoryEntry = (entry) => {
    return typeof entry === 'object' && entry !== null && 'content' in entry;
};

/**
 * Writes an array of messages to a file in NDJSON format and compresses it with Gzip.
 * Each message object is stringified to a single line, separated by newlines.
 * @param {string} filePath The full path to the file to write.
 * @param {Array<object>} messages An array of message objects.
 * @returns {Promise<void>} A promise that resolves when the file is written.
 */
const writeNdjsonGz = async (filePath, messages) => {
    const ndjsonContent = messages.map(msg => JSON.stringify(msg)).join('\n');
    const compressed = zlib.gzipSync(ndjsonContent);
    await fs.writeFile(filePath, compressed);
};

/**
 * Reads messages from a Gzipped NDJSON file, decompresses it, and parses each line.
 * @param {string} filePath The full path to the file to read.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of parsed message objects.
 */
const readNdjsonGz = async (filePath) => {
    try {
        const compressedData = await fs.readFile(filePath);
        const data = zlib.gunzipSync(compressedData).toString('utf8');
        // Filter out empty lines that might result from trailing newlines
        return data.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
    } catch (error) {
        // If the file doesn't exist, return an empty array instead of throwing an error
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error; // Re-throw other errors
    }
};

/**
 * Rotates backups in the BACKUP_DIR, keeping only the most recent `BACKUP_RETENTION` files.
 * @returns {Promise<void>} A promise that resolves when old backups are deleted.
 */
const rotateBackups = async () => {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        const backups = files
            .filter(f => f.startsWith('memory_backup_') && f.endsWith('.ndjson.gz'))
            .sort() // Sort alphabetically (which works for ISO timestamps)
            .reverse(); // Get most recent first

        const toDelete = backups.slice(BACKUP_RETENTION); // Identify backups to delete

        for (const file of toDelete) {
            await fs.unlink(path.join(BACKUP_DIR, file));
            // console.log(`Deleted old backup: ${file}`); // Uncomment for verbose logging
        }
    } catch (error) {
        console.error('Error rotating backups:', error);
    }
};

// --- Core Memory Management Functions ---

/**
 * Loads the active conversation history from MEMORY_FILE into inMemoryHistory.
 * If MEMORY_FILE is not found or corrupted, it attempts to load from the most recent backup.
 * Initializes the inMemoryHistory array.
 * @returns {Promise<Array<object>>} A promise that resolves to the loaded history.
 */
const load = async () => {
    // Ensure no pending save operations interfere with loading
    return saveQueue.then(async () => {
        try {
            // Ensure necessary directories exist before attempting to read/write
            await fs.mkdir(ARCHIVE_DIR, { recursive: true });
            await fs.mkdir(BACKUP_DIR, { recursive: true });

            // Attempt to load the main active memory file
            const loadedMessages = await readNdjsonGz(MEMORY_FILE);
            // Filter out any invalid entries and ensure it doesn't exceed max length
            inMemoryHistory = loadedMessages.filter(validateHistoryEntry).slice(-MAX_HISTORY_LENGTH);

            console.log(`Loaded ${inMemoryHistory.length} messages into active memory from ${MEMORY_FILE}.`);
            isDirty = false; // History is now in sync with disk

            return inMemoryHistory;
        } catch (error) {
            console.error(`Error loading main memory file (${MEMORY_FILE}):`, error);
            // If main file fails, try to load from the most recent backup
            try {
                const backupFiles = (await fs.readdir(BACKUP_DIR))
                    .filter(f => f.startsWith('memory_backup_') && f.endsWith('.ndjson.gz'))
                    .sort()
                    .reverse();

                if (backupFiles.length > 0) {
                    const backupPath = path.join(BACKUP_DIR, backupFiles[0]);
                    console.log(`Attempting to load from backup: ${backupPath}`);
                    const backupMessages = await readNdjsonGz(backupPath);
                    inMemoryHistory = backupMessages.filter(validateHistoryEntry).slice(-MAX_HISTORY_LENGTH);
                    console.log(`Successfully loaded ${inMemoryHistory.length} messages from backup.`);
                    isDirty = true; // Mark dirty so this recovered state is saved to main file
                    return inMemoryHistory;
                }
            } catch (backupError) {
                console.error('Error loading from backup:', backupError);
            }
            // If all loading attempts fail, start with an empty history
            console.warn('Could not load memory or backup. Starting with an empty history.');
            inMemoryHistory = [];
            isDirty = true; // Mark dirty to ensure an empty file is saved
            return [];
        }
    });
};

/**
 * Flushes the in-memory history to disk. This function handles:
 * 1. Archiving older messages if the history size exceeds the threshold.
 * 2. Creating a backup of the current active memory.
 * 3. Writing the current active memory to the main MEMORY_FILE.
 * 4. Rotating old backups.
 * This function is designed to be called periodically (e.g., via setInterval).
 * @returns {Promise<boolean>} A promise that resolves to true if flush was successful, false otherwise.
 */
const flush = async () => {
    if (!isDirty) {
        // console.log('No changes to save, skipping flush.'); // Uncomment for verbose logging
        return true; // Indicate success as nothing needed to be saved
    }

    // Use saveQueue to ensure only one flush operation runs at a time
    saveQueue = saveQueue.then(async () => {
        try {
            // 1. Handle Archiving: If history is nearing its limit, move oldest messages to an archive file
            if (inMemoryHistory.length >= ARCHIVE_THRESHOLD) {
                const messagesToArchive = inMemoryHistory.slice(0, ARCHIVE_CHUNK_SIZE);
                inMemoryHistory = inMemoryHistory.slice(ARCHIVE_CHUNK_SIZE); // Remove archived messages from active memory

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const archiveFile = path.join(ARCHIVE_DIR, `archive_${timestamp}.ndjson.gz`);
                await writeNdjsonGz(archiveFile, messagesToArchive);
                console.log(`Archived ${messagesToArchive.length} messages to ${archiveFile}`);
            }

            // 2. Create a backup of the current active memory before writing to the main file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `memory_backup_${timestamp}.ndjson.gz`);
            await writeNdjsonGz(backupFile, inMemoryHistory);
            // console.log(`Created backup: ${backupFile}`); // Uncomment for verbose logging

            // 3. Write current active memory to the main file
            await writeNdjsonGz(MEMORY_FILE, inMemoryHistory);
            console.log(`Saved active memory to ${MEMORY_FILE}. Current size: ${inMemoryHistory.length}`);

            // 4. Rotate backups to manage disk space
            await rotateBackups();

            isDirty = false; // Reset dirty flag after successful save
            return true;
        } catch (error) {
            console.error('Error during memory flush:', error);
            return false;
        }
    });
    return saveQueue; // Return the promise so other operations can chain after the flush completes
};

/**
 * Adds a new message to the in-memory history (ring buffer).
 * If the history exceeds MAX_HISTORY_LENGTH, the oldest message is removed.
 * This function only modifies the in-memory state and sets the `isDirty` flag.
 * Actual saving to disk happens via the `flush` function.
 * @param {object} message The message object to add.
 * @returns {Array<object>} The updated in-memory history.
 */
const addMessage = async (message) => {
    if (!validateHistoryEntry(message)) {
        console.warn('Attempted to add invalid message to history:', message);
        return inMemoryHistory; // Return current history without modification
    }
    inMemoryHistory.push(message);
    if (inMemoryHistory.length > MAX_HISTORY_LENGTH) {
        inMemoryHistory.shift(); // Remove the oldest message to maintain fixed size
    }
    isDirty = true; // Mark memory as having unsaved changes
    return inMemoryHistory;
};

/**
 * Retrieves the last chat message sent by a specific user from the in-memory history.
 * @param {string} userName The name of the user to search for.
 * @returns {object|null} The last message object from the specified user, or null if not found.
 */
const getLastChatBy = async (userName) => {
    // Iterate backwards to find the most recent message quickly
    for (let i = inMemoryHistory.length - 1; i >= 0; i--) {
        if (inMemoryHistory[i].from && inMemoryHistory[i].from.first_name === userName) {
            return inMemoryHistory[i];
        }
    }
    return null; // No message found from the specified user
};

/**
 * Saves the last chat message if it's from the TARGET_USER_NAME.
 * This function ensures that only the most recent message from the target user is kept in history.
 * It leverages `addMessage` for the actual addition and size management.
 * @param {object} message The incoming message object.
 * @returns {Promise<void>} A promise that resolves when the operation is complete.
 */
const saveLastChat = async (message) => {
    try {
        if (message?.from?.first_name === TARGET_USER_NAME) {
            // Remove any previous message from the TARGET_USER_NAME to keep only the latest
            const existingIndex = inMemoryHistory.findIndex(msg =>
                msg.from && msg.from.first_name === TARGET_USER_NAME && msg.from.id === message.from.id
            );
            if (existingIndex !== -1) {
                inMemoryHistory.splice(existingIndex, 1);
            }
            // Add the new message. addMessage will handle the ring buffer logic.
            await addMessage(message);
        }
    } catch (error) {
        console.error('Error saving last chat:', error);
    }
};

/**
 * Searches the in-memory history for messages containing a specific keyword.
 * @param {string} keyword The keyword to search for (case-insensitive).
 * @param {number} limit The maximum number of results to return.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of matching message objects.
 */
const searchHistory = async (keyword, limit = 5) => {
    const results = [];
    // Search in-memory history from newest to oldest
    for (let i = inMemoryHistory.length - 1; i >= 0 && results.length < limit; i--) {
        if (inMemoryHistory[i].content && inMemoryHistory[i].content.toLowerCase().includes(keyword.toLowerCase())) {
            results.unshift(inMemoryHistory[i]); // Add to the beginning to maintain chronological order
        }
    }
    // Note: This function currently only searches the active in-memory history.
    // To search archives, additional logic would be required to read and process archive files.
    return results;
};

// --- Module Exports ---
module.exports = {
    load,
    save: flush, // Expose `flush` as `save` for external calls 
    addMessage,
    searchHistory,
    getLastChatBy,
    saveLastChat,
    // Helper to get the current in-memory history for other modules 
    getInMemoryHistory: () => inMemoryHistory
};

// --- Initialization and Timed Flush Setup ---

// Load history when the module is first required
load().then(() => {
    console.log('Memory module initialized and history loaded successfully.');
}).catch(err => {
    console.error('Failed to initialize memory module on startup:', err);
});

// Set up periodic flush to save changes to disk every 30 seconds
setInterval(() => {
    module.exports.save(); // Call the flush function
}, 30 * 1000); // 30 seconds interval
