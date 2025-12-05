const pino = require("pino");

/**
 * @description Menginisialisasi dan mengkonfigurasi Pino logger.
 */
const logger = pino({
  level: 'info',
  base: { pid: false }, // Hilangkan pid dari log
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "SYS:standard",
      sync: false // Gunakan async untuk kinerja lebih baik
    },
  },
});

module.exports = logger;