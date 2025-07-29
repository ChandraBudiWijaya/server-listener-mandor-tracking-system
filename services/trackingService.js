const { db } = require('../config/firebase');
const { isWorkTime } = require('../utils/time');
const { isPointInPolygon } = require('../utils/geo');
const admin = require('firebase-admin');

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

module.exports = { processAndStoreLocation };