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
   BID LOGIC
========================= */
function getIncrementStep() {
  if (currentBid < 50000) return 2000;
  if (currentBid < 100000) return 5000;
  return 10000;
}

function updateBidUI() {
  bidDisplay.textContent = `₹${currentBid.toLocaleString()}`;
  incrementBtn.textContent = `+ ₹${getIncrementStep().toLocaleString()}`;
}

incrementBtn.onclick = () => {
  currentBid += getIncrementStep();

  if (selectedTeamId) {
    const team = teamsCache[selectedTeamId];
    const remaining = TOTAL_PLAYERS - (team.playersCount || 0);
    const maxBid = team.budget - (remaining - 1) * BASE_PRICE;
    if (currentBid > maxBid) currentBid = maxBid;
  }
  updateBidUI();
};

/* =========================
   STARS
========================= */
function renderStars(v, cls) {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="star ${i < v ? cls : "muted"}">★</span>`
  ).join("");
}

/* =========================
   LOAD PLAYER
========================= */
async function loadCurrentPlayer() {
  const auctionSnap = await getDoc(doc(db, "auction", "current"));
  if (!auctionSnap.exists()) return;

  currentPlayerId = auctionSnap.data().currentPlayerId;
  if (!currentPlayerId) return;

  const playerSnap = await getDoc(doc(db, "players", currentPlayerId));
  if (!playerSnap.exists()) return;

  currentPlayerData = playerSnap.data();

  selectedTeamId = null;
  currentBid = currentPlayerData.basePrice || BASE_PRICE;

  playerNameEl.textContent = currentPlayerData.name;
  basePriceEl.textContent = `Base Price: ₹${currentBid}`;
  roleEl.textContent = currentPlayerData.role || "-";

  const stats = currentPlayerData.stats || {};
  battingEl.innerHTML = renderStars(stats.batting || 0, "bat");
  bowlingEl.innerHTML = renderStars(stats.bowling || 0, "bowl");

  const first = currentPlayerData.name.split(" ")[0].toLowerCase();
  playerPhotoEl.style.backgroundImage =
    `url('assets/images/${first}.jpeg'), url('assets/images/default.jpeg')`;

  soldBtn.disabled = true;
  unsoldBtn.disabled = false;
  soldBadge.classList.add("hidden");
  soldInfo.classList.add("hidden");

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

  snap.forEach(d => {
    const team = d.data();
    teamsCache[d.id] = team;

    const btn = document.createElement("button");
    btn.className = "team-btn";
    btn.textContent = team.name;

    btn.onclick = () => {
      document.querySelectorAll(".team-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedTeamId = d.id;
      soldBtn.disabled = false;
    };

    teamsGrid.appendChild(btn);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${team.name}</td>
      <td>₹${team.budget.toLocaleString()}</td>
      <td>${(team.players || []).map(p => p.name).join(", ") || "—"}</td>
    `;
    teamsTableBody.appendChild(row);
  });
}

/* =========================
   SOLD
========================= */
soldBtn.onclick = async () => {
  if (!selectedTeamId) return;

  await runTransaction(db, async tx => {
    const teamRef = doc(db, "teams", selectedTeamId);
    const playerRef = doc(db, "players", currentPlayerId);

    const team = (await tx.get(teamRef)).data();
    const player = (await tx.get(playerRef)).data();
    if (player.sold) return;

    const safePlayers = Array.isArray(team.players) ? team.players : [];

    tx.update(teamRef, {
      budget: team.budget - currentBid,
      playersCount: (team.playersCount || 0) + 1,
      [`${player.gender}sCount`]: (team[`${player.gender}sCount`] || 0) + 1,
      players: [...safePlayers, { name: player.name, price: currentBid }]
    });

    tx.update(playerRef, {
      sold: true,
      soldTo: team.name,
      soldPrice: currentBid
    });
  });

  soldSound.play();
  soldBadge.classList.remove("hidden");
  soldInfo.classList.remove("hidden");

  setTimeout(async () => {
    await moveToNextPlayer();
    await loadCurrentPlayer();
  }, 800);
};

/* =========================
   UNSOLD
========================= */
unsoldBtn.onclick = async () => {
  await moveToNextPlayer();
  await loadCurrentPlayer();
};

/* =========================
   NEXT PLAYER (BULLETPROOF)
========================= */
async function moveToNextPlayer() {
  const auctionRef = doc(db, "auction", "current");
  const auctionSnap = await getDoc(auctionRef);
  let phase = auctionSnap.data().phase || "girls";

  const snap = await getDocs(query(collection(db, "players"), orderBy("__name__")));
  const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const girlsLeft = players.some(p => p.gender === "girl" && !p.sold);
  if (phase === "girls" && !girlsLeft) {
    phase = "boys";
    await updateDoc(auctionRef, { phase: "boys" });
  }

  const next = players.find(
    p => p.gender === phase && !p.sold && p.id !== currentPlayerId
  );

  if (next) {
    await updateDoc(auctionRef, { currentPlayerId: next.id });
  }
}

/* =========================
   INIT
========================= */
loadCurrentPlayer();
