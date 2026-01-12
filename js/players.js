import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { db } from "./firebase.js";

const tableBody = document.getElementById("playersTableBody");

async function loadPlayers() {
  try {
    const q = query(collection(db, "players"), orderBy("__name__"));
    const snapshot = await getDocs(q);

    tableBody.innerHTML = "";
    let i = 1;

    snapshot.forEach(docSnap => {
      const p = docSnap.data();

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${i++}</td>
        <td>${p.name}</td>
        <td>${p.sold ? "SOLD" : "UNSOLD"}</td>
        <td>${p.sold ? p.soldTo : "—"}</td>
        <td>${p.sold ? "₹" + p.soldPrice.toLocaleString() : "—"}</td>
      `;

      tableBody.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load players:", err);
  }
}

loadPlayers();
