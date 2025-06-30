// handler/visionHandler.js

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const sharp = require("sharp");
const schedule = require("node-schedule");
const Groq = require("groq-sdk");
const config = require("../config/config");
const { sendMessage } = require("../utils/sendMessage");
const { LuminaTyping, Mood } = require("../handler/commandHandlers");
const logger = require('../utils/logger');
const Sentry = require("@sentry/node");

// Kunci API dari file konfigurasi
const OCR_SPACE_API_KEY = config.ocrSpaceApiKey;
const IMAGGA_API_KEY = config.imaggaApiKey;
const IMAGGA_API_SECRET = config.imaggaApiSecret;
const groq = new Groq({ apiKey: config.groqApiKey });

// Direktori untuk menyimpan gambar sementara
const IMAGE_DIR = path.join(__dirname, "..", "temp_images");
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

const filesToDelete = {};

/**
 * Mengunduh file dari URL.
 * @param {string} fileUrl - URL file.
 * @param {string} fileName - Nama file tujuan.
 * @returns {Promise<string>} Path file yang diunduh.
 */
const downloadFile = async (fileUrl, fileName) => {
    const filePath = path.join(IMAGE_DIR, fileName);
    try {
        const response = await axios({ method: "GET", url: fileUrl, responseType: "stream" });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on("finish", () => {
                logger.info({ event: "download_success", filePath }, `Gambar berhasil diunduh ke: ${filePath}`);
                resolve(filePath);
            });
            writer.on("error", (err) => {
                logger.error({ event: "download_error", error: err.message }, "Gagal mengunduh gambar.");
                Sentry.captureException(err);
                reject(err);
            });
        });
    } catch (error) {
        logger.error({ event: "download_file_exception", error: error.message }, "Kesalahan saat mengunduh file.");
        Sentry.captureException(error);
        throw error;
    }
};

/**
 * Mengkompres gambar.
 * @param {string} inputPath - Path gambar asli.
 * @param {string} outputPath - Path tujuan.
 * @returns {Promise<string>} Path gambar terkompresi.
 */
const compressImage = async (inputPath, outputPath) => {
    try {
        await sharp(inputPath).jpeg({ quality: 80 }).toFile(outputPath);
        logger.info({ event: "compress_success", outputPath }, `Gambar berhasil dikompres ke: ${outputPath}`);
        return outputPath;
    } catch (error) {
        logger.error({ event: "compress_error", inputPath, error: error.message }, "Gagal mengkompres gambar.");
        Sentry.captureException(error);
        throw error;
    }
};

/**
 * Melakukan OCR pada gambar menggunakan ocr.space.
 * @param {string} imagePath - Path gambar.
 * @returns {Promise<string>} Teks hasil OCR.
 */
const performOCR = async (imagePath) => {
    if (!OCR_SPACE_API_KEY) {
        logger.warn({ event: "ocr_api_key_missing" }, "Kunci API OCR.space tidak ditemukan.");
        return ""; // Kembalikan string kosong jika tidak ada API key
    }
    try {
        const formData = new FormData();
        formData.append("apikey", OCR_SPACE_API_KEY);
        formData.append("file", fs.createReadStream(imagePath));

        const response = await axios.post("https://api.ocr.space/parse/image", formData, {
            headers: formData.getHeaders(),
        });

        const ocrText = response.data.ParsedResults?.[0]?.ParsedText || "";
        logger.info({ event: "ocr_success" }, `OCR berhasil, teks ditemukan: ${ocrText.length > 0}`);
        return ocrText.trim();
    } catch (error) {
        logger.error({ event: "ocr_api_error", error: error.message }, "Kesalahan saat melakukan OCR.");
        Sentry.captureException(error);
        return ""; // Kembalikan string kosong jika error
    }
};

/**
 * Melakukan Image Recognition menggunakan Imagga.
 * @param {string} imagePath - Path gambar.
 * @returns {Promise<Array>} Daftar tags dari Imagga.
 */
const performImageRecognition = async (imagePath) => {
    if (!IMAGGA_API_KEY || !IMAGGA_API_SECRET) {
        logger.warn({ event: "imagga_api_key_missing" }, "Kunci API Imagga tidak ditemukan.");
        return [];
    }
    try {
        const credentials = Buffer.from(`${IMAGGA_API_KEY}:${IMAGGA_API_SECRET}`).toString("base64");
        const formData = new FormData();
        formData.append("image", fs.createReadStream(imagePath));

        const response = await axios.post("https://api.imagga.com/v2/tags", formData, {
            headers: {
                Authorization: `Basic ${credentials}`,
                ...formData.getHeaders(),
            },
        });

        const tags = response.data.result?.tags || [];
        logger.info({ event: "imagga_success", tagCount: tags.length }, "Image recognition berhasil.");
        return tags;
    } catch (error) {
        logger.error({ event: "imagga_api_error", error: error.message }, "Kesalahan saat image recognition.");
        Sentry.captureException(error);
        return [];
    }
};

