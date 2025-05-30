// modules/weather.js

const axios = require('axios').default;
const config = require('../config/config'); 
const Mood  = require('./mood'); 
const USER_NAME = config.USER_NAME || 'Tuan'; 

/**
 * format data cuaca mentah jadi string yang mudah dibaca pengguna.
 * @param {object} weatherData  data cuaca yang diperoleh dari OpenWeatherMap API.
 * @returns {string} String yang diformat yang menjelaskan kondisi cuaca saat ini.
 */
const getWeatherString = (weatherData) => {
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return "Maaf, Lyra tidak bisa mendapatkan informasi cuaca saat ini.";
    }
    const { temp, feels_like, humidity } = weatherData.main;
    const description = weatherData.weather[0].description;

    return `Suhu ${Math.round(temp)}°C (Terasa ${Math.round(feels_like)}°C)\n` +
        `Kelembaban: ${humidity}%\n` +
        `Kondisi: ${description.charAt(0).toUpperCase() + description.slice(1)}`;
};

/**
 * Memberikan pengingat yang dipersonalisasi berdasarkan cuaca.
 * Pengingat beradaptasi berdasarkan kondisi cuaca utama.
 * @param {object} weatherData Objek data cuaca dari OpenWeatherMap API.
 * @returns {string} Pesan pengingat yang dipersonalisasi terkait cuaca.
 */
const getWeatherReminder = (weatherData) => {
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return `Maaf, ${USER_NAME}... Lyra lagi pusing nih... ${Mood.SAD.emoji}`;
    }
    const weatherMain = weatherData.weather[0].main; // Kondisi cuaca utama
    const description = weatherData.weather[0].description; // Deskripsi cuaca

    const reminders = {
        Rain: `Hujan-hujan gini, Tuan ${USER_NAME} jangan lupa payung! ${Mood.SAD.emoji}`,
        Clear: `Cuacanya cerah~, cocok buat produktivitas nih, ${USER_NAME}! ${Mood.HAPPY.emoji}`,
        Clouds: `Awan mendung nih, siapa tau hujan~ ${Mood.NORMAL.emoji}`,
        Thunderstorm: `Ada petir! Cepetan masuk rumah ${USER_NAME}! ${Mood.SAD.emoji}`,
        Snow: `Wah, ada salju! Pakai baju yang tebal ya, ${USER_NAME}! ${Mood.HAPPY.emoji}`,
        Drizzle: `Gerimis nih Tuan, hati-hati ya! ${Mood.NORMAL.emoji}`
    };

    // Fallback
    const weatherKey = reminders[weatherMain] ? weatherMain : 'Normal';
    return reminders[weatherKey] || `Cuaca hari ini ${description}, ${Mood.NORMAL.emoji}`; 
};

/**
 * Mengambil data cuaca saat ini dari OpenWeatherMap API.
 * Membutuhkan latitude, Longitude, dan API Key yang dikonfigurasi di config.js.
 * @returns {Promise<object|null>} Promise yang menyelesaikan ke objek data cuaca saat berhasil, atau null saat terjadi kesalahan.
 */
const getWeatherData = async () => {
    try {
        const latitude = config.latitude;
        const longitude = config.longitude;
        const apiKey = config.weatherApiKey;

        if (!latitude || !longitude || !apiKey) {
            console.error("Konfigurasi API Cuaca (latitude, longitude, atau apiKey) hilang di config.js.");
            return null;
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=id`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error("Error fetching weather data:", error.message);
        if (error.response) {
            console.error("Status error respons API Cuaca:", error.response.status);
            console.error("Data respons API Cuaca:", error.response.data);
        }
        return null;
    }
};

module.exports = {
    getWeatherData,
    getWeatherString,
    getWeatherReminder,
};
