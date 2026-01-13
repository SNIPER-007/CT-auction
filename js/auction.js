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
const SOLD_DELAY = 5000;

/* =========================
   DOM ELEMENTS
========================= */
const teamsGrid = document.getElementById("teamsGrid");
const teamsTableBody = document.getElementById("teamsTableBody");

const bidDisplay = document.getElementById("bidDisplay");
const incrementBtn = document.getElementById("incrementBtn");
const soldBtn = document.querySelector(".sold-btn");
const unsoldBtn = document.querySelector(".unsold-btn");

const soldBadge = document.getElementById("soldBadge");
const soldInfo = document.getElementById("soldInfo");
const soldToEl = document.getElementById("soldTo");
const soldPriceEl = document.getElementById("soldPrice");

const soldSound = new Audio("assets/sounds/sold.mp3");
soldSound.volume = 0.8;

// Player UI
const playerNameEl = document.querySelector(".player-name");
const basePriceEl = document.querySelector(".base-price");
const roleEl = document.querySelector(".player-right .stat:nth-child(1) span");
const battingEl = document.querySelector(".player-right .stat:nth-child(2) span");
const bowlingEl = document.querySelector(".player-right .stat:nth-child(3) span");

/* =========================
   STATE
========================= */
let selectedTeamId = null;
let teamsCache = {};
let currentPlayerId = null;
let currentPlayerData = null;
let currentBid = BASE_PRICE;
let auctionPhase = "girl"; // girl → boy

/* =========================
   STAR RENDER (COLOR GRADED)
========================= */
function renderStars(rating) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= rating ? "filled" : ""}">★</span>`;
  }
  return html;
}

/* =========================
   BID INCREMENT SLABS
========================= */
function getIncrementStep(bid) {
  if (bid < 50000) return 2000;
  if (bid < 100000) return 5000;
  return 10000;
}

function updateIncrementButton() {
  const step = getIncrementStep(currentBid);
  incrementBtn.textContent = `+ ₹${step.toLocaleString()}`;
  return step;
}

/* =========================
   INCREMENT BID (ANYTIME)
========================= */
incrementBtn.onclick = () => {
  let step = updateIncrementButton();
  let nextBid = currentBid + step;

  if (selectedTeamId) {
    const team = teamsCache[selectedTeamId];
    const remaining = TOTAL_PLAYERS - (team.playersCount || 0);
    const maxBid = team.budget - (remaining - 1) * BASE_PRICE;
    if (nextBid > maxBid) nextBid = maxBid;
  }

  currentBid = nextBid;
  bidDisplay.textContent = `₹${currentBid.toLocaleString()}`;
  updateIncrementButton();
};

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

  playerNameEl.textContent = currentPlayerData.name;
  basePriceEl.textContent = `Base Price: ₹${BASE_PRICE.toLocaleString()}`;
  roleEl.textContent = currentPlayerData.role;

  battingEl.innerHTML = renderStars(currentPlayerData.batting || 0);
  bowlingEl.innerHTML = renderStars(currentPlayerData.bowling || 0);

  // Photo (manual by first name)
  const photoEl = document.querySelector(".player-photo");
  const firstName = currentPlayerData.name.split(" ")[0].toLowerCase();
  const imgPath = `assets/players/${firstName}.jpg`;

  photoEl.style.backgroundImage = `url('${imgPath}')`;
  const img = new Image();
  img.onerror = () => {
    photoEl.style.backgroundImage = `url('assets/players/default.jpg')`;
  };
  img.src = imgPath;

  currentBid = BASE_PRICE;
  bidDisplay.textContent = `₹${currentBid.toLocaleString()}`;
  updateIncrementButton();

  soldBtn.disabled = true;
  unsoldBtn.disabled = false;

  soldBadge.classList.add("hidden");
  soldInfo.classList.add("hidden");

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

    const btn = document.createElement("button");
    btn.className = "team-btn";
    btn.textContent = team.name;
    btn.dataset.teamId = docSnap.id;

    const gender = currentPlayerData.gender;
    const disable =
      team.playersCount >= 9 ||
      (gender === "boy" && team.boysCount >= 7) ||
      (gender === "girl" && team.girlsCount >= 2);

    if (disable) {
      btn.classList.add("disabled");
    } else {
      btn.onclick = () => selectTeam(btn);
    }

    teamsGrid.appendChild(btn);

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
   SELECT TEAM
========================= */
function selectTeam(button) {
  document.querySelectorAll(".team-btn").forEach(b =>
    b.classList.remove("selected")
  );
  button.classList.add("selected");
  selectedTeamId = button.dataset.teamId;
  soldBtn.disabled = false;
}

/* =========================
   SOLD
========================= */
soldBtn.onclick = async () => {
  if (!selectedTeamId) return;

  const team = teamsCache[selectedTeamId];
  const bidAmount = currentBid;
  const gender = currentPlayerData.gender;

  if (
    bidAmount < BASE_PRICE ||
    (gender === "boy" && team.boysCount >= 7) ||
    (gender === "girl" && team.girlsCount >= 2)
  ) return;

  await runTransaction(db, async tx => {
    const teamRef = doc(db, "teams", selectedTeamId);
    const playerRef = doc(db, "players", currentPlayerId);

    const t = (await tx.get(teamRef)).data();
    const p = (await tx.get(playerRef)).data();
    if (p.sold) throw "Already sold";

    tx.update(teamRef, {
      budget: t.budget - bidAmount,
      playersCount: t.playersCount + 1,
      [`${p.gender}sCount`]: t[`${p.gender}sCount`] + 1,
      players: [...t.players, { name: p.name, price: bidAmount }]
    });

    tx.update(playerRef, {
      sold: true,
      soldTo: t.name,
      soldPrice: bidAmount
    });
  });

  soldSound.play();
  soldBadge.classList.remove("hidden");
  soldInfo.classList.remove("hidden");
  soldToEl.textContent = team.name;
  soldPriceEl.textContent = bidAmount.toLocaleString();

  setTimeout(async () => {
    resetUI();
    await moveToNextPlayer();
    await loadCurrentPlayer();
  }, SOLD_DELAY);
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
   NEXT PLAYER (GIRLS FIRST)
========================= */
async function moveToNextPlayer() {
  const snap = await getDocs(query(collection(db, "players"), orderBy("__name__")));
  const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Check if girls still remain
  const girlsLeft = players.some(p => p.gender === "girl" && !p.sold);
  auctionPhase = girlsLeft ? "girl" : "boy";

  const filtered = players.filter(
    p => p.gender === auctionPhase && !p.sold
  );

  if (!filtered.length) {
    alert("🎉 Auction completed!");
    return;
  }

  await updateDoc(doc(db, "auction", "current"), {
    currentPlayerId: filtered[0].id
  });
}

/* =========================
   RESET
========================= */
function resetUI() {
  selectedTeamId = null;
  soldBtn.disabled = true;
  currentBid = BASE_PRICE;
  bidDisplay.textContent = `₹${BASE_PRICE.toLocaleString()}`;
  updateIncrementButton();
}

/* =========================
   INIT
========================= */
loadCurrentPlayer();

