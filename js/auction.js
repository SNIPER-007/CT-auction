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
   DOM ELEMENTS (SAFE)
========================= */
const teamsGrid = document.getElementById("teamsGrid");
const teamsTableBody = document.getElementById("teamsTableBody");

const bidDisplay = document.getElementById("bidDisplay");
const incrementBtn = document.getElementById("incrementBtn");

const soldBtn = document.querySelector(".sold-btn");
const unsoldBtn = document.querySelector(".unsold-btn");

const playerNameEl = document.querySelector(".player-name");
const basePriceEl = document.querySelector(".base-price");
const roleEl = document.querySelector(".player-right .stat:nth-child(1) span");
const battingEl = document.querySelector(".player-right .stat:nth-child(2) span");
const bowlingEl = document.querySelector(".player-right .stat:nth-child(3) span");
const playerPhotoEl = document.querySelector(".player-photo");

const soldBadge = document.getElementById("soldBadge");
const soldInfo = document.getElementById("soldInfo");
const soldToEl = document.getElementById("soldTo");
const soldPriceEl = document.getElementById("soldPrice");

const soldSound = new Audio("assets/sounds/sold.mp3");
soldSound.volume = 0.9;

/* =========================
   STATE
========================= */
let selectedTeamId = null;
let teamsCache = {};
let currentPlayerId = null;
let currentPlayerData = null;
let currentBid = BASE_PRICE;

/* =========================
   INCREMENT LOGIC
========================= */
function getIncrementStep() {
  if (currentBid < 50000) return 2000;
  if (currentBid < 100000) return 5000;
  return 10000;
}

function updateBidUI() {
  if (bidDisplay) {
    bidDisplay.textContent = `₹${currentBid.toLocaleString()}`;
  }
  if (incrementBtn) {
    incrementBtn.textContent = `+ ₹${getIncrementStep().toLocaleString()}`;
  }
}

if (incrementBtn) {
  incrementBtn.disabled = false; // ✅ ALWAYS ENABLED
  incrementBtn.addEventListener("click", () => {
    currentBid += getIncrementStep();

    // Max bid protection ONLY if team selected
    if (selectedTeamId) {
      const team = teamsCache[selectedTeamId];
      if (team) {
        const remaining = TOTAL_PLAYERS - (team.playersCount || 0);
        const maxBid = team.budget - (remaining - 1) * BASE_PRICE;
        if (currentBid > maxBid) currentBid = maxBid;
      }
    }

    updateBidUI();
  });
}

/* =========================
   STAR RENDER (SAFE)
========================= */
function renderStars(count, colorClass) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= count ? colorClass : "muted"}">★</span>`;
  }
  return html;
}

/* =========================
   LOAD CURRENT PLAYER
========================= */
async function loadCurrentPlayer() {
  const auctionSnap = await getDoc(doc(db, "auction", "current"));
  if (!auctionSnap.exists()) return;

  currentPlayerId = auctionSnap.data().currentPlayerId;
  if (!currentPlayerId) return;

  const playerSnap = await getDoc(doc(db, "players", currentPlayerId));
  if (!playerSnap.exists()) return;

  currentPlayerData = playerSnap.data();

  // Reset state
  selectedTeamId = null;
  currentBid = currentPlayerData.basePrice || BASE_PRICE;

  // Text
  if (playerNameEl) playerNameEl.textContent = currentPlayerData.name || "-";
  if (basePriceEl) basePriceEl.textContent = `Base Price: ₹${currentPlayerData.basePrice || BASE_PRICE}`;
  if (roleEl) roleEl.textContent = currentPlayerData.role || "-";

  // Stars from Firestore stats
  const batting = currentPlayerData.stats?.batting || 0;
  const bowling = currentPlayerData.stats?.bowling || 0;

  if (battingEl) battingEl.innerHTML = renderStars(batting, "bat");
  if (bowlingEl) bowlingEl.innerHTML = renderStars(bowling, "bowl");

  // PHOTO: assets/images/tisha.jpeg
  if (playerPhotoEl) {
    const firstName = currentPlayerData.name.split(" ")[0].toLowerCase();
    const imgPath = `assets/images/${firstName}.jpeg`;

    const img = new Image();
    img.onload = () => {
      playerPhotoEl.style.backgroundImage = `url('${imgPath}')`;
      playerPhotoEl.textContent = "";
    };
    img.onerror = () => {
      playerPhotoEl.style.backgroundImage = `url('assets/images/default.jpeg')`;
      playerPhotoEl.textContent = "NO PHOTO";
    };
    img.src = imgPath;
  }

  // SOLD UI (GUARDED)
  if (currentPlayerData.sold) {
    soldBadge?.classList.remove("hidden");
    soldInfo?.classList.remove("hidden");
    if (soldToEl) soldToEl.textContent = currentPlayerData.soldTo || "";
    if (soldPriceEl) soldPriceEl.textContent = currentPlayerData.soldPrice || "";
  } else {
    soldBadge?.classList.add("hidden");
    soldInfo?.classList.add("hidden");
  }

  soldBtn.disabled = true;   // ❌ until team selected
  unsoldBtn.disabled = false;

  updateBidUI();
  await loadTeams();
}

