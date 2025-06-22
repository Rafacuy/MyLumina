// schedules/cronSetup.js
const schedule = require("node-schedule");
const logger = require("../utils/logger");
const memory = require("../data/memory");
const { getWeatherData, getWeatherString, getWeatherReminder } = require("../modules/weather");
const Mood = require("../modules/mood"); 
const { sendMessage } = require('../utils/sendMessage')
const newsManager = require("../modules/newsManager");
const recallMemory = require("../modules/recallMemory");
const holidaysModule = require("../handler/holidayHandlers");
const sendSadSongNotification = require("../utils/songNotifier");
const relationState = require("../handler/relationHandler");
const config = require("../config/config"); // Untuk mendapatkan TARGET_CHAT_ID dan calendarificApiKey
const chatSummarizer = require("../modules/chatSummarizer");
const globalState = require("../state/globalState"); // Import globalState

/**
 * @function setupCronJobs
 * @description Menyiapkan semua pekerjaan cron terjadwal untuk aplikasi Lumina.
 * Ini termasuk pembaruan cuaca, pembersihan LTM, pengecekan relasi, notifikasi lagu sedih,
 * berita harian, pengingat memori, pembaruan mode berbasis waktu, ringkasan obrolan,
 * dan pengecekan status 'ngambek'.
 * @param {object} bot - Instance bot Telegram.
 * @param {function} updateTimeBasedModes - Fungsi untuk memperbarui mode berbasis waktu.
 * @param {function} checkNgambekStatus - Fungsi untuk memeriksa dan memperbarui status 'ngambek'.
 * @param {string} USER_NAME - Nama pengguna Lumina.
 * @param {object} Sentry - Objek Sentry untuk pelacakan kesalahan.
 */
