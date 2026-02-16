// handler/visionHandler.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const sharp = require('sharp');
const schedule = require('node-schedule');
const Groq = require('groq-sdk');
const config = require('../config/config');
const { sendMessage } = require('../utils/sendMessage');
const { LuminaTyping, Mood } = require('../handler/commandHandlers');
const logger = require('../utils/logger');
const Sentry = require('@sentry/node');

// API Keys from configuration file
const OCR_SPACE_API_KEY = config.ocrSpaceApiKey;
const IMAGGA_API_KEY = config.imaggaApiKey;
const IMAGGA_API_SECRET = config.imaggaApiSecret;
const groq = new Groq({ apiKey: config.groqApiKey });

// Directory to store temporary images
const IMAGE_DIR = path.join(__dirname, '..', 'temp_images');
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

const filesToDelete = {};

/**
 * Downloads a file from a URL.
 * @param {string} fileUrl - File URL.
 * @param {string} fileName - Destination file name.
 * @returns {Promise<string>} Path of the downloaded file.
 */
const downloadFile = async (fileUrl, fileName) => {
    const filePath = path.join(IMAGE_DIR, fileName);
    try {
        const response = await axios({ method: 'GET', url: fileUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                logger.info({ event: 'download_success', filePath }, `Image successfully downloaded to: ${filePath}`);
                resolve(filePath);
            });
            writer.on('error', (err) => {
                logger.error({ event: 'download_error', error: err.message }, 'Failed to download image.');
                Sentry.captureException(err);
                reject(err);
            });
        });
    } catch (error) {
        logger.error({ event: 'download_file_exception', error: error.message }, 'Error downloading file.');
        Sentry.captureException(error);
        throw error;
    }
};

/**
 * Compresses an image.
 * @param {string} inputPath - Original image path.
 * @param {string} outputPath - Destination path.
 * @returns {Promise<string>} Compressed image path.
 */
const compressImage = async (inputPath, outputPath) => {
    try {
        await sharp(inputPath).jpeg({ quality: 80 }).toFile(outputPath);
        logger.info({ event: 'compress_success', outputPath }, `Image successfully compressed to: ${outputPath}`);
        return outputPath;
    } catch (error) {
        logger.error({ event: 'compress_error', inputPath, error: error.message }, 'Failed to compress image.');
        Sentry.captureException(error);
        throw error;
    }
};

/**
 * Performs OCR on an image using ocr.space.
 * @param {string} imagePath - Image path.
 * @returns {Promise<string>} OCR result text.
 */
const performOCR = async (imagePath) => {
    if (!OCR_SPACE_API_KEY) {
        logger.warn({ event: 'ocr_api_key_missing' }, 'OCR.space API key not found.');
        return ''; // Return empty string if no API key
    }
    try {
        const formData = new FormData();
        formData.append('apikey', OCR_SPACE_API_KEY);
        formData.append('file', fs.createReadStream(imagePath));

        const response = await axios.post('https://api.ocr.space/parse/image', formData, {
            headers: formData.getHeaders(),
        });

        const ocrText = response.data.ParsedResults?.[0]?.ParsedText || '';
        logger.info({ event: 'ocr_success' }, `OCR successful, text found: ${ocrText.length > 0}`);
        return ocrText.trim();
    } catch (error) {
        logger.error({ event: 'ocr_api_error', error: error.message }, 'Error performing OCR.');
        Sentry.captureException(error);
        return ''; // Return empty string if error
    }
};

/**
 * Performs Image Recognition using Imagga.
 * @param {string} imagePath - Image path.
 * @returns {Promise<Array>} List of tags from Imagga.
 */
const performImageRecognition = async (imagePath) => {
    if (!IMAGGA_API_KEY || !IMAGGA_API_SECRET) {
        logger.warn({ event: 'imagga_api_key_missing' }, 'Imagga API keys not found.');
        return [];
    }
    try {
        const credentials = Buffer.from(`${IMAGGA_API_KEY}:${IMAGGA_API_SECRET}`).toString('base64');
        const formData = new FormData();
        formData.append('image', fs.createReadStream(imagePath));

        const response = await axios.post('https://api.imagga.com/v2/tags', formData, {
            headers: {
                Authorization: `Basic ${credentials}`,
                ...formData.getHeaders(),
            },
        });

        const tags = response.data.result?.tags || [];
        logger.info({ event: 'imagga_success', tagCount: tags.length }, 'Image recognition successful.');
        return tags;
    } catch (error) {
        logger.error({ event: 'imagga_api_error', error: error.message }, 'Error during image recognition.');
        Sentry.captureException(error);
        return [];
    }
};

