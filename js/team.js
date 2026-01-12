// js/team.js
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { db } from "./firebase.js";

/* =========================
   DOM ELEMENTS
========================= */
const teamNameEl = document.getElementById("teamName");
const teamPlayersBody = document.getElementById("teamPlayersBody");
const exportBtn = document.getElementById("exportBtn");

/* =========================
   GET TEAM ID
========================= */
const params = new URLSearchParams(window.location.search);
const teamId = params.get("id");

if (!teamId) {
  alert("Invalid team");
  window.location.href = "login.html";
}

/* =========================
   LOAD TEAM DATA
========================= */
async function loadTeam() {
  const teamRef = doc(db, "teams", teamId);
  const snap = await getDoc(teamRef);

  if (!snap.exists()) {
    alert("Team not found");
    window.location.href = "login.html";
    return;
  }

  const team = snap.data();
  teamNameEl.textContent = team.name;

  teamPlayersBody.innerHTML = "";

  (team.players || []).forEach((player, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${player.name}</td>
      <td>₹${player.price.toLocaleString()}</td>
    `;
    teamPlayersBody.appendChild(row);
  });
}

/* =========================
   EXPORT AUCTION RESULT
========================= */
exportBtn.onclick = async () => {
  const teamRef = doc(db, "teams", teamId);
  const snap = await getDoc(teamRef);
  const team = snap.data();

  let csv = "Player,Price\n";
  (team.players || []).forEach(p => {
    csv += `${p.name},${p.price}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${team.name}_Auction_Result.csv`;
  a.click();

  URL.revokeObjectURL(url);
};

/* =========================
   INIT
========================= */
loadTeam();
