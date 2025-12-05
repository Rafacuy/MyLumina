// modules/selfieManager.js
// Handles registration and retrieval of Lumina selfie assets from a dedicated directory.

const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const CACHE_TTL_MS = 5 * 60 * 1000; // Refresh cache every 5 minutes

let cachedSelfies = [];
let lastLoadedAt = 0;
let lastServed = null;

const getSelfieDirectory = () => config.selfieDirectory;

const ensureDirectoryExists = async () => {
  const dir = getSelfieDirectory();
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const loadSelfiesFromDirectory = async (forceReload = false) => {
  const now = Date.now();
  if (!forceReload && cachedSelfies.length && now - lastLoadedAt < CACHE_TTL_MS) {
    return cachedSelfies;
  }

  const directory = await ensureDirectoryExists();

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    cachedSelfies = entries
      .filter((entry) =>
        entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      )
      .map((entry) => path.join(directory, entry.name));

    lastLoadedAt = now;

    logger.info(
      { event: 'selfie_directory_synced', count: cachedSelfies.length, directory },
      '[SelfieManager] Synced selfie directory.'
    );

    return cachedSelfies;
  } catch (error) {
    logger.error(
      { event: 'selfie_directory_read_error', directory, error: error.message },
      '[SelfieManager] Failed to read selfie directory.'
    );
    cachedSelfies = [];
    lastLoadedAt = now;
    return cachedSelfies;
  }
};

const pickRandomSelfie = (files) => {
  if (!files.length) return null;
  if (files.length === 1) {
    lastServed = files[0];
    return files[0];
  }

  let candidate = files[Math.floor(Math.random() * files.length)];
  let attempts = 0;

  while (candidate === lastServed && attempts < 3) {
    candidate = files[Math.floor(Math.random() * files.length)];
    attempts++;
  }

  lastServed = candidate;
  return candidate;
};

const getRandomSelfie = async () => {
  const files = await loadSelfiesFromDirectory();
  return pickRandomSelfie(files);
};

const refreshSelfies = async () => loadSelfiesFromDirectory(true);

const listSelfies = async () => loadSelfiesFromDirectory();

module.exports = {
  getSelfieDirectory,
  getRandomSelfie,
  refreshSelfies,
  listSelfies,
};
