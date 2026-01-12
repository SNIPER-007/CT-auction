// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASwXGRZLvcSuJw-TxTYb95iyIaQQVO_yM",
  authDomain: "champions-trophy-auction.firebaseapp.com",
  projectId: "champions-trophy-auction",
  storageBucket: "champions-trophy-auction.firebasestorage.app",
  messagingSenderId: "982669387954",
  appId: "1:982669387954:web:577b97cb854e8eddb801ab"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔥 THIS LINE IS THE FIX
export { db };
