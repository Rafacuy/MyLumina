// state/globalState.js

/**
 * @class GlobalState
 * @description Kelas ini mengelola semua status global aplikasi Lumina.
 * Membantu menghindari properti global yang berlebihan dan memusatkan manajemen status.
 */
class GlobalState {
    constructor() {
      /**
       * @property {boolean} isNgambekMode - Menunjukkan apakah Lumina sedang dalam mode 'ngambek'.
       */
      this.isNgambekMode = false;
  
      /**
       * @property {Map<string, string>} messageCache - Cache untuk respons AI berdasarkan prompt.
       * Menggunakan Map untuk mempertahankan urutan penyisipan (untuk LRU).
       */
      this.messageCache = new Map();
  
      /**
       * @property {Map<string, {count: number, lastCalled: number}>} userRequestCounts -
       * Melacak jumlah permintaan per pengguna untuk pembatasan laju.
       */
      this.userRequestCounts = new Map();
  
      /**
       * @property {boolean} isDeeptalkMode - Flag untuk menunjukkan apakah Lumina dalam mode deeptalk.
       */
      this.isDeeptalkMode = false;
  
      /**
       * @property {string|null} currentChatSummary - Menyimpan ringkasan obrolan terbaru.
       */
      this.currentChatSummary = null;
  
      /**
       * @property {object} loadedLongTermMemory - Cache untuk memori jangka panjang yang dimuat dari DB.
       */
      this.loadedLongTermMemory = {};
  
      /**
       * @property {number} ltmCounter - Counter untuk pemrosesan LTM (Long-Term Memory).
       */
      this.ltmCounter = 0;
  
      /**
       * @property {string|null} lastInteractionTimestamp - Waktu terakhir pengguna berinteraksi (ISO string).
       */
      this.lastInteractionTimestamp = null;
  
      /**
       * @property {object} dailyChatCounts - Objek yang melacak jumlah chat per hari.
       * Format: { 'YYYY-MM-DD': count }.
       */
      this.dailyChatCounts = {};
  
      /**
       * @property {boolean} interactionMutex - Mutex sederhana untuk mencegah kondisi balapan
       * saat memperbarui status interaksi.
       */
      this.interactionMutex = false;
    }
  
    /**
     * Menginisialisasi status 'ngambek' dan interaksi dari memori yang disimpan.
     * Dipanggil saat startup aplikasi.
     * @param {object} memory - Instance modul memori (data/memory.js).
     * @param {object} logger - Instance logger (utils/logger.js).
     * @param {function} setPersonalityMode - Fungsi dari commandHandlers untuk mengatur mode kepribadian.
     * @returns {Promise<void>}
     */
    async initializeFromMemory(memory, logger, setPersonalityMode) {
      try {
        // Memuat riwayat percakapan untuk memastikan memory.js sudah siap
        const loadedHistory = await memory.load();
        logger.info(
          { event: "global_state_init", messageCount: loadedHistory.length },
          `Memuat ${loadedHistory.length} pesan dari memori (via memory.js).`
        );
  
        this.loadedLongTermMemory = await memory.getLTMMemories();
        logger.info(
          {
            event: "long_term_memory_load",
            preferenceCount: Object.keys(this.loadedLongTermMemory).length,
          },
          `Memuat ${
            Object.keys(this.loadedLongTermMemory).length
          } preferensi dari memori jangka panjang.`
        );
  
        this.isNgambekMode = (await memory.getPreference("isNgambekMode")) || false;
        this.lastInteractionTimestamp =
          (await memory.getPreference("lastInteractionTimestamp")) || null;
        this.dailyChatCounts =
          (await memory.getPreference("dailyChatCounts")) || {};
        logger.info(
          {
            event: "ngambek_status_load",
            isNgambekMode: this.isNgambekMode,
          },
          `Status Ngambek dimuat: ${this.isNgambekMode}`
        );
  
        const savedPersonality = await memory.getPreference("lumina_personality");
        if (savedPersonality) {
          await setPersonalityMode(savedPersonality);
          logger.info(
            { event: "personality_load", personality: savedPersonality },
            `Mode kepribadian berhasil dimuat dari memori: ${savedPersonality}`
          );
        }
      } catch (error) {
        logger.error(
          {
            event: "global_state_init_error",
            error: error.message,
            stack: error.stack,
          },
          "Kesalahan saat menginisialisasi GlobalState dari memori:"
        );
      }
    }
  }
  
  module.exports = new GlobalState(); // Ekspor instance tunggal
  