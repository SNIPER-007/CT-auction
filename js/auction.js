import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  runTransaction,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { db } from "./firebase.js";

/* =========================
   CONSTANTS
========================= */
const TOTAL_PLAYERS = 9;
const BASE_PRICE = 10000;

/* =========================
   DOM ELEMENTS
========================= */
const soldBadge = document.getElementById("soldBadge");
const soldInfo = document.getElementById("soldInfo");
const soldToEl = document.getElementById("soldTo");
const soldPriceEl = document.getElementById("soldPrice");

const playerNameEl = document.querySelector(".player-name");
const basePriceEl = document.querySelector(".base-price");
const roleEl = document.querySelector(".player-right .stat:nth-child(1) span");
const battingEl = document.querySelector(".player-right .stat:nth-child(2) span");
const bowlingEl = document.querySelector(".player-right .stat:nth-child(3) span");
const playerPhotoEl = document.querySelector(".player-photo");

const teamsGrid = document.getElementById("teamsGrid");
const teamsTableBody = document.getElementById("teamsTableBody");

const bidDisplay = document.getElementById("bidDisplay"); // span/div showing bid
const incrementBtn = document.getElementById("incrementBtn");

const soldBtn = document.querySelector(".sold-btn");
const unsoldBtn = document.querySelector(".unsold-btn");

/* =========================
   STATE
========================= */
let selectedTeamId = null;
let teamsCache = {};
let currentPlayerId = null;
let currentPlayerData = null;
let currentBid = BASE_PRICE;

/* =========================
   STAR RENDERER
========================= */
function renderStars(value) {
  let stars = "";
  for (let i = 1; i <= 5; i++) {
    stars += i <= value ? "★" : "☆";
  }

  let color = value <= 2 ? "#ff4d4d" : value === 3 ? "#ffc107" : "#4caf50";
  return `<span style="color:${color}">${stars}</span>`;
}

/* =========================
   LOAD CURRENT PLAYER
========================= */
async function loadCurrentPlayer() {
  const auctionSnap = await getDoc(doc(db, "auction", "current"));
  if (!auctionSnap.exists()) return;

  currentPlayerId = auctionSnap.data().currentPlayerId;

  const playerSnap = await getDoc(doc(db, "players", currentPlayerId));
  if (!playerSnap.exists()) return;

  currentPlayerData = playerSnap.data();

  // Text
  playerNameEl.textContent = currentPlayerData.name;
  basePriceEl.textContent = `Base Price: ₹${currentPlayerData.basePrice}`;
  roleEl.textContent = currentPlayerData.role;

  // ⭐ Dynamic stats
  battingEl.innerHTML = renderStars(currentPlayerData.stats?.batting || 0);
  bowlingEl.innerHTML = renderStars(currentPlayerData.stats?.bowling || 0);

  // 📸 Photo (manual filename system)
  const firstName = currentPlayerData.name.split(" ")[0].toLowerCase();
  const imgPath = `assets/players/${firstName}.jpg`;

  playerPhotoEl.style.backgroundImage = `url('${imgPath}')`;
  playerPhotoEl.textContent = "";

  const img = new Image();
  img.onerror = () => {
    playerPhotoEl.style.backgroundImage = `url('assets/players/default.jpg')`;
  };
  img.src = imgPath;

  // SOLD badge
  if (currentPlayerData.sold) {
    soldBadge.classList.remove("hidden");
    soldInfo.classList.remove("hidden");
    soldToEl.textContent = currentPlayerData.soldTo;
    soldPriceEl.textContent = currentPlayerData.soldPrice;
  } else {
    soldBadge.classList.add("hidden");
    soldInfo.classList.add("hidden");
  }

  // Reset bid
  currentBid = BASE_PRICE;
  bidDisplay.textContent = `₹${currentBid}`;

  soldBtn.disabled = true;     // 🔒 until team selected
  unsoldBtn.disabled = false; // ✅ always allowed

  await loadTeams();
}

/* =========================
   LOAD TEAMS
========================= */
async function loadTeams() {
  const snapshot = await getDocs(collection(db, "teams"));
  teamsGrid.innerHTML = "";
  teamsTableBody.innerHTML = "";
  teamsCache = {};

  snapshot.forEach(docSnap => {
    const team = docSnap.data();
    teamsCache[docSnap.id] = team;

    const btn = document.createElement("button");
    btn.className = "team-btn";
    btn.textContent = team.name;
    btn.onclick = () => selectTeam(docSnap.id, btn);
    teamsGrid.appendChild(btn);

    const players = team.players?.map(p => p.name).join(", ") || "—";
    teamsTableBody.innerHTML += `
      <tr>
        <td>${team.name}</td>
        <td>₹${team.budget}</td>
        <td>${players}</td>
      </tr>
    `;
  });
}

/* =========================
   SELECT TEAM
========================= */
function selectTeam(teamId, button) {
  document.querySelectorAll(".team-btn").forEach(b => b.classList.remove("selected"));
  button.classList.add("selected");

  selectedTeamId = teamId;
  soldBtn.disabled = false; // 🔓 now allowed
}

/* =========================
   BID INCREMENT (NO TEAM REQUIRED)
========================= */
incrementBtn.onclick = () => {
  if (currentBid < 50000) currentBid += 2000;
  else if (currentBid < 100000) currentBid += 5000;
  else currentBid += 10000;

  bidDisplay.textContent = `₹${currentBid}`;
};

/* =========================
   SOLD LOGIC
========================= */
soldBtn.onclick = async () => {
  if (!selectedTeamId) return;

  const team = teamsCache[selectedTeamId];
  const remaining = TOTAL_PLAYERS - (team.playersCount || 0);
  const maxBid = team.budget - (remaining - 1) * BASE_PRICE;

  if (currentBid > maxBid) {
    alert("❌ Team cannot afford this bid");
    return;
  }

  await runTransaction(db, async tx => {
    const teamRef = doc(db, "teams", selectedTeamId);
    const playerRef = doc(db, "players", currentPlayerId);

    const t = (await tx.get(teamRef)).data();

    tx.update(teamRef, {
      budget: t.budget - currentBid,
      playersCount: (t.playersCount || 0) + 1,
      players: [...t.players, { name: currentPlayerData.name, price: currentBid }]
    });

    tx.update(playerRef, {
      sold: true,
      soldTo: t.name,
      soldPrice: currentBid
    });
  });

  soldBadge.classList.remove("hidden");

  setTimeout(async () => {
    await moveToNextPlayer();
    await loadCurrentPlayer();
  }, 5000); // ⏳ wait for animation
};

/* =========================
   UNSOLD LOGIC (ALWAYS WORKS)
========================= */
unsoldBtn.onclick = async () => {
  await moveToNextPlayer();
  await loadCurrentPlayer();
};

/* =========================
   NEXT PLAYER (GIRLS FIRST)
========================= */
async function moveToNextPlayer() {
  const snap = await getDocs(query(collection(db, "players"), orderBy("__name__")));
  const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const girls = players.filter(p => p.gender === "girl" && !p.sold);
  const boys = players.filter(p => p.gender === "boy" && !p.sold);

  const next = girls.length ? girls[0] : boys[0];
  if (!next) {
    alert("🎉 Auction Completed");
    return;
  }

  await updateDoc(doc(db, "auction", "current"), {
    currentPlayerId: next.id
  });
}

/* =========================
   INIT
========================= */
loadCurrentPlayer();
