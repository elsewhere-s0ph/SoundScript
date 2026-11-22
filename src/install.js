/* ===== SoundScript · Installazione (punto 4) =====
   Modulo autonomo: banner di installazione custom, guida iOS "Aggiungi a Home",
   riga "Installa l'app" nelle Info. Non modifica main.js: si aggancia al DOM
   già renderizzato e sopravvive ai re-render (cambio lingua, ecc.).
   Decisioni: A = ri-mostra dopo 7 giorni · B = pulsante in Info · C = guida iOS.
   Patch nativa: in APK Capacitor l'app risulta già installata (nessun pulsante,
   banner e guida iOS disattivati). Il web resta invariato. */

import "./install.css";

const SETTINGS_KEY = "vtt-settings";
const DISMISS_KEY = "ss-install-dismissed";
const IOS_DISMISS_KEY = "ss-ios-guide-dismissed";
const RESHOW_MS = 7 * 24 * 60 * 60 * 1000;

/* ---------- dizionario (allineato alla lingua scelta nell'app) ---------- */
const STR = {
  it: {
    regionLabel: "Installazione dell'app",
    title: "Installa SoundScript",
    desc: "Icona sulla home, scorciatoie rapide e uso offline. Nessun store, nessun download pesante.",
    install: "Installa",
    later: "Non ora",
    close: "Chiudi il banner di installazione",
    announce: "Puoi installare SoundScript su questo dispositivo.",
    installedToast: "SoundScript installata: trovi l'icona sulla home.",
    dismissedToast: "Va bene, non te lo chiedo per una settimana.",
    unavailable: "Il browser non offre l'installazione automatica qui. Usa il menu del browser → «Installa app» oppure «Aggiungi a Home».",
    infoTitle: "Installa l'app",
    infoDesc: "Icona sulla home, scorciatoie e funzionamento offline.",
    infoBtn: "Installa",
    infoBtnIos: "Come si installa",
    infoInstalled: "App installata",
    infoInstalledDesc: "SoundScript gira come app su questo dispositivo.",
    infoNativeDesc: "Versione nativa Android. Gli aggiornamenti si installano con una nuova APK.",
    infoNativeBadge: "Nativa",
    iosTitle: "Aggiungi SoundScript alla Home",
    iosLead: "Su iPhone e iPad l'installazione passa da Safari:",
    iosStep1: "Tocca <b>Condividi</b> nella barra di Safari",
    iosStep2: "Scorri e scegli <b>Aggiungi a Home</b>",
    iosStep3: "Conferma con <b>Aggiungi</b> in alto a destra",
    iosNote: "Non vedi Condividi? Apri questa pagina in <b>Safari</b>: Chrome e il browser interno di WhatsApp non possono installare le web app.",
    iosOk: "Ho capito",
    iosClose: "Chiudi la guida di installazione"
  },
  en: {
    regionLabel: "App installation",
    title: "Install SoundScript",
    desc: "Home-screen icon, quick shortcuts and offline use. No store, no heavy download.",
    install: "Install",
    later: "Not now",
    close: "Close the install banner",
    announce: "You can install SoundScript on this device.",
    installedToast: "SoundScript installed: the icon is on your home screen.",
    dismissedToast: "Alright, I won't ask again for a week.",
    unavailable: "This browser can't offer automatic installation here. Use the browser menu → “Install app” or “Add to Home Screen”.",
    infoTitle: "Install the app",
    infoDesc: "Home-screen icon, shortcuts and offline support.",
    infoBtn: "Install",
    infoBtnIos: "How to install",
    infoInstalled: "App installed",
    infoInstalledDesc: "SoundScript is running as an app on this device.",
    infoNativeDesc: "Native Android build. Updates arrive by installing a newer APK.",
    infoNativeBadge: "Native",
    iosTitle: "Add SoundScript to your Home Screen",
    iosLead: "On iPhone and iPad, installation goes through Safari:",
    iosStep1: "Tap <b>Share</b> in the Safari toolbar",
    iosStep2: "Scroll and choose <b>Add to Home Screen</b>",
    iosStep3: "Confirm with <b>Add</b> at the top right",
    iosNote: "No Share button? Open this page in <b>Safari</b>: Chrome and WhatsApp's in-app browser cannot install web apps.",
    iosOk: "Got it",
    iosClose: "Close the installation guide"
  }
};

/* ---------- lingua: stessa impostazione dell'app ---------- */
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

/* ---------- ambiente ---------- */
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* APK Capacitor: WebView nativa, non PWA. Letto live perché il bridge
   può comparire dopo il primo load dei moduli. */
