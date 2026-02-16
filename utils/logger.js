/**
 * logger.js - Application Logging Utility
 *
 * This module provides a centralized logging system using Pino, a high-performance
 * JSON logger. It configures structured logging with pretty-printing for development
 * and can be easily adapted for production JSON logging.
 *
 * Features:
 * - Structured JSON logging with customizable levels
 * - Pretty-printing with colors for development environments
 * - Automatic timestamp formatting
 * - Configurable log levels (trace, debug, info, warn, error, fatal)
 * - Async logging for better performance
 *
 * Log Levels:
 * - trace: Detailed debugging information
 * - debug: Development debugging
 * - info: General operational information
 * - warn: Warning conditions
 * - error: Error conditions
 * - fatal: System-critical errors
 *
 * @module utils/logger
 * @requires pino
 * @requires pino-pretty
 */

const pino = require('pino');

/**
 * Pino logger instance with custom configuration.
 *
 * Configuration:
 * - level: 'info' (change to 'debug' for more verbose logging)
 * - base: Excludes pid from log output
 * - transport: Uses pino-pretty for human-readable format
 * - options: Colorized output, custom timestamp format
 *
 * @constant {object}
 * @see https://getpino.io/#/docs/api
 */
const logger = pino({
    level: 'info',
    base: { pid: false }, // Hilangkan pid dari log
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
            sync: false, // Gunakan async untuk kinerja lebih baik
        },
    },
});

module.exports = logger;
