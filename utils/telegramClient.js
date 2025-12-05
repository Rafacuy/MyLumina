// utils/telegramClient.js
// Unified Telegram client wrapper for grammY framework
// Provides abstraction layer for Telegram API operations

const { Bot, InputFile } = require('grammy');
const config = require('../config/config');
const logger = require('./logger');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

/**
 * TelegramClient provides a unified interface for Telegram API operations
 * Acts as a wrapper around grammY Bot instance
 */
class TelegramClient {
  constructor() {
    // Create bot instance with custom configuration for better network handling
    this.bot = new Bot(config.telegramBotToken, {
      // Add custom client configuration for better network handling
      client: {
        // Timeout for API requests (in milliseconds)
        timeout: 30000, // Increased timeout to 30 seconds
        // Allow overriding API root (e.g., when using proxy/mirror) via env TELEGRAM_API_ROOT
        apiRoot: process.env.TELEGRAM_API_ROOT || undefined,
      }
    });
    this.initialized = false;
  }

  isTemporaryNetworkError(error) {
    const code = (error?.cause?.code || error?.code || '').toUpperCase();
    const message = (error?.message || '').toLowerCase();

    const tempCodes = [
      'ENOTFOUND', 'ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN',
      'EHOSTUNREACH', 'ENETUNREACH', 'ECONNREFUSED'
    ];
    const tempSnippets = [
      'network request', 'fetch failed', 'timeout', 'temporarily unavailable',
      'connection', 'tls', 'socket hang up'
    ];

    return tempCodes.includes(code) || tempSnippets.some(sn => message.includes(sn)) || !!error?.error_code && error.error_code >= 500;
  }

  /**
   * Initialize the Telegram client with error handlers and retry mechanism
   */
  async initialize(maxRetries = 5, retryDelay = 2000) {
    if (this.initialized) return;

    if (!config.telegramBotToken) {
      const err = new Error('TELEGRAM_BOT_TOKEN is missing. Set it in environment variables.');
      logger.error({ event: 'telegram_client_init_token_missing' }, err.message);
      throw err;
    }

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Test bot connectivity
        const botInfo = await this.bot.api.getMe();
        logger.info(
          { event: 'telegram_client_initialized', botUsername: botInfo.username, attempt },
          `[TelegramClient] Successfully connected as @${botInfo.username} (attempt ${attempt})`
        );
        this.initialized = true;
        this.botInfo = botInfo;
        return; // Success, exit the function
      } catch (error) {
        lastError = error;

        const isTemp = this.isTemporaryNetworkError(error);
        const backoffMs = retryDelay * Math.pow(2, attempt - 1);

        logger.warn(
          {
            event: 'telegram_client_init_retry',
            attempt,
            maxRetries,
            error: error.message,
            errorCode: error.error_code,
            parameters: error.parameters,
            code: error.code || error?.cause?.code,
            isTemporary: isTemp,
            nextDelayMs: attempt < maxRetries ? backoffMs : null,
          },
          `[TelegramClient] Initialization attempt ${attempt} failed: ${error.message}`
        );

        // If this is clearly an auth error (bad token), fail fast
        if (!isTemp && (error.error_code === 401 || error.error_code === 400)) {
          break;
        }

        // If this wasn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // If all retries failed, log the final error and throw it
    logger.error(
      { event: 'telegram_client_init_error', error: lastError.message, maxRetries },
      `[TelegramClient] Failed to initialize Telegram client after ${maxRetries} attempts`
    );
    throw lastError;
  }

  /**
   * Get the underlying grammY bot instance
   */
  getBot() {
    return this.bot;
  }

  /**
   * Send a text message
   * @param {number|string} chatId - Target chat ID
   * @param {string} text - Message text
   * @param {object} options - Additional options (parse_mode, reply_markup, etc.)
   */
  async sendMessage(chatId, text, options = {}) {
    try {
      const defaultOptions = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      const finalOptions = { ...defaultOptions, ...options };

      const result = await this.bot.api.sendMessage(chatId, text, finalOptions);

      logger.debug(
        { event: 'message_sent', chatId, messageId: result.message_id },
        '[TelegramClient] Message sent successfully'
      );

      return result;
    } catch (error) {
      logger.error(
        { event: 'send_message_error', chatId, error: error.message },
        '[TelegramClient] Failed to send message'
      );
      throw error;
    }
  }

  /**
   * Send a voice message
   * @param {number|string} chatId - Target chat ID
   * @param {string|Buffer|Stream} voice - Voice file (file_id, URL, or stream)
   * @param {object} options - Additional options (caption, duration, etc.)
   */
  async sendVoice(chatId, voice, options = {}) {
    try {
      let voiceInput = voice;

      // If voice is a URL, download and convert to InputFile
      if (typeof voice === 'string' && voice.startsWith('http')) {
        const response = await axios({ url: voice, responseType: 'arraybuffer' });
        voiceInput = new InputFile(Buffer.from(response.data), 'voice.ogg');
      }

      const result = await this.bot.api.sendVoice(chatId, voiceInput, options);

      logger.debug(
        { event: 'voice_sent', chatId, messageId: result.message_id },
        '[TelegramClient] Voice message sent successfully'
      );

      return result;
    } catch (error) {
      logger.error(
        { event: 'send_voice_error', chatId, error: error.message },
        '[TelegramClient] Failed to send voice message'
      );
      throw error;
    }
  }

