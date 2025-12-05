// utils/pollingErrorHandler.js
// Error handling for grammY bot long-polling and API errors

const logger = require('./logger');
const Sentry = require('@sentry/node');

/**
 * Determines if an error from grammY should be considered critical
 * @param {Error} error - Error from grammY bot or Telegram API
 * @returns {boolean} - true if error is critical and should be reported
 */
function isCriticalPollingError(error) {
  if (!error) return true;

  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toUpperCase() || '';

  // List of temporary network errors that shouldn't be reported as critical
  const temporaryErrors = [
    'ENOTFOUND',      // DNS lookup failed
    'ECONNABORTED',   // Connection aborted
    'ECONNRESET',     // Connection reset
    'ETIMEDOUT',      // Request timeout
    'EAI_AGAIN',      // DNS temporary failure
    'EHOSTUNREACH',   // Host unreachable
    'ENETUNREACH',    // Network unreachable
    'ECONNREFUSED',   // Connection refused (usually temporary)
  ];

  // If error code matches temporary error list, not critical
  if (temporaryErrors.includes(errorCode)) {
    return false;
  }

  // Check message content for temporary error patterns
  const tempMessages = [
    'timeout',
    'network error',
    'connection',
    'econnrefused',
    'enotfound',
    'abort',
    'temporary',
    'unavailable'
  ];

  if (tempMessages.some(msg => errorMessage.includes(msg))) {
    return false;
  }

  // Check for grammY-specific error codes (4xx, 5xx from Telegram API)
  if (error.error_code) {
    // 429 = Too many requests (temporary)
    // 500+ = Server errors (often temporary)
    if (error.error_code === 429 || error.error_code >= 500) {
      return false;
    }
  }

  // If we can't determine, assume it's critical
  return true;
}

/**
 * Handle polling/API errors from grammY bot
 * @param {Error} error - Error from bot.start() or API call
 * @param {object} logger - Logger instance
 */
function handlePollingError(error) {
  logger.error(
    {
      event: 'polling_error_handler',
      code: error.code || 'unknown',
      message: error.message || 'no message',
      stack: error.stack,
      errorCode: error.error_code,
    },
    '[Polling Handler] Polling error occurred'
  );

  // Only report to Sentry if error is critical
  if (isCriticalPollingError(error)) {
    logger.info('[Sentry] Critical polling error captured to Sentry');
    Sentry.captureException(error);
  } else {
    logger.warn(
      { event: 'temporary_network_error' },
      '[Polling Handler] Temporary network error, not reporting to Sentry'
    );
  }
}

/**
 * Set up global error handler for unhandled rejections
 * Useful for catching uncaught promise rejections in grammY middleware
 */
function setupGlobalErrorHandlers() {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(
      {
        event: 'unhandled_rejection',
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
      '[Global Handler] Unhandled promise rejection'
    );

    if (reason instanceof Error && isCriticalPollingError(reason)) {
      Sentry.captureException(reason);
    }
  });

  process.on('uncaughtException', (error) => {
    logger.error(
      {
        event: 'uncaught_exception',
        message: error.message,
        stack: error.stack,
      },
      '[Global Handler] Uncaught exception'
    );

    Sentry.captureException(error);
    // Process will exit after this
  });
}

module.exports = {
  isCriticalPollingError,
  handlePollingError,
  setupGlobalErrorHandlers,
};