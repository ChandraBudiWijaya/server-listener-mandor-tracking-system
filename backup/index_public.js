// =======================================================
//   SERVER LISTENER - MANDOR BANANA TRACKING (V8 - PERBAIKAN LOGIKA LAST_LOCATION)
// =======================================================
//   Perubahan Utama:
//   - Memindahkan logika update 'last_location' ke bagian atas,
//     memastikan lokasi terakhir selalu diperbarui setiap ada data masuk,
//     terlepas dari jam kerja.
// -------------------------------------------------------

const mqtt = require('mqtt');
const admin = require('firebase-admin');

// --- KONFIGURASI ---
const MQTT_CONFIG = {
  host: 'mqtt://test.mosquitto.org',
  port: 1883,
  username: '',
  password: '',
  topic: 'mandor/tracking/data'
};
const SERVICE_ACCOUNT_KEY_PATH = './serviceaccountKey.json';

const WORK_SCHEDULES = {
  '1-4': [ { start: [7, 45], end: [12, 0] }, { start: [13, 0], end: [16, 0] } ],
  '5':   [ { start: [7, 45], end: [11, 30] }, { start: [13, 30], end: [16, 0] } ],
  '6':   [ { start: [7, 45], end: [12, 0] } ],
};

// --- INISIALISASI ---
try {
  const serviceAccount = require(SERVICE_ACCOUNT_KEY_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK (Firestore) berhasil diinisialisasi.');
} catch (error) {
  console.error('FATAL: Gagal menginisialisasi Firebase Admin SDK.', error);
  process.exit(1);
}

const db = admin.firestore();
const client = mqtt.connect(MQTT_CONFIG.host, {
  port: MQTT_CONFIG.port,
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
});

// --- LOGIKA KONEKSI MQTT ---
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

function isWorkTime(dateObject) {
  const day = dateObject.getDay();
  const timeInMinutes = dateObject.getHours() * 60 + dateObject.getMinutes();
  let schedule = null;
  if (day >= 1 && day <= 4) schedule = WORK_SCHEDULES['1-4'];
  else if (day === 5) schedule = WORK_SCHEDULES['5'];
  else if (day === 6) schedule = WORK_SCHEDULES['6'];
  if (!schedule) return false;
  for (const session of schedule) {
    const startInMinutes = session.start[0] * 60 + session.start[1];
    const endInMinutes = session.end[0] * 60 + session.end[1];
    if (timeInMinutes >= startInMinutes && timeInMinutes <= endInMinutes) return true;
  }
  return false;
}

async function processAndStoreLocation(data) {
  const { index_karyawan, lat, lng, device_timestamp } = data;
  
  const deviceTime = new Date(device_timestamp);
  if (isNaN(deviceTime.getTime())) {
    console.warn('Format device_timestamp tidak valid, dilewati.', device_timestamp);
    return;
  }

  const today = deviceTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const dailyLogCollectionName = `logs_${today}`;

  // 1. Simpan log mentah
  const logData = {
    ...data,
    device_timestamp: admin.firestore.Timestamp.fromDate(deviceTime),
    server_timestamp: admin.firestore.FieldValue.serverTimestamp()
  };
  const logCollectionRef = db.collection('employees').doc(index_karyawan).collection(dailyLogCollectionName);
  await logCollectionRef.add(logData);
  console.log(`-> Data mentah disimpan ke: employees/${index_karyawan}/${dailyLogCollectionName}`);

  // --- [PERBAIKAN] LOGIKA UPDATE LOKASI TERAKHIR DIPINDAHKAN KE SINI ---
  // 2. Update lokasi terakhir di dokumen utama karyawan (SELALU DIJALANKAN)
  const employeeDocRef = db.collection('employees').doc(index_karyawan);
  try {
      await employeeDocRef.update({
          last_location: {
              lat: lat,
              lng: lng,
              device_timestamp: admin.firestore.Timestamp.fromDate(deviceTime)
          }
      });
      console.log(`-> Lokasi terakhir untuk ${index_karyawan} berhasil diupdate.`);
  } catch(e) {
      console.error(`-> Gagal mengupdate lokasi terakhir untuk ${index_karyawan}:`, e.message);
  }

  // 3. Cek jam kerja, hanya untuk update summary
  if (!isWorkTime(deviceTime)) {
    console.log(`-> Aktivitas di luar jam kerja. Update summary dilewati.`);
    return;
  }
  
  // 4. Hitung durasi (hanya jika dalam jam kerja)
  const logsQuery = db.collection('employees').doc(index_karyawan).collection(dailyLogCollectionName)
    .orderBy('device_timestamp', 'desc').limit(2);
  const logsSnapshot = await logsQuery.get();
  
  let durationMinutes = 0;
  if (logsSnapshot.docs.length > 1) {
    const newLogTime = logsSnapshot.docs[0].data().device_timestamp.toMillis();
    const prevLogTime = logsSnapshot.docs[1].data().device_timestamp.toMillis();
    const durationSeconds = (newLogTime - prevLogTime) / 1000;
    if (durationSeconds > 0 && durationSeconds < 600) { 
        durationMinutes = durationSeconds / 60;
    } else {
        console.log(`-> Jeda waktu terlalu besar (${(durationSeconds/60).toFixed(1)} menit), durasi tidak dihitung.`);
    }
  }
  
  if (durationMinutes <= 0) {
    console.log(`-> Tidak ada durasi valid untuk diupdate.`);
    return;
  }
  console.log(`-> Durasi akurat dari log sebelumnya: ${durationMinutes.toFixed(2)} menit.`);

  // 5. Cek Geofence dan Update Summary
  const geofencesQuery = db.collection('geofences').where('assignedTo', '==', index_karyawan);
  const geofenceSnapshot = await geofencesQuery.get();
  let isInsideWorkArea = false;
  geofenceSnapshot.forEach(doc => {
      if (doc.data().coordinates && isPointInPolygon({ lat, lng }, doc.data().coordinates)) {
        isInsideWorkArea = true;
      }
  });

  const summaryDocRef = db.collection('daily_summaries').doc(`${index_karyawan}_${today}`);
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(summaryDocRef);
      const updatePayload = { lastUpdate: admin.firestore.FieldValue.serverTimestamp() };
      if (isInsideWorkArea) {
        updatePayload.totalWorkMinutes = admin.firestore.FieldValue.increment(durationMinutes);
      } else {
        updatePayload.totalOutsideAreaMinutes = admin.firestore.FieldValue.increment(durationMinutes);
      }
      
      if (!doc.exists) {
        transaction.set(summaryDocRef, {
          employeeId: index_karyawan,
          date: today,
          totalWorkMinutes: isInsideWorkArea ? durationMinutes : 0,
          totalOutsideAreaMinutes: isInsideWorkArea ? 0 : durationMinutes,
          ...updatePayload
        });
      } else {
        transaction.update(summaryDocRef, updatePayload);
      }
    });
    console.log(`-> Summary harian untuk ${index_karyawan} tanggal ${today} telah diperbarui.`);
  } catch (e) {
    console.error("Transaksi Gagal:", e);
  }
}

/**
 * Fungsi untuk mengecek apakah sebuah titik berada di dalam poligon.
 */
function isPointInPolygon(point, polygon) {
  let isInside = false;
  const { lat, lng } = point;
  if (!polygon || !Array.isArray(polygon)) {
    return false;
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}