const mqtt = require('mqtt');
const { processAndStoreLocation } = require('../services/trackingService');

const MQTT_CONFIG = {
  host: process.env.MQTT_HOST,
  port: process.env.MQTT_PORT,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  topic: process.env.MQTT_TOPIC
};

const client = mqtt.connect(MQTT_CONFIG.host, {
  port: MQTT_CONFIG.port,
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
});

function startListener() {
  client.on('connect', () => {
    console.log('Berhasil terhubung ke MQTT Broker.');
    client.subscribe(MQTT_CONFIG.topic, (err) => {
      if (!err) {
        console.log(`Berhasil subscribe ke topik: "${MQTT_CONFIG.topic}"`);
      } else {
        console.error('Gagal subscribe ke MQTT:', err);
      }
    });
  });

  client.on('message', async (topic, message) => {
    if (topic === MQTT_CONFIG.topic) {
      try {
        const data = JSON.parse(message.toString());
        console.log(`\n[${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}] Menerima data untuk: ${data.index_karyawan}`);
        
        if (!data.index_karyawan || data.lat === undefined || data.lng === undefined || !data.device_timestamp) {
          console.warn('Data tidak lengkap, dilewati.', data);
          return;
        }
        await processAndStoreLocation(data);
      } catch (e) {
        console.error('Terjadi error saat memproses pesan:', e);
      }
    }
  });

  client.on('error', (err) => {
    console.error('Koneksi MQTT Error:', err);
  });
}

module.exports = { startListener };