function isNativeCapacitor() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) { return false; }
}

const standaloneQuery = window.matchMedia("(display-mode: standalone)");
function isInstalled() {
  return isNativeCapacitor() ||
    standaloneQuery.matches ||
    navigator.standalone === true ||
    String(document.referrer || "").startsWith("android-app://");
}

let installed = isInstalled();
let deferredPrompt = null;
let bannerEl = null;
let guideEl = null;
let toastObserver = null;
let hideTimer = null;
let guideHideTimer = null;

/* ---------- icone ---------- */
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/* ---------- utilità ---------- */
function readStamp(key) {
  try {
    const v = Number(localStorage.getItem(key) || "0");
    return Number.isFinite(v) ? v : 0;
  } catch (e) { return 0; }
}
function writeStamp(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
}
function recentlyDismissed(key) {
  const t = readStamp(key);
  return t > 0 && (Date.now() - t) < RESHOW_MS;
}
function announce(msg) {
  const live = document.getElementById("srStatus");
  if (!live) return;
  live.textContent = "";
  setTimeout(() => { live.textContent = msg; }, 40);
}
function toast(title, desc) {
  const el = document.getElementById("toast");
  if (!el) { announce(title + (desc ? " " + desc : "")); return; }
  el.className = "toast";
  el.innerHTML =
    '<div class="toast-head">' +
      '<div class="toast-ico update">' + ICON_CHECK + '</div>' +
      '<div class="toast-title"></div>' +
      '<button class="toast-close" data-toast-close aria-label="' + T("close") + '">' + ICON_CLOSE + '</button>' +
    '</div>' +
    (desc ? '<div class="toast-desc"></div>' : "");
  el.querySelector(".toast-title").textContent = title;
  if (desc) el.querySelector(".toast-desc").textContent = desc;
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(el._ssInstallTimer);
  el._ssInstallTimer = setTimeout(() => el.classList.remove("show"), 4000);
}

/* ---------- costruzione banner ---------- */
function buildBanner() {
  if (bannerEl) return bannerEl;
  const el = document.createElement("div");
  el.className = "ss-install";
  el.id = "ssInstallBanner";
  el.setAttribute("role", "region");
  el.setAttribute("aria-labelledby", "ssInstallTitle");
  el.hidden = true;
  el.innerHTML =
    '<span class="ss-install-aura" aria-hidden="true"></span>' +
    '<div class="ss-install-head">' +
      '<span class="ss-install-icon" aria-hidden="true">' + ICON_DOWNLOAD + '</span>' +
      '<div class="ss-install-text">' +
        '<p class="ss-install-title" id="ssInstallTitle"></p>' +
        '<p class="ss-install-desc"></p>' +
      '</div>' +
      '<button type="button" class="ss-install-close" data-ss-close>' + ICON_CLOSE + '</button>' +
    '</div>' +
    '<div class="ss-install-actions">' +
      '<button type="button" class="ss-install-btn ghost" data-ss-later></button>' +
      '<button type="button" class="ss-install-btn primary" data-ss-install></button>' +
    '</div>';
  document.body.appendChild(el);

  el.querySelector("[data-ss-close]").addEventListener("click", () => dismissBanner(true));
  el.querySelector("[data-ss-later]").addEventListener("click", () => dismissBanner(true));
  el.querySelector("[data-ss-install]").addEventListener("click", doInstall);

  bannerEl = el;
  applyBannerTexts();
  return el;
}

function applyBannerTexts() {
  if (!bannerEl) return;
  bannerEl.setAttribute("aria-label", T("regionLabel"));
  bannerEl.querySelector(".ss-install-title").textContent = T("title");
  bannerEl.querySelector(".ss-install-desc").textContent = T("desc");
  bannerEl.querySelector("[data-ss-close]").setAttribute("aria-label", T("close"));
  bannerEl.querySelector("[data-ss-later]").textContent = T("later");
  bannerEl.querySelector("[data-ss-install]").textContent = T("install");
}

function showBanner() {
  if (installed || isNativeCapacitor()) return;
  const el = buildBanner();
  clearTimeout(hideTimer);
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("show");
  announce(T("announce"));
  syncToastLift();
}

function hideBanner() {
  if (!bannerEl) return;
  bannerEl.classList.remove("show", "lifted");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (bannerEl) bannerEl.hidden = true; }, 480);
}

function dismissBanner(remember) {
  if (remember) {
    writeStamp(DISMISS_KEY);
    toast(T("dismissedToast"));
  }
  hideBanner();
}

