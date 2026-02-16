/**
 * mood.js - Mood State Constants
 *
 * This module defines the emotional state constants used throughout Lumina.
 * Each mood has an associated emoji and Indonesian name that affects how
 * Lumina responds to user interactions.
 *
 * Mood System Overview:
 * - Moods are more than cosmetic - they influence AI prompt generation
 * - Each mood affects emoji usage, tone, and word choice in responses
 * - Moods can be set temporarily and auto-reset after a timeout period
 * - Some moods are reserved for special situations (CALM for deep talk)
 *
 * Available Moods:
 * - HAPPY: Cheerful and upbeat responses
 * - SAD: Subdued and empathetic tone
 * - ANGRY: Short, curt responses with irritation
 * - LAZY: Sleepy, low-energy responses (used during "sleep hours")
 * - LOVING: Affectionate and warm responses
 * - NORMAL: Default baseline mood
 * - CALM: Reserved for deep talk mode (9 PM - 6 AM)
 * - JEALOUS: Used during "ngambek" (sulking) mode
 *
 * @module modules/mood
 * @see handler/commandHandlers.js - Where mood management logic resides
 */

/**
 * Mood state constants object.
 * Each mood contains an emoji for visual representation and an Indonesian name.
 *
 * @constant {object}
 * @property {object} HAPPY - Cheerful mood with happy emoji
 * @property {object} SAD - Sad mood with melancholic emoji
 * @property {object} ANGRY - Angry mood with angry emoji
 * @property {object} LAZY - Lazy/sleepy mood with tired emoji
 * @property {object} LOVING - Affectionate mood with loving emoji
 * @property {object} NORMAL - Default neutral mood
 * @property {object} CALM - Calm mood for deep conversations
 * @property {object} JEALOUS - Jealous/sulking mood
 */
const Mood = {
    HAPPY: { emoji: '>.<', name: 'Senang' },
    SAD: { emoji: ':)', name: 'Sedih' },
    ANGRY: { emoji: '😠', name: 'Marah' },
    LAZY: { emoji: '😪', name: 'Malas' },
    LOVING: { emoji: '>///<', name: 'Loving' },
    NORMAL: { emoji: '>~<', name: 'Normal' },
    CALM: { emoji: '😌', name: 'Tenang' },
    JEALOUS: { emoji: '😒', name: 'Ngambek' },
};

module.exports = Mood;