/**
 * Membuat deskripsi akhir yang disimpulkan oleh AI.
 * @param {string} ocrText - Teks dari OCR.
 * @param {Array} tags - Daftar tags dari Imagga.
 * @returns {Promise<string>} Deskripsi gambar yang telah disimpulkan.
 */
const createFinalDescription = async (ocrText, tags) => {
    if (!ocrText && tags.length === 0) {
        return "Tidak ada yang bisa dideskripsikan dari gambar ini.";
    }

    // Cari tag dengan confidence tertinggi
    const topTag = tags.reduce((prev, current) => (prev.confidence > current.confidence) ? prev : current, { confidence: 0, tag: { en: '' } });

    let contextForAI = "Informasi dari gambar:\n";
    if (ocrText) {
        contextForAI += `- Teks yang terbaca: "${ocrText}"\n`;
    }
    if (topTag.tag.en) {
        contextForAI += `- Objek utama yang terdeteksi: "${topTag.tag.en}"\n`;
    }

    logger.info({ event: "create_final_description_start" }, "Membuat deskripsi final dengan Groq...");
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{
                role: "system",
                content: "Kamu adalah asisten yang tugasnya membuat deskripsi gambar yang sangat singkat, padat, dan jelas (cukup satu kalimat) berdasarkan data analisis yang diberikan. Fokus pada inti dari gambar tersebut."
            }, {
                role: "user",
                content: `Buatkan satu kalimat deskripsi natural dari analisis gambar berikut:\n${contextForAI}`
            }],
            model: "llama3-8b-8192", // Gunakan model yang lebih cepat untuk tugas sederhana
            temperature: 0.5,
            max_tokens: 100,
        });

        const finalDescription = chatCompletion.choices[0]?.message?.content || "Tidak dapat membuat deskripsi.";
        logger.info({ event: "create_final_description_success" }, "Deskripsi final berhasil dibuat.");
        return finalDescription.trim();
    } catch (error) {
        logger.error({ event: "create_final_description_error", error: error.message }, "Gagal membuat deskripsi final.");
        Sentry.captureException(error);
        return "Deskripsi tidak tersedia karena kesalahan internal.";
    }
};

/**
 * Menjadwalkan penghapusan file.
 */
const scheduleFileDeletion = (filePath, delayMs = 30 * 60 * 1000) => {
    const fileName = path.basename(filePath);
    if (filesToDelete[fileName]?.scheduledJob) {
        filesToDelete[fileName].scheduledJob.cancel();
    }
    const job = schedule.scheduleJob(Date.now() + delayMs, () => {
        fs.unlink(filePath, (err) => {
            if (err) {
                logger.error({ event: "file_deletion_error", filePath, error: err.message }, `Gagal menghapus file: ${filePath}`);
                Sentry.captureException(err);
            } else {
                logger.info({ event: "file_deleted", filePath }, `File berhasil dihapus: ${filePath}`);
                delete filesToDelete[fileName];
            }
        });
    });
    filesToDelete[fileName] = { filePath, scheduledJob: job };
};

/**
 * Handler utama untuk permintaan visi.
 * @param {string} fileUrl - URL gambar.
 * @param {string} chatId - ID chat.
 * @returns {Promise<{description: string|null}>} Objek berisi deskripsi final.
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

        // Lakukan OCR dan Image Recognition secara paralel
        const [ocrResult, recognitionResult] = await Promise.all([
            performOCR(compressedFilePath),
            performImageRecognition(compressedFilePath),
        ]);

        // Buat deskripsi final yang disimpulkan oleh AI
        const finalDescription = await createFinalDescription(ocrResult, recognitionResult);

        // Jadwalkan penghapusan file
        scheduleFileDeletion(downloadedFilePath);
        scheduleFileDeletion(compressedFilePath);
        
        // Kembalikan hasilnya sebagai objek untuk diproses di core.js
        return { description: finalDescription };

    } catch (error) {
        logger.error({ event: "handle_vision_request_error", error: error.message }, "Kesalahan dalam menangani permintaan visi.");
        Sentry.captureException(error);
        await sendMessage(chatId, `Maaf, Tuan. Lumina tidak bisa memproses gambar itu. ${Mood.SAD.emoji}`);
        
        if (downloadedFilePath) scheduleFileDeletion(downloadedFilePath, 1000);
        if (compressedFilePath) scheduleFileDeletion(compressedFilePath, 1000);

        return { description: null };
    }
};

module.exports = {
    handleVisionRequest,
};
