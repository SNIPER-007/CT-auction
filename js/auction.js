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
const teamsMenu = document.getElementById("teamsMenu");

// SOLD badge
const soldBadge = document.getElementById("soldBadge");
const soldInfo = document.getElementById("soldInfo");
const soldToEl = document.getElementById("soldTo");
const soldPriceEl = document.getElementById("soldPrice");

const soldSound = new Audio("assets/sounds/sold.mp3");
soldSound.volume = 0.8;

// Player card
const playerNameEl = document.querySelector(".player-name");
const basePriceEl = document.querySelector(".base-price");
const roleEl = document.querySelector(".player-right .stat:nth-child(1) span");
const battingEl = document.querySelector(".player-right .stat:nth-child(2) span");
const bowlingEl = document.querySelector(".player-right .stat:nth-child(3) span");

// Teams & bidding
const teamsGrid = document.getElementById("teamsGrid");
const teamsTableBody = document.getElementById("teamsTableBody");
const bidInput = document.getElementById("bidInput");
const soldBtn = document.querySelector(".sold-btn");
const unsoldBtn = document.querySelector(".unsold-btn");

/* =========================
   STATE
========================= */
let selectedTeamId = null;
let teamsCache = {};
let currentPlayerId = null;
let currentPlayerData = null;

/* =========================
   BID INPUT HANDLER
========================= */
bidInput.addEventListener("input", () => {
  bidInput.value = bidInput.value.replace(/[^0-9]/g, "");

  if (!selectedTeamId) return;

  const team = teamsCache[selectedTeamId];
  if (!team) return;

  const value = Number(bidInput.value);
  const remaining = TOTAL_PLAYERS - (team.playersCount || 0);
  const maxBid = team.budget - (remaining - 1) * BASE_PRICE;

  if (value > maxBid) {
    bidInput.value = String(maxBid);
  }
});

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
  basePriceEl.textContent = `Base Price: ₹${currentPlayerData.basePrice.toLocaleString()}`;
  roleEl.textContent = currentPlayerData.role;
  battingEl.textContent = "★★★★☆";
  bowlingEl.textContent = "★★★★☆";

  // ✅ MANUAL PHOTO SYSTEM
  const playerPhotoEl = document.querySelector(".player-photo");

  const firstName = currentPlayerData.name
    .split(" ")[0]
    .toLowerCase();

  const photoPath = `assets/players/${firstName}.jpg`;

  playerPhotoEl.style.backgroundImage = `url('${photoPath}')`;
  playerPhotoEl.textContent = "";

  // Fallback if image not found
  const testImg = new Image();
  testImg.onerror = () => {
    playerPhotoEl.style.backgroundImage = `url('assets/players/default.jpg')`;
  };
  testImg.src = photoPath;

  // SOLD badge
  if (currentPlayerData.sold) {
    soldBadge.classList.remove("hidden");
    soldInfo.classList.remove("hidden");
    soldToEl.textContent = currentPlayerData.soldTo;
    soldPriceEl.textContent = currentPlayerData.soldPrice.toLocaleString();
  } else {
    soldBadge.classList.add("hidden");
    soldInfo.classList.add("hidden");
  }

  unsoldBtn.disabled = false;
  await loadTeams();
}

/* =========================
   LOAD TEAMS
========================= */
async function loadTeams() {
  const snapshot = await getDocs(collection(db, "teams"));

  teamsMenu.innerHTML = "";
  teamsGrid.innerHTML = "";
  teamsTableBody.innerHTML = "";
  teamsCache = {};

  snapshot.forEach(docSnap => {
    const team = docSnap.data();
    teamsCache[docSnap.id] = team;

    // Hamburger
    const link = document.createElement("a");
    link.href = `team.html?id=${docSnap.id}`;
    link.className = "menu-link";
    link.textContent = team.name;
    teamsMenu.appendChild(link);

    // Team button
    const btn = document.createElement("button");
    btn.className = "team-btn";
    btn.textContent = team.name;
    btn.dataset.teamId = docSnap.id;

    const boys = team.boysCount || 0;
    const girls = team.girlsCount || 0;
    const total = team.playersCount || 0;
    const gender = currentPlayerData?.gender;

    let disable = false;
    if (total >= 9) disable = true;
    if (gender === "girl" && girls >= 2) disable = true;
    if (gender === "boy" && boys >= 7) disable = true;

    if (disable) {
      btn.classList.add("disabled");
    } else {
      btn.onclick = () => selectTeam(btn);
    }

    teamsGrid.appendChild(btn);

    const players =
      team.players?.map(p => p.name).join(", ") || "—";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${team.name}</td>
      <td>₹${team.budget.toLocaleString()}</td>
      <td>${players}</td>
    `;
    teamsTableBody.appendChild(row);
  });
}

/* =========================
   SELECT TEAM
========================= */
function selectTeam(button) {
  document.querySelectorAll(".team-btn").forEach(b =>
    b.classList.remove("selected")
  );

  button.classList.add("selected");
  selectedTeamId = button.dataset.teamId;

  bidInput.disabled = false;
  soldBtn.disabled = false;
  bidInput.value = String(BASE_PRICE);
  bidInput.focus();
}

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

  for (let i = 0; i <= idx; i++) {
    if (!players[i].sold) {
      await updateDoc(doc(db, "auction", "current"), {
        currentPlayerId: players[i].id
      });
      return;
    }
  }

  alert("🎉 Auction completed!");
}

/* =========================
   SOLD
========================= */
soldBtn.onclick = async () => {
  if (!selectedTeamId) return;

  const team = teamsCache[selectedTeamId];
  const gender = currentPlayerData.gender;
  const bidAmount = Number(bidInput.value);

  if (!bidAmount || bidAmount < BASE_PRICE) return;
  if (gender === "girl" && (team.girlsCount || 0) >= 2) return;
  if (gender === "boy" && (team.boysCount || 0) >= 7) return;

  try {
    await runTransaction(db, async tx => {
      const teamRef = doc(db, "teams", selectedTeamId);
      const playerRef = doc(db, "players", currentPlayerId);

      const t = (await tx.get(teamRef)).data();
      const p = (await tx.get(playerRef)).data();
      if (p.sold) throw "Already sold";

      tx.update(teamRef, {
        budget: t.budget - bidAmount,
        playersCount: (t.playersCount || 0) + 1,
        [`${p.gender}sCount`]: (t[`${p.gender}sCount`] || 0) + 1,
        players: [...t.players, { name: p.name, price: bidAmount }]
      });

      tx.update(playerRef, {
        sold: true,
        soldTo: t.name,
        soldPrice: bidAmount
      });
    });

    soldSound.currentTime = 0;
    soldSound.play();

    soldBadge.classList.remove("hidden");
    soldInfo.classList.remove("hidden");

    resetUI();
    await moveToNextPlayer();
    await loadCurrentPlayer();

  } catch (e) {
    console.error(e);
  }
};

/* =========================
   UNSOLD
========================= */
unsoldBtn.onclick = async () => {
  resetUI();
  await moveToNextPlayer();
  await loadCurrentPlayer();
};

/* =========================
   RESET
========================= */
function resetUI() {
  selectedTeamId = null;
  bidInput.value = "";
  bidInput.disabled = true;
  soldBtn.disabled = true;
  unsoldBtn.disabled = true;
  document.querySelectorAll(".team-btn").forEach(b =>
    b.classList.remove("selected")
  );
}

/* =========================
   INIT
========================= */
loadCurrentPlayer();

document.querySelector(".fullscreen-btn").onclick = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};
