const ADMIN_USER = "cp";
const ADMIN_PASS = "cp7";

// LOGIN PAGE
const loginBtn = document.getElementById("loginBtn");

if (loginBtn) {
  loginBtn.onclick = () => {
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;

    if (u === ADMIN_USER && p === ADMIN_PASS) {
      localStorage.setItem("auctionAdmin", "true");
      window.location.href = "index.html";
    } else {
      document.getElementById("loginError").classList.remove("hidden");
    }
  };
}

// PROTECT INDEX PAGE
if (window.location.pathname.includes("index.html")) {
  if (localStorage.getItem("auctionAdmin") !== "true") {
    window.location.href = "login.html";
  }
}
