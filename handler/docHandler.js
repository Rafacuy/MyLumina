// handler/docHandler.js

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const Sentry = require('@sentry/node');

const { sendMessage } = require('../utils/sendMessage');
const documentReader = require('../modules/documentReader');
const logger = require('../utils/logger');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
const MAX_FILE_SIZE_TELEGRAM = 5 * 1024 * 1024; // 5 MB, batas awal sebelum download

/**
 * Memastikan direktori sementara ada.
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
 * Menangani pesan masuk yang berisi dokumen.
 * @param {object} msg - Objek pesan dari node-telegram-bot-api.
 * @param {object} bot - Instance bot Telegram.
 * @param {object} aiDependencies - Objek yang berisi dependensi AI dari core.js.
 */
async function handleDocument(msg, bot, aiDependencies) {
    const chatId = msg.chat.id;
    const doc = msg.document;

    if (!doc) {
        return; // Bukan pesan dokumen
    }
    
    logger.info({ event: 'document_received', chatId, file_id: doc.file_id, file_name: doc.file_name }, 'Document message received.');

    // Validasi awal ukuran file sebelum download
    if (doc.file_size > MAX_FILE_SIZE_TELEGRAM) {
        sendMessage(chatId, 'Maaf, ukuran file terlalu besar. Ukuran maksimal yang diizinkan adalah 5MB.');
        logger.warn({ event: 'file_size_exceeded', size: doc.file_size }, 'File size validation failed before download.');
        return;
    }
    
    let tempFilePath = '';
    
    try {
        await ensureTempDir();
        await sendMessage(chatId, `Membaca file "${doc.file_name}"... Mohon tunggu sebentar ya, Tuan.`);

        // Download file
        const fileLink = await bot.getFileLink(doc.file_id);
        const randomFileName = `${crypto.randomBytes(16).toString('hex')}${path.extname(doc.file_name || '.tmp')}`;
        tempFilePath = path.join(TEMP_DIR, randomFileName);

        const response = await axios({
            url: fileLink,
            method: 'GET',
            responseType: 'stream'
        });

        const writer = require('fs').createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        logger.info({ event: 'file_download_success', path: tempFilePath }, 'File downloaded successfully.');

        // Proses dan rangkum dokumen, teruskan dependensi AI
        const summary = await documentReader.summarizeDocument(tempFilePath, msg, aiDependencies);

        // Kirim hasil rangkuman
        // Rangkuman sudah dalam format respons dari AI, jadi kita bisa kirim langsung
        await sendMessage(chatId, summary);

    } catch (error) {
        logger.error({ event: 'document_handling_error', error: error.message, stack: error.stack }, 'Failed to handle document.');
        Sentry.captureException(error);
        
        let userMessage = 'Maaf Tuan, terjadi kesalahan saat memproses dokumen Anda.';
        if (error.message.includes('Unsupported file type')) {
            userMessage = `Maaf, format file "${path.extname(doc.file_name)}" tidak didukung saat ini.`;
        } else if (error.message.includes('exceeds the 5MB limit')) {
            userMessage = 'Maaf, ukuran file melebihi batas 5MB.';
        }

        await sendMessage(chatId, userMessage);
    }
    // File deletion sudah dihandle di dalam documentReader via `finally` block
}

module.exports = { handleDocument };
