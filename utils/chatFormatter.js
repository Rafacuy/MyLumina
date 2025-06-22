// utils/ChatFormatter.js

/**
 * Mengubah riwayat chat dari format JSON menjadi string teks yang mudah dibaca.
 * ...
 * @param {Array<Object>} chatHistory Array objek pesan dari memory.js.
 * @param {string} userName Nama pengguna untuk identifikasi pesan dari user.
 * @param {string} botName Nama bot (Lumina) untuk identifikasi pesan dari bot.
 * @returns {string} Riwayat chat yang diformat sebagai string teks.
 */
function formatChatHistoryForPrompt(chatHistory, userName, botName) {
    if (!chatHistory || chatHistory.length === 0) {
      return "[💬 Percakapan Sebelumnya]\nTidak ada riwayat percakapan.";
    }
  
    let formattedText = "[💬 Percakapan Sebelumnya]\n";
  
    chatHistory.forEach(message => {
      const sender = message.role === "user" ? userName : botName;
      const content = message.content || message.text; // Pastikan mengambil konten yang benar
  
      if (content) {
        formattedText += `${sender}: ${content}\n`;
      }
    });
  
    return formattedText;
  }
  
  module.exports = {
    formatChatHistoryForPrompt
  };