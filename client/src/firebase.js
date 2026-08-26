// Firebase client SDK setup for Bizness-OS-ERP.
// Exports Firestore (offline queue) and Realtime Database (notifications/presence)
// instances for use elsewhere in the React app.

import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDkvOIKV0R01gdkTUuR1CsrGUzjGZC8mcc",
  authDomain: "bizness-os.firebaseapp.com",
  databaseURL: "https://bizness-os-default-rtdb.firebaseio.com",
  projectId: "bizness-os",
  storageBucket: "bizness-os.firebasestorage.app",
  messagingSenderId: "754524588358",
  appId: "1:754524588358:web:5068091e42c78146ef7d47",
  measurementId: "G-CRBDBXL4SZ",
};

const app = initializeApp(firebaseConfig);

// Firestore — used as an offline write queue for specific modules (e.g. Sales/POS,
// stock counts) so field staff can keep working without a connection.
export const firestoreDb = getFirestore(app);

// Enable offline persistence so writes/reads work while disconnected and
// automatically sync once back online. Safe to call once at app startup.
enableIndexedDbPersistence(firestoreDb).catch((err) => {
  if (err.code === "failed-precondition") {
    // Multiple tabs open at once — persistence can only be enabled in one.
    console.warn("Firestore offline persistence disabled: multiple tabs open.");
  } else if (err.code === "unimplemented") {
    // Browser doesn't support the required IndexedDB APIs.
    console.warn("Firestore offline persistence not supported in this browser.");
  }
});

// Realtime Database — used for live notifications and presence.
export const realtimeDb = getDatabase(app);

// Firebase Auth — signed into via a custom token minted by the server after
// your normal JWT login succeeds, so Realtime Database/Firestore security
// rules can check auth != null and per-company claims.
export const firebaseAuth = getAuth(app);

export default app;
