// utils/sendMessage.js
// High-level message sending interface using grammY framework

const telegramClient = require('./telegramClient');
const logger = require('./logger');

/**
 * Send a text message to a chat
 * @param {number|string} chatId - Target chat ID
 * @param {string} text - Message text
 * @param {object} options - Additional options (parse_mode, reply_markup, etc.)
 */
async function sendMessage(chatId, text, options = {}) {
  try {
    const result = await telegramClient.sendMessage(chatId, text, options);
    logger.debug(
      { event: 'send_message', chatId, messageId: result.message_id },
      '[SendMessage] Message sent successfully'
    );
    return result;
  } catch (error) {
    logger.error(
      { event: 'send_message_error', chatId, error: error.message },
      '[SendMessage] Error sending message'
    );
    throw error;
  }
}

/**
 * Send a voice note to a chat
 * Supports file_id, URL, or local file path
 * @param {number|string} chatId - Target chat ID
 * @param {string|Buffer} audioUrl - Audio URL, file_id, or file path
 * @param {string} caption - Voice note caption (optional)
 * @param {object} options - Additional options
 */
async function sendVoiceNote(chatId, audioUrl, caption = '', options = {}) {
  try {
    const voiceOptions = {
      caption: caption || undefined,
      ...options,
    };

    // Remove undefined properties
    Object.keys(voiceOptions).forEach(
      key => voiceOptions[key] === undefined && delete voiceOptions[key]
    );

    const result = await telegramClient.sendVoice(chatId, audioUrl, voiceOptions);

    logger.info(
      { event: 'voice_note_sent', chatId, messageId: result.message_id },
      `[SendMessage] Voice note successfully sent to ${chatId}`
    );

    return result;
  } catch (error) {
    logger.error(
      { event: 'send_voice_note_error', chatId, error: error.message },
      `[SendMessage] Failed to send voice note to ${chatId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Send an audio file to a chat
 * @param {number|string} chatId - Target chat ID
 * @param {string} audioUrl - Audio URL or file_id
 * @param {object} options - Additional options (title, performer, duration, etc.)
 */
async function sendAudio(chatId, audioUrl, options = {}) {
  try {
    const result = await telegramClient.sendAudio(chatId, audioUrl, options);
    logger.debug(
      { event: 'audio_sent', chatId, messageId: result.message_id },
      '[SendMessage] Audio sent successfully'
    );
    return result;
  } catch (error) {
    logger.error(
      { event: 'send_audio_error', chatId, error: error.message },
      '[SendMessage] Error sending audio'
    );
    throw error;
  }
}

/**
 * Send a document to a chat
 * @param {number|string} chatId - Target chat ID
 * @param {string|Buffer} document - Document file_id, URL, or buffer
 * @param {object} options - Additional options (caption, etc.)
 */
async function sendDocument(chatId, document, options = {}) {
  try {
    const result = await telegramClient.sendDocument(chatId, document, options);
    logger.debug(
      { event: 'document_sent', chatId, messageId: result.message_id },
      '[SendMessage] Document sent successfully'
    );
    return result;
  } catch (error) {
    logger.error(
      { event: 'send_document_error', chatId, error: error.message },
      '[SendMessage] Error sending document'
    );
    throw error;
  }
}

/**
 * Send a photo to a chat
 * @param {number|string} chatId - Target chat ID
 * @param {string|Buffer} photo - Photo file_id, URL, or buffer
 * @param {object} options - Additional options (caption, etc.)
 */
async function sendPhoto(chatId, photo, options = {}) {
  try {
    const result = await telegramClient.sendPhoto(chatId, photo, options);
    logger.debug(
      { event: 'photo_sent', chatId, messageId: result.message_id },
      '[SendMessage] Photo sent successfully'
    );
    return result;
  } catch (error) {
    logger.error(
      { event: 'send_photo_error', chatId, error: error.message },
      '[SendMessage] Error sending photo'
    );
    throw error;
  }
}

/**
 * Send typing indicator
 * @param {number|string} chatId - Target chat ID
 */
async function sendTypingIndicator(chatId) {
  try {
    await telegramClient.sendChatAction(chatId, 'typing');
    logger.debug(
      { event: 'typing_indicator_sent', chatId },
      '[SendMessage] Typing indicator sent'
    );
  } catch (error) {
    logger.warn(
      { event: 'typing_indicator_error', chatId, error: error.message },
      '[SendMessage] Error sending typing indicator'
    );
  }
}

/**
 * Edit an existing message
 * @param {number|string} chatId - Chat ID
 * @param {number} messageId - Message ID to edit
 * @param {string} text - New message text
 * @param {object} options - Additional options
 */
async function editMessage(chatId, messageId, text, options = {}) {
  try {
    const result = await telegramClient.editMessageText(chatId, messageId, text, options);
    logger.debug(
      { event: 'message_edited', chatId, messageId },
      '[SendMessage] Message edited successfully'
    );
    return result;
  } catch (error) {
    logger.warn(
      { event: 'edit_message_error', chatId, messageId, error: error.message },
      '[SendMessage] Error editing message'
    );
    throw error;
  }
}

/**
 * Delete a message
 * @param {number|string} chatId - Chat ID
 * @param {number} messageId - Message ID to delete
 */
async function deleteMessage(chatId, messageId) {
  try {
    await telegramClient.deleteMessage(chatId, messageId);
    logger.debug(
      { event: 'message_deleted', chatId, messageId },
      '[SendMessage] Message deleted successfully'
    );
  } catch (error) {
    logger.warn(
      { event: 'delete_message_error', chatId, messageId, error: error.message },
      '[SendMessage] Error deleting message'
    );
    throw error;
  }
}

module.exports = {
  sendMessage,
  sendVoiceNote,
  sendAudio,
  sendDocument,
  sendPhoto,
  sendTypingIndicator,
  editMessage,
  deleteMessage,
  // Export client for advanced usage
  telegramClient,
};