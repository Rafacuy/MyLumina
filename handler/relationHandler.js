// handler/relationHandler.js
// AUTHOR: Arash
// DESCRIPTION: Manages relationship status, points, and levels between the Chatbot and User

const fs = require('fs').promises;
const path = require('path');
const memory = require('../data/memory'); // Import memory.js to access chat history
const config = require('../config/config'); // Import config.js to get USER_NAME
const { getJakartaMoment } = require('../utils/timeHelper');

// --- Relationship Status Configuration ---
const RELATION_STATE_FILE = path.join(__dirname, '..', 'data', 'relationState.json'); // Storage file location
const WEEKLY_CONVERSATION_THRESHOLD = 30; // Target conversations per week
const WEEKLY_POINTS_BONUS = 30; // Bonus points if target is reached
const POINTS_PER_MESSAGE = 1; // Points earned each time the user sends a message

// Points required for each level
const LEVEL_THRESHOLDS = {
    1: 0,
    2: 100,
    3: 250,
    4: 500,
    5: 1000,
};

// Descriptions for each level
const LEVEL_DESCRIPTIONS = {
    1: 'just a helping assistant.',
    2: 'Close friend',
    3: 'Dearest best friend',
    4: 'Significant other',
    5: 'Beloved partner',
};

// --- Internal State ---
let currentState = {
    points: 0,
    level: 1,
    lastWeeklyCheckTimestamp: getJakartaMoment().valueOf(),
};

/**
 * Loads relationship status from the JSON file.
 * If the file doesn't exist, a new one will be created with default values.
 */
async function loadRelationState() {
    try {
        const data = await fs.readFile(RELATION_STATE_FILE, 'utf8');
        currentState = JSON.parse(data);
        // Ensure lastWeeklyCheckTimestamp is numeric after loading
        if (typeof currentState.lastWeeklyCheckTimestamp !== 'number') {
            currentState.lastWeeklyCheckTimestamp = getJakartaMoment().valueOf();
            await saveRelationState();
        }
        console.log('✅ Relationship status successfully loaded.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Relationship status file not found. Creating a new one...');
            currentState.lastWeeklyCheckTimestamp = getJakartaMoment().valueOf(); // Initialize when new file is created
            await saveRelationState();
        } else {
            console.error('❌ Failed to load relationship status:', error);
        }
    }
}

/**
 * Saves the current relationship status to the JSON file.
 */
async function saveRelationState() {
    try {
        await fs.writeFile(RELATION_STATE_FILE, JSON.stringify(currentState, null, 2));
        console.log('💾 Relationship status successfully saved.');
    } catch (error) {
        console.error('❌ Failed to save relationship status:', error);
    }
}

/**
 * Updates the relationship level based on current points.
 * @returns {boolean} - True if the level changed, false otherwise.
 */
function updateLevel() {
    const oldLevel = currentState.level;
    let newLevel = 1;

    // Check from highest to lowest level
    for (let level = 5; level >= 1; level--) {
        if (currentState.points >= LEVEL_THRESHOLDS[level]) {
            newLevel = level;
            break;
        }
    }

    if (newLevel !== oldLevel) {
        currentState.level = newLevel;
        console.log(`🎉 LEVEL UP! Lumina is now at Level ${newLevel}: ${LEVEL_DESCRIPTIONS[newLevel]}`);
        return true;
    }
    return false;
}

/**
 * Adds or subtracts points and updates the level.
 * @param {number} pointsToAdd - Number of points to add (can be negative).
 */
async function addPoints(pointsToAdd) {
    console.log(`[DEBUG - RelationState] addPoints function called with ${pointsToAdd} points.`);
    currentState.points += pointsToAdd;
    // Ensure points are not negative
    if (currentState.points < 0) {
        currentState.points = 0;
    }
    console.log(`✨ Relationship points changed by ${pointsToAdd}. Total points now: ${currentState.points}`);
    updateLevel(); // Call updateLevel after points are changed
    await saveRelationState();
}

/**
 * Adds points every time the user sends a message.
 * Called from core.js
 */
async function addPointOnMessage() {
    await addPoints(POINTS_PER_MESSAGE);
    console.log(`[RelationState] Points increased by ${POINTS_PER_MESSAGE} from message interaction.`);
}

/**
 * Checks the number of conversations in the past week.
 * If above the threshold, grant bonus points.
 * This function should be called periodically (e.g., every few hours) from core.js.
 */
async function checkWeeklyConversation() {
    // Ensure lastWeeklyCheckTimestamp is a number
    if (typeof currentState.lastWeeklyCheckTimestamp !== 'number') {
        currentState.lastWeeklyCheckTimestamp = getJakartaMoment().valueOf();
        await saveRelationState();
    }

    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    const now = getJakartaMoment().valueOf(); // Get current timestamp in Jakarta timezone

    // Check if it's been more than a week since the last check
    if (now - currentState.lastWeeklyCheckTimestamp > oneWeekInMs) {
        console.log('⏳ Performing weekly conversation check...');
        
        // Load history from memory (assuming load() returns the relevant history)
        const history = await memory.load();
        const lastWeekDate = new Date(currentState.lastWeeklyCheckTimestamp);

        // Filter messages from the target user within the last week
        const userMessagesLastWeek = history.filter(
            (msg) =>
                msg.role === 'user' &&
                msg.timestamp &&
                new Date(msg.timestamp) > lastWeekDate,
        );

        console.log(
            `Total conversations from user in the past week: ${userMessagesLastWeek.length}`,
        );

        if (userMessagesLastWeek.length > WEEKLY_CONVERSATION_THRESHOLD) {
            console.log(`🏆 Weekly conversation target exceeded! Granting ${WEEKLY_POINTS_BONUS} points.`);
            await addPoints(WEEKLY_POINTS_BONUS);
        } else {
            console.log(
                `Weekly conversation target not reached (${userMessagesLastWeek.length}/${WEEKLY_CONVERSATION_THRESHOLD}).`,
            );
        }

        // Reset check timestamp to current time
        currentState.lastWeeklyCheckTimestamp = now;
        await saveRelationState();
    } else {
        const remainingDays = Math.floor((oneWeekInMs - (now - currentState.lastWeeklyCheckTimestamp)) / (1000 * 60 * 60 * 24));
        console.log(
            `Weekly check is not yet due. ${remainingDays} days remaining.`,
        );
    }
}

// --- Exported Functions ---

/**
 * Gets the current relationship level.
 * @returns {number} - Current level (1-5).
 */
function getRelationLevel() {
    return currentState.level;
}

/**
 * Gets the description of the current relationship level.
 * @returns {string} - Level description.
 */
function getRelationLevelDescription() {
    return LEVEL_DESCRIPTIONS[currentState.level] || 'Status unknown.';
}

/**
 * Gets current relationship points.
 * @returns {number} - Number of points.
 */
function getCurrentPoints() {
    return currentState.points;
}

// Initialization
loadRelationState();

module.exports = {
    loadRelationState,
    addPoints,
    addPointOnMessage,
    checkWeeklyConversation,
    getRelationLevel,
    getRelationLevelDescription,
    getCurrentPoints,
};