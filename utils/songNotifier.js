// utils/songNotifier.js
// For notifying song recomendations at night - 10 PM (Modular Update)

const sendMessage = require('./sendMessage')

const sadSongs = [
    {
        "title": "Car's Outside - James Arthur",
        "url": "https://www.youtube.com/watch?v=v27COkZT4GY&pp=0gcJCdgAo7VqN5tD",
        "reason": "Lagu buat kamu yang udah nyampe tapi nggak bisa ketemu, karena keadaan nggak pernah berpihak."
    },
    {
        "title": "Keane - Somewhere Only We Know (Official Music Video)",
        "url": "https://www.youtube.com/watch?v=Oextk-If8HQ",
        "reason": "Kalau kamu pernah punya tempat rahasia bareng seseorang, tapi sekarang cuma tinggal kenangan. :)"
    },
    {
        "title": "Armada - Asal Kau Bahagia (Official Lyric Video)",
        "url": "https://www.youtube.com/watch?v=py6GDNgye6k",
        "reason": "Saat mencintai harus rela ngelepas, karena yang kamu cintai lebih bahagia tanpa kamu."
    },
    {
        "title": "Armada - Hargai Aku (Official Music Video)",
        "url": "https://www.youtube.com/watch?v=9B7UcTBJYCA",
        "reason": "Tentang rasa lelah dicintai sepihak dan harapan kecil agar kamu dilihat dan dihargai."
    },
    {
        "title": "Impossible - James Arthur [Speed up] | (Lyrics & Terjemahan)",
        "url": "https://www.youtube.com/watch?v=p6om2S-ZpRY",
        "reason": "Cerita tentang cinta yang udah hancur, tapi sisa sakitnya tetap tinggal selamanya."
    },
    {
        "title": "Daun Jatuh - Resah Jadi Luka (Official Audio)",
        "url": "https://www.youtube.com/watch?v=tOMFR0nQt48",
        "reason": "Ketika rasa resah nggak pernah reda, dan akhirnya berubah jadi luka yang dalam."
    },
    {
        "title": "Keisya Levronka - Tak Ingin Usai (Official Lyric Video)",
        "url": "https://www.youtube.com/watch?v=FB1YNEOspyA",
        "reason": "Karena nggak semua pertemuan bisa selamanya, meski kamu nggak mau itu berakhir."
    },
    {
        "title": "VIONITA - DIA MASA LALUMU, AKU MASA DEPANMU (OFFICIAL MUSIC VIDEO)",
        "url": "https://www.youtube.com/watch?v=05wQrmLejyo",
        "reason": "Untuk seseorang yang belum bisa lepas dari masa lalu, padahal masa depannya udah di depan mata."
    }
];

/**
 * Memilih lagu sedih secara acak dari daftar.
 * @returns {object} Objek yang berisi judul dan URL lagu sedih acak.
 */
const getRandomSadSong = () => {
    const randomIndex = Math.floor(Math.random() * sadSongs.length);
    return sadSongs[randomIndex];
};

/**
 * Mengirim notifikasi lagu sedih secara acak.
 * @param {string|number} chatId ID obrolan untuk mengirim notifikasi.
 */
const sendSadSongNotification = async (chatId) => {
    const song = getRandomSadSong();
    sendMessage(chatId, `🎶 Judul: ${song.title}\n${song.reason}\n${song.url}`);
};

module.exports = sendSadSongNotification;