  /**
   * Send an audio message
   * @param {number|string} chatId - Target chat ID
   * @param {string|Buffer|Stream} audio - Audio file (file_id, URL, or stream)
   * @param {object} options - Additional options (title, performer, duration, etc.)
   */
  async sendAudio(chatId, audio, options = {}) {
    try {
      let audioInput = audio;

      if (typeof audio === 'string' && audio.startsWith('http')) {
        const response = await axios({ url: audio, responseType: 'arraybuffer' });
        audioInput = new InputFile(Buffer.from(response.data), 'audio.mp3');
      }

      const result = await this.bot.api.sendAudio(chatId, audioInput, options);

      logger.debug(
        { event: 'audio_sent', chatId, messageId: result.message_id },
        '[TelegramClient] Audio message sent successfully'
      );

      return result;
    } catch (error) {
      logger.error(
        { event: 'send_audio_error', chatId, error: error.message },
        '[TelegramClient] Failed to send audio message'
      );
      throw error;
    }
  }

  /**
   * Send a document
   * @param {number|string} chatId - Target chat ID
   * @param {string|Buffer|Stream} document - Document file
   * @param {object} options - Additional options (caption, etc.)
   */
  async sendDocument(chatId, document, options = {}) {
    try {
      let docInput = document;

      if (typeof document === 'string' && document.startsWith('http')) {
        const response = await axios({ url: document, responseType: 'arraybuffer' });
        docInput = new InputFile(Buffer.from(response.data), 'document');
      }

      const result = await this.bot.api.sendDocument(chatId, docInput, options);

      logger.debug(
        { event: 'document_sent', chatId, messageId: result.message_id },
        '[TelegramClient] Document sent successfully'
      );

      return result;
    } catch (error) {
      logger.error(
        { event: 'send_document_error', chatId, error: error.message },
        '[TelegramClient] Failed to send document'
      );
      throw error;
    }
  }

  /**
   * Send a photo
   * @param {number|string} chatId - Target chat ID
   * @param {string|Buffer|Stream} photo - Photo file
   * @param {object} options - Additional options (caption, etc.)
   */
  async sendPhoto(chatId, photo, options = {}) {
    try {
      let photoInput = photo;

      if (typeof photo === 'string' && photo.startsWith('http')) {
        const response = await axios({ url: photo, responseType: 'arraybuffer' });
        photoInput = new InputFile(Buffer.from(response.data), 'photo.jpg');
      } else if (
        typeof photo === 'string' &&
        (photo.startsWith('/') || photo.startsWith('./') || photo.includes(path.sep))
      ) {
        const resolvedPath = path.isAbsolute(photo) ? photo : path.join(process.cwd(), photo);
        try {
          const buffer = await fs.readFile(resolvedPath);
          photoInput = new InputFile(buffer, path.basename(resolvedPath));
        } catch (fileError) {
          logger.warn(
            { event: 'local_photo_read_failed', path: resolvedPath, error: fileError.message },
            '[TelegramClient] Failed to read local photo, sending raw input instead.'
          );
        }
      }

      const result = await this.bot.api.sendPhoto(chatId, photoInput, options);

      logger.debug(
        { event: 'photo_sent', chatId, messageId: result.message_id },
        '[TelegramClient] Photo sent successfully'
      );

      return result;
    } catch (error) {
      logger.error(
        { event: 'send_photo_error', chatId, error: error.message },
        '[TelegramClient] Failed to send photo'
      );
      throw error;
    }
  }

  /**
   * Set typing status indicator
   * @param {number|string} chatId - Target chat ID
   */
  async sendChatAction(chatId, action = 'typing') {
    try {
      await this.bot.api.sendChatAction(chatId, action);

      logger.debug(
        { event: 'chat_action_sent', chatId, action },
        '[TelegramClient] Chat action sent'
      );
    } catch (error) {
      logger.warn(
        { event: 'send_chat_action_error', chatId, error: error.message },
        '[TelegramClient] Failed to send chat action'
      );
    }
  }

  /**
   * Get file information and download URL
   * @param {string} fileId - Telegram file ID
   * @returns {Promise<{fileId, filePath, downloadUrl}>}
   */
  async getFileLink(fileId) {
    try {
      const file = await this.bot.api.getFile(fileId);

      if (!file.file_path) {
        throw new Error('File path not available');
      }

      const downloadUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

      logger.debug(
        { event: 'file_link_obtained', fileId, filePath: file.file_path },
        '[TelegramClient] File link obtained'
      );

      return {
        fileId,
        filePath: file.file_path,
        downloadUrl,
        fileSize: file.file_size,
      };
    } catch (error) {
      logger.error(
        { event: 'get_file_link_error', fileId, error: error.message },
        '[TelegramClient] Failed to get file link'
      );
      throw error;
    }
  }

