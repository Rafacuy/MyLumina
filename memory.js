const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');

const MEMORY_FILE = path.join(__dirname, 'memory.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_HISTORY_LENGTH = 100; // Maksimal 100 pesan terakhir
const BACKUP_RETENTION = 3; // Jumlah backup yang disimpan
const TARGET_USER_NAME = 'Arash'; // Nama pengguna yang spesifik

// Queue untuk menghindari race condition
let saveQueue = Promise.resolve();

const validateHistory = (history) => {
  return Array.isArray(history) && history.every(msg =>
    msg && typeof msg === 'object' &&
    ['role', 'content', 'from'].every(prop => prop in msg) &&
    typeof msg.from === 'object' &&
    'first_name' in msg.from
  );
};

const load = async () => {
  try {
    const compressedData = await fs.readFile(MEMORY_FILE);
    const data = zlib.gunzipSync(compressedData).toString('utf8');
    const history = JSON.parse(data);

    if (!validateHistory(history)) {
      console.error('Invalid history format, loading backup');
      return await loadBackup();
    }

    return history.slice(-MAX_HISTORY_LENGTH);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Memory file not found, creating new one');
      return [];
    }
    console.error('Error loading memory:', error);
    return await loadBackup();
  }
};

const loadBackup = async () => {
  try {
    const backups = await fs.readdir(BACKUP_DIR);
    const sortedBackups = backups
      .filter(f => f.startsWith('memory_backup'))
      .sort()
      .reverse();

    if (sortedBackups.length > 0) {
      const data = await fs.readFile(path.join(BACKUP_DIR, sortedBackups[0]), 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading backup:', error);
  }
  return [];
};

const rotateBackups = async () => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const backups = await fs.readdir(BACKUP_DIR);
    const sortedBackups = backups
      .filter(f => f.startsWith('memory_backup'))
      .sort()
      .reverse();

    // Hapus backup lama
    for (const file of sortedBackups.slice(BACKUP_RETENTION)) { // Perbaikan slice
      await fs.unlink(path.join(BACKUP_DIR, file));
    }
  } catch (error) {
    console.error('Error rotating backups:', error);
  }
};

const save = async (history) => {
  const trimmedHistory = history.slice(-MAX_HISTORY_LENGTH);

  // Tambahkan ke queue untuk menghindari race condition
  saveQueue = saveQueue.then(async () => {
    try {
      // Buat backup sebelum menyimpan
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUP_DIR, `memory_backup_${timestamp}.json`);

      await fs.mkdir(BACKUP_DIR, { recursive: true });
      await fs.writeFile(backupFile, JSON.stringify(trimmedHistory));
      await rotateBackups();

      // Kompresi data untuk penyimpanan
      const compressed = zlib.gzipSync(JSON.stringify(trimmedHistory));
      await fs.writeFile(MEMORY_FILE, compressed);

      return true;
    } catch (error) {
      console.error('Error saving memory:', error);
      return false;
    }
  });

  return saveQueue;
};

const addMessage = async (message) => {
  const history = await load();
  const newHistory = [...history, message];
  await save(newHistory);
  return newHistory;
};

const getLastChatBy = async (userName) => {
  const history = await load();
  return history
    .filter(msg => msg.from && msg.from.first_name === userName)
    .pop(); // Ambil elemen terakhir
};

const saveLastChat = async (message) => {
  if (message && message.from && message.from.first_name === TARGET_USER_NAME) {
    const history = await load();
    const newHistory = [...history.filter(msg => !(msg.from && msg.from.first_name === TARGET_USER_NAME)), message]; // Hapus chat Arash sebelumnya
    await save(newHistory);
  }
};

const searchHistory = async (keyword, limit = 5) => {
  const history = await load();
  return history
    .filter(msg => msg.content.toLowerCase().includes(keyword.toLowerCase()))
    .slice(-limit);
};

module.exports = {
  load,
  save,
  addMessage,
  searchHistory,
  getLastChatBy,
  saveLastChat
};