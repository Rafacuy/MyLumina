// utils/cacheHelper.js
const logger = require("./logger"); // Import logger

const MAX_CACHE_ENTRIES = 100; // Batas maksimum entri cache yang diinginkan

/**
 * @function manageCache
 * @description Fungsi untuk mengelola cache dengan strategi LRU (Least Recently Used).
 * Saat cache penuh, entri yang paling lama tidak digunakan akan dihapus.
 * @param {Map} cache - Objek Map yang digunakan sebagai cache.
 * @param {any} key - Kunci untuk entri cache.
 * @param {any} value - Nilai yang akan disimpan.
 */
const manageCache = (cache, key, value) => {
  if (cache.has(key)) {
    // Jika kunci sudah ada, hapus dan tambahkan kembali untuk membuatnya menjadi 'paling baru digunakan'
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_ENTRIES) {
    // Jika cache penuh, hapus entri paling lama (yang pertama ditambahkan)
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
    logger.warn(
      {
        event: "cache_eviction",
        evictedKey: firstKey,
        currentSize: cache.size,
        maxEntries: MAX_CACHE_ENTRIES,
      },
      `Cache penuh, menghapus entri lama: "${firstKey}"`
    );
  }
  cache.set(key, value); // Tambahkan atau perbarui entri
  logger.info(
    { event: "cache_add_or_update", key: key, currentSize: cache.size },
    `Entri cache ditambahkan/diperbarui: "${key}". Ukuran cache sekarang: ${cache.size}`
  );
};

module.exports = { manageCache, MAX_CACHE_ENTRIES };