  /**
   * Download file from URL and save to disk
   * @param {string} downloadUrl - Download URL
   * @param {string} targetPath - Target file path
   */
  async downloadFile(downloadUrl, targetPath) {
    try {
      const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
      });

      const writer = require('fs').createWriteStream(targetPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      logger.info(
        { event: 'file_downloaded', targetPath },
        '[TelegramClient] File downloaded successfully'
      );

      return targetPath;
    } catch (error) {
      logger.error(
        { event: 'download_file_error', targetPath, error: error.message },
        '[TelegramClient] Failed to download file'
      );
      throw error;
    }
  }

  /**
   * Edit an existing message
   * @param {number|string} chatId - Chat ID
   * @param {number} messageId - Message ID to edit
   * @param {string} text - New message text
   * @param {object} options - Additional options
   */
  async editMessageText(chatId, messageId, text, options = {}) {
    try {
      const result = await this.bot.api.editMessageText(chatId, messageId, text, options);

      logger.debug(
        { event: 'message_edited', chatId, messageId },
        '[TelegramClient] Message edited successfully'
      );

      return result;
    } catch (error) {
      logger.warn(
        { event: 'edit_message_error', chatId, messageId, error: error.message },
        '[TelegramClient] Failed to edit message'
      );
      throw error;
    }
  }

  /**
   * Delete a message
   * @param {number|string} chatId - Chat ID
   * @param {number} messageId - Message ID to delete
   */
  async deleteMessage(chatId, messageId) {
    try {
      await this.bot.api.deleteMessage(chatId, messageId);

      logger.debug(
        { event: 'message_deleted', chatId, messageId },
        '[TelegramClient] Message deleted successfully'
      );
    } catch (error) {
      logger.warn(
        { event: 'delete_message_error', chatId, messageId, error: error.message },
        '[TelegramClient] Failed to delete message'
      );
      throw error;
    }
  }

  /**
   * Get chat information
   * @param {number|string} chatId - Chat ID
   */
  async getChat(chatId) {
    try {
      return await this.bot.api.getChat(chatId);
    } catch (error) {
      logger.error(
        { event: 'get_chat_error', chatId, error: error.message },
        '[TelegramClient] Failed to get chat info'
      );
      throw error;
    }
  }

  /**
   * Get chat member information
   * @param {number|string} chatId - Chat ID
   * @param {number} userId - User ID
   */
  async getChatMember(chatId, userId) {
    try {
      return await this.bot.api.getChatMember(chatId, userId);
    } catch (error) {
      logger.error(
        { event: 'get_chat_member_error', chatId, userId, error: error.message },
        '[TelegramClient] Failed to get chat member info'
      );
      throw error;
    }
  }

  /**
   * Stop the bot (graceful shutdown)
   */
  async stop() {
    try {
      await this.bot.stop();
      logger.info(
        { event: 'telegram_client_stopped' },
        '[TelegramClient] Telegram client stopped gracefully'
      );
    } catch (error) {
      logger.warn(
        { event: 'telegram_client_stop_error', error: error.message },
        '[TelegramClient] Error stopping Telegram client'
      );
    }
  }

  /**
   * Answer inline query (for inline bot functionality)
   * @param {string} inlineQueryId - Inline query ID
   * @param {array} results - Array of InlineQueryResult objects
   * @param {object} options - Additional options
   */
  async answerInlineQuery(inlineQueryId, results, options = {}) {
    try {
      await this.bot.api.answerInlineQuery(inlineQueryId, results, options);
      logger.debug(
        { event: 'inline_query_answered', inlineQueryId },
        '[TelegramClient] Inline query answered'
      );
    } catch (error) {
      logger.warn(
        { event: 'answer_inline_query_error', inlineQueryId, error: error.message },
        '[TelegramClient] Failed to answer inline query'
      );
      throw error;
    }
  }

  /**
   * Send callback query answer (for inline buttons)
   * @param {string} callbackQueryId - Callback query ID
   * @param {object} options - Answer options (text, alert, etc.)
   */
  async answerCallbackQuery(callbackQueryId, options = {}) {
    try {
      await this.bot.api.answerCallbackQuery(callbackQueryId, options);
      logger.debug(
        { event: 'callback_query_answered', callbackQueryId },
        '[TelegramClient] Callback query answered'
      );
    } catch (error) {
      logger.warn(
        { event: 'answer_callback_query_error', callbackQueryId, error: error.message },
        '[TelegramClient] Failed to answer callback query'
      );
      throw error;
    }
  }
}

// Create singleton instance
const telegramClient = new TelegramClient();

module.exports = telegramClient;
