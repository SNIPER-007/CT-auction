import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* =========================
   TEAMS (OWNER EMPTY FOR NOW)
   ========================= */
const teams = [
  { id: "team1", name: "Team Alpha" },
  { id: "team2", name: "Team Bravo" },
  { id: "team3", name: "Team Cyclone" },
  { id: "team4", name: "Team Dragon" }
];

/* =========================
   PLAYERS DATA (FINAL)
   ========================= */

const girls = [
  "Tisha","Yashvi","Urjaa","Shipra","Hirak","Kshitija","Khushi",
  "Vrushi","Meha","Diya Parekh","Aashna"
];

const boys = [
  "Parin","Jainam","Sayam","Siddesh","Shubham","Chittansh","Om",
  "Ayush","Triman","Shaurya","Vimal","Bhavya","Ankit","Pratik",
  "Smit","Khanjan","Samrudh","Siddh","Jugal","Harshil","Hemang",
  "Vaibhav","Parth","Partham","Jash Parekh","Kavish","Krish",
  "Manav","Tanish","Vedant","Harsh","Ronak","Ayush","Dhruvil",
  "Varun","Parth Parekh","Vansh","Aman","Yash","Paddy","Jay",
  "Preet","Dhruv"
];

const players = [...girls, ...boys].map((name, index) => ({
  id: `player${index + 1}`,
  name,
  gender: girls.includes(name) ? "girl" : "boy"
}));

/* =========================
   CREATE TEAMS
   ========================= */
async function createTeams() {
  for (const team of teams) {
    await setDoc(doc(db, "teams", team.id), {
      name: team.name,
      ownerName: "",
      budget: 100000,
      players: [],
      playersCount: 0,
      boysCount: 0,
      girlsCount: 0
    });
  }
  console.log("✅ Teams created");
}

/* =========================
   CREATE PLAYERS
   ========================= */
async function createPlayers() {
  for (const player of players) {
    await setDoc(doc(db, "players", player.id), {
      name: player.name,
      photoURL: "",
      basePrice: 10000,
      gender: player.gender,
      role: "All-Rounder",
      stats: {
        batting: 4,
        bowling: 4
      },
      sold: false,
      soldTo: null,
      soldPrice: null
    });
  }
  console.log("✅ Players created");
}

/* =========================
   AUCTION STATE
   ========================= */
async function createAuctionState() {
  await setDoc(doc(db, "auction", "current"), {
    currentPlayerId: players[0].id,
    status: "active"
  });
  console.log("✅ Auction state created");
}

/* =========================
   ONE-TIME INIT FUNCTION
   ========================= */
window.initDatabase = async function () {
  try {
    await createTeams();
    await createPlayers();
    await createAuctionState();
    alert("🎉 Database initialized successfully!");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    alert("Error initializing database. Check console.");
  }
};
