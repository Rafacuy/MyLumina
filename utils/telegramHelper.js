// utils/telegramHelper.js

/**
 * Retrieves the username from the Telegram message object.
 * Priority is first_name, then username, falling back to "Tuan".
 * @param {object} msg - Telegram message object.
 * @returns {string} Username.
 */
function getUserName(msg) {
    if (msg && msg.from) {
        if (msg.from.first_name) {
            return msg.from.first_name;
        }
        if (msg.from.username) {
            return msg.from.username;
        }
    }
    // If neither is available, use a default name
    return 'Tuan';
}

module.exports = {
    getUserName,
};