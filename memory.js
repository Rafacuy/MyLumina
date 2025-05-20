const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');

const MEMORY_FILE = path.join(__dirname, 'memory.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_HISTORY_LENGTH = 100; // Maks cuma 100 pesan
const BACKUP_RETENTION = 3; // Jumlah backup 
const TARGET_USER_NAME = 'Arash'; // Nama p

let saveQueue = Promise.resolve();

const validateHistory = (history) => {
  try {
    return Array.isArray(history) && 
           history.length <= MAX_HISTORY_LENGTH &&
           history.every(msg => msg?.content);
  } catch {
    return false;
  }
};

const load = async () => {
  try {
    const fileExists = await fs.access(MEMORY_FILE).then(() => true).catch(() => false);
    
    if (!fileExists) {
      await save([]);
      return [];
    }

    const compressedData = await fs.readFile(MEMORY_FILE);
    const data = zlib.gunzipSync(compressedData).toString();
    const history = JSON.parse(data);

    if (!validateHistory(history)) {
      console.log('Invalid history, loading backup');
      return await loadBackup();
    }

    return history.slice(-MAX_HISTORY_LENGTH);
  } catch (error) {
    console.error('Load error:', error);
    return await loadBackup();
  }
};

const loadBackup = async () => {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, BACKUP_RETENTION);

    if (backups.length > 0) {
      const data = await fs.readFile(path.join(BACKUP_DIR, backups[0]), 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Backup error:', error);
  }
  return [];
};

const rotateBackups = async () => {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files
      .filter(f => f.startsWith('memory_backup'))
      .sort()
      .reverse();

    const toDelete = backups.slice(BACKUP_RETENTION);
    
    for (const file of toDelete) {
      await fs.unlink(path.join(BACKUP_DIR, file));
    }
  } catch (error) {
    console.error('Rotate error:', error);
  }
};


const save = async (history) => {
  const trimmedHistory = history.slice(-MAX_HISTORY_LENGTH);
  
  return saveQueue = saveQueue.then(async () => {
    try {
      // Buat backup folder
      await fs.mkdir(BACKUP_DIR, { recursive: true });

      // Simpan backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUP_DIR, `memory_backup_${timestamp}.json`);
      await fs.writeFile(backupFile, JSON.stringify(trimmedHistory));

      // Kompresi data
      const compressed = zlib.gzipSync(JSON.stringify(trimmedHistory));
      
      // Tulis ke file utama
      await fs.writeFile(MEMORY_FILE, compressed);
      
      // Rotate backup
      await rotateBackups();

      return true;
    } catch (error) {
      console.error('Save error:', error);
      return false;
    }
  });
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
  try {
    if (message?.from?.first_name === TARGET_USER_NAME) {
      const history = await load();
      const filtered = history.filter(msg => 
        msg.from?.id !== message.from.id
      );
      await save([...filtered, message]);
    }
  } catch (error) {
    console.error('Save last chat error:', error);
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