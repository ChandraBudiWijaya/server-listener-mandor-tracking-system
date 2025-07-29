// Memuat konfigurasi dari .env
require('dotenv').config();

// Memulai koneksi Firebase (harus dimuat sebelum yang lain)
require('./config/firebase');

// Memulai MQTT listener
const mqttListener = require('./config/mqtt');
mqttListener.startListener();

console.log('Server listener mandor telah dimulai...');