/* =========================
   LOAD TEAMS
========================= */
async function loadTeams() {
  const snap = await getDocs(collection(db, "teams"));
  teamsGrid.innerHTML = "";
  teamsTableBody.innerHTML = "";
  teamsCache = {};

  snap.forEach(docSnap => {
    const team = docSnap.data();
    teamsCache[docSnap.id] = team;

    // Team select button
    const btn = document.createElement("button");
    btn.className = "team-btn";
    btn.textContent = team.name;

    btn.onclick = () => {
      document.querySelectorAll(".team-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedTeamId = docSnap.id;
      soldBtn.disabled = false; // ✅ ENABLE SOLD
    };

    teamsGrid.appendChild(btn);

    // Summary table
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${team.name}</td>
      <td>₹${team.budget.toLocaleString()}</td>
      <td>${team.players?.map(p => p.name).join(", ") || "—"}</td>
    `;
    teamsTableBody.appendChild(row);
  });
}

/* =========================
   SOLD
========================= */
soldBtn.addEventListener("click", async () => {
  if (!selectedTeamId) return;

  await runTransaction(db, async tx => {
    const teamRef = doc(db, "teams", selectedTeamId);
    const playerRef = doc(db, "players", currentPlayerId);

    const team = (await tx.get(teamRef)).data();
    const player = (await tx.get(playerRef)).data();
    if (player.sold) return;

    tx.update(teamRef, {
      budget: team.budget - currentBid,
      playersCount: (team.playersCount || 0) + 1,
      [`${player.gender}sCount`]: (team[`${player.gender}sCount`] || 0) + 1,
      players: [...team.players, { name: player.name, price: currentBid }]
    });

    tx.update(playerRef, {
      sold: true,
      soldTo: team.name,
      soldPrice: currentBid
    });
  });

  soldSound.play();
  soldBadge?.classList.remove("hidden");
  soldInfo?.classList.remove("hidden");

  setTimeout(async () => {
    await moveToNextPlayer();
    await loadCurrentPlayer();
  }, 5000);
});

/* =========================
   UNSOLD
========================= */
unsoldBtn.addEventListener("click", async () => {
  await moveToNextPlayer();
  await loadCurrentPlayer();
});

/* =========================
   NEXT PLAYER
========================= */
async function moveToNextPlayer() {
  const q = query(collection(db, "players"), orderBy("__name__"));
  const snap = await getDocs(q);
  const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const idx = players.findIndex(p => p.id === currentPlayerId);

  for (let i = idx + 1; i < players.length; i++) {
    if (!players[i].sold) {
      await updateDoc(doc(db, "auction", "current"), {
        currentPlayerId: players[i].id
      });
      return;
    }
  }
}

/* =========================
   INIT
========================= */
loadCurrentPlayer();
