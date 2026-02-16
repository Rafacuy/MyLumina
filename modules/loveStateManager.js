/**
 * loveStateManager.js - Romance State Management Module
 *
 * This module handles the detection and management of romantic interactions
 * between the user and Lumina. It tracks "love triggers" (romantic confessions)
 * and activates "romance mode" when the user expresses romantic interest
 * multiple times within a time window.
 *
 * Features:
 * - Detects romantic phrases and confessions in Indonesian and English
 * - Tracks confession "score" to determine when romance mode should activate
 * - Auto-resets romance state after 6 hours of inactivity
 * - Integrates with AI response generation for romantic context
 *
 * Romance Mode:
 * When activated (after 3 confessions), Lumina's personality shifts to respond
 * to romantic context, affecting system prompts and responses.
 *
 * @module modules/loveStateManager
 */

let confessionScore = 0;
let lastConfessionTimestamp = null;
let isRomanceMode = false;

const CONFESSION_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Analyzes the user's text for romantic triggers and updates the confession score.
 * @param {string} userText - The text input from the user.
 */
function analyzeLoveTrigger(userText) {
    const text = userText.toLowerCase();

    const triggers = [
        'aku suka kamu',
        'i like you',
        'jatuh cinta',
        'crush on you',
        'aku cinta kamu',
        'apa kamu suka aku',
        'i love you',
    ];

    if (triggers.some((phrase) => text.includes(phrase))) {
        confessionScore++;
        lastConfessionTimestamp = Date.now();
        console.log(`[LoveState] Confession score: ${confessionScore}`);

        if (confessionScore >= CONFESSION_THRESHOLD) {
            isRomanceMode = true;
            console.log('[LoveState] ROMANCE MODE ACTIVE 💖');
        }
    }
}

/**
 * Returns the current status of romance mode.
 * @returns {boolean} - True if romance mode is active, false otherwise.
 */
function getRomanceStatus() {
    return isRomanceMode;
}

/**
 * Resets the romance state if the timeout period has passed since the last confession.
 */
function resetRomanceStateIfNeeded() {
    const now = Date.now();
    if (lastConfessionTimestamp && now - lastConfessionTimestamp >= RESET_TIMEOUT_MS) {
        confessionScore = 0;
        isRomanceMode = false;
        console.log('[LoveState] Romance mode reset due to timeout.');
    }
}

module.exports = {
    analyzeLoveTrigger,
    getRomanceStatus,
    resetRomanceStateIfNeeded,
};