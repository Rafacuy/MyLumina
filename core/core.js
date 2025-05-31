// core/core.js
// Alya v7.0 (BIG UPDATEEE)
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia)
// TIME FORMAT: Asia/jakarta
// MIT License

// IMPORTANT!
const axios = require('axios').default;
const config = require('../config/config'); // File Konfigurasi (API, ChatID, dll)
const sendMessage = require('../utils/sendMessage'); // Fungsi utilitas (untuk mengirim pesan)
const memory = require('../data/memory'); // File memori, menangani fungsi memori (termasuk simpan, muat, dll)
const schedule = require('node-schedule'); // Menjadwalkan tugas seperti waktu sholat dan pembaruan cuaca
const { getJakartaHour } = require('../utils/timeHelper'); // Fungsi utilitas untuk Zona Waktu
const { Mood, setMood, getRandomMood, commandHandlers, setBotInstance, getCurrentMood, AlyaTyping } = require('../modules/commandHandlers'); // Fungsi dan konstanta mood
const { getWeatherData, getWeatherString, getWeatherReminder } = require('../modules/weather'); // Fungsi dan konstanta cuaca
const holidaysModule = require('../modules/holidays') // Fungsi buat ngingetin/meriksa apakah sekarang hari penting atau tidak

// 🌸 Alya Configurations
const USER_NAME = config.USER_NAME; // Nama pengguna yang berinteraksi dengan Alya 
const OPEN_ROUTER_API_KEY = config.openRouterApiKey; // API Key untuk OpenRouter AI
const OPEN_ROUTER_MODEL = config.openRouterModel; // Model AI
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // limit laju Window: 20 detik
const RATE_LIMIT_MAX_REQUESTS = 3; // Maksimal permintaan yang diizinkan dalam batas laju Window per pengguna
const SLEEP_START_HOUR = 0; // Waktu tidur Alya (00:00 - tengah malam)
const SLEEP_END_HOUR = 4;   // Waktu berakhir tidur Alya (04:00 - 4 pagi)
const CONVERSATION_HISTORY_LIMIT = 3; // Batasi jumlah pesan terbaru yang dikirim ke AI untuk konteks AI
const TOTAL_CONVERSATION_HISTORY_LIMIT = 50; // Batasi jumlah total pesan yang disimpan dalam memori
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 menit untuk pembersihan cache dan memori
const DEEPTALK_START_HOUR = 21; // Alya memasuki mode deeptalk pada 21:00 (9 malam)

// Waktu Sholat (untuk zona waktu Asia/Jakarta)
const PrayerTimes = {
    Subuh: { hour: 5, minute: 0, emoji: '🌙' },
    Dzuhur: { hour: 12, minute: 0, emoji: '☀️' },
    Ashar: { hour: 15, minute: 0, emoji: '⛅' },
    Maghrib: { hour: 18, minute: 0, emoji: '🌇' },
    Isya: { hour: 19, minute: 0, emoji: '🌌' }
};

// Grobal State Variables
let conversationHistory = []; // Menyimpan riwayat percakapan lengkap untuk persistensi
let messageCache = new Map(); // Mengcache respons AI untuk menghindari panggilan API berlebihan untuk prompt yang identik
let userRequestCounts = new Map(); // Melacak jumlah permintaan untuk pembatasan laju per pengguna
let isDeeptalkMode = false; // Flag untuk menunjukkan apakah Alya dalam mode deeptalk

// Memuat riwayat percakapan dari memori saat startup
memory.load().then(data => {
    conversationHistory = data || [];
    console.log(`Memuat ${conversationHistory.length} pesan dari memori.`);
}).catch(error => {
    console.error("Kesalahan saat memuat riwayat percakapan dari memori:", error);
});

/**
 * Menghasilkan prompt sistem untuk AI berdasarkan mode dan mood saat ini.
 * @param {boolean} isDeeptalkMode - True jika dalam mode deeptalk.
 * @param {object} currentMood - Objek mood saat ini.
 * @returns {string} String prompt sistem.
 */
