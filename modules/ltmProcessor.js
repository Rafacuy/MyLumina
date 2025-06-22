// modules/ltmProcessor.js
const Groq = require("groq-sdk");
const config = require("../config/config");
const memory = require("../data/memory");
const pino = require("pino");
const Sentry = require("@sentry/node");

// Inisialisasi Sentry
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 1.0,
  });
}

// Inisialisasi logger
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "SYS:standard",
    },
  },
});

//  ---- Inilisiasi Groq API ----
const client = new Groq({ apiKey: config.groqApiKey });

// Cache untuk mengurangi pemanggilan berulang ke LLM
const ltmCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 jam

/**
 * Membersihkan cache secara berkala.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ltmCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      ltmCache.delete(key);
    }
  }
}, CACHE_TTL);

/**
 * Memproses teks untuk menentukan apakah layak disimpan sebagai LTM.
 * @param {string} text - Teks input dari pengguna.
 * @returns {Promise<Object>} Objek hasil analisis.
 */
async function processForLTM(text) {
  // Cek cache terlebih dahulu
  if (ltmCache.has(text)) {
    const cached = ltmCache.get(text);
    logger.debug(
      { event: "ltm_cache_hit", text },
      "LTM analysis result retrieved from cache."
    );
    return cached.data;
  }

  // Jika tidak ada di cache, proses dengan LLM
  try {
    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `
          Tugasmu adalah menganalisis pesan pengguna dan menentukan apakah pesan tersebut mengandung preferensi, kebiasaan, karakteristik diri, emosi berkelanjutan, atau fakta penting jangka panjang tentang pengguna. Abaikan komentar sementara, pertanyaan umum, atau ekspresi emosi sesaat.

          Jika informasinya relevan untuk disimpan sebagai memori jangka panjang, tentukan "should_save_preferences": true.
          Berikan "priorities_level" dari 1 hingga 100, di mana 100 adalah yang paling penting.
          Buat "query_preferences" sebagai ringkasan informasi tersebut dalam 1 kalimat pendek dan jelas, dalam bahasa Indonesia, fokus pada PENGGUNA. Jangan gunakan frasa seperti "User merasa...", langsung saja sebutkan preferensinya.

          Contoh:
          Kalimat: "Aku paling benci kalau hari senin, bikin males."
          Output: { "should_save_preferences": true, "priorities_level": 90, "query_preferences": "Pengguna benci hari Senin." }

          Kalimat: "Kok kamu baik banget sih?"
          Output: { "should_save_preferences": false, "priorities_level": 0, "query_preferences": "" }

          Kalimat: "Sekarang aku lagi ngerjain project AI namanya NebulaAI."
          Output: { "should_save_preferences": true, "priorities_level": 95, "query_preferences": "Pengguna sedang mengembangkan project AI bernama NebulaAI." }

          Tulis dalam format JSON.
          Kalimat: "${text}"
          `,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(content);
      console.log("[DEBUG] LTM Analysis Result:", result);
    } catch (parseError) {
      logger.error(
        { event: "ltm_json_parse_error", content },
        "Failed to parse LTM analysis result."
      );
      throw new Error("Invalid JSON response from LLM");
    }

    // Validasi hasil
    if (typeof result.should_save_preferences !== "boolean") {
      throw new Error("Invalid should_save_preferences value");
    }

    // Simpan ke cache
    ltmCache.set(text, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    logger.error(
      { event: "ltm_processing_error", error: error.message, text },
      "Error processing text for LTM:"
    );
    if (config.sentryDsn) {
      Sentry.captureException(error);
    }
    // Return default value in case of error
    return {
      should_save_preferences: false,
      priorities_level: 0,
      query_preferences: "",
    };
  }
}

/**
 * Menyimpan hasil analisis LTM ke dalam database.
 * @param {Object} analysisResult - Hasil dari processForLTM()
 * @param {string} originalText - Teks asli pengguna
 */
async function saveLTMResult(analysisResult, originalText) {
  if (!analysisResult.should_save_preferences) return;

  try {
    const ltmObject = {
      value: analysisResult.query_preferences,
      priority: analysisResult.priorities_level,
      source: originalText,
      createdAt: new Date().toISOString(),
    };

    // Simpan ke database SQLite
    await memory.savePreference(
      `ltm_${Date.now()}`,
      JSON.stringify(ltmObject)
    );

    logger.info(
      {
        event: "ltm_saved",
        priority: analysisResult.priorities_level,
        summary: analysisResult.query_preferences,
      },
      "LTM saved to database"
    );
  } catch (error) {
    logger.error(
      { event: "ltm_save_error", error: error.message },
      "Failed to save LTM to database"
    );
    Sentry.captureException(error);
  }
}

module.exports = {
  processForLTM,
  saveLTMResult,
};
