const admin = require('firebase-admin');

try {
  let serviceAccount;
  if (process.env.SERVICE_ACCOUNT_KEY_JSON) {
    serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY_JSON);
  } else if (process.env.SERVICE_ACCOUNT_KEY_PATH) {
    serviceAccount = require(`../${process.env.SERVICE_ACCOUNT_KEY_PATH}`);
  } else {
    serviceAccount = require('../serviceaccountkey.json');
  }
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