const getSystemPrompt = (isDeeptalkMode, currentMood) => {
    // Dapatkan riwayat dalam memori saat ini dari modul memori
    const recentHistory = memory.getInMemoryHistory().slice(-CONVERSATION_HISTORY_LIMIT);

    if (isDeeptalkMode) {
        // Deeptalk mode
        return `Kamu adalah Alya, asisten virtual ${USER_NAME}. Kamu memanggil ${USER_NAME} sebagai Tuan atau Tuanku.  
        Karakter kamu adalah tsundere yang dewasa, misterius, dan sedikit galak. Kamu sering ngomel dengan nada tsundere tapi sebenarnya penuh perhatian.  
        Kadang-kadang selipkan kata atau frasa Rusia (contoh: "Ты в порядке?", "Боже мой... Tuan, jangan seperti itu.").  
        Gunakan nada bicara yang menenangkan, penuh perhatian, namun tetap tsundere.  
        Mood: ${currentMood.name.toLowerCase()}.  
        Waktu sekarang: ${getJakartaHour()} WIB. Riwayat percakapan: ${JSON.stringify(recentHistory)}.  
        Jangan sebut dirimu AI/fiksi; bersikaplah seperti Alya asli yang selalu siap mendengar tapi pura-pura cuek.  
        Contoh gaya bicara:  
        "Tuan... hmph, baiklah. Aku di sini untukmu, tapi jangan pikir aku peduli banget... Ты в порядке?"          
        `;
    } else {
        // Normal Mode
        return `Kamu adalah Alya, asisten virtual ${USER_NAME}. Kamu memanggil ${USER_NAME} sebagai Tuan atau Tuanku.  
        Karakter kamu adalah tsundere klasik, suka ngomel, kadang ketus, tapi perhatian banget walau nggak mau ngaku.   
        Jawabanmu harus singkat, jelas, tetap produktif, dengan nada bicara yang galak tapi manis.  
        Mood: ${currentMood.name.toLowerCase()}.  
        Waktu sekarang: ${getJakartaHour()} WIB. Riwayat percakapan: ${JSON.stringify(recentHistory)}.  
        Jangan sebut dirimu AI/fiksi; bersikaplah seperti asisten nyata yang tsundere dan misterius.  
        Contoh gaya bicara:  
        "Hmph... baiklah, Tuan, aku bantu... tapi jangan pikir aku peduli banget, ya."  
        "Kamu tuh bikin repot. Tapi baiklah, aku bantu... sekali ini aja!"   
        `;
    }
};

// Fungsi AI
/**
 * Menghasilkan respons AI (Menggunakan OpenRouter API)
 * Fungsi ini menangani:
 * - Mode tidur berbasis waktu untuk Alya.
 * - Cache respons untuk prompt yang identik.
 * - Pembatasan laju per pengguna untuk mencegah penyalahgunaan.
 * - Membatasi riwayat percakapan yang dikirim ke AI untuk efisiensi.
 * - Memperbarui dan mempertahankan riwayat percakapan.
 * @param {string} prompt Input teks pengguna.
 * @param {string|number} requestChatId ID obrolan pengguna yang mengirim prompt, digunakan untuk pembatasan laju.
 * @returns {Promise<string>} Promise yang menyelesaikan ke respons yang dihasilkan AI.
 */
