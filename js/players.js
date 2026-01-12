import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const playersTableBody = document.getElementById("playersTableBody");

async function loadPlayers() {
  const q = query(collection(db, "players"), orderBy("__name__"));
  const snapshot = await getDocs(q);

  playersTableBody.innerHTML = "";

  snapshot.forEach((docSnap, index) => {
    const p = docSnap.data();

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${p.name}</td>
      <td>${p.sold ? "SOLD" : "UNSOLD"}</td>
      <td>${p.sold ? p.soldTo : "—"}</td>
      <td>${p.sold ? "₹" + p.soldPrice.toLocaleString() : "—"}</td>
    `;

    playersTableBody.appendChild(row);
  });
}

loadPlayers();

// Auto refresh every 5 seconds
setInterval(loadPlayers, 5000);