const setupCronJobs = (
  bot,
  updateTimeBasedModes,
  checkNgambekStatus,
  USER_NAME,
  Sentry
) => {
  const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

  if (!configuredChatId) {
    logger.warn(
      "⚠️ TARGET_CHAT_ID tidak ditemukan di config.js. Pesan terjadwal TIDAK akan dikirim."
    );
    return;
  }

  logger.info(
    `📬 Pesan terjadwal akan dikirim ke ID obrolan: ${configuredChatId}`
  );

  // Pekerjaan cron untuk laporan cuaca (setiap 5 jam)
  schedule.scheduleJob(
    { rule: "0 */5 * * *", tz: "Asia/Jakarta" },
    async () => {
      try {
        const weather = await getWeatherData();
        if (weather) {
          sendMessage(
            configuredChatId,
            `🌸 Cuaca hari ini:\n${getWeatherString(
              weather
            )}\n${getWeatherReminder(weather)}`
          );
          logger.info(
            { event: "weather_report_sent", chatId: configuredChatId },
            "Laporan cuaca dikirim."
          );
        } else {
          sendMessage(
            configuredChatId,
            `Hmm... Lumina sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`
          );
          logger.warn(
            { event: "weather_report_failed", chatId: configuredChatId },
            "Gagal mengambil data cuaca."
          );
        }
      } catch (error) {
        logger.error(
          {
            event: "scheduled_weather_error",
            error: error.message,
            stack: error.stack,
          },
          "Kesalahan saat penjadwalan cuaca:"
        );
        Sentry.captureException(error);
      }
    }
  );

  // Pembersihan LTM setiap 2 bulan (60 hari)
  schedule.scheduleJob(
    { rule: "0 0 1 */2 *", tz: "Asia/Jakarta" },
    async () => {
      logger.info("Running LTM cleanup...");
      try {
        const allPrefs = await memory.getLongTermMemory();
        const twoMonthsAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
        let count = 0;

        for (const key in allPrefs) {
          if (key.startsWith("ltm_")) {
            const timestamp = parseInt(key.split("_")[1]);
            if (timestamp < twoMonthsAgo) {
              await memory.deletePreference(key);
              count++;
            }
          }
        }
        logger.info(`Cleaned up ${count} old LTM entries`);
      } catch (error) {
        logger.error({ error: error.message }, "LTM cleanup failed");
        Sentry.captureException(error);
      }
    }
  );

  // Cek relasi setiap 7 jam
  schedule.scheduleJob({ rule: "0 */7 * * *" }, async () => {
    logger.info(
      { event: "relation_status_check_scheduled" },
      "Menjalankan pengecekan status relasi terjadwal..."
    );
    try {
      await relationState.checkWeeklyConversation();
    } catch (error) {
      logger.error(
        {
          event: "scheduled_relation_check_error",
          error: error.message,
          stack: error.stack,
        },
        "Kesalahan saat pengecekan relasi terjaduk:"
      );
      Sentry.captureException(error);
    }
  });

  // Rekomendasi lagu sedih setiap jam 10 malam
  schedule.scheduleJob({ rule: "0 22 * * *", tz: "Asia/Jakarta" }, () => {
    try {
      sendSadSongNotification(configuredChatId);
      logger.info(
        { event: "sad_song_notification_sent", chatId: configuredChatId },
        "Notifikasi lagu sedih dikirim."
      );
    } catch (error) {
      logger.error(
        {
          event: "scheduled_song_notification_error",
          error: error.message,
          stack: error.stack,
        },
        "Kesalahan saat penjadwalan notifikasi lagu sedih:"
      );
      Sentry.captureException(error);
    }
  });

  // Berita & ringkasannya setiap jam 8 pagi
  schedule.scheduleJob(
    { rule: "0 8 * * *", tz: "Asia/Jakarta" },
    async () => {
      logger.info(
        { event: "daily_news_send_scheduled" },
        "[Core] Menjalankan pengiriman berita harian terjadwal..."
      );
      try {
        await newsManager.sendDailyNews(configuredChatId);
      } catch (error) {
        logger.error(
          {
            event: "scheduled_daily_news_error",
            error: error.message,
            stack: error.stack,
          },
          "Kesalahan saat penjadwalan berita harian:"
        );
        Sentry.captureException(error);
      }
    }
  );

  // Fungsi ingat memori terjadwal setiap jam 9 pagi
  schedule.scheduleJob(
    { rule: "0 9 * * *", tz: "Asia/Jakarta" },
    async () => {
      logger.info(
        { event: "recall_memory_scheduled" },
        "[Core] Menjalankan fungsi ingat memori terjadwal..."
      );
      try {
        await recallMemory.recallRandomMemory(configuredChatId);
      } catch (error) {
        logger.error(
          {
            event: "scheduled_recall_memory_error",
            error: error.message,
            stack: error.stack,
          },
          "Kesalahan saat penjadwalan ingat memori:"
        );
        Sentry.captureException(error);
      }
    }
  );

  // Pembaruan mode berbasis waktu setiap jam
  schedule.scheduleJob({ rule: "0 * * * *", tz: "Asia/Jakarta" }, () => {
    try {
      updateTimeBasedModes(configuredChatId);
    } catch (error) {
      logger.error(
        {
          event: "scheduled_time_modes_update_error",
          error: error.message,
          stack: error.stack,
        },
        "Kesalahan saat penjadwalan pembaruan mode berbasis waktu:"
      );
      Sentry.captureException(error);
    }
  });

  // Pembaruan ringkasan obrolan setiap jam
  schedule.scheduleJob(
    { rule: "0 * * * *", tz: "Asia/Jakarta" },
    async () => {
      logger.info(
        { event: "update_chat_summary_start" },
        "[Core] Memperbarui ringkasan obrolan..."
      );
      try {
        const fullHistory = await memory.getInMemoryHistory();
        const summary = await chatSummarizer.getSummarizedHistory(50, fullHistory);
        if (summary) {
          globalState.currentChatSummary = summary;
          logger.info(
            { event: "update_chat_summary_success" },
            "[Core] Ringkasan obrolan terbaru berhasil dibuat."
          );
        } else {
          globalState.currentChatSummary = null;
          logger.info(
            { event: "update_chat_summary_no_summary" },
            "[Core] Tidak ada ringkasan obrolan yang dibuat atau riwayat terlalu pendek."
          );
        }
      } catch (error) {
        logger.error(
          {
            event: "update_chat_summary_error",
            error: error.message,
            stack: error.stack,
          },
          "Kesalahan saat memperbarui ringkasan obrolan:"
        );
        Sentry.captureException(error);
      }
    }
  );

  // Penjadwalan untuk sistem Ngambek (setiap hari pukul 00:00)
  schedule.scheduleJob(
    { rule: "0 0 * * *", tz: "Asia/Jakarta" },
    async () => {
      logger.info(
        { event: "ngambek_status_check_scheduled" },
        "[Ngambek System] Memeriksa status ngambek Lumina..."
      );
      try {
        await checkNgambekStatus(configuredChatId);
      } catch (error) {
        logger.error(
          {
            event: "scheduled_ngambek_check_error",
            error: error.message,
            stack: error.stack,
          },
          "Kesalahan saat penjadwalan pengecekan status ngambek:"
        );
        Sentry.captureException(error);
      }
    }
  );

  // check hari libur dan kirim notifikasi jika hari libur (setiap jam 7 pagi)
  if (config.calendarificApiKey) {
    schedule.scheduleJob(
      { rule: "0 7 * * *", tz: "Asia/Jakarta" },
      async () => {
        try {
          await holidaysModule.checkAndNotifyDailyHolidays(
            config.calendarificApiKey,
            "ID",
            (message) => sendMessage(configuredChatId, message)
          );
          logger.info(
            { event: "daily_holiday_check_scheduled" },
            "Pengecekan hari libur harian dilakukan."
          );
        } catch (error) {
          logger.error(
            {
              event: "scheduled_holiday_check_error",
              error: error.message,
              stack: error.stack,
            },
            "Kesalahan saat penjadwalan pengecekan hari libur:"
          );
          Sentry.captureException(error);
        }
      }
    );
  } else {
    logger.warn(
      "[Core] Calendarific API Key tidak ditemukan. Pemeriksaan hari libur dinonaktifkan."
    );
  }
};

module.exports = { setupCronJobs };
