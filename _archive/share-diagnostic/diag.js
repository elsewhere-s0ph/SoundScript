/* ===== SoundScript · Diagnostica condivisione =====
   Due compiti, entrambi passivi:
   1. registra ogni avvio dell'app (referrer Android, URL, display-mode, controllo SW)
      in sessionStorage, così la pagina di diagnosi sa se Android ha consegnato qualcosa;
   2. aggiunge una riga "Diagnostica condivisione" in coda alle Info, con badge
      se c'è un audio in attesa nella cache.
   Non modifica main.js, i18n.js, support.js né credits.js. */

const SHARE_CACHE = "soundscript-share-v1";
const SETTINGS_KEY = "vtt-settings";
const LAUNCH_KEY = "ss-launch-log";
const ROW_ID = "ssDiagRow";
const MAX_LAUNCHES = 12;

const STR = {
  it: {
    title: "Diagnostica condivisione",
    desc: "Verifica perché un vocale condiviso non arriva, dentro l'app installata.",
    descPending: "C'è un audio in attesa nella cache: la diagnosi dice se è leggibile.",
    btn: "Apri diagnosi",
    aria: "Apri la pagina di diagnostica della condivisione",
    pending: "audio in attesa"
  },
  en: {
    title: "Share diagnostics",
    desc: "Find out why a shared voice note doesn't arrive, inside the installed app.",
    descPending: "There is audio waiting in the cache: the diagnostic tells you if it's readable.",
    btn: "Open diagnostics",
    aria: "Open the share diagnostics page",
    pending: "audio pending"
  }
};

function currentLang() {
  let choice = "auto";
  try { choice = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").lang || "auto"; } catch (e) {}
  if (choice === "it" || choice === "en") return choice;
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
}
function T(key) {
  const d = STR[currentLang()] || STR.it;
  return d[key] !== undefined ? d[key] : (STR.it[key] !== undefined ? STR.it[key] : key);
}

function displayMode() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return "standalone";
    if (window.matchMedia("(display-mode: fullscreen)").matches) return "fullscreen";
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return "minimal-ui";
  } catch (e) {}
  if (navigator.standalone === true) return "ios-standalone";
  return "browser";
}

/* ---------- storico avvii ---------- */
let logged = false;
function logLaunch() {
  if (logged) return;
  logged = true;
  try {
    const ref = document.referrer || "";
    const url = location.pathname + location.search;
    const isShare = /[?&](shared|share-error)=1/.test(location.search);
    const isAndroid = ref.indexOf("android-app://") === 0;
    const isShortcut = /[?&]action=/.test(location.search);
    if (!isShare && !isAndroid && !isShortcut) return;
    const rec = {
      time: new Date().toISOString().slice(11, 19),
      ref: ref,
      url: url,
      dm: displayMode(),
      controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller)
    };
    let arr = [];
    try { arr = JSON.parse(sessionStorage.getItem(LAUNCH_KEY) || "[]"); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.push(rec);
    while (arr.length > MAX_LAUNCHES) arr.shift();
    sessionStorage.setItem(LAUNCH_KEY, JSON.stringify(arr));
  } catch (e) {}
}

/* ---------- audio in attesa ---------- */
async function pendingCount() {
  try {
    if (!("caches" in window)) return 0;
    const c = await caches.open(SHARE_CACHE);
    const keys = await c.keys();
    return keys.length;
  } catch (e) { return 0; }
}

/* ---------- riga nelle Info ---------- */
async function mountRow() {
  const info = document.getElementById("faqInfo");
  if (!info) return;
  const body = info.querySelector(".faq-body");
  if (!body) return;

  const pending = await pendingCount();

  let row = body.querySelector("#" + ROW_ID);
  if (!row) {
    row = document.createElement("div");
    row.className = "settings-item";
    row.id = ROW_ID;
    row.innerHTML =
      '<div>' +
        '<div class="settings-item-title"></div>' +
        '<div class="settings-item-desc"></div>' +
      '</div>' +
      '<a class="btn" href="share-debug.html"></a>';
    body.appendChild(row);
  }

  row.querySelector(".settings-item-title").textContent = T("title");
  row.querySelector(".settings-item-desc").textContent = pending ? T("descPending") : T("desc");

  const link = row.querySelector("a");
  link.textContent = T("btn");
  link.setAttribute("aria-label", T("aria"));

  let badge = row.querySelector(".ss-diag-badge");
  if (pending) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "hbadge warn ss-diag-badge";
      badge.style.marginLeft = "8px";
      badge.innerHTML = '<span class="dot"></span><span class="ss-diag-badge-t"></span>';
      row.querySelector(".settings-item-title").appendChild(badge);
    }
    badge.querySelector(".ss-diag-badge-t").textContent = T("pending");
  } else if (badge) {
    badge.remove();
  }
}

function afterRender() {
  logLaunch();
  mountRow();
}

function watchApp() {
  const app = document.getElementById("app");
  if (!app) return;
  const mo = new MutationObserver(() => afterRender());
  mo.observe(app, { childList: true });
}

function boot() {
  afterRender();
  watchApp();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