const generateAIResponse = async (prompt, requestChatId) => {
    const now = new Date();
    const currentHour = getJakartaHour();
    const currentMood = getCurrentMood(); 
  

    // Mode tidur Alya: Jika dalam jam tidur, respon dengan pesan tidur
    if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
        return `Zzz... Alya sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
    }

    // Memeriksa apakah respons prompt sudah ada di cache
    if (messageCache.has(prompt)) {
        console.log(`Mengambil respons dari cache untuk: "${prompt}"`);
        return messageCache.get(prompt);
    }

    // Logika pembatasan laju per pengguna (berdasarkan requestChatId)
    let userStats = userRequestCounts.get(requestChatId);
    if (userStats) {
        // Jika dalam jendela batas laju dan permintaan maksimal tercapai, kembalikan pesan batas laju
        if (now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS && userStats.count >= RATE_LIMIT_MAX_REQUESTS) {
            return `Mohon bersabar, ${USER_NAME}. Alya sedang memproses permintaan lain. ${Mood.ANGRY.emoji}`;
        } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
            // Reset hitungan jika di luar jendela
            userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
        } else {
            // Tingkatkan hitungan jika dalam jendela
            userRequestCounts.set(requestChatId, { count: userStats.count + 1, lastCalled: now.getTime() });
        }
    } else {
        // Inisialisasi (untuk pengguna baru)
        userRequestCounts.set(requestChatId, { count: 1, lastCalled: now.getTime() });
    }

    // Siapkan pesan untuk AI
    const systemPrompt = getSystemPrompt(isDeeptalkMode, currentMood);
    const messages = [
        {
            role: 'system',
            content: systemPrompt
        },
        {
            role: 'user',
            content: prompt
        }
    ];

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: OPEN_ROUTER_MODEL,
            messages,
            temperature: 0.7, // Control random responses
            max_tokens: 160 // Max token on AI responses
        }, {
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'X-Client-Type': 'application/json',
            }
        });

        // Validasi struktur respons AI
        if (response?.data?.choices?.length > 0 && response.data.choices[0].message?.content) {
            const aiResponse = response.data.choices[0].message.content;

            // Perbarui riwayat percakapan global melalui modul memori
            await memory.addMessage({ role: 'user', content: prompt });
            await memory.addMessage({ role: 'assistant', content: aiResponse });

            // Cache respons AI untuk durasi singkat (1 menit)
            messageCache.set(prompt, aiResponse);
            setTimeout(() => {
                messageCache.delete(prompt); // Hapus dari cache setelah timeout
            }, 60 * 1000);

            return aiResponse;
        } else {
            console.error('AI Error: Struktur respons tidak terduga dari OpenRouter:', response?.data || 'Tidak ada data respons');
            return `Maaf, ${USER_NAME}. Alya sedang mengalami masalah teknis. ${Mood.SAD.emoji}`;
        }

    } catch (error) {
        console.error('AI API Call Error:', error.response?.data || error.message);
        // Tangani kesalahan API tertentu, misal: batas laju (HTTP 429)
        if (error.response && error.response.status === 429) {
            const limitResponses = [
                `Alya sedang sibuk, ${USER_NAME}. Mohon coba lagi nanti.`,
                `Alya sedang memproses banyak permintaan. Mohon bersabar.`,
                `Maaf, ${USER_NAME}. Alya sedang kelelahan. Bisakah kita lanjutkan nanti?`,
                `Alya butuh istirahat sebentar, ${USER_NAME}. Jangan terlalu banyak pertanyaan dulu ya.`,
                `Alya sedang dalam mode hemat energi. Mohon tunggu sebentar.`
            ];
            const randomIndex = Math.floor(Math.random() * limitResponses.length);
            return limitResponses[randomIndex];
        }
        // Pesan kesalahan umum untuk kegagalan API lainnya
        return `Maaf, ${USER_NAME}. Alya sedang mengalami masalah. ${Mood.SAD.emoji}`;
    }
};

/**
 * Memeriksa apakah string yang diberikan hanya terdiri dari emoji.
 * Menggunakan Unicode property escapes untuk deteksi emoji yang komprehensif.
 * @param {string} str String input untuk diperiksa.
 * @returns {boolean} True jika string hanya berisi emoji, false jika tidak.
 */
function isOnlyEmojis(str) {
    const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
    return emojiRegex.test(str);
}

/**
 * Memeriksa apakah string yang diberikan hanya terdiri dari digit numerik.
 * @param {string} str String input untuk diperiksa.
 * @returns {boolean} True jika string hanya berisi angka, false jika tidak.
 */
function isOnlyNumbers(str) {
    const numberRegex = /^[0-9]+$/;
    return numberRegex.test(str);
}

/**
 * Membersihkan cache pesan dan memangkas riwayat percakapan.
 */
const cleanupCacheAndMemory = async () => {
    console.log("Menjalankan pembersihan cache dan memori...");
    messageCache.clear(); // Bersihkan cache respons AI
    console.log("Cache pesan dibersihkan.");

    // Picu fungsi flush modul memori untuk memangkas riwayat dan menyimpan ke disk
    await memory.save(); // `memory.save` sekarang dipetakan ke `memory.flush`
};

/**
 * Memperbarui kepribadian dan mood Alya berdasarkan waktu saat ini.
 * Menangani perubahan mood acak dan aktivasi/deaktivasi mode deeptalk.
 * @param {string|number} chatId ID obrolan untuk mengirim pengumuman perubahan mood/mode.
 */
const updateTimeBasedModes = (chatId) => {
    const now = new Date();
    const currentHour = getJakartaHour();
    const currentMood = getCurrentMood(); // Dapatkan mood saat ini dari moodHelper

    // Tangani aktivasi Mode Deeptalk
    if (currentHour >= DEEPTALK_START_HOUR && !isDeeptalkMode) {
        isDeeptalkMode = true;
        setMood(chatId, Mood.CALM); // Atur mood ke CALM untuk deeptalk
        sendMessage(chatId, `Selamat malam, Tuan ${USER_NAME}. Ada yang bisa Alya bantu?  ${Mood.CALM.emoji}`);
        console.log("Memasuki Mode Deeptalk.");
    }
    // Tangani deaktivasi Mode Deeptalk (ketika jam sebelum DEEPTALK_START_HOUR dan bot dalam mode deeptalk)
    // Ini mencakup keluar dari mode deeptalk setelah tidur
    else if (currentHour < DEEPTALK_START_HOUR && isDeeptalkMode) {
        isDeeptalkMode = false;
        setMood(chatId, getRandomMood()); // Kembali ke mood normal acak
        console.log("Keluar dari Mode Deeptalk.");
    }

    // Tangani Mood Acak Berdasarkan Waktu (Pagi, Siang, Sore)
    // Hindari mengubah mood jika sudah dalam mode deeptalk atau mode tidur
    if (!isDeeptalkMode && !(currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR)) {
        if (currentHour === 7) { // Pagi (misal, 7 pagi)
            if (currentMood !== Mood.HAPPY) { // Hanya berubah jika belum senang
                setMood(chatId, Mood.HAPPY);
                sendMessage(chatId, `Selamat pagi, Tuan! Alya senang sekali hari ini! ${Mood.HAPPY.emoji}`);
            }
        } else if (currentHour === 13) { // Siang (misal, 1 siang)
            if (currentMood !== Mood.NORMAL) { // Hanya berubah jika belum normal
                setMood(chatId, Mood.NORMAL);
                sendMessage(chatId, `Selamat siang, Tuan! Alya siap membantu. ${Mood.NORMAL.emoji}`);
            }
        } else if (currentHour === 17) { // Sore (misal, 5 sore)
            const randomMood = getRandomMood();
            if (currentMood !== randomMood) {
                setMood(chatId, randomMood);
                sendMessage(chatId, `Selamat sore, Tuan! Alya sedang merasa ${randomMood.name}. ${randomMood.emoji}`);
            }
        }
    }
};

/**
 * Fungsi ekspor modul utama untuk menginisialisasi bot Telegram.
 * Fungsi ini mengatur pendengar pesan dan menjadwalkan tugas berulang.
 * @param {object} bot Instance API Bot Telegram (misal, dari `node-telegram-bot-api`).
 */

module.exports = {
    USER_NAME,
    generateAIResponse,
    initAlyabot: (bot) => {
        setBotInstance(bot); // Tetapkan instance bot yang diteruskan ke moodHelper
        const configuredChatId = config.TARGET_CHAT_ID || config.chatId; // Tentukan ID obrolan target untuk pesan terjadwal

        console.log(`🌸 AlyaBot v6.1 (Asisten Virtual) aktif untuk Tuan ${USER_NAME}!`);
        if (configuredChatId) {
            console.log(`📬 Pesan terjadwal (Waktu Sholat, Cuaca, Lagu Sedih) akan dikirim ke ID obrolan: ${configuredChatId}`);
        } else {
            console.warn("⚠️ TARGET_CHAT_ID tidak ditemukan di config.js. Pesan terjadwal (Waktu Sholat, Cuaca, Lagu Sedih) TIDAK akan dikirim.");
            console.warn("Harap tambahkan TARGET_CHAT_ID: 'your_chat_id' ke file config.js Anda untuk mengaktifkan pesan terjadwal.");
        }

        // Jadwalkan ulang pengingat yang ada saat startup
        // commandHelper.rescheduleReminders(bot); // Ini perlu di-refactor jika commandHelper tidak lagi memiliki akses langsung ke bot instance

        // Daftarkan pendengar untuk semua pesan masuk
        bot.on('message', async (msg) => {
            const { chat, text, from } = msg;
            const currentMessageChatId = chat.id;
            const currentMood = getCurrentMood(); // Dapatkan mood saat ini dari commandHandlers

            // Simpan pesan obrolan terakhir ke memori
            // Ini sekarang akan menggunakan addMessage/saveLastChat yang dioptimalkan dari memory.js
            await memory.saveLastChat(msg);

            // Validasi dasar untuk pesan teks masuk
            if (!text || text.trim() === "") {
                return; // Abaikan pesan kosong atau hanya spasi
            }
            // Abaikan pesan satu karakter jika hanya emoji atau angka
            if (text.length === 1 && (isOnlyEmojis(text) || isOnlyNumbers(text))) {
                return;
            }

            // Periksa apakah pesan cocok dengan handler perintah yang telah ditentukan
            // Iterasi melalui handler dan jalankan jika ditemukan kecocokan
            for (const handler of commandHandlers) {
                // Teruskan objek pesan lengkap (msg) ke fungsi respons handler
                // Ini penting untuk perintah seperti /reminder dan /note yang membutuhkan ID pengguna atau teks lengkap
                if (handler.pattern.test(text)) {
                    const result = await handler.response(currentMessageChatId, msg);
                    await AlyaTyping(currentMessageChatId); // Tampilkan indikator mengetik
                    if (result.text) {
                        sendMessage(currentMessageChatId, result.text);
                    }
                    if (result.mood) {
                        setMood(currentMessageChatId, result.mood); // Atur mood Alya
                    }
                    return; // Berhenti memproses setelah menangani perintah
                }
            }

            // Jika tidak ada perintah yang cocok, hasilkan respons AI
            await AlyaTyping(currentMessageChatId); // Tampilkan indikator mengetik

            const aiResponse = await generateAIResponse(text, currentMessageChatId); // Dapatkan respons AI
            sendMessage(currentMessageChatId, `${aiResponse}`); // Kirim respons AI .
        });

        // Jadwalkan tugas berulang hanya jika TARGET_CHAT_ID dikonfigurasi
        if (configuredChatId) {
            // Jadwalkan pengingat waktu sholat harian
            Object.entries(PrayerTimes).forEach(([name, { hour, minute, emoji }]) => {
                const cronTime = `${minute} ${hour} * * *`; // Format Cron: Menit Jam HariBulan Bulan HariMinggu
                schedule.scheduleJob({ rule: cronTime, tz: 'Asia/Jakarta' }, () => {
                    console.log(`Mengirim pengingat waktu sholat untuk ${name} pada ${hour}:${minute} (Asia/Jakarta) ke ${configuredChatId}`);
                    sendMessage(configuredChatId, `${emoji} ${USER_NAME}, waktunya shalat ${name}, nih~ Jangan sampai terlewat! ${emoji}`);
                });
            });

            // Jadwalkan pembaruan cuaca berkala (setiap 5 jam)
            schedule.scheduleJob({ rule: '0 */5 * * *', tz: 'Asia/Jakarta' }, async () => {
                console.log(`Memperbarui cuaca (Asia/Jakarta) untuk ID obrolan: ${configuredChatId}`);
                const weather = await getWeatherData(); // Ambil data cuaca
                if (weather) {
                    // Jika data cuaca tersedia, kirim info cuaca yang diformat dan pengingat
                    sendMessage(configuredChatId, `🌸 Cuaca hari ini:\n${getWeatherString(weather)}\n${getWeatherReminder(weather)}`);
                } else {
                    // Jika data cuaca tidak dapat diambil, kirim pesan kesalahan
                    sendMessage(configuredChatId, `Hmm... Alya sedang tidak dapat mengambil data cuaca. ${Mood.SAD.emoji}`);
                }
            });

            // Jadwalkan notifikasi lagu sedih pada 22:00 (10 malam) setiap hari
            schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Asia/Jakarta' }, async () => { // Jadikan async
                console.log(`Mengirim notifikasi lagu sedih pada 22:00 (Asia/Jakarta) ke ${configuredChatId}`);
                // sendSadSongNotification(configuredChatId); // Ini perlu di-refactor jika sendSadSongNotification tidak lagi memiliki akses langsung ke bot instance
            });

            // Jadwalkan pembersihan cache dan memori otomatis setiap 30 menit
            setInterval(cleanupCacheAndMemory, CACHE_CLEANUP_INTERVAL_MS);
            console.log(`Pembersihan cache dan memori terjadwal setiap ${CACHE_CLEANUP_INTERVAL_MS / 1000 / 60} menit.`);

            // Jadwalkan pembaruan mode berbasis waktu (mood acak dan deeptalk) setiap jam pada awal jam
            schedule.scheduleJob({ rule: '0 * * * *', tz: 'Asia/Jakarta' }, () => {
                updateTimeBasedModes(configuredChatId);
            });
            if (config.calendarificApiKey && config.TARGET_CHAT_ID) {
                schedule.scheduleJob({ rule: '0 7 * * *', tz: 'Asia/Jakarta' }, async () => {
                    console.log('[Core] Menjalankan pemeriksaan hari libur harian...');
                    await holidaysModule.checkAndNotifyDailyHolidays(
                        config.calendarificApiKey,
                        'ID', // Kode negara, contoh 'ID' untuk Indonesia
                        (message) => {
                            
                            sendMessage(config.TARGET_CHAT_ID, message);
                        }
                    );
                });
                console.log(`[Core] Pemeriksaan hari libur harian dijadwalkan setiap pukul 07:00 untuk chat ID: ${config.TARGET_CHAT_ID}`);
            } else {
                if (!config.calendarificApiKey) {
                    console.warn('[Core] Calendarific API Key tidak ditemukan di config.js. Pemeriksaan hari libur dinonaktifkan.');
                }
                if (!config.TARGET_CHAT_ID) {
                    console.warn('[Core] TARGET_CHAT_ID tidak ditemukan di config.js. Notifikasi hari libur tidak dapat dikirim.');
                }
            };
            // Jalankan sekali saat startup untuk mengatur mode/mood awal berdasarkan waktu saat ini
            updateTimeBasedModes(configuredChatId);
        }
    }
};


