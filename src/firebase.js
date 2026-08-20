// src/firebase.js

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAYoRX-hnVy1Y8agYyaUtCBL4WmBhMYeAM",
  authDomain: "ibuddie-f5585.firebaseapp.com",
  databaseURL: "https://ibuddie-f5585-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ibuddie-f5585",
  storageBucket: "ibuddie-f5585.firebasestorage.app",
  messagingSenderId: "3985131383",
  appId: "1:3985131383:web:8b80a43de611d4f4e58372",
  measurementId: "G-6WGGNDJHQZ"
};


// Reuse the existing Firebase app if one already exists
const app = getApps().length > 0
  ? getApp()
  : initializeApp(firebaseConfig);

let analytics = null;

isSupported()
  .then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  })
  .catch((error) => {
    console.error("Firebase Analytics initialization failed:", error);
  });

export { app, analytics };