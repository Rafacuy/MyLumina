// modules/loveStateManager.js
let confessionScore = 0;
let isRomanceMode = false;
const CONFESSION_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 1000 * 60 * 60 * 6; // reset setelah 6 jam

let lastConfessionTimestamp = null;

function analyzeLoveTrigger(userText) {
  const text = userText.toLowerCase();

  const triggers = [
    "aku suka kamu",
    "i like you",
    "punya rasa",
    "jatuh cinta",
    "crush on you",
    "aku cinta kamu",
    "apa kamu suka aku",
    "I love you"
  ];

  if (triggers.some((phrase) => text.includes(phrase))) {
    confessionScore++;
    lastConfessionTimestamp = Date.now();
    console.log(`[LoveState] Skor nembak: ${confessionScore}`);

    if (confessionScore >= CONFESSION_THRESHOLD) {
      isRomanceMode = true;
      console.log("[LoveState] ROMANCE MODE AKTIF 💖");
    }
  }
}

function getRomanceStatus() {
  return isRomanceMode;
}

function resetRomanceStateIfNeeded() {
  const now = Date.now();
  if (
    lastConfessionTimestamp &&
    now - lastConfessionTimestamp >= RESET_TIMEOUT_MS
  ) {
    confessionScore = 0;
    isRomanceMode = false;
    console.log("[LoveState] Romance mode direset karena timeout.");
  }
}

module.exports = {
  analyzeLoveTrigger,
  getRomanceStatus,
  resetRomanceStateIfNeeded,
};
