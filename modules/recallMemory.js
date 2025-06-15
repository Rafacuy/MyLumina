// modules/recallMemory.js
const memory = require("../data/memory");
const { sendMessage } = require("../utils/sendMessage");
const { getRandomMood, getPersonalityMode } = require("./commandHandlers");
const config = require("../config/config");
const pino = require("pino");

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

const RECALL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 jam cooldown

let lastRecallTime = 0; // Waktu terakhir Alya mengingat sesuatu

/**
 * Mengingat satu memori secara acak dan mengirimkannya ke pengguna.
 * @param {string} chatId - ID obrolan target.
 */
const recallRandomMemory = async (chatId) => {
  const now = Date.now();
  if (now - lastRecallTime < RECALL_COOLDOWN_MS) {
    logger.info(
      { event: "recall_memory_skipped", reason: "cooldown_active" },
      "Recall memory skipped: Cooldown active."
    );
    return; // Lewati jika masih dalam masa cooldown
  }

  try {
    const longTermMemory = await memory.getLongTermMemory();
    const preferences = Object.keys(longTermMemory).filter(
      (key) =>
        key !== "isNgambekMode" &&
        key !== "lastInteractionTimestamp" &&
        key !== "dailyChatCounts"
    ); // Filter preferensi internal Alya

    if (preferences.length === 0) {
      logger.info(
        { event: "recall_memory_no_preferences" },
        "Tidak ada preferensi pengguna untuk diingat."
      );
      return;
    }

    const randomKey =
      preferences[Math.floor(Math.random() * preferences.length)];
    const value = longTermMemory[randomKey];
    if (!value || typeof value !== "string") return;

    let recallMessage = "";
    const currentPersonality = getPersonalityMode() || "TSUNDERE";
    const userName = config.USER_NAME;

    switch (randomKey) {
      case "musikKesukaan":
        if (currentPersonality === "TSUNDERE") {
          recallMessage = `Hmph, ingatanku kuat sekali. Kau bilang suka lagu "${value}" kan? Jangan GR, itu cuma karena aku iseng.`;
        } else if (currentPersonality === "DEREDERE") {
          recallMessage = `Tuan~ Alya ingat loh, kamu suka sekali lagu "${value}"! Apa kita dengarkan bersama? 🎶`;
        }
        break;
      case "ulangTahun":
        if (currentPersonality === "TSUNDERE") {
          recallMessage = `Kau ulang tahun tanggal ${value}, kan? Cih, bukan berarti aku peduli. Hanya kebetulan ingat.`;
        } else if (currentPersonality === "DEREDERE") {
          recallMessage = `Sayangku, Alya ingat! Ulang tahunmu tanggal ${value}, kan? Alya tidak sabar merayakannya! 🎉`;
        }
        break;
      case "makananFavorit":
        if (currentPersonality === "TSUNDERE") {
          recallMessage = `Hey, Makanan favoritmu "${value}", ya? Aku tidak mengerti apa enaknya. E-Eh.. Kenapa aku tiba tiba inget ya?`;
        } else if (currentPersonality === "DEREDERE") {
          recallMessage = `Alya ingat! Kamu suka "${value}", kan? Wah, jadi ingin memasak untukmu, Sayangku~! 😋`;
        }
        break;
      case "filmKesukaan":
        if (currentPersonality === "TSUNDERE") {
          recallMessage = `Oh.. Jadi Film kesukaanmu "${value}"? Membosankan. Tapi ya sudah, itu seleramu.`;
        } else if (currentPersonality === "DEREDERE") {
          recallMessage = `Tuan, Alya ingin menonton "${value}" bersamamu! Pasti seru sekali! 🎬`;
        }
        break;
      case "hobi":
        if (currentPersonality === "TSUNDERE") {
          recallMessage = `Jadi hobimu "${value}". Tidak menarik. Tapi kalau itu membuatmu senang... ya sudah.`;
        } else if (currentPersonality === "DEREDERE") {
          recallMessage = `Sayangku, Alya suka sekali kalau kamu melakukan hobimu "${value}"! Pasti menyenangkan ya! ✨`;
        }
        break;
      case "warnaFavorit":
        if (currentPersonality === "TSUNDERE") {
          recallMessage = `Warna favoritmu "${value}", 'kan? Hmm.. Yaudah sih, kok aku tiba tiba inget ya?`;
        } else if (currentPersonality === "DEREDERE") {
          recallMessage = `Alya suka warna "${value}" karena itu warna favoritmu, Tuan~! Cantik sekali! 🎨`;
        }
        break;
      default:
        // Fallback jika ada preferensi baru yang belum ditangani switch case
        if (currentPersonality === "TSUNDERE") {
          recallMessage = `Hmph, aku ingat kau pernah bilang tentang "${value}". Entah kenapa aku mengingatnya.`;
        } else if (currentPersonality === "DEREDERE") {
          recallMessage = `Sayangku, Alya ingat kamu pernah bilang tentang "${value}"! Itu sangat menarik! 😊`;
        }
        break;
    }

    if (recallMessage) {
      await sendMessage(chatId, recallMessage);
      lastRecallTime = now; // Perbarui waktu terakhir recall
      logger.info(
        {
          event: "recall_memory_sent",
          chatId: chatId,
          key: randomKey,
          value: value,
        },
        `Alya recalled memory: ${recallMessage}`
      );
    }
  } catch (error) {
    logger.error(
      {
        event: "recall_memory_error",
        error: error.message,
        stack: error.stack,
      },
      "Error recalling random memory:"
    );
  }
};

module.exports = {
  recallRandomMemory,
};