/* ---------- guida iOS ---------- */
function buildGuide() {
  if (guideEl) return guideEl;
  const el = document.createElement("div");
  el.className = "ss-guide";
  el.id = "ssIosGuide";
  el.setAttribute("role", "region");
  el.setAttribute("aria-labelledby", "ssGuideTitle");
  el.hidden = true;
  el.innerHTML =
    '<span class="ss-install-aura" aria-hidden="true"></span>' +
    '<div class="ss-install-head">' +
      '<span class="ss-install-icon ios" aria-hidden="true">' + ICON_SHARE + '</span>' +
      '<div class="ss-install-text">' +
        '<p class="ss-install-title" id="ssGuideTitle"></p>' +
        '<p class="ss-install-desc ss-guide-lead"></p>' +
      '</div>' +
      '<button type="button" class="ss-install-close" data-ss-guide-close>' + ICON_CLOSE + '</button>' +
    '</div>' +
    '<ol class="ss-guide-steps">' +
      '<li><span class="ss-guide-n">1</span><span class="ss-guide-t" data-s1></span></li>' +
      '<li><span class="ss-guide-n">2</span><span class="ss-guide-t" data-s2></span></li>' +
      '<li><span class="ss-guide-n">3</span><span class="ss-guide-t" data-s3></span></li>' +
    '</ol>' +
    '<p class="ss-guide-note"></p>' +
    '<div class="ss-install-actions">' +
      '<button type="button" class="ss-install-btn primary" data-ss-guide-ok></button>' +
    '</div>';
  document.body.appendChild(el);

  el.querySelector("[data-ss-guide-close]").addEventListener("click", () => dismissGuide(true));
  el.querySelector("[data-ss-guide-ok]").addEventListener("click", () => dismissGuide(true));

  guideEl = el;
  applyGuideTexts();
  return el;
}

function applyGuideTexts() {
  if (!guideEl) return;
  guideEl.querySelector(".ss-install-title").textContent = T("iosTitle");
  guideEl.querySelector(".ss-guide-lead").textContent = T("iosLead");
  guideEl.querySelector("[data-s1]").innerHTML = T("iosStep1");
  guideEl.querySelector("[data-s2]").innerHTML = T("iosStep2");
  guideEl.querySelector("[data-s3]").innerHTML = T("iosStep3");
  guideEl.querySelector(".ss-guide-note").innerHTML = T("iosNote");
  guideEl.querySelector("[data-ss-guide-close]").setAttribute("aria-label", T("iosClose"));
  guideEl.querySelector("[data-ss-guide-ok]").textContent = T("iosOk");
}

function showGuide() {
  if (installed || isNativeCapacitor()) return;
  hideBanner();
  const el = buildGuide();
  clearTimeout(guideHideTimer);
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("show");
  announce(T("iosTitle"));
  syncToastLift();
}

function hideGuide() {
  if (!guideEl) return;
  guideEl.classList.remove("show", "lifted");
  clearTimeout(guideHideTimer);
  guideHideTimer = setTimeout(() => { if (guideEl) guideEl.hidden = true; }, 480);
}

function dismissGuide(remember) {
  if (remember) writeStamp(IOS_DISMISS_KEY);
  hideGuide();
}

/* ---------- azione di installazione ---------- */
async function doInstall() {
  if (installed || isNativeCapacitor()) return;
  if (IS_IOS) { showGuide(); return; }
  if (!deferredPrompt) {
    hideBanner();
    toast(T("unavailable"));
    return;
  }
  const ev = deferredPrompt;
  deferredPrompt = null;
  hideBanner();
  try {
    ev.prompt();
    const choice = await ev.userChoice;
    if (choice && choice.outcome === "dismissed") {
      writeStamp(DISMISS_KEY);
      toast(T("dismissedToast"));
    }
  } catch (e) {
    toast(T("unavailable"));
  }
  refreshInfoRow();
}

/* ---------- riga "Installa l'app" nelle Info ---------- */
function infoBody() {
  const info = document.getElementById("faqInfo");
  return info ? info.querySelector(".faq-body") : null;
}

