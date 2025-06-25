// utils/telegramHelper.js

/**
 * Mengambil nama pengguna dari objek pesan Telegraf.
 * Prioritasnya adalah first_name, lalu username, dan fallback ke "Tuan".
 * @param {object} msg - Objek pesan dari Telegraf.
 * @returns {string} Nama pengguna.
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
    // Jika tidak ada keduanya, gunakan nama default
    return "Tuan";
  }
  
  module.exports = {
    getUserName,
  };
  