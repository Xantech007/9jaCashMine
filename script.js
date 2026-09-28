let userData = null;

function formatExternalLink(url, defaultUrl) {
  if (!url || typeof url !== 'string' || !url.trim()) return defaultUrl;
  let clean = url.trim();
  clean = clean.replace(/^\/+/, '');
  if (/^(https?:\/\/|tg:\/\/|whatsapp:\/\/)/i.test(clean)) {
    return clean;
  }
  if (/^(t\.me|wa\.me|whatsapp\.com|telegram\.me)/i.test(clean)) {
    return 'https://' + clean;
  }
  if (/^\+?\d+$/.test(clean)) {
    return 'https://wa.me/' + clean.replace(/^\+/, '');
  }
  if (/^@?[a-zA-Z0-9_]+$/.test(clean)) {
    let username = clean.startsWith('@') ? clean.slice(1) : clean;
    return 'https://t.me/' + username;
  }
  return 'https://' + clean;
}

let isBouncing = false;
let hasRejectedWithdrawal = false;
let rejectedWithdrawalInfo = null;

try { userData = JSON.parse(localStorage.getItem("9jaCashUser")); } catch (e) { userData = null; }
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
if (!userData) { window.location.href = "login.html"; }

let balance = (userData ? parseFloat(userData.balance) : 0) || parseFloat(localStorage.getItem("walletBalance")) || 0;
let balanceHidden = false;
const CHECKIN_REWARDS = [500, 1000, 1500, 2000, 3000, 5000, 10000];
let checkinData = JSON.parse(localStorage.getItem("checkinData")) || { streak: 0, lastCheckin: null, claimedDays: [], checkedInToday: false };
const CLAIM_AMOUNT = 2000;
const CLAIM_INTERVAL = 60;
const MAX_CLAIMS_PER_DAY = 50;
let claimData = JSON.parse(localStorage.getItem("claimData")) || { count: 0, lastClaim: 0, dateStr: "", claimsToday: 0 };
let claimTimer = null;
let secondsLeft = CLAIM_INTERVAL;
let alreadyMinedToday = false;
let telegramLink = "https://t.me/apex_customercare";

const TUTORIAL_STEPS = [
  { id: "mineBtn", title: "Start Mining", desc: "Tap the Mine button to earn your first ₦30,000. Mining runs daily!", position: "bottom" },
  { id: "withdrawBtn", title: "Withdraw Cash", desc: "Tap Withdraw to cash out your earnings to your linked bank account.", position: "bottom" },
  { id: "tasksBtn", title: "Complete Tasks", desc: "Visit the Tasks page to earn extra cash by completing simple social media tasks.", position: "bottom" },
  { id: "eyeBtn", title: "Hide Balance", desc: "Tap the eye icon anytime to hide or show your balance for privacy.", position: "bottom" },
  { id: "claimArea", title: "Claim Every Minute", desc: "Tap Claim every 60 seconds to collect ₦2,000 free cash! Up to 50 times daily.", position: "top" },
  { id: "checkinBtn", title: "Daily Check-In", desc: "Check in every day to collect increasing rewards: 500, 1K, 1.5K, 2K, 3K, 5K, 10K!", position: "top" }
];
let currentTutorialStep = 0;
let tutorialActive = false;
let db = null;
let auth = null;

function initFirebase() {
  try {
    if (window._9jaCash && window._9jaCash.db) {
      db = window._9jaCash.db;
      auth = window._9jaCash.auth;
      return true;
    }
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      db = firebase.firestore();
      try { db.settings({ experimentalForceLongPolling: true }); } catch (e) { }
      auth = firebase.auth();
      return true;
    }
  } catch (e) { console.error("Firebase init error:", e); }
  return false;
}

function loadTelegramConfig() {
  const stored = localStorage.getItem("9jaCashAdminConfig");
  if (stored) { try { const config = JSON.parse(stored); if (config.telegramLink) telegramLink = config.telegramLink; } catch (e) { } }
  fetch(API_URL + "/api/settings")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      const s = data.settings || {};
      if (s.telegramLink) {
        telegramLink = s.telegramLink;
        localStorage.setItem("9jaCashAdminConfig", JSON.stringify({ telegramLink: telegramLink }));
        updateTelegramLink();
      }
    })
    .catch(function (err) { });
  updateTelegramLink();
}

function updateTelegramLink() {
  const btn = document.getElementById("telegramSupport");
  if (btn) {
    btn.href = "javascript:void(0)";
  }
}