/**
 * Generates a final description concluded by AI.
 * @param {string} ocrText - Text from OCR.
 * @param {Array} tags - List of tags from Imagga.
 * @returns {Promise<string>} Concluded image description.
 */
const createFinalDescription = async (ocrText, tags) => {
    if (!ocrText && tags.length === 0) {
        return 'Nothing could be described from this image.';
    }

    // Find the tag with the highest confidence
    const topTag = tags.reduce((prev, current) => (prev.confidence > current.confidence ? prev : current), {
        confidence: 0,
        tag: { en: '' },
    });

    let contextForAI = 'Information from the image:\n';
    if (ocrText) {
        contextForAI += `- Read text: "${ocrText}"\n`;
    }
    if (topTag.tag.en) {
        contextForAI += `- Main object detected: "${topTag.tag.en}"\n`;
    }

    logger.info({ event: 'create_final_description_start' }, 'Generating final description with Groq...');
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content:
                        'You are an assistant whose task is to create a very short, concise, and clear image description (one sentence only) based on the provided analysis data. Focus on the core of the image.',
                },
                {
                    role: 'user',
                    content: `Create a natural one-sentence description from the following image analysis:\n${contextForAI}`,
                },
            ],
            model: 'llama3-8b-8192', // Use a faster model for simple tasks
            temperature: 0.5,
            max_tokens: 100,
        });

        const finalDescription = chatCompletion.choices[0]?.message?.content || 'Unable to create description.';
        logger.info({ event: 'create_final_description_success' }, 'Final description successfully created.');
        return finalDescription.trim();
    } catch (error) {
        logger.error(
            { event: 'create_final_description_error', error: error.message },
            'Failed to generate final description.',
        );
        Sentry.captureException(error);
        return 'Description unavailable due to an internal error.';
    }
};

/**
 * Schedules file deletion.
 */
const scheduleFileDeletion = (filePath, delayMs = 30 * 60 * 1000) => {
    const fileName = path.basename(filePath);
    if (filesToDelete[fileName]?.scheduledJob) {
        filesToDelete[fileName].scheduledJob.cancel();
    }
    const job = schedule.scheduleJob(Date.now() + delayMs, () => {
        fs.unlink(filePath, (err) => {
            if (err) {
                logger.error(
                    { event: 'file_deletion_error', filePath, error: err.message },
                    `Failed to delete file: ${filePath}`,
                );
                Sentry.captureException(err);
            } else {
                logger.info({ event: 'file_deleted', filePath }, `File successfully deleted: ${filePath}`);
                delete filesToDelete[fileName];
            }
        });
    });
    filesToDelete[fileName] = { filePath, scheduledJob: job };
};

/**
 * Main handler for vision requests.
 * @param {string} fileUrl - Image URL.
 * @param {string} chatId - Chat ID.
 * @returns {Promise<{description: string|null}>} Object containing the final description.
 */
const handleVisionRequest = async (fileUrl, chatId) => {
    await LuminaTyping(chatId);

    const originalFileName = `${Date.now()}_original.jpg`;
    const compressedFileName = `${Date.now()}_compressed.jpg`;
    let downloadedFilePath = null;
    let compressedFilePath = null;

    try {
        downloadedFilePath = await downloadFile(fileUrl, originalFileName);
        compressedFilePath = await compressImage(downloadedFilePath, path.join(IMAGE_DIR, compressedFileName));

        // Perform OCR and Image Recognition in parallel
        const [ocrResult, recognitionResult] = await Promise.all([
            performOCR(compressedFilePath),
            performImageRecognition(compressedFilePath),
        ]);

        // Create a final description concluded by AI
        const finalDescription = await createFinalDescription(ocrResult, recognitionResult);

        // Schedule file deletion
        scheduleFileDeletion(downloadedFilePath);
        scheduleFileDeletion(compressedFilePath);

        // Return the result as an object to be processed in core.js
        return { description: finalDescription };
    } catch (error) {
        logger.error(
            { event: 'handle_vision_request_error', error: error.message },
            'Error handling vision request.',
        );
        Sentry.captureException(error);
        await sendMessage(chatId, `Sorry, Master. Lumina cannot process that image. ${Mood.SAD.emoji}`);

        if (downloadedFilePath) {
            scheduleFileDeletion(downloadedFilePath, 1000);
        }
        if (compressedFilePath) {
            scheduleFileDeletion(compressedFilePath, 1000);
        }

        return { description: null };
    }
};

module.exports = {
    handleVisionRequest,
};