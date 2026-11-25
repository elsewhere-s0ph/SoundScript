/* ===== SoundScript · self-update nativo (APK) =====
   Solo in Capacitor. Controlla l'ultima release GitHub, confronta la versione
   installata (letta dal PackageManager, non dal bundle), e se superiore propone
   download interno + verifica SHA-256 + installer di sistema.
   Primo volta: guida al permesso "Installa app sconosciute", ricontrollo al resume.
   La PWA web non entra mai qui. */

import "./native-update.css";

const API = "https://api.github.com/repos/elsewhere-s0ph/SoundScript/releases/latest";

function isNative() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch (e) { return false; }
}
function plugin() {
  try { return window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.SelfUpdate : null; }
  catch (e) { return null; }
}
function lang() {
  try {
    const c = JSON.parse(localStorage.getItem("vtt-settings") || "{}").lang || "auto";
    if (c === "it" || c === "en") return c;
  } catch (e) {}
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
}
const STR = {
  it: {
    checking: "Controllo aggiornamenti…", checkingDesc: "Confronto con l'ultima release GitHub.",
    uptodate: "Sei aggiornato", uptodateDesc: "La versione installata è l'ultima disponibile.",
    available: "Nuova versione disponibile", availableDesc: "Scaricala e installala senza uscire dall'app.",
    install: "Scarica e installa", later: "Non ora", close: "Chiudi",
    permTitle: "Permesso necessario", permBadge: "SOLO LA PRIMA VOLTA",
    permDesc: "Android chiede di consentire a SoundScript di installare app sconosciute. Si apre un'impostata di sistema: accendi l'interruttore e torna qui.",
    permWait: "In attesa del permesso… torna all'app dopo aver acceso l'interruttore.",
    openSettings: "Apri impostazioni",
    deniedTitle: "Permesso non concesso", deniedDesc: "Nessun problema: l'aggiornamento resta disponibile. Concedi il permesso quando vuoi e riprova.",
    retry: "Riprova",
    downloading: "Download in corso…", verifying: "Verifica checksum SHA-256…",
    installing: "Installer di sistema aperto", installingDesc: "Conferma «Aggiorna» nell'installer. I tuoi dati saranno conservati.",
    error: "Aggiornamento non riuscito",
    noPlugin: "Plugin nativo non disponibile."
  },
  en: {
    checking: "Checking for updates…", checkingDesc: "Comparing with the latest GitHub release.",
    uptodate: "You're up to date", uptodateDesc: "The installed version is the latest available.",
    available: "New version available", availableDesc: "Download and install without leaving the app.",
    install: "Download and install", later: "Not now", close: "Close",
    permTitle: "Permission required", permBadge: "FIRST TIME ONLY",
    permDesc: "Android asks to allow SoundScript to install unknown apps. A system setting opens: flip the switch and come back.",
    permWait: "Waiting for permission… return to the app after flipping the switch.",
    openSettings: "Open settings",
    deniedTitle: "Permission not granted", deniedDesc: "No problem: the update stays available. Grant the permission whenever you want and retry.",
    retry: "Retry",
    downloading: "Downloading…", verifying: "Verifying SHA-256 checksum…",
    installing: "System installer opened", installingDesc: "Confirm “Update” in the installer. Your data will be kept.",
    error: "Update failed",
    noPlugin: "Native plugin not available."
  }
};
function T(k) { const d = STR[lang()] || STR.it; return d[k] !== undefined ? d[k] : k; }

function cmp(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

let overlay = null, pending = null, openedSettings = false, listenersOn = false, autoTimer = null;

function open() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "nu-overlay";
  overlay.innerHTML = '<div class="nu-card" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  return overlay;
}
function close() {
  clearTimeout(autoTimer);
  if (overlay) { overlay.remove(); overlay = null; }
  openedSettings = false;
}
function card() { return open().querySelector(".nu-card"); }

