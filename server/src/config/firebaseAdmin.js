const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

const serviceAccountPath = path.resolve(
  __dirname,
  '..',
  '..',
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './src/config/firebase-service-account.json'
);

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://bizness-os-default-rtdb.firebaseio.com',
});

// Realtime Database — notifications, presence
const realtimeDb = admin.database();

// Firestore — offline queue sync target
const firestoreDb = admin.firestore();

// Mint a Firebase custom token for a user after your normal JWT login succeeds,
// so the client can sign into Firebase and satisfy `auth != null` in security
// rules. Include companyId as a custom claim so rules can scope access per company.
async function createFirebaseCustomToken(userId, companyId) {
  return admin.auth().createCustomToken(String(userId), { companyId: String(companyId) });
}

// Push a notification to a specific user within a company. Call this from
// wherever a relevant event happens server-side (e.g. invoice approved,
// low stock alert, task assigned).
async function pushNotification(companyId, userId, notification) {
  const ref = realtimeDb.ref(`notifications/${companyId}/${userId}`).push();
  await ref.set({
    ...notification,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    read: false,
  });
  return ref.key;
}

// Mark a user as online/offline for presence tracking. Typically called on
// socket/session connect and disconnect, or on a heartbeat interval.
async function setPresence(companyId, userId, isOnline) {
  const ref = realtimeDb.ref(`presence/${companyId}/${userId}`);
  await ref.set({
    online: isOnline,
    lastSeen: admin.database.ServerValue.TIMESTAMP,
  });
}

module.exports = {
  admin,
  realtimeDb,
  firestoreDb,
  createFirebaseCustomToken,
  pushNotification,
  setPresence,
};
