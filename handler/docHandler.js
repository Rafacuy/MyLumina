// handler/docHandler.js
// Handles incoming document messages from Telegram. It downloads the file,
// processes it using a document reader module, and sends back a summary.

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Sentry = require('@sentry/node');

const { sendMessage } = require('../utils/sendMessage');
const telegramClient = require('../utils/telegramClient');
const documentReader = require('../modules/documentReader');
const logger = require('../utils/logger');

// --- Constants ---
const TEMP_DIR = path.join(__dirname, '..', 'temp_images');
const MAX_FILE_SIZE_TELEGRAM = 5 * 1024 * 1024; // 5 MB, initial limit before download.

/**
 * Ensures that the temporary directory for storing downloaded files exists.
 * Creates the directory if it doesn't already exist.
 * @throws {Error} If the directory cannot be created.
 */
async function ensureTempDir() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
        logger.error({ event: 'temp_dir_creation_error', error: error.message }, 'Failed to create temp directory.');
        Sentry.captureException(error);
        throw new Error('Could not create temporary directory for file processing.');
    }
}

/**
 * Handles an incoming message containing a document.
 * @param {object} msg - The message object from Telegram (grammY context format).
 * @param {object} aiDependencies - An object containing AI dependencies from core.js, passed to the document reader.
 */
async function handleDocument(msg, aiDependencies) {
    const chatId = msg.chat.id;
    const doc = msg.document;

    // Guard clause: exit if the message is not a document.
    if (!doc) {
        return;
    }

    logger.info(
        { event: 'document_received', chatId, file_id: doc.file_id, file_name: doc.file_name },
        'Document message received.',
    );

    // Initial validation of file size before attempting to download.
    // This prevents wasting bandwidth on files that are too large.
    if (doc.file_size && doc.file_size > MAX_FILE_SIZE_TELEGRAM) {
        await sendMessage(
            chatId,
            'Buset, Ukuran file-nya terlalu besar, aku tidak bisa menganalisisnya. Maksimum 5MB ukuran dokumen.',
        );
        logger.warn(
            { event: 'file_size_exceeded', size: doc.file_size },
            'File size validation failed before download.',
        );
        return;
    }

    let tempFilePath = '';

    try {
        await ensureTempDir();
        await sendMessage(chatId, `Membaca file "${doc.file_name}"... Tunggu bentar yaa...`);

        // --- File Download ---
        // Get file link from Telegram using grammY client
        const fileInfo = await telegramClient.getFileLink(doc.file_id);
        const downloadUrl = fileInfo.downloadUrl;

        // Generate a random file name to avoid naming conflicts.
        const randomFileName = `${crypto.randomBytes(16).toString('hex')}${path.extname(doc.file_name || '.tmp')}`;
        tempFilePath = path.join(TEMP_DIR, randomFileName);

        // Download file using telegramClient method
        await telegramClient.downloadFile(downloadUrl, tempFilePath);

        logger.info({ event: 'file_download_success', path: tempFilePath }, 'File downloaded successfully.');

        // --- Document Processing ---
        // Pass the file path and AI dependencies to the summarizer module.
        // This keeps the document handling logic separate from the processing logic.
        const summary = await documentReader.summarizeDocument(tempFilePath, msg, aiDependencies);

        // Send the summary result back to the user.
        await sendMessage(chatId, summary);
    } catch (error) {
        logger.error(
            { event: 'document_handling_error', error: error.message, stack: error.stack },
            'Failed to handle document.',
        );
        Sentry.captureException(error);

        // Provide a user-friendly error message based on the error type.
        let userMessage = 'Oops, Ada kesalahan saat menganalisis dokumen. Mohon coba lagi nanti.';
        if (error.message.includes('Unsupported file type')) {
            userMessage = `Hmm.. Format file"${path.extname(doc.file_name)}" masih belum didukung.`;
        } else if (error.message.includes('exceeds the 5MB limit')) {
            userMessage = 'Maaf, batas size dokumen hanya 5MB.';
        }

        await sendMessage(chatId, userMessage);
    } finally {
        // Cleanup temporary file
        if (tempFilePath) {
            try {
                await fs.unlink(tempFilePath);
                logger.debug({ event: 'temp_file_deleted', path: tempFilePath }, 'Temporary file cleaned up.');
            } catch (cleanupError) {
                logger.warn(
                    { event: 'temp_file_cleanup_error', path: tempFilePath, error: cleanupError.message },
                    'Failed to cleanup temporary file.',
                );
            }
        }
    }
}

module.exports = { handleDocument };
