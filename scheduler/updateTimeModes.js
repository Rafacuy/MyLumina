// schedules/updateTimeModes.js
const { getJakartaHour } = require('../utils/timeHelper');
const { setMood, getRandomMood, getCurrentMood } = require('../handler/commandHandlers');
const { sendMessage } = require('../utils/sendMessage');
const Mood = require('../modules/mood');
const globalState = require('../state/globalState');
const logger = require('../utils/logger');

const SLEEP_START_HOUR = 0; // Waktu tidur Lumina (00:00 - tengah malam)
const SLEEP_END_HOUR = 4; // Waktu berakhir tidur Lumina (04:00 - 4 pagi)
const DEEPTALK_START_HOUR = 21; // Lumina memasuki mode deeptalk pada 21:00 (9 malam)

/**
 * @function updateTimeBasedModes
 * @description Memperbarui kepribadian dan mood Lumina berdasarkan waktu saat ini.
 * Menangani perubahan mood acak dan aktivasi/deaktivasi mode deeptalk.
 * @param {string|number} chatId - ID obrolan untuk mengirim pengumuman perubahan mood/mode.
 */
const updateTimeBasedModes = (chatId) => {
    const currentHour = getJakartaHour();
    const currentMood = getCurrentMood();

    // Aktivasi/Deaktivasi mode deeptalk
    if (currentHour >= DEEPTALK_START_HOUR && !globalState.isDeeptalkMode) {
        globalState.isDeeptalkMode = true;
        setMood(chatId, Mood.CALM); // Mood tenang saat deeptalk
        logger.info({ event: 'deeptalk_mode_activated' }, 'Memasuki Mode Deeptalk.');
    } else if (currentHour < DEEPTALK_START_HOUR && globalState.isDeeptalkMode) {
        globalState.isDeeptalkMode = false;
        setMood(chatId, getRandomMood()); // Kembali ke mood acak setelah deeptalk
        logger.info({ event: 'deeptalk_mode_deactivated' }, 'Keluar dari Mode Deeptalk.');
    }

    // Jangan ubah mood jika sedang ngambek, kecuali oleh sistem ngambek itu sendiri
    if (globalState.isNgambekMode) {
        logger.debug(
            { event: 'mood_change_skipped', reason: 'ngambek_mode_active' },
            '[DEBUG] Lumina sedang Ngambek, mood tidak diubah oleh time-based mode.',
        );
        return;
    }

    // Perubahan mood berbasis waktu (jika tidak dalam mode deeptalk atau tidur)
    if (!globalState.isDeeptalkMode && !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)) {
        if (currentHour === 7 && currentMood !== Mood.HAPPY) {
            setMood(chatId, Mood.HAPPY);
        } else if (currentHour === 13 && currentMood !== Mood.NORMAL) {
            setMood(chatId, Mood.NORMAL);
        } else if (currentHour === 17) {
            const randomMood = getRandomMood();
            if (currentMood !== randomMood) {
                setMood(chatId, randomMood);
                sendMessage(chatId, `Selamat sore, Tuan! Lumina sedang merasa ${randomMood.name}. ${randomMood.emoji}`);
                logger.info(
                    {
                        event: 'mood_set_random',
                        hour: currentHour,
                        mood: randomMood.name,
                    },
                    'Mood sore disetel secara acak.',
                );
            }
        }
    }
};

module.exports = updateTimeBasedModes;
