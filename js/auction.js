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
let auctionPhase = "girls"; // girls → boys

/* =========================
   INCREMENT LOGIC
========================= */
function getIncrementStep() {
  if (currentBid < 50000) return 2000;
  if (currentBid < 100000) return 5000;
  return 10000;
}

function updateBidUI() {
  bidDisplay && (bidDisplay.textContent = `₹${currentBid.toLocaleString()}`);
  incrementBtn &&
    (incrementBtn.textContent = `+ ₹${getIncrementStep().toLocaleString()}`);
}

incrementBtn &&
  incrementBtn.addEventListener("click", () => {
    currentBid += getIncrementStep();

    // Budget cap only if team selected
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

/* =========================
   STAR RENDER
========================= */
function renderStars(count, cls) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= count ? cls : "muted"}">★</span>`;
  }
  return html;
}

/* =========================
   LOAD CURRENT PLAYER
========================= */
async function loadCurrentPlayer() {
  const auctionRef = doc(db, "auction", "current");
  const auctionSnap = await getDoc(auctionRef);
  if (!auctionSnap.exists()) return;

  const data = auctionSnap.data();
  currentPlayerId = data.currentPlayerId;
  auctionPhase = data.phase || "girls";

  if (!currentPlayerId) return;

  const playerSnap = await getDoc(doc(db, "players", currentPlayerId));
  if (!playerSnap.exists()) return;

  currentPlayerData = playerSnap.data();

  selectedTeamId = null;
  currentBid = currentPlayerData.basePrice || BASE_PRICE;

  playerNameEl.textContent = currentPlayerData.name || "-";
  basePriceEl.textContent = `Base Price: ₹${currentBid}`;
  roleEl.textContent = currentPlayerData.role || "-";

// ⭐ SAFE stats extraction (VERY IMPORTANT)
const stats = currentPlayerData.stats || {};

const batting =
  typeof stats.batting === "number" ? stats.batting : 0;

const bowling =
  typeof stats.bowling === "number" ? stats.bowling : 0;

battingEl.innerHTML = renderStars(batting, "bat");
bowlingEl.innerHTML = renderStars(bowling, "bowl");


  // PHOTO
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

  soldBtn.disabled = true;
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

    const btn = document.createElement("button");
    btn.className = "team-btn";
    btn.textContent = team.name;

    btn.onclick = () => {
      document.querySelectorAll(".team-btn").forEach(b =>
        b.classList.remove("selected")
      );
      btn.classList.add("selected");
      selectedTeamId = docSnap.id;
      soldBtn.disabled = false;
    };

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
  soldBadge.classList.remove("hidden");
  soldInfo.classList.remove("hidden");

  setTimeout(async () => {
    await moveToNextPlayer();
    await loadCurrentPlayer();
  }, 5000);
};

/* =========================
   UNSOLD
========================= */
unsoldBtn.onclick = async () => {
  await moveToNextPlayer();
  await loadCurrentPlayer();
};

/* =========================
   NEXT PLAYER (PHASE LOGIC)
========================= */
async function moveToNextPlayer() {
  const auctionRef = doc(db, "auction", "current");
  const auctionSnap = await getDoc(auctionRef);

  let phase = auctionSnap.data().phase || "girls";

  const q = query(collection(db, "players"), orderBy("__name__"));
  const snap = await getDocs(q);

  const players = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  /* =========================
     CHECK GIRLS LEFT
  ========================= */
  const unsoldGirls = players.filter(
    p => p.gender === "girl" && p.sold !== true
  );

  if (phase === "girls" && unsoldGirls.length === 0) {
    // 🔁 SWITCH PHASE
    phase = "boys";
    await updateDoc(auctionRef, { phase: "boys" });
  }

  /* =========================
     GET ELIGIBLE FOR CURRENT PHASE
  ========================= */
  const eligible = players.filter(
    p => p.gender === phase && p.sold !== true
  );

  if (eligible.length === 0) {
    alert("🎉 AUCTION COMPLETED!");
    return;
  }

  /* =========================
     SET NEXT PLAYER (NO LOOP, NO INDEX)
  ========================= */
  await updateDoc(auctionRef, {
    currentPlayerId: eligible[0].id
  });
}


/* =========================
   INIT
========================= */
loadCurrentPlayer();