function initDarkMode() {
  const isDark = localStorage.getItem("9jaCashDark") === "true";
  if (isDark) {
    document.body.classList.add("dark-mode");
    const icon = document.getElementById("themeIcon");
    const text = document.getElementById("themeText");
    if (icon) icon.className = "fa-solid fa-sun";
    if (text) text.textContent = "Light";
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("9jaCashDark", isDark);
  const icon = document.getElementById("themeIcon");
  const text = document.getElementById("themeText");
  if (isDark) { if (icon) icon.className = "fa-solid fa-sun"; if (text) text.textContent = "Light"; }
  else { if (icon) icon.className = "fa-solid fa-moon"; if (text) text.textContent = "Dark"; }
}

function initTutorial() {
  if (localStorage.getItem("9jaCashTutorialDone") === "true") return;
  setTimeout(function () { startTutorial(); }, 1500);
}

function startTutorial() {
  tutorialActive = true; currentTutorialStep = 0;
  document.getElementById("tutorialOverlay").classList.add("active");
  const skipBtn = document.getElementById("skipTourBtn");
  if (skipBtn) skipBtn.classList.add("show");
  const startBtn = document.getElementById("startTourBtn");
  if (startBtn) startBtn.style.display = "none";
  renderTutorialDots(); showTutorialStep(0);
}

function skipTutorial() { finishTutorial(); }

function renderTutorialDots() {
  const wrap = document.getElementById("tutorialProgress");
  wrap.innerHTML = "";
  TUTORIAL_STEPS.forEach(function (s, i) {
    const dot = document.createElement("div");
    dot.className = "tutorial-dot" + (i === 0 ? " active" : "");
    dot.id = "dot" + i; wrap.appendChild(dot);
  });
}

function showTutorialStep(index) {
  if (index >= TUTORIAL_STEPS.length) { finishTutorial(); return; }
  const step = TUTORIAL_STEPS[index];
  const target = document.getElementById(step.id);
  if (!target) { nextTutorial(); return; }
  document.querySelectorAll(".tutorial-glow").forEach(function (el) { el.classList.remove("tutorial-glow"); });
  target.classList.add("tutorial-glow");
  const rect = target.getBoundingClientRect();
  const highlight = document.getElementById("tutorialHighlight");
  const bubble = document.getElementById("tutorialBubble");
  highlight.style.left = (rect.left - 8) + "px";
  highlight.style.top = (rect.top - 8) + "px";
  highlight.style.width = (rect.width + 16) + "px";
  highlight.style.height = (rect.height + 16) + "px";
  document.getElementById("tutorialStepNum").textContent = "Step " + (index + 1) + " of " + TUTORIAL_STEPS.length;
  document.getElementById("tutorialTitle").textContent = step.title;
  document.getElementById("tutorialDesc").textContent = step.desc;
  bubble.className = "tutorial-bubble" + (step.position === "top" ? " top" : "");
  let bubbleTop, bubbleLeft;
  if (step.position === "bottom") { bubbleTop = rect.bottom + 20; } else { bubbleTop = rect.top - 180; }
  bubbleLeft = Math.max(20, Math.min(window.innerWidth - 320, rect.left + rect.width / 2 - 150));
  bubble.style.top = bubbleTop + "px";
  bubble.style.left = bubbleLeft + "px";
  TUTORIAL_STEPS.forEach(function (s, i) {
    const dot = document.getElementById("dot" + i);
    if (dot) dot.className = "tutorial-dot" + (i === index ? " active" : "");
  });
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}

function nextTutorial() {
  const currentStep = TUTORIAL_STEPS[currentTutorialStep];
  if (currentStep) {
    const target = document.getElementById(currentStep.id);
    if (target) target.classList.remove("tutorial-glow");
  }
  currentTutorialStep++; showTutorialStep(currentTutorialStep);
}

function finishTutorial() {
  tutorialActive = false;
  document.getElementById("tutorialOverlay").classList.remove("active");
  document.getElementById("tutorialProgress").innerHTML = "";
  document.querySelectorAll(".tutorial-glow").forEach(function (el) { el.classList.remove("tutorial-glow"); });
  const skipBtn = document.getElementById("skipTourBtn");
  if (skipBtn) skipBtn.classList.remove("show");
  const startBtn = document.getElementById("startTourBtn");
  if (startBtn) startBtn.style.display = "flex";
  localStorage.setItem("9jaCashTutorialDone", "true");
  showToast("Tour complete! Start earning!");
}

function checkPendingBounceOnLoad() {
  if (localStorage.getItem("pendingBounce")) {
    localStorage.removeItem("pendingBounce");
  }
}

function maskNum(num) { if (!num || num.length < 4) return "****"; return "**** " + num.slice(-4); }

function formatMoney(num) { return "₦" + Number(num || 0).toLocaleString("en-NG"); }

function updateBalance() {
  const el = document.getElementById("walletBalance");
  if (balanceHidden) { el.innerHTML = "****<span>.**</span>"; } else {
    const formatted = formatMoney(balance);
    if (formatted.includes(".")) { el.innerHTML = formatted.replace(/\.(\d+)$/, '<span>.$1</span>'); }
    else { el.innerHTML = formatted + '<span>.00</span>'; }
  }
  localStorage.setItem("walletBalance", balance);
}

function toggleBalance() {
  if (tutorialActive && currentTutorialStep === 3) { nextTutorial(); }
  balanceHidden = !balanceHidden;
  const icon = document.getElementById("eyeIcon");
  icon.style.opacity = "0";
  setTimeout(function () { icon.className = balanceHidden ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"; icon.style.opacity = "1"; }, 150);
  updateBalance();
}

function showToast(msg) {
  const t = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  setTimeout(function () { t.classList.remove("show"); }, 2500);
}

function fetchFirestoreUserData() {
  if (window._9jaCash && window._9jaCash.db && userData && userData.phone) {
    window._9jaCash.db.collection("users").doc(userData.phone).get()
      .then(function(doc) {
        if (doc.exists) {
          const data = doc.data();
          if (data.balance !== undefined) {
            balance = parseFloat(data.balance);
            userData.balance = balance;
          }
          if (data.totalMined !== undefined) {
            userData.totalMined = parseFloat(data.totalMined);
          }
          localStorage.setItem("walletBalance", balance);
          localStorage.setItem("9jaCashUser", JSON.stringify(userData));
          updateBalance();
          if (document.getElementById("totalMined")) {
            document.getElementById("totalMined").textContent = formatMoney(userData.totalMined || 0);
          }
        }
      })
      .catch(function(err) { console.error("Error fetching Firestore user data:", err); });
  }
}

function saveUserData() {
  localStorage.setItem("9jaCashUser", JSON.stringify(userData));
  localStorage.setItem("walletBalance", balance);

  fetch(API_URL + '/api/user/update-balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: userData.phone,
      password: userData.password,
      balance: balance,
      totalMined: userData.totalMined || 0
    })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.status && data.balance !== undefined) {
        balance = parseFloat(data.balance);
        userData.balance = balance;
        localStorage.setItem("walletBalance", balance);
        localStorage.setItem("9jaCashUser", JSON.stringify(userData));
        updateBalance();
      }
    })
    .catch(function (err) { console.error("Balance SQL update failed:", err); });

  if (window._9jaCash && window._9jaCash.db && userData && userData.phone) {
    window._9jaCash.db.collection("users").doc(userData.phone).set({
      balance: balance,
      totalMined: userData.totalMined || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
      .then(function () { console.log("Firestore balance synced successfully."); })
      .catch(function (err) { console.error("Firestore balance sync failed:", err); });
  }
}

function addToActivity(title, amount, type) {
  if (window._9jaCash && window._9jaCash.db && userData && userData.phone) {
    window._9jaCash.db.collection("users").doc(userData.phone).collection("activities").add({
      title: title,
      amount: amount,
      type: type,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) { console.error("Failed to write activity to Firestore:", err); });
  }
}

function initCheckin() {
  document.getElementById("streakCount").textContent = checkinData.streak;
  for (let i = 0; i < 7; i++) {
    const el = document.getElementById("day" + i);
    if (!el) continue;
    if (i < checkinData.claimedDays.length) { el.className = "checkin-day done"; el.querySelector(".day-num").textContent = "✓"; }
    else if (i === checkinData.claimedDays.length) { el.className = "checkin-day active"; el.querySelector(".day-num").textContent = (i + 1); }
    else { el.className = "checkin-day locked"; el.querySelector(".day-num").textContent = (i + 1); }
  }
  const btn = document.getElementById("checkinBtn");
  if (checkinData.checkedInToday) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-check"></i> Checked In Today'; }
  else { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-gift"></i> Check In'; }
}

function doCheckin() {
  if (tutorialActive && currentTutorialStep === 5) { nextTutorial(); }
  if (checkinData.checkedInToday) { showToast("Already checked in today!"); return; }
  if (!userData || !userData.phone) { showToast("Please log in again."); return; }

  fetch(API_URL + '/api/user/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: userData.phone })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.status) {
        checkinData.checkedInToday = true;
        localStorage.setItem("checkinData", JSON.stringify(checkinData));
        initCheckin();
        showToast(data.error === 'Already checked in today' ? "Already checked in today!" : (data.error || "Check-in failed"));
        return;
      }
      const amount = data.amount;
      balance = data.newBalance;
      userData.balance = balance;
      userData.totalMined = (userData.totalMined || 0) + amount;
      saveUserData();

      checkinData.streak = data.streak;
      checkinData.claimedDays = data.claimedDays;
      checkinData.checkedInToday = true;
      localStorage.setItem("checkinData", JSON.stringify(checkinData));

      addToActivity("Daily Check-In", amount, "in"); updateBalance(); initCheckin();
      showToast("Checked in! +₦" + amount.toLocaleString());
      const dayLabel = ((data.streak - 1) % 7) + 1;
      Swal.fire({ icon: "success", title: "Day " + dayLabel + " Complete!", text: "+₦" + amount.toLocaleString() + " added to your balance", confirmButtonColor: "#6366f1", timer: 2000, showConfirmButton: false, background: document.body.classList.contains("dark-mode") ? "#1e293b" : "#fff", color: document.body.classList.contains("dark-mode") ? "#f8fafc" : "#1e293b" });
    })
    .catch(function (err) {
      console.error("Check-in failed:", err);
      showToast("Check-in failed. Check your connection and try again.");
    });
}