function refreshInfoRow() {
  const body = infoBody();
  if (!body) return;
  let row = body.querySelector("[data-ss-install-row]");
  if (!row) {
    row = document.createElement("div");
    row.className = "settings-item";
    row.setAttribute("data-ss-install-row", "");
    const updateBtn = body.querySelector("#checkUpdateBtn");
    const anchor = updateBtn ? updateBtn.closest(".settings-item") : null;
    if (anchor && anchor.parentNode === body) body.insertBefore(row, anchor);
    else body.appendChild(row);
  }

  if (installed) {
    const native = isNativeCapacitor();
    row.className = "settings-item";
    row.innerHTML =
      '<div>' +
        '<div class="settings-item-title"></div>' +
        '<div class="settings-item-desc"></div>' +
      '</div>' +
      '<span class="hbadge ok"><span class="dot"></span><span class="ss-row-badge"></span></span>';
    row.querySelector(".settings-item-title").textContent = native ? T("infoInstalled") : T("infoTitle");
    row.querySelector(".settings-item-desc").textContent = native ? T("infoNativeDesc") : T("infoInstalledDesc");
    row.querySelector(".ss-row-badge").textContent = native ? T("infoNativeBadge") : T("infoInstalled");
    return;
  }

  row.className = "settings-item";
  row.innerHTML =
    '<div>' +
      '<div class="settings-item-title"></div>' +
      '<div class="settings-item-desc"></div>' +
    '</div>' +
    '<button type="button" class="btn" data-ss-row-action></button>';
  row.querySelector(".settings-item-title").textContent = T("infoTitle");
  row.querySelector(".settings-item-desc").textContent = T("infoDesc");
  const btn = row.querySelector("[data-ss-row-action]");
  btn.textContent = IS_IOS ? T("infoBtnIos") : T("infoBtn");
  btn.addEventListener("click", () => {
    if (IS_IOS) { showGuide(); return; }
    if (deferredPrompt) { doInstall(); return; }
    showBanner();
    toast(T("unavailable"));
  });
}

/* ---------- convivenza con il toast dell'app ---------- */
function syncToastLift() {
  const t = document.getElementById("toast");
  const shown = !!(t && t.classList.contains("show"));
  if (bannerEl) bannerEl.classList.toggle("lifted", shown && bannerEl.classList.contains("show"));
  if (guideEl) guideEl.classList.toggle("lifted", shown && guideEl.classList.contains("show"));
}

function watchToast() {
  if (toastObserver) { toastObserver.disconnect(); toastObserver = null; }
  const t = document.getElementById("toast");
  if (!t) return;
  toastObserver = new MutationObserver(syncToastLift);
  toastObserver.observe(t, { attributes: true, attributeFilter: ["class"] });
  syncToastLift();
}

/* ---------- aggancio ai re-render dell'app ---------- */
function afterRender() {
  // Il bridge Capacitor può comparire dopo il primo load: rileggi a ogni render.
  const now = isInstalled();
  if (now !== installed) {
    installed = now;
    if (installed) { hideBanner(); hideGuide(); }
  }
  applyBannerTexts();
  applyGuideTexts();
  refreshInfoRow();
  watchToast();
}

function watchApp() {
  const app = document.getElementById("app");
  if (!app) return;
  const mo = new MutationObserver(() => afterRender());
  mo.observe(app, { childList: true });
}

/* ---------- eventi di installazione ---------- */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  refreshInfoRow();
  if (installed || IS_IOS) return;
  if (recentlyDismissed(DISMISS_KEY)) return;
  showBanner();
});

window.addEventListener("appinstalled", () => {
  installed = true;
  deferredPrompt = null;
  hideBanner();
  hideGuide();
  refreshInfoRow();
  toast(T("installedToast"));
});

try {
  const onDisplayChange = () => {
    const now = isInstalled();
    if (now !== installed) {
      installed = now;
      if (installed) { hideBanner(); hideGuide(); }
      refreshInfoRow();
    }
  };
  if (standaloneQuery.addEventListener) standaloneQuery.addEventListener("change", onDisplayChange);
  else if (standaloneQuery.addListener) standaloneQuery.addListener(onDisplayChange);
} catch (e) {}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (guideEl && guideEl.classList.contains("show")) { dismissGuide(true); return; }
  if (bannerEl && bannerEl.classList.contains("show")) dismissBanner(true);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const now = isInstalled();
  if (now !== installed) { installed = now; refreshInfoRow(); }
});

/* ---------- avvio ---------- */
function boot() {
  buildBanner();
  buildGuide();
  afterRender();
  watchApp();

  // Retry brevi: se il bridge nativo compare in ritardo, allinea lo stato.
  setTimeout(() => { const now = isInstalled(); if (now !== installed) { installed = now; refreshInfoRow(); } }, 300);
  setTimeout(() => { const now = isInstalled(); if (now !== installed) { installed = now; refreshInfoRow(); } }, 1200);

  /* iOS: nessun beforeinstallprompt, mostriamo la guida una volta sola
     (e di nuovo solo dopo 7 giorni dal "Ho capito"). */
  if (IS_IOS && !installed && !recentlyDismissed(IOS_DISMISS_KEY)) {
    setTimeout(() => { if (!installed) showGuide(); }, 2600);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
