/**
 * weather.js - Weather Information Module
 *
 * This module provides weather-related functionality for the bot, including
 * fetching current weather data from OpenWeatherMap API, formatting it for
 * display, and generating contextual reminders based on weather conditions.
 *
 * Features:
 * - Fetches real-time weather data from OpenWeatherMap API
 * - Formats weather data into human-readable Indonesian text
 * - Provides contextual reminders based on weather conditions (rain, heat, etc.)
 * - Supports location-based weather lookup using coordinates
 * - Includes emoji icons for better visual representation
 *
 * The module uses axios for API calls and integrates with the mood system
 * to provide emotionally appropriate weather responses.
 *
 * @module modules/weather
 * @requires axios
 * @requires ../config/config
 * @requires ./mood
 * @requires ../utils/logger
 */

const axios = require('axios').default;
const config = require('../config/config');
const Mood = require('./mood');
const logger = require('../utils/logger');

/**
 * Formats raw weather data into a human-readable string in Indonesian.
 *
 * Takes the raw JSON response from OpenWeatherMap API and converts it into
 * a nicely formatted string with temperature, conditions, and humidity.
 * Includes emoji icons for visual appeal.
 *
 * @param {object} weatherData - Raw weather data from OpenWeatherMap API
 * @returns {string} Formatted weather description in Indonesian
 * @example
 * const formatted = getWeatherString(weatherData);
 * // Returns: "🌤️ Cuaca di Jakarta: 28°C (Berawan)\nTerasa seperti: 30°C\nKelembaban: 75%"
 */
const getWeatherString = (weatherData) => {
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return 'Maaf, Lumina tidak bisa mendapatkan informasi cuaca saat ini.';
    }
    const { temp, feels_like, humidity } = weatherData.main;
    const description = weatherData.weather[0].description;
    const cityName = weatherData.name || 'lokasi Anda';

    // Format description with a capital letter at the beginning
    const formattedDescription = description.charAt(0).toUpperCase() + description.slice(1);

    return (
        `🌤️ Cuaca di ${cityName}: ${Math.round(temp)}°C (${formattedDescription})\n` +
        `Terasa seperti: ${Math.round(feels_like)}°C\n` +
        `Kelembaban: ${humidity}%`
    );
};

/**
 * Provides personalized reminders based on the weather.
 * Reminders adapt based on the main weather condition.
 * @param {object} weatherData Weather data object from OpenWeatherMap API.
 * @param {string} userName Username for message personalization.
 * @returns {string} Personalized weather-related reminder message.
 */
const getWeatherReminder = (weatherData, userName = 'Tuan') => {
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return `Maaf, Lumina lagi pusing nih... ${Mood.SAD.emoji}`;
    }
    const weatherMain = weatherData.weather[0].main; // Main weather condition

    const reminders = {
        Rain: `Jangan lupa bawa payung atau jas hujan ya, ${userName}. ` +
            `Jaga kesehatan! ${Mood.NORMAL.emoji}`,
        Clear: 'Cuacanya cerah banget! Waktu yang pas buat produktif di luar, ' +
            `tapi jangan lupa pakai sunscreen ya, ${userName}! ${Mood.HAPPY.emoji}`,
        Clouds: `Langitnya berawan, mungkin akan teduh. Tetap semangat ya, ${userName}! ${Mood.NORMAL.emoji}`,
        Thunderstorm: `Ada badai petir! Sebaiknya tetap di dalam ruangan yang aman ya, ${userName}. ${Mood.SAD.emoji}`,
        Snow: `Wah, ada salju! Pakai baju yang tebal ya, nanti kedinginan! ${Mood.HAPPY.emoji}`,
        Drizzle: `Gerimis manja nih, hati-hati di jalan ya kalau bepergian, ${userName}! ${Mood.NORMAL.emoji}`,
        Mist: `Ada kabut, hati-hati saat berkendara ya, ${userName}. Jarak pandang terbatas.`,
        Smoke: 'Ada asap, sebaiknya kurangi aktivitas di luar atau gunakan masker ya.',
        Haze: `Udara berkabut, jaga kesehatan pernapasan ya, ${userName}.`,
        Fog: `Kabut tebal, visibility sangat rendah. Hati-hati ya, ${userName}.`,
    };

    // Fallback if the weather condition is not on the list
    return reminders[weatherMain] || `Jaga diri baik-baik ya hari ini, ${userName}! ${Mood.NORMAL.emoji}`;
};

/**
 * Fetches current weather data from OpenWeatherMap API.
 * If latitude and longitude are not provided, fallbacks from config will be used.
 * @param {number} [latitude] Latitude of the user's location (optional).
 * @param {number} [longitude] Longitude of the user's location (optional).
 * @returns {Promise<object|null>} Promise that resolves to the weather data object.
 */
const getWeatherData = async (latitude, longitude) => {
    try {
        const apiKey = config.weatherApiKey;

        // Use location from arguments, or fallback to config if not present
        const lat = latitude || config.latitude;
        const lon = longitude || config.longitude;

        if (!lat || !lon) {
            logger.error('Error: Invalid Latitude or Longitude and no fallback in config.');
            return null;
        }

        if (!apiKey) {
            logger.error('Weather API Key configuration missing in config.js.');
            return null;
        }

        const url = 'https://api.openweathermap.org/data/2.5/weather?' +
            `lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=id`;
        const response = await axios.get(url);
        logger.info(
            { event: 'weather_data_fetched', location: response.data.name },
            'Successfully fetched weather data.',
        );
        return response.data;
    } catch (error) {
        logger.error('Error fetching weather data:', error.message);
        if (error.response) {
            logger.error('Weather API response error status:', error.response.status);
            logger.error('Weather API response data:', error.response.data);
        }
        return null;
    }
};

module.exports = {
    getWeatherData,
    getWeatherString,
    getWeatherReminder,
};