function getTodayStr() { return new Date().toDateString(); }

function initClaim() {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = claimData.lastClaim ? now - claimData.lastClaim : CLAIM_INTERVAL;
  const timerEl = document.getElementById("claimTimer");
  const nextEl = document.getElementById("claimNext");
  const progressEl = document.getElementById("claimProgress");
  progressEl.textContent = claimData.claimsToday || 0;
  if ((claimData.claimsToday || 0) >= MAX_CLAIMS_PER_DAY) { if (claimTimer) { clearInterval(claimTimer); claimTimer = null; } timerEl.textContent = "DONE"; timerEl.className = "claim-timer done"; nextEl.textContent = "Come back tomorrow"; return; }
  if (elapsed >= CLAIM_INTERVAL) { secondsLeft = 0; if (claimTimer) { clearInterval(claimTimer); claimTimer = null; } timerEl.textContent = "CLAIM"; timerEl.className = "claim-timer ready"; }
  else {
    secondsLeft = Math.max(0, Math.min(CLAIM_INTERVAL, CLAIM_INTERVAL - elapsed));
    timerEl.className = "claim-timer";
    startClaimTimer();
  }
}

function startClaimTimer() {
  if (claimTimer) { clearInterval(claimTimer); claimTimer = null; }
  const timerEl = document.getElementById("claimTimer");
  const nextEl = document.getElementById("claimNext");
  claimTimer = setInterval(function () {
    if (secondsLeft > 0) { secondsLeft--; const m = Math.floor(secondsLeft / 60); const s = secondsLeft % 60; timerEl.textContent = m + ":" + s.toString().padStart(2, '0'); nextEl.textContent = m + ":" + s.toString().padStart(2, '0'); }
    else { clearInterval(claimTimer); claimTimer = null; timerEl.textContent = "CLAIM"; timerEl.className = "claim-timer ready"; }
  }, 1000);
}

