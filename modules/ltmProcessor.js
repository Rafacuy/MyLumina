// modules/ltmProcessor.js
const Groq = require("groq-sdk");
const config = require("../config/config");
const memory = require("../data/memory");
const Sentry = require("@sentry/node");
const logger = require("../utils/logger");

const CONVERSATION_HISTORY_LIMIT = 3;

//  ---- Groq API ----
const client = new Groq({ apiKey: config.groqApiKey });

// --- Cache Management ---
// Cache untuk mengurangi pemanggilan berulang ke LLM atau Regex
const ltmCache = new Map();
const MAX_LTM_CACHE_SIZE = 1000; // Menetapkan batas maksimal cache

/**
 * Menambahkan data ke cache dengan manajemen ukuran.
 * Jika cache penuh, entri tertua akan dihapus.
 * @param {string} key - Kunci cache (teks input).
 * @param {Object} data - Data hasil analisis untuk disimpan.
 */
function addToLtmCache(key, data) {
  if (ltmCache.size >= MAX_LTM_CACHE_SIZE) {
    // Hapus entri pertama (tertua) jika cache sudah penuh
    const oldestKey = ltmCache.keys().next().value;
    ltmCache.delete(oldestKey);
    logger.info(
      { event: "ltm_cache_purged", key: oldestKey },
      "Oldest LTM cache entry purged."
    );
  }
  ltmCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Mendeteksi preferensi umum menggunakan Regex.
 * Jika pola cocok, fungsi ini akan mengembalikan struktur data yang sama dengan output AI.
 * @param {string} text - Teks input dari pengguna.
 * @returns {Promise<Object|null>} Objek hasil analisis jika cocok, atau null jika tidak.
 */
async function detectWithRegex(text) {
  const patterns = [
    // Pola untuk preferensi (suka/benci) atau kebiasaan (selalu/sering)
    {
      pattern: /aku\s+(suka|benci|selalu|sering)\s+(.+)/i,
      priority: 80,
      formatter: (match) => `Pengguna ${match[1]} ${match[2]}.`,
    },
    // Pola untuk aktivitas yang sedang/sudah berlangsung
    {
      pattern: /aku\s+(lagi|sedang|sudah|baru saja)\s+(.+)/i,
      priority: 83,
      formatter: (match) =>
        `Pengguna sedang mengerjakan atau telah menyelesaikan: ${match[2]}.`,
    },
    // Pola untuk fakta personal (nama, asal, pekerjaan)
    {
      pattern: /nama\s+aku\s+adalah\s+(.+)/i,
      priority: 98,
      formatter: (match) => `Nama pengguna adalah ${match[1]}.`,
    },
    {
      pattern: /aku\s+tinggal\s+di\s+(.+)/i,
      priority: 95,
      formatter: (match) => `Pengguna tinggal di ${match[1]}.`,
    },
  ];

  for (const { pattern, priority, formatter } of patterns) {
    const match = text.match(pattern);
    if (match) {
      const query_preferences = formatter(match);
      logger.info(
        { event: "ltm_regex_hit", pattern: pattern.source },
        "LTM preference detected via Regex."
      );
      return {
        should_save_preferences: true,
        priorities_level: priority,
        query_preferences,
      };
    }
  }

  // Jika tidak ada pola yang cocok
  return null;
}

/**
 * Memproses teks untuk menentukan apakah layak disimpan sebagai LTM.
 * Menggunakan sistem hybrid, Regex (fast-path) lalu AI (slow-path).
 * @param {string} text - Teks input dari pengguna.
 * @returns {Promise<Object>} Objek hasil analisis.
 */
async function processForLTM(text) {
  // Cek cache terlebih dahulu
  if (ltmCache.has(text)) {
    logger.debug(
      { event: "ltm_cache_hit", text },
      "LTM analysis result retrieved from cache."
    );
    return ltmCache.get(text).data;
  }

  // Coba deteksi dengan Regex
  const regexResult = await detectWithRegex(text);
  if (regexResult) {
    // Jika Regex berhasil, simpan ke cache dan kembalikan hasilnya
    addToLtmCache(text, regexResult);
    return regexResult;
  }

  // Jika Regex gagal, lanjutkan ke AI
  logger.info(
    { event: "ltm_ai_fallback", text },
    "Regex did not match, falling back to AI processing."
  );

  try {
    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `
          You are the “Long-Term Memory (LTM) gatekeeper” for MyLumina, the Indonesian-language Telegram assistant.
          Your task is 100% pure: DECIDE whether a user's sentence contains facts, preferences, or habits that will STILL BE RELEVANT 30 days from now.
          
          STRONG RULES:
          1. Ignore fleeting expressions like “gabut,” “bosan,” “capek,” “laper,” “pengen tidur,” “lagi malas.”
          2. Ignore questions, short feedback, or insults without context.
          3. Ignore emoji-only or sentences less than 4 words.
          4. Save only if the information is permanent: name, address, job, hobbies, favorite food, fears, life goals, etc.
          5. Priority 1-100; use ≥ 80 only for important personal facts (name, birthplace, beliefs).
          6. If in doubt, even 1%, return should_save_preferences = false.
          
          Reject example:
          - "I'm bored, dude" → false
          - "I'm busy" → false
          - "Why are you taking so long to reply?" → false
          
          Accept example:
          - "My name is Rizky, but you can just call me Riz." → true, priority 98
          - "I'm allergic to peanuts." → true, priority 90
          - "Every weekend I play badminton with my office friends." → true, priority 75
          
          Required JSON output without comments:
          {
            "should_save_preferences":boolean,
            "priorities_level":number,
            "query_preferences":"Short sentence, max 8 words"
          }
          
          Sentence: ${text}
            `,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 200,
      temperature: 0.6,
    });

    const content = response.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      logger.error(
        { event: "ltm_json_parse_error", content },
        "Failed to parse LTM analysis result from AI."
      );
      throw new Error("Invalid JSON response from LLM");
    }

    // Validasi hasil dari AI
    if (typeof result.should_save_preferences !== "boolean") {
      throw new Error("Invalid should_save_preferences value from AI");
    }

    // Simpan hasil AI ke cache
    addToLtmCache(text, result);

    return result;
  } catch (error) {
    logger.error(
      { event: "ltm_processing_error", error: error.message, text },
      "Error processing text for LTM with AI:"
    );
    if (config.sentryDsn) {
      Sentry.captureException(error);
    }
    // Kembalikan nilai default jika terjadi error
    return {
      should_save_preferences: false,
      priorities_level: 0,
      query_preferences: "",
    };
  }
}

/**
 * Menyimpan hasil analisis LTM ke dalam database menggunakan koleksi LTM.
 * @param {Object} analysisResult - Hasil dari processForLTM()
 * @param {string} originalText - Teks asli pengguna
 */
async function saveLTMResult(analysisResult, originalText) {
  if (!analysisResult.should_save_preferences) return;

  try {
    const ltmData = {
      content: analysisResult.query_preferences,
      priority: analysisResult.priorities_level,
      source: originalText, // Menyimpan teks asli sebagai sumber
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(), // Inisialisasi lastAccessed
    };

    // Menggunakan fungsi saveLTMMemory untuk menyimpan ke koleksi 'ltm'
    await memory.saveLTMMemory(
      `ltm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Kunci unik
      ltmData
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
