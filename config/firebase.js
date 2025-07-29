const admin = require('firebase-admin');

try {
  const serviceAccount = require(`../${process.env.SERVICE_ACCOUNT_KEY_PATH}`);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK (Firestore) berhasil diinisialisasi.');
} catch (error) {
  console.error('FATAL: Gagal menginisialisasi Firebase Admin SDK.', error);
  process.exit(1);
}

const db = admin.firestore();

module.exports = { db };