function doClaim() {
  if (tutorialActive && currentTutorialStep === 4) { nextTutorial(); }
  if (!userData || !userData.phone) { showToast("Please log in again."); return; }
  if ((claimData.claimsToday || 0) >= MAX_CLAIMS_PER_DAY) { showToast("Daily claim limit reached (50/50)"); return; }

  fetch(API_URL + '/api/user/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: userData.phone })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      const timerEl = document.getElementById("claimTimer");
      if (!data.status) {
        if (data.error === 'Daily claim limit reached') {
          claimData.claimsToday = MAX_CLAIMS_PER_DAY;
          localStorage.setItem("claimData", JSON.stringify(claimData));
          initClaim();
          showToast("Daily claim limit reached (50/50)");
        } else if (data.secondsLeft) {
          secondsLeft = data.secondsLeft;
          timerEl.className = "claim-timer";
          startClaimTimer();
          showToast("Please wait before claiming again.");
        } else {
          showToast(data.error || "Claim failed");
        }
        return;
      }

      balance = data.newBalance;
      userData.balance = balance;
      userData.totalMined = (userData.totalMined || 0) + data.amount;
      saveUserData();

      claimData.count = (claimData.count || 0) + 1;
      claimData.claimsToday = data.claimsToday;
      claimData.lastClaim = Math.floor(Date.now() / 1000);
      claimData.dateStr = getTodayStr();
      localStorage.setItem("claimData", JSON.stringify(claimData));

      addToActivity("Auto Claim", data.amount, "in"); updateBalance();
      const progressEl = document.getElementById("claimProgress");
      progressEl.textContent = claimData.claimsToday;
      showToast("+₦" + data.amount + " claimed! (" + claimData.claimsToday + "/" + MAX_CLAIMS_PER_DAY + ")");
      if (claimData.claimsToday >= MAX_CLAIMS_PER_DAY) { timerEl.textContent = "DONE"; timerEl.className = "claim-timer done"; document.getElementById("claimNext").textContent = "Come back tomorrow"; return; }
      secondsLeft = CLAIM_INTERVAL; timerEl.className = "claim-timer"; startClaimTimer();
    })
    .catch(function (err) {
      console.error("Claim failed:", err);
      showToast("Claim failed. Check your connection and try again.");
    });
}

