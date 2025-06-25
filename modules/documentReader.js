// modules/documentReader.js

const fs = require('fs').promises;
const path = require('path');
const Groq = require('groq-sdk');
const Sentry = require('@sentry/node');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const logger = require('../utils/logger'); 
const config = require('../config/config');

// Inisialisasi Groq Client
const groq = new Groq({ apiKey: config.groqApiKey });

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_LENGTH = 15000; // Batas karakter untuk dikirim ke AI, mencegah token limit
const SUSPICIOUS_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.py', '.msi', '.dll', '.vbs'];

/**
 * Merangkum teks menggunakan Groq AI.
 * @param {string} text - Teks yang akan diringkas.
 * @returns {Promise<string>} - Rangkuman dari AI.
 */
async function summarizeWithAI(text) {
    logger.info({ event: 'summarization_start' }, 'Sending text to Groq for summarization.');
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Anda adalah asisten AI yang ahli dalam merangkum dokumen. Tugas Anda adalah membaca teks yang diberikan dan membuat rangkuman yang jelas, ringkas, dan mudah dipahami dalam format poin-poin utama (bullet points) dalam Bahasa Indonesia. Fokus pada ide-ide kunci dan informasi terpenting.'
                },
                {
                    role: 'user',
                    content: `Berikut adalah teks dari sebuah dokumen. Tolong buatkan rangkumannya:\n\n---\n\n${text}`
                }
            ],
            model: 'llama-3.1-8b-instant', 
            temperature: 0.5,
            max_tokens: 1024,
        });

        const summary = chatCompletion.choices[0]?.message?.content || 'Tidak dapat menghasilkan rangkuman.';
        logger.info({ event: 'summarization_success' }, 'Successfully received summary from Groq.');
        return summary;

    } catch (error) {
        logger.error({ event: 'summarization_error', error: error.message, stack: error.stack }, 'Error during summarization with Groq.');
        Sentry.captureException(error);
        throw new Error('Gagal saat berkomunikasi dengan AI untuk merangkum teks.');
    }
}

/**
 * Membaca file, mengekstrak teksnya, dan mengembalikannya untuk dirangkum.
 * @param {string} filePath - Path menuju file yang akan diproses.
 * @returns {Promise<string>} Rangkuman dokumen.
 */
async function summarizeDocument(filePath) {
    try {
        const stats = await fs.stat(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        // Security Check file Extension & Size
        if (SUSPICIOUS_EXTENSIONS.includes(fileExt)) {
            throw new Error(`File type ${fileExt} is not allowed for security reasons.`);
        }
        if (stats.size > MAX_FILE_SIZE) {
            throw new Error(`File size ${stats.size} exceeds the 5MB limit.`);
        }

        logger.info({ event: 'file_processing_start', file: filePath, size: stats.size }, 'Starting document processing.');

        // Ekstrak Teks berdasarkan Tipe File
        let text = '';
        switch (fileExt) {
            case '.pdf':
                const dataBuffer = await fs.readFile(filePath);
                const data = await pdf(dataBuffer);
                text = data.text;
                break;
            case '.docx':
                const docxResult = await mammoth.extractRawText({ path: filePath });
                text = docxResult.value;
                break;
            case '.txt':
            case '.csv':
            case '.md': 
                text = await fs.readFile(filePath, 'utf-8');
                break;
            default:
                throw new Error(`Unsupported file type: ${fileExt}`);
        }

        logger.info({ event: 'text_extraction_success', length: text.length }, 'Text extracted successfully.');

        // Potong Teks jika terlalu panjang
        let processedText = text;
        if (text.length > MAX_TEXT_LENGTH) {
            processedText = text.substring(0, MAX_TEXT_LENGTH) + "\n\n[...teks dipotong karena terlalu panjang...]";
            logger.warn({ event: 'text_truncated', original: text.length, new: processedText.length }, 'Text truncated due to length limit.');
        }

        // Kirim ke AI untuk dirangkum
        const summary = await summarizeWithAI(processedText);
        return summary;

    } catch (error) {
        logger.error({ event: 'document_processing_error', error: error.message, stack: error.stack }, 'An error occurred in summarizeDocument.');
        Sentry.captureException(error);
        // Melempar error lagi agar bisa ditangkap oleh handler
        throw error;
    } finally {
        // Auto-delete file
        try {
            await fs.unlink(filePath);
            logger.info({ event: 'file_cleanup_success', file: filePath }, 'Temporary file deleted successfully.');
        } catch (unlinkError) {
            logger.error({ event: 'file_cleanup_error', error: unlinkError.message, file: filePath }, 'Failed to delete temporary file.');
            Sentry.captureException(unlinkError);
        }
    }
}

module.exports = { summarizeDocument };