function setState(s, msg) {
  clearTimeout(autoTimer);
  const c = card();
  let ico = "…", title = "", desc = "", extra = "", actions = "";
  const btn = (act, label, kind) => '<button type="button" class="nu-btn ' + kind + '" data-act="' + act + '">' + label + "</button>";

  if (s === "checking") { ico = "…"; title = T("checking"); desc = T("checkingDesc"); }
  else if (s === "uptodate") { ico = "✓"; title = T("uptodate"); desc = T("uptodateDesc"); actions = btn("close", T("close"), "ghost"); autoTimer = setTimeout(close, 2600); }
  else if (s === "available") {
    ico = "↑"; title = T("available"); desc = T("availableDesc");
    extra = '<div class="nu-ver"><span class="nu-old"></span><span>→</span><span class="nu-new"></span></div>';
    actions = btn("install", T("install"), "primary") + btn("close", T("later"), "ghost");
  }
  else if (s === "permneed") {
    ico = "🔓"; title = T("permTitle"); desc = openedSettings ? T("permWait") : T("permDesc");
    extra = '<span class="nu-badge">' + T("permBadge") + "</span>";
    actions = btn("settings", T("openSettings"), "primary") + btn("close", T("later"), "ghost");
  }
  else if (s === "permdenied") { ico = "↩"; title = T("deniedTitle"); desc = T("deniedDesc"); actions = btn("settings", T("retry"), "primary") + btn("close", T("later"), "ghost"); }
  else if (s === "downloading") { ico = "↓"; title = T("downloading"); desc = "SoundScript.apk"; extra = '<div class="nu-bar"><i id="nuBar"></i></div><div class="nu-pct" id="nuPct">0%</div>'; }
  else if (s === "verifying") { ico = "✓"; title = T("verifying"); desc = ""; extra = '<div class="nu-bar"><i style="width:100%"></i></div>'; }
  else if (s === "installing") { ico = "✓"; title = T("installing"); desc = T("installingDesc"); actions = btn("close", T("close"), "ghost"); }
  else if (s === "error") { ico = "!"; title = T("error"); desc = msg || ""; actions = btn("retry", T("retry"), "primary") + btn("close", T("close"), "ghost"); }

  c.innerHTML =
    '<div class="nu-row"><span class="nu-ico">' + ico + '</span><div><div class="nu-title"></div><div class="nu-desc"></div></div></div>' +
    extra + '<div class="nu-actions">' + actions + "</div>";
  c.querySelector(".nu-title").textContent = title;
  c.querySelector(".nu-desc").textContent = desc;
  if (s === "available") {
    c.querySelector(".nu-old").textContent = pending.current;
    c.querySelector(".nu-new").textContent = pending.latest;
  }
  c.querySelectorAll("[data-act]").forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.getAttribute("data-act");
      if (a === "close") close();
      else if (a === "install") startDownload();
      else if (a === "settings") openSettings();
      else if (a === "retry") { if (pending) begin(); else run(); }
    });
  });
}

function ensureListeners() {
  if (listenersOn) return;
  const p = plugin();
  if (!p) return;
  listenersOn = true;
  p.addListener("progress", (ev) => {
    const bar = document.getElementById("nuBar"), pct = document.getElementById("nuPct");
    if (bar) bar.style.width = (ev.percent || 0) + "%";
    if (pct) pct.textContent = (ev.percent || 0) + "%";
  });
  p.addListener("state", (ev) => {
    if (ev.state === "verifying") setState("verifying");
    else if (ev.state === "installing") setState("installing");
    else if (ev.state === "error") setState("error", ev.message);
  });
  const resume = () => handleResume();
  window.addEventListener("focus", resume);
  window.addEventListener("capacitorResume", resume);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(); });
}

async function handleResume() {
  if (!openedSettings) return;
  openedSettings = false;
  const p = plugin();
  if (!p) return;
  try {
    const ci = await p.canInstall();
    if (ci.allowed) begin();
    else setState("permdenied");
  } catch (e) { setState("permdenied"); }
}

async function openSettings() {
  const p = plugin();
  if (!p) return;
  openedSettings = true;
  setState("permneed");
  try { await p.openInstallSettings(); } catch (e) { openedSettings = false; setState("error", String(e)); }
}

async function startDownload() {
  const p = plugin();
  if (!p || !pending) return;
  try {
    const ci = await p.canInstall();
    if (!ci.allowed) { setState("permneed"); return; }
    begin();
  } catch (e) { setState("error", String(e)); }
}

async function begin() {
  const p = plugin();
  if (!p || !pending) return;
  setState("downloading");
  try {
    const r = await p.downloadAndInstall({ url: pending.url, sha256: pending.sha || "" });
    if (r && r.needPermission) setState("permneed");
  } catch (e) { setState("error", String(e)); }
}

async function run() {
  if (!isNative()) return false;
  const p = plugin();
  if (!p) return false;
  ensureListeners();
  setState("checking");
  try {
    const iv = await p.getInstalledVersion();
    const res = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error("GitHub " + res.status);
    const j = await res.json();
    const latest = String(j.tag_name || "").replace(/^v/, "");
    const asset = (j.assets || []).find((a) => a.name === "SoundScript.apk");
    if (!latest || !asset) throw new Error("release asset missing");
    let sha = "";
    const shaAsset = (j.assets || []).find((a) => a.name === "SHA256SUMS.txt");
    if (shaAsset) {
      try {
        const t = await (await fetch(shaAsset.browser_download_url)).text();
        sha = (t.trim().split(/\s+/)[0] || "").toLowerCase();
      } catch (e) { sha = ""; }
    }
    if (cmp(latest, iv.versionName) > 0) {
      pending = { url: asset.browser_download_url, sha, latest, current: iv.versionName };
      setState("available");
    } else {
      setState("uptodate");
    }
  } catch (e) {
    setState("error", String(e && e.message ? e.message : e));
  }
  return true;
}

window.__ssNativeUpdate = run;