function getPlanMiningDetails() {
  const plan = userData.planName || 'Free Miner';
  if (plan.includes('Basic')) {
    return { name: 'Basic Plan', limit: 50000 };
  } else if (plan.includes('Silver')) {
    return { name: 'Silver Plan', limit: 80000 };
  } else if (plan.includes('Gold')) {
    return { name: 'Gold Plan', limit: 172000 };
  } else if (plan.includes('Diamond')) {
    return { name: 'Diamond Plan', limit: 320000 };
  }
  return { name: 'Free Miner', limit: 30000 };
}

function startMining() {
  if (tutorialActive && currentTutorialStep === 0) { nextTutorial(); }
  const details = getPlanMiningDetails();
  if (alreadyMinedToday) {
    Swal.fire({
      icon: "info",
      title: "Mining Limit Reached",
      text: "You've already mined " + formatMoney(details.limit) + " today. Upgrade your plan to continue.",
      confirmButtonColor: "#6366f1",
      background: document.body.classList.contains("dark-mode") ? "#1e293b" : "#fff",
      color: document.body.classList.contains("dark-mode") ? "#f8fafc" : "#1e293b"
    });
    return;
  }
  Swal.fire({
    title: "Start Mining?",
    html: '<p style="color:#64748b;margin-top:8px;">Your plan is <b>' + details.name + '</b>. Mine up to <b>' + formatMoney(details.limit) + '</b> today.</p>',
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Start Mining",
    confirmButtonColor: "#6366f1",
    cancelButtonColor: "#64748b",
    background: document.body.classList.contains("dark-mode") ? "#1e293b" : "#fff",
    color: document.body.classList.contains("dark-mode") ? "#f8fafc" : "#1e293b"
  }).then(function(res) {
    if (res.isConfirmed) {
      fetch(API_URL + '/api/user/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: userData.phone })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.status) {
          balance = data.newBalance;
          userData.balance = balance;
          userData.totalMined = (userData.totalMined || 0) + data.minedAmount;
          alreadyMinedToday = true;
          saveUserData();
          addToActivity("Daily Mining", data.minedAmount, "in");
          updateBalance();
          Swal.fire({
            icon: "success",
            title: "Mining Complete!",
            text: "+₦" + data.minedAmount.toLocaleString() + " added to your wallet.",
            confirmButtonColor: "#6366f1",
            background: document.body.classList.contains("dark-mode") ? "#1e293b" : "#fff",
            color: document.body.classList.contains("dark-mode") ? "#f8fafc" : "#1e293b"
          });
        } else {
          showToast(data.error || "Mining failed");
        }
      })
      .catch(function(err) {
        console.error("Mining request error:", err);
        showToast("Mining error. Please try again.");
      });
    }
  });
}

function goToWithdraw() {
  window.location.href = "withdraw.html";
}

document.addEventListener("DOMContentLoaded", function() {
  initFirebase();
  initDarkMode();
  checkPendingBounceOnLoad();
  loadTelegramConfig();
  fetchFirestoreUserData();
  updateBalance();
  initCheckin();
  initClaim();
  initTutorial();

  if (userData) {
    const avatarEl = document.getElementById("userAvatar");
    const nameEl = document.getElementById("userName");
    if (avatarEl && userData.name) avatarEl.textContent = userData.name.charAt(0).toUpperCase();
    if (nameEl && userData.name) nameEl.textContent = userData.name;

    const refInput = document.getElementById("referralLinkInput");
    if (refInput) {
      const code = userData.refCode || userData.phone || "9JACASH";
      refInput.value = window.location.origin + "/register.html?ref=" + code;
    }
  }
});
