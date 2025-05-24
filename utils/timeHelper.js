// utils/timeHelper.js
function getJakartaTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

function getJakartaHour() {
    return getJakartaTime().getHours();
}

module.exports = { getJakartaTime, getJakartaHour };
