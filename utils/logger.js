const pino = require("pino");

/**
 * @description Menginisialisasi dan mengkonfigurasi Pino logger.
 */
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

module.exports = logger;