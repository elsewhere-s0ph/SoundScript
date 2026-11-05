import { PROVIDERS, listModels, classifyModels, apiTranscribe, apiSummarize } from "./providers.js";
import { I18N, deviceLang } from "./i18n.js";
import "./style.css";

const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHARE_CACHE = "soundscript-share-v1";
const SETTINGS_KEY = "vtt-settings";
const LASTERR_KEY = "vtt-lasterr";
const TLDR_AUTO_SECONDS = 60;
const APP_VERSION = (typeof __APP_VERSION__ === "string") ? __APP_VERSION__ : "build dev";

/* ===== i18n · lingua attiva ===== */
let LANG = "it";
function refreshLang() {
  let choice = "auto";
  try { choice = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").lang || "auto"; } catch (e) {}
  LANG = (choice === "it" || choice === "en") ? choice : deviceLang();
}
function langChoice() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").lang || "auto"; } catch (e) { return "auto"; }
}
function T(key) {
  const d = I18N[LANG] || I18N.it;
  if (d[key] !== undefined) return d[key];
  if (I18N.it[key] !== undefined) return I18N.it[key];
  return key;
}
function LOC() { return (I18N[LANG] || I18N.it)._locale; }
function langName(code) { return code === "it" ? T("langOptIt") : T("langOptEn"); }
refreshLang();
document.documentElement.lang = LANG;

/* Rilevamento iOS (per la domanda FAQ sul limite di condivisione) */
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* ===== Transformers.js on-demand (import dinamico) ===== */
let TF = null;
async function getTF() {
  if (!TF) {
    TF = await import("@huggingface/transformers");
    TF.env.allowLocalModels = false;
    TF.env.useBrowserCache = true;
  }
  return TF;
}

let asr = null;
let llm = null;
let busy = false;
let activeModel = null;
let hasSummary = false;
let downloading = false;
let wakeLock = null;

let draftKeys = null;
let chainDirty = false;
let providerChoice = "openai";
const modelCache = {};
const dlRows = {};

/* ===== Cronologia ===== */
let lastSttEngine = "";
let lastDurSec = null;
let lastProcessDate = new Date();
let histShowAll = false;
const HIST_LIMIT = 5;

/* ===== Player audio ===== */
let audioEl = null;
let audioUrl = null;
let playerDragging = false;
let playerSpeedIdx = 0;
const PLAYER_SPEEDS = [1, 1.25, 1.5, 2, 0.75];

/* ===== Annulla elaborazione ===== */
let abortCtrl = null;
function throwAbort() {
  const e = new Error("abort");
  e.name = "AbortError";
  throw e;
}

/* ===== Draft su ricarica (sessionStorage) ===== */
const DRAFT_KEYS = {
  txt: "ss-draft-txt",
  sum: "ss-draft-sum",
  has: "ss-draft-has-sum",
  eng: "ss-draft-engine",
  dur: "ss-draft-dur",
  date: "ss-draft-date"
};
let draftTimer = null;

function writeDraft() {
  try {
    const t = $("#txt");
    if (!t) return;
    sessionStorage.setItem(DRAFT_KEYS.txt, t.value);
    sessionStorage.setItem(DRAFT_KEYS.sum, (($("#sum") && $("#sum").textContent) || ""));
    sessionStorage.setItem(DRAFT_KEYS.has, hasSummary ? "1" : "0");
    sessionStorage.setItem(DRAFT_KEYS.eng, lastSttEngine || "");
    sessionStorage.setItem(DRAFT_KEYS.dur, lastDurSec != null ? String(lastDurSec) : "");
    sessionStorage.setItem(DRAFT_KEYS.date, lastProcessDate ? lastProcessDate.toISOString() : "");
  } catch (e) {}
}
function queueDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(writeDraft, 500);
}
function clearDraft() {
  try { Object.values(DRAFT_KEYS).forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
}
function restoreDraft() {
  try {
    const t = sessionStorage.getItem(DRAFT_KEYS.txt);
    const has = sessionStorage.getItem(DRAFT_KEYS.has);
    if (!t || (!t.trim() && has !== "1")) return;
    const txtEl = $("#txt");
    if (!txtEl) return;
    txtEl.value = t;
    hasSummary = has === "1";
    const sumEl = $("#sum");
    const s = sessionStorage.getItem(DRAFT_KEYS.sum);
    if (sumEl) sumEl.textContent = (s !== null && s !== "") ? s : T("sumPlaceholder");
    lastSttEngine = sessionStorage.getItem(DRAFT_KEYS.eng) || "";
    const d = sessionStorage.getItem(DRAFT_KEYS.dur);
    lastDurSec = (d !== null && d !== "") ? Number(d) : null;
    const dt = sessionStorage.getItem(DRAFT_KEYS.date);
    if (dt) {
      const p = new Date(dt);
      if (!isNaN(p.getTime())) lastProcessDate = p;
    }
    $("#resultStt").classList.remove("hidden");
    $("#engStt").textContent = (lastSttEngine || "—") + " " + T("sessionRestored");
    $("#durStt").textContent = lastDurSec != null ? fmtDur(lastDurSec) : T("notAvailable");
    $("#all").disabled = false;
    $("#chipLlm").hidden = true;
    $("#regen").textContent = hasSummary ? "⟳ " + T("genTldr") : T("genTldr");
    announce(T("anDraftRestored"));
  } catch (e) {}
}

/* ===== Incolla file dagli appunti ===== */
function isAudioFile(f) {
  if (!f) return false;
  if (f.type && f.type.startsWith("audio/")) return true;
  return /\.(ogg|opus|mp3|wav|m4a|aac|flac|webm)$/i.test(f.name || "");
}
document.addEventListener("paste", (e) => {
  const files = e.clipboardData && e.clipboardData.files;
  if (!files || !files.length) return;
  for (const f of files) {
    if (isAudioFile(f)) {
      e.preventDefault();
      const drop = $("#drop");
      if (drop) {
        drop.classList.add("over");
        setTimeout(() => drop.classList.remove("over"), 700);
      }
      announce(T("stClipGot"));
      process(f);
      return;
    }
  }
  stat(T("stNoClip"), 0);
});

/* ===== Scorciatoie da manifest ===== */
function handleShortcutAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  if (!action) return;

  const url = new URL(window.location);
  url.searchParams.delete("action");
  window.history.replaceState({}, "", url);

  setTimeout(() => {
    if (action === "new") {
      const drop = $("#drop");
      const pick = $("#pick");
      if (drop) {
        drop.classList.add("over");
        setTimeout(() => drop.classList.remove("over"), 1200);
      }
      if (pick) {
        pick.scrollIntoView({ behavior: "smooth", block: "center" });
        pick.focus({ preventScroll: true });
        pick.style.boxShadow = "0 0 0 5px color-mix(in srgb, var(--primary) 45%, transparent)";
        setTimeout(() => { pick.style.boxShadow = ""; }, 2600);
      }
      stat(T("stShortcut"), 0);
      announce(T("anShortcut"));
    } else if (action === "history") {
      const hist = $("#faqHist");
      if (hist) {
        hist.open = true;
        setTimeout(() => hist.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        announce(T("anHistOpened"));
      }
    }
  }, 400);
}

/* ===== Portali chiavi API ===== */
const KEY_PORTALS = {
  openai:    { name: "OpenAI",           url: "https://platform.openai.com/api-keys" },
  groq:      { name: "Groq",             url: "https://console.groq.com/keys" },
  google:    { name: "Google AI Studio", url: "https://aistudio.google.com/apikey" },
  anthropic: { name: "Anthropic",        url: "https://console.anthropic.com/settings/keys" },
  mistral:   { name: "Mistral",          url: "https://console.mistral.ai/api-keys/" },
  custom:    null
};

/* ===== Logo per il foglio di stampa ===== */
const PRINT_LOGO_SVG =
  '<svg class="pv-logo" viewBox="0 0 320 80" role="img" aria-label="SoundScript">' +
  '<defs><linearGradient id="pvlg" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#06b6d4"/>' +
  '</linearGradient></defs>' +
  '<g transform="translate(8,8)">' +
  '<path d="M8 32 Q16 8 24 32 T40 32" fill="none" stroke="url(#pvlg)" stroke-width="6" stroke-linecap="round"/>' +
  '<path d="M48 22 H72 M48 32 H66 M48 42 H58" fill="none" stroke="#4f46e5" stroke-width="5" stroke-linecap="round"/>' +
  '<circle cx="72" cy="42" r="4" fill="#06b6d4"/></g>' +
  '<text x="96" y="52" font-family="Roboto Flex, system-ui, sans-serif" font-weight="700" font-size="28" fill="#0f172a" letter-spacing="-0.02em">Sound <tspan fill="#4f46e5">Script</tspan></text>' +
  '</svg>';

/* ===== Service worker: aggiornamento silenzioso ===== */
let swReg = null;
let swHadController = false;
let swCheckInProgress = false;
let toastTimer = null;

const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  update: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
};
const SUN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

/* ===== Annunci per lettori schermo ===== */
let srTimer = null;
function announce(msg) {
  const el = $("#srStatus");
  if (!el) return;
  el.textContent = "";
  clearTimeout(srTimer);
  srTimer = setTimeout(() => { el.textContent = msg; }, 30);
}

function hideToast() {
  const t = $("#toast");
  if (!t) return;
  t.classList.remove("show");
  clearTimeout(toastTimer);
}
function renderToast(html, sticky) {
  const t = $("#toast");
  if (!t) return;
  clearTimeout(toastTimer);
  t.classList.remove("show");
  t.innerHTML = html;
  void t.offsetWidth;
  t.classList.add("show");
  if (!sticky) toastTimer = setTimeout(hideToast, 3000);
}
function showStatusToast(type) {
  const t = $("#toast");
  if (!t) return;
  t.className = "toast";
  if (type === "success") {
    renderToast(`
      <div class="toast-head">
        <div class="toast-ico success">${TOAST_ICONS.success}</div>
        <div class="toast-title">${T("toastUpdTitle")}</div>
        <button class="toast-close" data-toast-close aria-label="${T("toastClose")}">${TOAST_ICONS.close}</button>
      </div>
      <div class="toast-desc">${T("toastUpdDesc")(APP_VERSION)}</div>
    `, false);
  } else {
    renderToast(`
      <div class="toast-head">
        <div class="toast-ico warning">${TOAST_ICONS.warning}</div>
        <div class="toast-title">${T("toastErrTitle")}</div>
        <button class="toast-close" data-toast-close aria-label="${T("toastClose")}">${TOAST_ICONS.close}</button>
      </div>
      <div class="toast-desc">${T("toastErrDesc")}</div>
    `, false);
  }
}
function showInfoToast(title, desc) {
  const t = $("#toast");
  if (!t) return;
  t.className = "toast";
  renderToast(`
    <div class="toast-head">
      <div class="toast-ico update">${TOAST_ICONS.update}</div>
      <div class="toast-title">${title}</div>
      <button class="toast-close" data-toast-close aria-label="${T("toastClose")}">${TOAST_ICONS.close}</button>
    </div>
    <div class="toast-desc">${desc}</div>
  `, false);
}
async function checkForUpdates() {
  const btn = $("#checkUpdateBtn");
  const label = $("#checkUpdateLabel");
  if (btn) btn.disabled = true;
  if (label) label.innerHTML = '<span class="mini-spinner"></span>';
  swCheckInProgress = true;
  try {
    if (!("serviceWorker" in navigator) || !swReg) throw new Error("sw");
    const before = navigator.serviceWorker.controller;
    await swReg.update();
    await sleep(1500);
    const after = navigator.serviceWorker.controller;
    if (after && after !== before) {
      showInfoToast(T("toastNewTitle"), T("toastNewDesc"));
      announce(T("anNewVer"));
    } else {
      showStatusToast("success");
      announce(T("anUpdated"));
    }
  } catch (err) {
    showStatusToast("warning");
    announce(T("anUpdateFailed"));
  } finally {
    swCheckInProgress = false;
    if (btn) btn.disabled = false;
    if (label) label.textContent = T("checkBtn");
  }
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swHadController && !swCheckInProgress) {
      showInfoToast(T("toastNewTitle"), T("toastNewDesc"));
    }
  });
  window.addEventListener("load", async () => {
    try {
      swHadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register("./sw.js");
      swReg = reg;
      try { await reg.update(); } catch (e) {}
    } catch (error) {
      console.error("SW registration failed:", error);
    }
  });
}

/* ===== Formattazioni ===== */
function fmtDur(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return m + ":" + String(ss).padStart(2, "0");
}
function fmtMB(bytes) { return (bytes / 1048576).toFixed(1) + " MB"; }
function fmtMs(ms) {
  if (ms < 10000) return (ms / 1000).toFixed(1).replace(".", LANG === "it" ? "," : ".") + " s";
  if (ms < 60000) return Math.round(ms / 1000) + " s";
  return fmtDur(ms / 1000);
}
function fmtHistDate(iso) {
  try {
    return new Date(iso).toLocaleString(LOC(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return iso; }
}
function nowLabel() {
  return new Date().toLocaleString(LOC(), { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ===== Regole TL;DR ===== */
const DEFAULT_TLR = { len: "medio", style: "narrativo", lang: "it", custom: "" };

/* ===== Impostazioni ===== */
function migrateSettings(s) {
  if (Array.isArray(s.keys)) return s;
  const keys = [];
  if (s.apiKey) {
    keys.push({
      id: "k1", provider: s.provider || "openai", apiKey: s.apiKey,
      baseUrl: s.baseUrl || "", sttModel: s.sttModel || "", llmModel: s.llmModel || ""
    });
  }
  keys.push({ id: "local" });
  if (s.mode === "local" && keys.length > 1) keys.reverse();
  const out = { ...s, keys };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(out));
  return out;
}
function loadSettingsRaw() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}
function saveSettings(patch) {
  const current = loadSettingsRaw();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
}
function loadSettings() {
  let s = migrateSettings(loadSettingsRaw());
  if (!s.keys.some((k) => k.id === "local")) {
    s.keys.push({ id: "local" });
    saveSettings({ keys: s.keys });
  }
  return s;
}
function updateEntry(id, patch) {
  const s = loadSettings();
  s.keys = s.keys.map((k) => (k.id === id ? { ...k, ...patch } : k));
  saveSettings({ keys: s.keys });
}
function providerLabel(id) {
  if (id === "custom") return T("customProvider");
  return PROVIDERS[id]?.label || id;
}
function entryLabel(entry) {
  if (entry.id === "local") return T("offlineLabel");
  return providerLabel(entry.provider);
}
function chainLabel() { return loadSettings().keys.map(entryLabel).join(" → "); }

function tldrSettings() {
  return { ...DEFAULT_TLR, ...(loadSettings().tldr || {}) };
}
function composeInstruction(t) {
  const p = I18N[LANG].prompt;
  let out = p.style[t.style](p.lang[t.lang]) + " " + p.len[t.len];
  out += p.tail;
  if (t.custom && t.custom.trim()) out += " " + t.custom.trim();
  return out;
}

/* ===== Tema ===== */
function applyTheme(t) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t;
  else root.removeAttribute("data-theme");
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length >= 2) {
    const light = metas[0], dark = metas[1];
    if (t === "light") { light.setAttribute("media", "all"); dark.setAttribute("media", "not all"); }
    else if (t === "dark") { dark.setAttribute("media", "all"); light.setAttribute("media", "not all"); }
    else {
      light.setAttribute("media", "(prefers-color-scheme: light)");
      dark.setAttribute("media", "(prefers-color-scheme: dark)");
    }
  }
  renderHeroTheme();
}
function effectiveTheme() {
  const t = loadSettings().theme || "auto";
  if (t === "light" || t === "dark") return t;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function renderHeroTheme() {
  const b = $("#heroTheme");
  if (b) b.innerHTML = effectiveTheme() === "dark" ? SUN_SVG : MOON_SVG;
}
function themeName(code) {
  if (code === "light") return T("themeLight");
  if (code === "dark") return T("themeDark");
  return T("themeAuto");
}
function setTheme(choice) {
  saveSettings({ theme: choice });
  applyTheme(choice);
  document.querySelectorAll("#themeSeg button").forEach((x) => x.classList.toggle("active", x.dataset.t === choice));
  stat(T("stTheme")(themeName(choice)), 100);
  announce(T("anTheme")(themeName(choice)));
}
try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((loadSettings().theme || "auto") === "auto") renderHeroTheme();
  });
} catch (e) {}

/* ===== Cambio lingua (re-render preservando lo stato) ===== */
function setLang(choice) {
  const openIds = Array.from(document.querySelectorAll(".faq-item[open]")).map((d) => d.id);
  const keepDraft = draftKeys ? JSON.parse(JSON.stringify(draftKeys)) : null;
  const keepDirty = chainDirty;
  writeDraft();
  saveSettings({ lang: choice });
  refreshLang();
  document.documentElement.lang = LANG;
  render();
  openIds.forEach((id) => { const el = document.getElementById(id); if (el) el.open = true; });
  if (keepDraft) {
    draftKeys = keepDraft;
    chainDirty = keepDirty;
    renderKeyList();
    updatePrefMsg();
    const chip = $("#unsavedChip");
    if (chip) chip.hidden = !chainDirty;
  }
  const name = choice === "auto" ? T("langOptAuto") + " · " + langName(LANG) : langName(choice);
  stat(T("stLang")(name), 100);
  announce(T("anLang")(name));
}

/* ===== Feedback fine elaborazione ===== */
function updateNotifDesc() {
  const d = $("#notifDesc");
  if (!d) return;
  const on = !!loadSettings().notify;
  if (!on) { d.textContent = T("notifyDescOff"); return; }
  if (!("Notification" in window)) { d.textContent = T("notifyDescNoNotif"); return; }
  if (Notification.permission === "granted") d.textContent = T("notifyDescGranted");
  else if (Notification.permission === "denied") d.textContent = T("notifyDescDenied");
  else d.textContent = T("notifyDescAsk");
}
function notifyDone() {
  const s = loadSettings();
  if (!s.notify) return;
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  try {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification("SoundScript", { body: T("stCompleted") });
    }
  } catch (e) {}
}

/* ===== Badge di stato ===== */
function renderStatusBadges() {
  const row = $("#badgeRow");
  if (!row) return;
  const keys = loadSettings().keys.filter((k) => k.id !== "local").length;
  const offline = localStorage.getItem("ss-local-ready") === "1";
  let html = "";
  if (offline) html += '<span class="hbadge ok"><span class="dot"></span>' + T("badgeOffline") + '</span>';
  if (keys > 0) html += '<span class="hbadge api"><span class="dot"></span>' + T("badgeApi")(keys) + '</span>';
  if (!keys && !offline) html += '<span class="hbadge warn"><span class="dot"></span>' + T("badgeLocalNone") + '</span>';
  if (!keys && offline) html += '<span class="hbadge warn"><span class="dot"></span>' + T("badgeLocal") + '</span>';
  row.innerHTML = html;
}

/* ===== Cronologia: storage ===== */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem("vtt-history") || "[]"); }
  catch { return []; }
}
function saveHistoryList(items) {
  /* Guardia anti-quota: se lo storage è pieno, sfoltisci le voci più vecchie e riprova */
  const toSave = items.slice(0, 20);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      localStorage.setItem("vtt-history", JSON.stringify(toSave));
      return;
    } catch (err) {
      const quota = err && (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22);
      if (quota && toSave.length > 1) {
        toSave.pop(); /* le voci sono ordinate dalla più recente: pop toglie la più vecchia */
        continue;
      }
      console.warn("Salvataggio cronologia non riuscito:", err);
      return;
    }
  }
}

function pushHistoryEntry() {
  try {
    const transcript = ($("#txt") && $("#txt").value) || "";
    if (!transcript.trim()) return;
    const items = loadHistory();
    items.unshift({
      date: new Date().toISOString(),
      transcript: transcript,
      summary: hasSummary ? (($("#sum") && $("#sum").textContent) || "") : "",
      engine: lastSttEngine || "",
      dur: lastDurSec
    });
    saveHistoryList(items);
    renderHistory();
    announce(T("anCompleted"));
  } catch (e) {
    console.warn("History save failed:", e);
  }
}
function attachSummaryToLatest(summary) {
  try {
    const txt = ($("#txt") && $("#txt").value) || "";
    const items = loadHistory();
    for (const it of items) {
      if (it.transcript === txt && !it.summary) { it.summary = summary; break; }
    }
    saveHistoryList(items);
    renderHistory();
  } catch (e) {}
}

/* ===== Export cronologia multi-formato ===== */
function buildHistoryMD(list) {
  let s = "# " + T("histMdHeading") + "\n\n" + T("histGenerated")(nowLabel(), list.length) + "\n";
  list.forEach((h) => {
    s += "\n---\n\n## " + fmtHistDate(h.date) + " · " + (h.engine || "—") +
      (h.dur != null && h.dur !== "" ? " · " + fmtDur(Number(h.dur)) : "") +
      "\n\n**" + T("lblTranscript") + "**\n\n" + (h.transcript || "") + "\n";
    if (h.summary) s += "\n**TL;DR**\n\n" + h.summary + "\n";
  });
  return s;
}
function buildHistoryTXT(list) {
  let s = T("histTxtHeading") + "\n" + T("histGenerated")(nowLabel(), list.length) + "\n";
  list.forEach((h) => {
    s += "\n[" + fmtHistDate(h.date) + "] " + (h.engine || "—") + "\n" + T("lblTranscriptTxt") + ":\n" + (h.transcript || "") + "\n";
    if (h.summary) s += "TL;DR:\n" + h.summary + "\n";
    s += "================================\n";
  });
  return s;
}
function exportHistoryFormat(kind) {
  const items = loadHistory();
  if (!items.length) { stat(T("stHistEmpty"), 0); return; }
  const name = "soundscript-" + (LANG === "it" ? "cronologia" : "history") + "-" + fileStamp();
  if (kind === "json") { downloadFile(name + ".json", JSON.stringify(items, null, 2), "application/json"); announce(T("anHistExpJson")); }
  if (kind === "md") { downloadFile(name + ".md", buildHistoryMD(items), "text/markdown;charset=utf-8"); announce(T("anHistExpMd")); }
  if (kind === "txt") { downloadFile(name + ".txt", buildHistoryTXT(items), "text/plain;charset=utf-8"); announce(T("anHistExpTxt")); }
  stat(T("stHistExported"), 100);
}
function exportSingleEntry(h) {
  downloadFile("soundscript-" + fileStamp() + ".md", buildHistoryMD([h]), "text/markdown;charset=utf-8");
  stat(T("stEntryExp"), 100);
  announce(T("anEntryExp"));
}

/* ===== Import cronologia ===== */
async function importHistoryFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error("shape");
    const items = loadHistory();
    let added = 0, dup = 0;
    data.forEach((v) => {
      if (!v || typeof v.transcript !== "string" || !v.date) return;
      if (items.some((x) => x.date === v.date && x.transcript === v.transcript)) { dup++; return; }
      items.push({
        date: v.date,
        transcript: v.transcript,
        summary: typeof v.summary === "string" ? v.summary : "",
        engine: typeof v.engine === "string" ? v.engine : "",
        dur: (v.dur != null && v.dur !== "") ? Number(v.dur) : null
      });
      added++;
    });
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    const over = Math.max(0, items.length - 20);
    saveHistoryList(items);
    renderHistory();
    const msg = T("stImported")(added, dup, over);
    stat(msg + ".", 100);
    announce(msg);
  } catch (e) {
    stat(T("stImportBad"), 0);
    announce(T("anImportBad"));
  }
}

/* ===== Backup e ripristino impostazioni ===== */
function buildSettingsBackup(full) {
  const s = loadSettings();
  const out = {
    app: "SoundScript",
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: s.theme || "auto",
    lang: s.lang || "auto",
    notify: !!s.notify,
    tldr: s.tldr || {},
    tldrPresets: Array.isArray(s.tldrPresets) ? s.tldrPresets : [],
    localModel: s.localModel || "",
    lastProvider: s.lastProvider || "openai"
  };
  if (full) out.keys = s.keys;
  else out.keysOmitted = true;
  return out;
}
async function importSettingsFile(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== "SoundScript" || d.version !== 1) throw new Error("format");
    const patch = {};
    if (d.theme) patch.theme = d.theme;
    if (d.lang) patch.lang = d.lang;
    if (typeof d.notify === "boolean") patch.notify = d.notify;
    if (d.tldr) patch.tldr = d.tldr;
    if (Array.isArray(d.tldrPresets)) patch.tldrPresets = d.tldrPresets;
    if (d.localModel) patch.localModel = d.localModel;
    if (d.lastProvider) patch.lastProvider = d.lastProvider;
    let keysMsg = "";
    if (Array.isArray(d.keys) && d.keys.length) {
      if (confirm(T("confirmImportKeys")(d.keys.length))) {
        patch.keys = d.keys;
        keysMsg = T("stSetKeys");
      }
    }
    saveSettings(patch);
    stat(T("stSetImported") + keysMsg + T("stSetReloading"), 100);
    announce(T("anSetImported"));
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    stat(T("stSetBad"), 0);
    announce(T("anSetBad"));
  }
}

/* ===== Player audio ===== */
function setPlayingUI(playing) {
  const ip = $("#icoPlay"), ipa = $("#icoPause"), pl = $("#player");
  if (ip) ip.toggleAttribute("hidden", playing);
  if (ipa) ipa.toggleAttribute("hidden", !playing);
  if (pl) pl.classList.toggle("playing", playing);
}
function paintPlayer() {
  const fill = $("#pFill"), knob = $("#pKnob"), cur = $("#pCur");
  if (!fill || !audioEl) return;
  const d = audioEl.duration || 0;
  const pct = d ? (audioEl.currentTime / d) * 100 : 0;
  fill.style.width = pct + "%";
  knob.style.left = pct + "%";
  cur.textContent = fmtDur(audioEl.currentTime);
}
function ensureAudioEl() {
  if (audioEl) return;
  audioEl = new Audio();
  audioEl.preload = "metadata";
  audioEl.addEventListener("loadedmetadata", () => {
    const d = $("#pDur");
    if (d) d.textContent = fmtDur(audioEl.duration);
    paintPlayer();
  });
  audioEl.addEventListener("timeupdate", () => { if (!playerDragging) paintPlayer(); });
  audioEl.addEventListener("play", () => setPlayingUI(true));
  audioEl.addEventListener("pause", () => setPlayingUI(false));
  audioEl.addEventListener("ended", () => setPlayingUI(false));

  const play = $("#pPlay");
  if (play) play.onclick = () => {
    if (audioEl.paused) audioEl.play().catch(() => setPlayingUI(false));
    else audioEl.pause();
  };
  const back = $("#pBack");
  if (back) back.onclick = () => { audioEl.currentTime = Math.max(0, audioEl.currentTime - 10); paintPlayer(); };
  const fwd = $("#pFwd");
  if (fwd) fwd.onclick = () => { audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + 10); paintPlayer(); };
  const sp = $("#pSpeed");
  if (sp) sp.onclick = () => {
    playerSpeedIdx = (playerSpeedIdx + 1) % PLAYER_SPEEDS.length;
    audioEl.playbackRate = PLAYER_SPEEDS[playerSpeedIdx];
    sp.textContent = String(PLAYER_SPEEDS[playerSpeedIdx]).replace(".", LANG === "it" ? "," : ".") + "×";
  };
  const seek = $("#pSeek");
  if (seek) {
    const seekTo = (x) => {
      const r = seek.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (x - r.left) / r.width));
      audioEl.currentTime = ratio * (audioEl.duration || 0);
      paintPlayer();
    };
    seek.addEventListener("pointerdown", (e) => { playerDragging = true; seek.classList.add("drag"); seek.setPointerCapture(e.pointerId); seekTo(e.clientX); });
    seek.addEventListener("pointermove", (e) => { if (playerDragging) seekTo(e.clientX); });
    seek.addEventListener("pointerup", () => { playerDragging = false; seek.classList.remove("drag"); });
    seek.addEventListener("pointercancel", () => { playerDragging = false; seek.classList.remove("drag"); });
  }
}
function attachAudio(file) {
  try {
    ensureAudioEl();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file);
    audioEl.src = audioUrl;
    audioEl.currentTime = 0;
    audioEl.playbackRate = PLAYER_SPEEDS[playerSpeedIdx];
    const pl = $("#player");
    if (pl) pl.hidden = false;
    setPlayingUI(false);
    const d = $("#pDur"); if (d) d.textContent = "0:00";
    const c = $("#pCur"); if (c) c.textContent = "0:00";
    paintPlayer();
  } catch (e) {
    console.warn("Player unavailable:", e);
  }
}
function detachAudio() {
  if (audioEl) audioEl.pause();
  const pl = $("#player");
  if (pl) pl.hidden = true;
  setPlayingUI(false);
}

/* ===== Test chiave API ===== */
async function testApiKey() {
  const out = $("#testResult");
  if (!out) return;
  out.className = "test-result";
  const key = ($("#apiKey").value || "").trim();
  if (!key) { out.textContent = T("testPasteFirst"); out.classList.add("err"); return; }
  out.textContent = T("testChecking");
  const temp = {
    id: "test",
    provider: providerChoice,
    apiKey: key,
    baseUrl: ($("#baseUrl").value || "").trim()
  };
  try {
    const models = await listModels(temp);
    const cls = classifyModels(models, (PROVIDERS[providerChoice] || PROVIDERS.openai).family);
    out.textContent = T("keyValid")(cls.stt.length, cls.chat.length);
    out.classList.add("ok");
    announce(out.textContent);
  } catch (err) {
    out.textContent = T("keyInvalidPre") + (describeError(err) || T("errGeneric"));
    out.classList.add("err");
    announce(out.textContent);
  }
}

/* ===== Pulsante Nuovo ===== */
function resetSession() {
  detachAudio();
  hasSummary = false;
  const r = $("#resultStt"); if (r) r.classList.add("hidden");
  const txt = $("#txt"); if (txt) txt.value = "";
  const sum = $("#sum"); if (sum) sum.textContent = T("sumPlaceholder");
  const chip = $("#chipLlm"); if (chip) chip.hidden = true;
  const regen = $("#regen"); if (regen) regen.textContent = T("genTldr");
  const all = $("#all"); if (all) all.disabled = true;
  const bar = $("#bar"); if (bar) bar.style.width = "0%";
  clearDraft();
  stat(T("ready"), 0);
  announce(T("ready"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ===== Export TXT / MD / PDF ===== */
function fileStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}
function docDateLabel() {
  try {
    return lastProcessDate.toLocaleString(LOC(), { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return String(lastProcessDate); }
}
function currentSum() {
  return hasSummary ? (($("#sum") && $("#sum").textContent) || "") : "";
}
function buildTXT() {
  const sum = currentSum();
  let s = "SoundScript — " + docDateLabel() + "\n";
  s += T("engine") + ": " + (lastSttEngine || "—") + " | " + T("duration") + ": " +
    (lastDurSec != null ? fmtDur(lastDurSec) : T("notAvailable")) + "\n\n";
  s += T("lblTranscriptTxt") + "\n" + (($("#txt") && $("#txt").value) || "") + "\n";
  if (sum) s += "\nTL;DR\n" + sum + "\n";
  return s;
}
function buildMD() {
  const sum = currentSum();
  let s = "# SoundScript — " + T("expDocKind") + "\n\n";
  s += "- **" + T("expMetaDate") + ":** " + docDateLabel() + "\n";
  s += "- **" + T("engine") + ":** " + (lastSttEngine || "—") + "\n";
  s += "- **" + T("duration") + ":** " + (lastDurSec != null ? fmtDur(lastDurSec) : T("notAvailable")) + "\n\n";
  s += "## " + T("lblTranscript") + "\n\n" + (($("#txt") && $("#txt").value) || "") + "\n";
  if (sum) s += "\n## TL;DR\n\n" + sum + "\n";
  return s;
}
function buildDocHTML() {
  const sum = currentSum();
  let h = "";
  h += '<div class="pv-head">' + PRINT_LOGO_SVG + '<span class="pv-kind">' + T("expDocKind") + '</span></div>';
  h += '<div class="pv-meta"><span>' + T("expMetaDate") + ': ' + docDateLabel() + '</span><span>' + T("engine") + ': ' +
    (lastSttEngine || "—") + '</span><span>' + T("duration") + ': ' +
    (lastDurSec != null ? fmtDur(lastDurSec) : T("notAvailable")) + '</span></div>';
  h += "<h2>" + T("lblTranscript") + "</h2><p></p>";
  if (sum) h += "<h2>TL;DR</h2><p></p>";
  h += '<div class="pv-foot"><span>' + T("expGeneratedBy") + '</span><span>soundscript · ' + fileStamp() + '</span></div>';
  const wrap = document.createElement("div");
  wrap.innerHTML = h;
  const ps = wrap.querySelectorAll("p");
  if (ps[0]) ps[0].textContent = ($("#txt") && $("#txt").value) || "";
  if (sum && ps[1]) ps[1].textContent = sum;
  return wrap.innerHTML;
}
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function ensurePrintView() {
  let pv = document.getElementById("printView");
  if (!pv) {
    pv = document.createElement("div");
    pv.id = "printView";
    document.body.appendChild(pv);
  }
  return pv;
}

/* ===== Chiusura menu popover ===== */
function closeExportMenu() {
  const m = $("#exportMenu");
  if (m) m.hidden = true;
  const b = $("#exportBtn");
  if (b) b.setAttribute("aria-expanded", "false");
}
function closeAllMenus() {
  closeExportMenu();
  const hm = $("#histExpMenu"); if (hm) hm.hidden = true;
  const hb = $("#histExpBtn"); if (hb) hb.setAttribute("aria-expanded", "false");
  const sm = $("#setExpMenu"); if (sm) sm.hidden = true;
  const sb = $("#setExpBtn"); if (sb) sb.setAttribute("aria-expanded", "false");
}

/* ===== Ultimi errori ===== */
function loadLastErrors() {
  try { return JSON.parse(localStorage.getItem(LASTERR_KEY) || "{}"); }
  catch { return {}; }
}
function saveLastError(id, txt) {
  const m = loadLastErrors(); m[id] = txt;
  localStorage.setItem(LASTERR_KEY, JSON.stringify(m));
}
function clearLastError(id) {
  const m = loadLastErrors();
  if (id in m) { delete m[id]; localStorage.setItem(LASTERR_KEY, JSON.stringify(m)); }
}
function describeError(err) {
  if (err && err.name === "AbortError") return T("deAborted");
  const st = err && err.status;
  if (st === 401 || st === 403) return T("de401")(st);
  if (st === 402) return T("de402");
  if (st === 429) return T("de429");
  if (st === 400) return T("de400");
  if (st === 404) return T("de404");
  if (st >= 500) return T("de5xx")(st);
  return T("deNet");
}

/* ===== Suggerimento modelli ===== */
function suggestModel(list, slot, provider) {
  const p = PROVIDERS[provider] || PROVIDERS.openai;
  const rec = slot === "stt" ? p.recommended.stt : p.recommended.llm;
  if (rec && list.some((m) => m.id === rec)) return rec;
  if (slot === "stt") {
    const pref = list.find((m) => /turbo|v3|large|whisper|transcribe|voxtral/i.test(m.id));
    if (pref) return pref.id;
  } else {
    const pref = list.find((m) => /flash-lite|flash|mini|instant|lite|nano|small|haiku/i.test(m.id));
    if (pref) return pref.id;
  }
  return list[0]?.id || "";
}
function entrySugg(entry, slot) {
  if (slot === "stt" && entry.suggStt) return entry.suggStt;
  if (slot === "llm" && entry.suggLlm) return entry.suggLlm;
  const cls = modelCache[entry.id];
  if (cls) return suggestModel(slot === "stt" ? cls.stt : cls.chat, slot, entry.provider);
  const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
  return slot === "stt" ? (p.recommended.stt || "") : p.recommended.llm;
}
async function ensureModels(entry, force) {
  if (!force && modelCache[entry.id]) return modelCache[entry.id];
  const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
  const models = await listModels(entry);
  const cls = classifyModels(models, p.family);
  modelCache[entry.id] = cls;
  return cls;
}

/* ===== Wake Lock ===== */
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        if (downloading && document.visibilityState === "visible") {
          requestWakeLock().then((ok) => setWlBanner(ok ? "ok" : "warn"));
        }
      });
      return true;
    }
  } catch (e) {
    console.warn("Wake lock unavailable:", e);
  }
  return false;
}
async function releaseWakeLock() {
  if (wakeLock) {
    try { await wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
}
function setWlBanner(mode) {
  const b = $("#wlBanner");
  if (!b) return;
  if (mode === "ok") {
    b.hidden = false;
    b.className = "wl-banner ok";
    b.textContent = T("wlOk");
  } else if (mode === "warn") {
    b.hidden = false;
    b.className = "wl-banner warn";
    b.textContent = T("wlWarn");
  } else {
    b.hidden = true;
  }
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && downloading && !wakeLock) {
    const ok = await requestWakeLock();
    setWlBanner(ok ? "ok" : "warn");
  }
});

function stat(message, percent) {
  const status = $("#status");
  const bar = $("#bar");
  const eq = $("#eq");
  if (status) status.textContent = message;
  if (bar && percent != null) bar.style.width = percent + "%";
  if (eq) eq.hidden = !(percent > 0 && percent < 100);
}

/* ===== Icone ===== */
const TLDR_SVG = `<svg viewBox="0 0 24 24"><path d="M4 6h9"/><path d="M4 12h6"/><path d="M4 18h4"/><path d="M17 4l1.5 3.5L22 9l-3.5 1.5L17 14l-1.5-3.5L12 9l3.5-1.5z"/></svg>`;
const HIST_SVG = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
const KEY_SVG = `<svg viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13 19 4"/><path d="M17 6l2 2"/><path d="M14 9l1.5 1.5"/></svg>`;
const CHIP_SVG = `<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/><rect x="10.5" y="10.5" width="3" height="3"/><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3"/></svg>`;
const FAQ_SVG = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .2c0 1.8-2.5 2-2.5 3.3"/><circle cx="12" cy="17" r=".5"/></svg>`;
const REFRESH_SVG = `<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;
const DL_SVG = `<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
const DROP_MARK_SVG = `<svg class="drop-mark" viewBox="0 0 80 64" aria-hidden="true">
  <defs><linearGradient id="dz-mark" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#06b6d4"/>
  </linearGradient></defs>
  <path d="M8 40 Q16 16 24 40 T40 40" fill="none" stroke="url(#dz-mark)" stroke-width="7" stroke-linecap="round"/>
  <path d="M48 24 H72 M48 40 H66 M48 56 H58" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <circle cx="72" cy="56" r="4.5" fill="#06b6d4"/>
</svg>`;
const CHEVRON_SVG = `<svg class="chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
const CHEV_SVG = `<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
const TICK_SVG = `<svg class="tick" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>`;

/* ===== Dropdown custom ===== */
function closeAllDD() {
  document.querySelectorAll(".dd.open").forEach((d) => {
    d.classList.remove("open");
    const m = d.querySelector(".dd-menu"); if (m) m.hidden = true;
    const b = d.querySelector(".dd-btn"); if (b) b.setAttribute("aria-expanded", "false");
  });
}
document.addEventListener("click", () => { closeAllDD(); closeAllMenus(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeAllDD(); closeAllMenus(); }
});

function makeDropdown(host, opts) {
  host.innerHTML = "";
  host.classList.add("dd");
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "dd-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  if (opts.ariaLabel) btn.setAttribute("aria-label", opts.ariaLabel);
  btn.innerHTML = `<span class="val"></span>${CHEV_SVG}`;
  const current = opts.options.find((o) => o.id === opts.value) || opts.options[0];
  btn.querySelector(".val").textContent = current ? current.label : "";
  host.appendChild(btn);

  const menu = document.createElement("div");
  menu.className = "dd-menu"; menu.hidden = true; menu.setAttribute("role", "listbox");
  opts.options.forEach((o) => {
    const it = document.createElement("button");
    it.type = "button";
    it.className = "dd-item" + (o.id === opts.value ? " sel" : "");
    it.setAttribute("role", "option");
    it.setAttribute("aria-selected", o.id === opts.value ? "true" : "false");
    it.innerHTML = `${TICK_SVG}<span class="name"></span>` +
      (opts.suggId && o.id === opts.suggId ? `<span class="star-tag">⭐</span>` : "");
    it.querySelector(".name").textContent = o.label;
    it.onclick = (e) => {
      e.stopPropagation();
      closeAllDD();
      if (o.id !== opts.value) opts.onChange(o.id);
    };
    menu.appendChild(it);
  });
  host.appendChild(menu);

  btn.onclick = (e) => {
    e.stopPropagation();
    const isOpen = !menu.hidden;
    closeAllDD();
    if (!isOpen) {
      menu.hidden = false;
      host.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    }
  };
}

/* ===== Riga portale chiavi ===== */
function renderKeyPortal(providerId) {
  const box = $("#keyPortal");
  if (!box) return;
  const p = KEY_PORTALS[providerId];
  let html = "";
  if (!p) {
    html = '<span class="kp-ico">ℹ️</span><span>' + T("portalCustom") + '</span>';
  } else {
    html = '<span class="kp-ico">🔑</span><span>' + T("portalNoKey") + ' <a href="' + p.url +
      '" target="_blank" rel="noopener noreferrer">' + T("portalGet")(p.name) +
      '<span class="kp-ext">↗</span></a></span>';
  }
  if (providerId === "anthropic") html += '<div class="kp-note">' + T("portalAnthropic") + '</div>';
  box.innerHTML = html;
}

/* ===== Cronologia: rendering ===== */
function renderHistory() {
  const listEl = $("#histList");
  if (!listEl) return;
  const items = loadHistory();
  const q = (($("#histSearch") && $("#histSearch").value) || "").trim().toLowerCase();
  const filtered = items.filter((h) => !q ||
    (h.transcript || "").toLowerCase().includes(q) ||
    (h.summary || "").toLowerCase().includes(q) ||
    fmtHistDate(h.date).toLowerCase().includes(q));
  const shown = histShowAll ? filtered : filtered.slice(0, HIST_LIMIT);
  listEl.innerHTML = "";

  shown.forEach((h) => {
    const idx = items.indexOf(h);
    const row = document.createElement("div");
    row.className = "hist-item";
    row.innerHTML = `
      <div class="hist-main">
        <div class="hist-meta">
          <span class="hist-date"></span>
          <span class="badge engine"></span>
          <span class="badge dur"></span>
          ${h.summary ? '<span class="badge tldr">TL;DR</span>' : ""}
        </div>
        <div class="hist-preview"></div>
      </div>
      <div class="hist-actions">
        <button class="icon-btn expone" title="${T("histExpOneAria")}" aria-label="${T("histExpOneAria")}">${DL_SVG}</button>
        <button class="icon-btn del" title="${T("histDelAria")}" aria-label="${T("histDelAria")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>
        </button>
      </div>`;
    row.querySelector(".hist-date").textContent = fmtHistDate(h.date);
    row.querySelector(".badge.engine").textContent = h.engine || "—";
    const durB = row.querySelector(".badge.dur");
    if (h.dur != null && h.dur !== "") durB.textContent = fmtDur(Number(h.dur));
    else durB.remove();
    row.querySelector(".hist-preview").textContent = h.transcript || "";
    row.onclick = () => loadHistoryEntry(h);
    row.querySelector(".expone").onclick = (e) => { e.stopPropagation(); exportSingleEntry(h); };
    row.querySelector(".del").onclick = (e) => {
      e.stopPropagation();
      items.splice(idx, 1);
      saveHistoryList(items);
      renderHistory();
      stat(T("stEntryDeleted"), 100);
      announce(T("anEntryDeleted"));
    };
    listEl.appendChild(row);
  });

  const empty = $("#histEmpty");
  if (empty) empty.hidden = filtered.length > 0;
  const shownLbl = $("#histShown");
  if (shownLbl) shownLbl.textContent = filtered.length ? T("histShown")(shown.length, filtered.length) : "";
  const more = $("#histMore");
  if (more) {
    if (filtered.length <= HIST_LIMIT) more.hidden = true;
    else {
      more.hidden = false;
      more.textContent = histShowAll ? T("histShowFew") : T("histShowAll")(filtered.length);
    }
  }
}

function loadHistoryEntry(h) {
  const txt = $("#txt");
  if (!txt) return;
  detachAudio();
  txt.value = h.transcript || "";
  $("#resultStt").classList.remove("hidden");
  lastSttEngine = h.engine || "";
  lastDurSec = (h.dur != null && h.dur !== "") ? Number(h.dur) : null;
  const d = new Date(h.date);
  lastProcessDate = isNaN(d.getTime()) ? new Date() : d;
  $("#engStt").textContent = (h.engine || "—") + " " + T("fromHistory");
  $("#durStt").textContent = lastDurSec != null ? fmtDur(lastDurSec) : T("notAvailable");
  const sum = $("#sum");
  if (h.summary) {
    hasSummary = true;
    sum.textContent = h.summary;
    const ft = $("#faqTldr"); if (ft) ft.open = true;
  } else {
    hasSummary = false;
    sum.textContent = T("histNoTldr");
  }
  $("#chipLlm").hidden = true;
  $("#regen").textContent = T("genTldr");
  $("#all").disabled = false;
  writeDraft();
  stat(T("stEntryLoaded"), 100);
  announce(T("anEntryLoaded"));
  $("#resultStt").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearHistory() {
  const items = loadHistory();
  if (!items.length) return;
  if (confirm(T("confirmClear")(items.length))) {
    saveHistoryList([]);
    renderHistory();
    stat(T("stHistCleared"), 100);
    announce(T("anHistCleared"));
  }
}

function render() {
  const lc = langChoice();
  const savedTheme = loadSettings().theme || "auto";

  $("#app").innerHTML = `
    <main>
      <div class="hero">
        <div class="hero-bar">
          <div class="lang-pill" role="group" aria-label="${T("heroLangAria")}">
            <button type="button" data-hlang="it" class="${LANG === "it" ? "active" : ""}">IT</button>
            <button type="button" data-hlang="en" class="${LANG === "en" ? "active" : ""}">EN</button>
          </div>
          <button type="button" class="hero-theme" id="heroTheme" aria-label="${T("themeToggleAria")}"></button>
        </div>
        <img class="hero-logo hero-logo-light" alt="SoundScript" src="logo-light.svg" width="320" height="80">
        <img class="hero-logo hero-logo-dark" alt="SoundScript" src="logo-dark.svg" width="320" height="80">
        <p class="sub">${T("heroSub")}</p>
      </div>

      <section class="card" style="margin-top:0">
        <div class="card-label">${T("whatApp")}</div>
        <div class="feature-grid">
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </div>
            <div><h3>${T("feat1T")}</h3><p>${T("feat1D")}</p></div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div><h3>${T("feat2T")}</h3><p>${T("feat2D")}</p></div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div><h3>${T("feat3T")}</h3><p>${T("feat3D")}</p></div>
          </div>
        </div>
      </section>

      <div class="drop" id="drop">
        ${DROP_MARK_SVG}
        <strong>${T("dropTitle")}</strong>
        <span>${T("dropSub")}</span>
        <button id="pick" class="btn primary" style="margin-top:var(--space-md)">${T("pickAudio")}</button>
        <input id="file" class="hidden" type="file" accept="audio/*,.ogg,.opus,.m4a,.mp3,.wav,.aac">
      </div>

      <div class="status-row">
        <div class="spinner" id="eq" hidden></div>
        <div id="status" class="status" role="status" aria-live="polite">${T("ready")}</div>
        <button class="btn danger" id="cancelBtn" hidden>${T("cancel")}</button>
      </div>
      <div class="progress"><div id="bar" class="progress-bar"></div></div>

      <div id="resultStt" class="card hidden">
        <div class="card-head">
          <div class="card-label">${T("transcriptCard")}</div>
          <button class="btn ghostline" id="newBtn" style="min-height:36px;padding:0 14px" title="${T("newBtnTitle")}">↺ ${T("newBtn")}</button>
        </div>
        <div class="chips">
          <span class="chip">${T("engine")}: <b id="engStt"></b></span>
          <span class="chip">${T("duration")}: <b id="durStt"></b></span>
        </div>

        <div class="player" id="player" hidden>
          <button class="p-btn" id="pPlay" aria-label="${T("playerPlay")}">
            <svg id="icoPlay" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg id="icoPause" viewBox="0 0 24 24" hidden><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          </button>
          <button class="p-btn" id="pBack" aria-label="${T("playerBack")}">-10</button>
          <button class="p-btn" id="pFwd" aria-label="${T("playerFwd")}">+10</button>
          <span class="p-time" id="pCur">0:00</span>
          <div class="p-seek" id="pSeek">
            <div class="p-fill" id="pFill"></div>
            <div class="p-knob" id="pKnob"></div>
          </div>
          <span class="p-time" id="pDur">0:00</span>
          <button class="p-speed" id="pSpeed" aria-label="${T("playerSpeed")}">1×</button>
        </div>

        <textarea id="txt" aria-label="${T("txtAria")}"></textarea>
        <div class="actions">
          <button id="copy" class="btn">${T("copyT")}</button>
          <button id="share" class="btn">${T("shareT")}</button>
          <div class="export-wrap">
            <button class="btn" id="exportBtn" aria-haspopup="menu" aria-expanded="false">⤓ ${T("exportT")}</button>
            <div class="export-menu" id="exportMenu" hidden role="menu">
              <button class="xm-item" id="expTxt" role="menuitem">
                <span class="xm-ico txt">📄</span>
                <span><span class="xm-t">${T("expTxtT")}</span><br><span class="xm-d">${T("expTxtD")}</span></span>
              </button>
              <button class="xm-item" id="expMd" role="menuitem">
                <span class="xm-ico md">Ⓜ️</span>
                <span><span class="xm-t">${T("expMdT")}</span><br><span class="xm-d">${T("expMdD")}</span></span>
              </button>
              <button class="xm-item" id="expPdf" role="menuitem">
                <span class="xm-ico pdf">🖨️</span>
                <span><span class="xm-t">${T("expPdfT")}</span><br><span class="xm-d">${T("expPdfD")}</span></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="faq">
        <details class="faq-item t0" id="faqTldr">
          <summary>
            <span class="si" aria-hidden="true">${TLDR_SVG}</span>
            <span class="ttl">${T("tldrTitle")}</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <p class="note" id="autoNote" style="margin:0 0 var(--space-sm)"></p>

            <div class="field-label" style="margin-top:0">${T("lenLabel")}</div>
            <div class="seg" data-group="len">
              <button data-v="breve">${I18N[LANG].segLen.breve}</button>
              <button data-v="medio">${I18N[LANG].segLen.medio}</button>
              <button data-v="lungo">${I18N[LANG].segLen.lungo}</button>
            </div>

            <div class="field-label">${T("styleLabel")}</div>
            <div class="seg" data-group="style">
              <button data-v="narrativo">${I18N[LANG].segStyle.narrativo}</button>
              <button data-v="elenco">${I18N[LANG].segStyle.elenco}</button>
              <button data-v="azioni">${I18N[LANG].segStyle.azioni}</button>
              <button data-v="formale">${I18N[LANG].segStyle.formale}</button>
              <button data-v="informale">${I18N[LANG].segStyle.informale}</button>
            </div>

            <div class="field-label">${T("tlangUiLabel")}</div>
            <div class="seg" data-group="lang">
              <button data-v="it">${I18N[LANG].segLang.it}</button>
              <button data-v="auto">${I18N[LANG].segLang.auto}</button>
            </div>

            <div class="field-label">${T("customLabel")} <span class="muted">${T("customOptional")}</span></div>
            <input id="tldrCustom" type="text" placeholder="${T("customPh")}">

            <div class="field-label">${T("promptLabel")}</div>
            <div class="prompt-box" id="promptBox"></div>

            <div class="field-label">${T("presetsLabel")}</div>
            <div class="preset-row" id="presetRow"></div>
            <div class="preset-row">
              <input id="presetName" type="text" placeholder="${T("presetPh")}" style="flex:1;min-width:160px">
              <button id="savePreset" class="btn">${T("savePreset")}</button>
            </div>

            <div class="actions">
              <button id="regen" class="btn primary">${T("genTldr")}</button>
            </div>

            <div class="chips" style="margin-top:var(--space-md)">
              <span class="chip" id="chipLlm" hidden>${T("engine")}: <b id="engLlm"></b></span>
            </div>
            <div id="sum" class="tldr-box">${T("sumPlaceholder")}</div>
            <p id="tldrMeta" class="muted" style="margin-top:var(--space-sm)"></p>

            <div class="actions">
              <button id="all" class="btn primary" disabled>${T("copyAll")}</button>
            </div>
          </div>
        </details>

        <details class="faq-item t4" id="faqHist">
          <summary>
            <span class="si" aria-hidden="true">${HIST_SVG}</span>
            <span class="ttl">${T("histTitle")}</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div class="search-wrap">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input class="search-input" id="histSearch" type="text" placeholder="${T("histSearchPh")}" aria-label="${T("histSearchAria")}">
            </div>
            <div class="hist-list" id="histList"></div>
            <div class="empty" id="histEmpty" hidden><span class="em">🗂️</span>${T("histEmpty")}</div>
            <div class="hist-footer">
              <button class="btn ghostline" id="histMore">${T("histShowFew")}</button>
              <div class="export-wrap">
                <button class="btn" id="histExpBtn" aria-haspopup="menu" aria-expanded="false">⤓ ${T("histExport")}</button>
                <div class="export-menu" id="histExpMenu" hidden role="menu">
                  <button class="xm-item" id="histExpJson" role="menuitem">
                    <span class="xm-ico txt">{ }</span>
                    <span><span class="xm-t">${T("histExpJsonT")}</span><br><span class="xm-d">${T("histExpJsonD")}</span></span>
                  </button>
                  <button class="xm-item" id="histExpMd" role="menuitem">
                    <span class="xm-ico md">Ⓜ️</span>
                    <span><span class="xm-t">${T("histExpMdT")}</span><br><span class="xm-d">${T("histExpMdD")}</span></span>
                  </button>
                  <button class="xm-item" id="histExpTxt" role="menuitem">
                    <span class="xm-ico pdf">📄</span>
                    <span><span class="xm-t">${T("histExpTxtT")}</span><br><span class="xm-d">${T("histExpTxtD")}</span></span>
                  </button>
                </div>
              </div>
              <button class="btn ghostline" id="histImpBtn">⤒ ${T("histImport")}</button>
              <input type="file" id="histImpFile" accept=".json,application/json" hidden>
              <button class="btn danger" id="histClear">${T("histClear")}</button>
              <span class="hist-count" id="histShown"></span>
            </div>
            <p class="muted" style="margin-top:var(--space-sm)">${T("histNote")}</p>
          </div>
        </details>

        <details class="faq-item t1" id="faqKeys">
          <summary>
            <span class="si" aria-hidden="true">${KEY_SVG}</span>
            <span class="ttl">${T("keysTitle")}</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div class="dd" id="ddProvider"></div>
            <div class="key-portal" id="keyPortal"></div>
            <div class="test-row">
              <input id="apiKey" type="password" placeholder="${T("keyPh")}">
              <button class="btn" id="testKeyBtn">${T("testBtn")}</button>
            </div>
            <div class="test-result" id="testResult"></div>
            <input id="baseUrl" type="text" placeholder="${T("baseUrlPh")}" style="margin-top:var(--space-sm)">
            <div class="actions">
              <button id="saveKey" class="btn primary">${T("saveKeyBtn")}</button>
            </div>
            <p id="keysMsg" class="muted" style="margin-top:var(--space-sm)"></p>
            <ul id="keyList" class="chain-list"></ul>
            <div class="actions">
              <button id="saveChain" class="btn primary">${T("saveChain")}</button>
              <span id="unsavedChip" class="chip warn" hidden>${T("unsaved")}</span>
            </div>
            <p id="prefMsg" class="muted" style="margin-top:var(--space-sm)"></p>
            <p class="muted" style="margin-top:var(--space-sm)">${T("chainNote")}</p>
          </div>
        </details>

        <details class="faq-item t2" id="faqLocal">
          <summary>
            <span class="si" aria-hidden="true">${CHIP_SVG}</span>
            <span class="ttl">${T("localTitle")}</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div id="ddLocal"></div>
            <div class="actions">
              <button id="preload" class="btn">${T("dlNow")}</button>
            </div>
            <div class="wl-banner" id="wlBanner" hidden></div>
            <div class="disclaimer">
              <span class="ic">ⓘ</span>
              <span>${T("localDisclaimer")}</span>
            </div>
            <div class="dl-area" id="dlArea" hidden>
              <div class="dl-head">
                <div class="spinner" id="dlSpinner"></div>
                <div class="dl-step" id="dlStep">${T("dlStepAsr")}</div>
                <div class="dl-stepcount" id="dlStepCount">${T("dlCount")(1, 2)}</div>
              </div>
              <div class="dl-file">
                <span id="dlFile">…</span>
                <span id="dlPct">0%</span>
              </div>
              <div class="dl-bar"><div class="dl-fill" id="dlFill"></div></div>
              <div class="dl-meta" style="display:flex;justify-content:space-between;margin-top:var(--space-xs);font-size:.8125rem;color:var(--on-surface-variant)">
                <span id="dlLoaded">0 MB</span>
                <span id="dlTotal">— 0 MB</span>
              </div>
              <div class="dl-list" id="dlList"></div>
              <div class="dl-done" id="dlDone" hidden>
                <span class="dl-check">✓</span>
                <span>${T("dlDone")}</span>
              </div>
            </div>
          </div>
        </details>

        <details class="faq-item t5" id="faqFaq">
          <summary>
            <span class="si" aria-hidden="true">${FAQ_SVG}</span>
            <span class="ttl">${T("faqTitle")}</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            ${IS_IOS ? `
            <details class="faq-sub" open>
              <summary><span class="ttl">${T("faqIosT")}</span>${CHEV_SVG}</summary>
              <div class="faq-sub-body">${T("faqIosB")}</div>
            </details>` : ""}
            <details class="faq-sub">
              <summary><span class="ttl">${T("faqPrivT")}</span>${CHEV_SVG}</summary>
              <div class="faq-sub-body">${T("faqPrivB")}</div>
            </details>
            <details class="faq-sub">
              <summary><span class="ttl">${T("faqAutoT")}</span>${CHEV_SVG}</summary>
              <div class="faq-sub-body">${T("faqAutoB")}</div>
            </details>
          </div>
        </details>

        <details class="faq-item t3" id="faqInfo">
          <summary>
            <span class="si" aria-hidden="true">${REFRESH_SVG}</span>
            <span class="ttl">${T("infoTitle")}</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div class="settings-item stack">
              <div>
                <div class="settings-item-title">${T("statusApp")}</div>
                <div class="settings-item-desc">${T("statusAppD")}</div>
              </div>
              <div class="hbadge-row" id="badgeRow"></div>
            </div>

            <div class="settings-item stack">
              <div>
                <div class="settings-item-title">${T("langLabel")}</div>
                <div class="settings-item-desc">${T("langDesc")}</div>
              </div>
              <div class="seg" id="langSeg" style="margin:0">
                <button data-langopt="auto" class="${lc === "auto" ? "active" : ""}">${T("langOptAuto")}</button>
                <button data-langopt="it" class="${lc === "it" ? "active" : ""}">${T("langOptIt")}</button>
                <button data-langopt="en" class="${lc === "en" ? "active" : ""}">${T("langOptEn")}</button>
              </div>
            </div>

            <div class="settings-item stack">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div class="settings-item-title" style="margin:0">${T("tlangLabel")}</div>
                <span class="tlang-badge">${T("tlangBadge")}</span>
              </div>
              <div class="settings-item-desc">${T("tlangDesc")}</div>
            </div>

            <div class="settings-item">
              <div>
                <div class="settings-item-title">${T("themeLabel")}</div>
                <div class="settings-item-desc">${T("themeDesc")}</div>
              </div>
              <div class="seg" id="themeSeg" style="margin:0">
                <button data-t="auto" class="${savedTheme === "auto" ? "active" : ""}">${T("themeAuto")}</button>
                <button data-t="light" class="${savedTheme === "light" ? "active" : ""}">${T("themeLight")}</button>
                <button data-t="dark" class="${savedTheme === "dark" ? "active" : ""}">${T("themeDark")}</button>
              </div>
            </div>

            <div class="settings-item">
              <div>
                <div class="settings-item-title">${T("notifyLabel")}</div>
                <div class="settings-item-desc" id="notifDesc">${T("notifyDescOff")}</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="notifToggle">
                <span class="track"></span>
              </label>
            </div>

            <div class="settings-item stack">
              <div>
                <div class="settings-item-title">${T("backupLabel")}</div>
                <div class="settings-item-desc">${T("backupDesc")}</div>
              </div>
              <div class="actions" style="margin:0;justify-content:flex-end">
                <div class="export-wrap">
                  <button class="btn" id="setExpBtn" aria-haspopup="menu" aria-expanded="false">⤓ ${T("exportT")}</button>
                  <div class="export-menu" id="setExpMenu" hidden role="menu">
                    <button class="xm-item" id="setExpSafe" role="menuitem">
                      <span class="xm-ico txt">🛡️</span>
                      <span><span class="xm-t">${T("expSafeT")}</span><br><span class="xm-d">${T("expSafeD")}</span></span>
                    </button>
                    <button class="xm-item" id="setExpFull" role="menuitem">
                      <span class="xm-ico md">🔑</span>
                      <span><span class="xm-t">${T("expFullT")}</span><br><span class="xm-d">${T("expFullD")}</span></span>
                    </button>
                  </div>
                </div>
                <button class="btn ghostline" id="setImpBtn">⤒ ${T("setImport")}</button>
                <input type="file" id="setImpFile" accept=".json,application/json" hidden>
              </div>
            </div>

            <div class="settings-item">
              <div>
                <div class="settings-item-title">${T("updatesLabel")}</div>
                <div class="settings-item-desc">${T("updatesDesc")}</div>
              </div>
              <button class="btn" id="checkUpdateBtn"><span id="checkUpdateLabel">${T("checkBtn")}</span></button>
            </div>
            <div class="settings-item">
              <div>
                <div class="settings-item-title">${T("versionLabel")}</div>
                <div class="settings-item-desc" id="appVersion">—</div>
              </div>
            </div>
            <p class="muted" style="margin-top:var(--space-sm)">${T("infoNote")}</p>
          </div>
        </details>
      </div>

      <div id="srStatus" class="sr-only" role="status" aria-live="polite"></div>
      <div class="toast" id="toast"></div>
    </main>
  `;

  /* Toast delegation */
  const toastEl = $("#toast");
  if (toastEl) {
    toastEl.addEventListener("click", (e) => {
      if (e.target.closest("[data-toast-close]")) hideToast();
    });
  }

  /* Hero: lingua + tema */
  document.querySelectorAll("[data-hlang]").forEach((b) => {
    b.onclick = () => { if (b.dataset.hlang !== LANG || langChoice() === "auto") setLang(b.dataset.hlang); };
  });
  const heroTheme = $("#heroTheme");
  if (heroTheme) heroTheme.onclick = () => setTheme(effectiveTheme() === "dark" ? "light" : "dark");
  applyTheme(savedTheme);

  /* Input file */
  $("#pick").onclick = () => $("#file").click();
  $("#file").onchange = (event) => {
    const file = event.target.files?.[0];
    if (file) process(file);
    event.target.value = "";
  };

  const drop = $("#drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (file) process(file);
  };

  const txtEl = $("#txt");
  if (txtEl) txtEl.addEventListener("input", queueDraft);

  /* Cronologia */
  const hs = $("#histSearch"); if (hs) hs.oninput = () => renderHistory();
  const hm = $("#histMore"); if (hm) hm.onclick = () => { histShowAll = !histShowAll; renderHistory(); };
  const hc = $("#histClear"); if (hc) hc.onclick = clearHistory;

  const histExpBtn = $("#histExpBtn");
  if (histExpBtn) histExpBtn.onclick = (e) => {
    e.stopPropagation();
    const was = !$("#histExpMenu").hidden;
    closeAllMenus();
    if (!was) { $("#histExpMenu").hidden = false; histExpBtn.setAttribute("aria-expanded", "true"); }
  };
  const hj = $("#histExpJson"); if (hj) hj.onclick = () => { closeAllMenus(); exportHistoryFormat("json"); };
  const hmd = $("#histExpMd"); if (hmd) hmd.onclick = () => { closeAllMenus(); exportHistoryFormat("md"); };
  const htx = $("#histExpTxt"); if (htx) htx.onclick = () => { closeAllMenus(); exportHistoryFormat("txt"); };

  const histImpBtn = $("#histImpBtn");
  if (histImpBtn) histImpBtn.onclick = () => $("#histImpFile").click();
  const histImpFile = $("#histImpFile");
  if (histImpFile) histImpFile.onchange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) importHistoryFile(f);
  };

  /* Backup impostazioni */
  const setExpBtn = $("#setExpBtn");
  if (setExpBtn) setExpBtn.onclick = (e) => {
    e.stopPropagation();
    const was = !$("#setExpMenu").hidden;
    closeAllMenus();
    if (!was) { $("#setExpMenu").hidden = false; setExpBtn.setAttribute("aria-expanded", "true"); }
  };
  const setSafe = $("#setExpSafe");
  if (setSafe) setSafe.onclick = () => {
    closeAllMenus();
    downloadFile("soundscript-settings-" + fileStamp() + "-safe.json", JSON.stringify(buildSettingsBackup(false), null, 2), "application/json");
    stat(T("stBackupSafe"), 100);
    announce(T("anBackupSafe"));
  };
  const setFull = $("#setExpFull");
  if (setFull) setFull.onclick = () => {
    closeAllMenus();
    downloadFile("soundscript-settings-" + fileStamp() + "-full.json", JSON.stringify(buildSettingsBackup(true), null, 2), "application/json");
    stat(T("stBackupFull"), 100);
    announce(T("anBackupFull"));
  };
  const setImpBtn = $("#setImpBtn");
  if (setImpBtn) setImpBtn.onclick = () => $("#setImpFile").click();
  const setImpFile = $("#setImpFile");
  if (setImpFile) setImpFile.onchange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) importSettingsFile(f);
  };

  /* Annulla / Nuovo / Testa chiave */
  const cb = $("#cancelBtn"); if (cb) cb.onclick = () => { if (abortCtrl) abortCtrl.abort(); };
  const nb = $("#newBtn"); if (nb) nb.onclick = resetSession;
  const tk = $("#testKeyBtn"); if (tk) tk.onclick = testApiKey;

  /* Export trascrizione */
  const exBtn = $("#exportBtn");
  if (exBtn) exBtn.onclick = (e) => {
    e.stopPropagation();
    const was = !$("#exportMenu").hidden;
    closeAllMenus();
    if (!was) { $("#exportMenu").hidden = false; exBtn.setAttribute("aria-expanded", "true"); }
  };
  const exTxt = $("#expTxt");
  if (exTxt) exTxt.onclick = () => {
    closeAllMenus();
    downloadFile("soundscript-" + fileStamp() + ".txt", buildTXT(), "text/plain;charset=utf-8");
    stat(T("stTxt"), 100);
    announce(T("anTxt"));
  };
  const exMd = $("#expMd");
  if (exMd) exMd.onclick = () => {
    closeAllMenus();
    downloadFile("soundscript-" + fileStamp() + ".md", buildMD(), "text/markdown;charset=utf-8");
    stat(T("stMd"), 100);
    announce(T("anMd"));
  };
  const exPdf = $("#expPdf");
  if (exPdf) exPdf.onclick = () => {
    closeAllMenus();
    ensurePrintView().innerHTML = buildDocHTML();
    window.print();
    announce(T("anPrint"));
  };

  /* Lingua e tema nelle Info */
  document.querySelectorAll("#langSeg button").forEach((b) => {
    b.onclick = () => setLang(b.dataset.langopt);
  });
  document.querySelectorAll("#themeSeg button").forEach((b) => {
    b.onclick = () => setTheme(b.dataset.t);
  });

  /* Notifiche */
  const nt = $("#notifToggle");
  if (nt) {
    nt.checked = !!loadSettings().notify;
    updateNotifDesc();
    nt.onchange = async () => {
      saveSettings({ notify: nt.checked });
      if (nt.checked && "Notification" in window && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch (e) {}
      }
      updateNotifDesc();
      stat(nt.checked ? T("notifyLabel") + " ✓" : T("notifyLabel") + " ✕", 100);
      announce(nt.checked ? T("notifyDescGranted") : T("notifyDescOff"));
    };
  }

  /* Modelli locali */
  $("#preload").onclick = async () => {
    if (busy) return;
    busy = true;
    downloading = true;
    const btn = $("#preload");
    btn.disabled = true;
    showDlArea();
    const wlOk = await requestWakeLock();
    setWlBanner(wlOk ? "ok" : "warn");
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
      setDlStep(T("dlStepAsr"), T("dlCount")(1, 2));
      await getASR(true);
      setDlStep(T("dlStepLlm"), T("dlCount")(2, 2));
      await getLLM(true);
      hideDlSpinner();
      showDlDone();
      localStorage.setItem("ss-local-ready", "1");
      renderStatusBadges();
      stat(T("stLocalReady"), 100);
      announce(T("anLocalReady"));
    } catch (error) {
      hideDlSpinner();
      stat(T("stLocalFail")(error?.message || error), 0);
    } finally {
      downloading = false;
      await releaseWakeLock();
      setWlBanner(null);
      busy = false;
      btn.disabled = false;
    }
  };

  const settings = loadSettings();
  providerChoice = settings.lastProvider || "openai";
  buildProviderDD();
  buildLocalDD();
  renderKeyPortal(providerChoice);

  document.querySelectorAll(".seg[data-group]").forEach((g) => {
    g.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const group = g.dataset.group;
        const t = tldrSettings();
        t[group] = b.dataset.v;
        saveSettings({ tldr: t });
        syncTldrUi();
      };
    });
  });
  $("#tldrCustom").oninput = (e) => {
    const t = tldrSettings();
    t.custom = e.target.value;
    saveSettings({ tldr: t });
    syncTldrUi();
  };
  $("#savePreset").onclick = () => {
    const name = $("#presetName").value.trim();
    if (!name) { stat(T("stPresetName"), 0); return; }
    const s = loadSettings();
    const presets = Array.isArray(s.tldrPresets) ? s.tldrPresets : [];
    presets.push({ name, ...tldrSettings() });
    saveSettings({ tldrPresets: presets });
    $("#presetName").value = "";
    renderPresets();
    stat(T("stPresetSaved")(name), 100);
    announce(T("anPresetSaved")(name));
  };
  $("#regen").onclick = async () => {
    const transcript = $("#txt").value.trim();
    if (!transcript) { stat(T("stNoTranscript"), 0); return; }
    if (busy) { stat(T("stBusy"), 0); return; }
    busy = true;
    const sum = $("#sum");
    sum.classList.add("loading");
    sum.textContent = T("stTldrWorking");
    try {
      const r = await runSummaryChain(transcript, 0, null);
      if (r.summary) showTldr(r.summary, r.engine, T("stTldrDoneNote"), r.ms);
      else showTldrFail(r.reasons);
      stat(T("stDone"), 100);
    } catch (error) {
      sum.classList.remove("loading");
      stat(T("stTldrErr")(error?.message || error), 0);
    } finally { busy = false; }
  };

  $("#copy").onclick = async () => {
    await copyText($("#txt").value);
    stat(T("stCopied"), 100);
    announce(T("anCopied"));
  };
  $("#all").onclick = async () => {
    await copyText(fullText());
    stat(hasSummary ? T("stCopiedAll") : T("stCopiedAllNo"), 100);
    announce(hasSummary ? T("anCopiedAll") : T("anCopiedAllNo"));
  };
  $("#share").onclick = async () => {
    const text = fullText();
    try {
      if (navigator.share) await navigator.share({ title: "SoundScript", text });
      else { await copyText(text); stat(T("stSharedFallback"), 100); }
    } catch (error) {
      if (error?.name !== "AbortError") { console.error(error); stat(T("stShareErr"), 0); }
    }
  };

  $("#checkUpdateBtn").onclick = checkForUpdates;
  const ver = $("#appVersion");
  if (ver) ver.textContent = APP_VERSION;

  $("#saveKey").onclick = async () => {
    const key = $("#apiKey").value.trim();
    const msg = $("#keysMsg");
    if (!key) { msg.textContent = T("keyEmpty"); return; }
    const entry = {
      id: "k" + Date.now(), provider: providerChoice, apiKey: key,
      baseUrl: $("#baseUrl").value.trim(),
      sttModel: "", llmModel: "", suggStt: "", suggLlm: "", isNew: true
    };
    const localIndex = draftKeys.findIndex((k) => k.id === "local");
    draftKeys.splice(localIndex < 0 ? draftKeys.length : localIndex, 0, entry);
    $("#apiKey").value = ""; $("#baseUrl").value = "";
    const tr = $("#testResult"); if (tr) { tr.textContent = ""; tr.className = "test-result"; }
    markDirty(); renderKeyList();
    msg.textContent = T("keyAdded");
    announce(T("keyAdded"));
    try {
      const cls = await ensureModels(entry, true);
      entry.suggStt = suggestModel(cls.stt, "stt", entry.provider);
      entry.suggLlm = suggestModel(cls.chat, "llm", entry.provider);
      entry.sttModel = entry.suggStt;
      entry.llmModel = entry.suggLlm;
      msg.textContent = T("keyModelsDetected")(entry.suggStt, entry.suggLlm);
    } catch (error) {
      const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
      entry.suggStt = entry.suggStt || p.recommended.stt;
      entry.suggLlm = entry.suggLlm || p.recommended.llm;
      entry.sttModel = entry.suggStt; entry.llmModel = entry.suggLlm;
      msg.textContent = T("keyModelsFailed")(error?.message || error);
    }
    renderKeyList();
  };

  $("#saveChain").onclick = () => {
    draftKeys.forEach((k) => delete k.isNew);
    saveSettings({ keys: JSON.parse(JSON.stringify(draftKeys)) });
    chainDirty = false;
    $("#unsavedChip").hidden = true;
    $("#keysMsg").textContent = T("chainSaved");
    updatePrefMsg();
    renderKeyList();
    renderStatusBadges();
    announce(T("chainSaved"));
  };

  draftKeys = JSON.parse(JSON.stringify(loadSettings().keys));
  chainDirty = false;

  renderKeyList();
  updatePrefMsg();
  syncTldrUi();
  renderPresets();
  renderHistory();
  renderStatusBadges();
  restoreDraft();
  loadShared();
  handleShortcutAction();
}

function fullText() {
  return $("#txt").value + (hasSummary ? "\n\nTL;DR\n" + $("#sum").textContent : "");
}

function showTldrFail(reasons) {
  hasSummary = false;
  const ft = $("#faqTldr"); if (ft) ft.open = true;
  const sum = $("#sum");
  sum.classList.remove("loading");
  sum.textContent = T("tldrFailHead") + "\n• " +
    (reasons && reasons.length ? reasons.join("\n• ") : T("tldrReasonUnknown")) +
    "\n\n" + T("tldrFailTail");
  $("#chipLlm").hidden = true;
  $("#regen").textContent = "⟳ " + T("genTldr");
  $("#all").disabled = false;
  writeDraft();
}

/* ===== UI download ===== */
function showDlArea() {
  const area = $("#dlArea");
  if (!area) return;
  area.hidden = false;
  $("#dlDone").hidden = true;
  $("#dlSpinner").hidden = false;
  $("#dlList").innerHTML = "";
  for (const k in dlRows) delete dlRows[k];
}
function hideDlSpinner() { const s = $("#dlSpinner"); if (s) s.hidden = true; }
function showDlDone() {
  const d = $("#dlDone"); if (d) d.hidden = false;
  const f = $("#dlFill"); if (f) f.style.width = "100%";
}
function setDlStep(label, count) {
  const s = $("#dlStep"); if (s) s.textContent = label;
  const c = $("#dlStepCount"); if (c) c.textContent = count;
}
function updateDlProgress(pct, loaded, total, fileName) {
  const f = $("#dlFile"); if (f) f.textContent = fileName || "…";
  const p = $("#dlPct"); if (p) p.textContent = Math.round(pct) + "%";
  const fill = $("#dlFill"); if (fill) fill.style.width = pct + "%";
  const l = $("#dlLoaded"); if (l) l.textContent = fmtMB(loaded);
  const t = $("#dlTotal"); if (t) t.textContent = "— " + fmtMB(total);
}
function addDlRow(file, total) {
  const list = $("#dlList");
  if (!list || dlRows[file]) return;
  const row = document.createElement("div");
  row.className = "dl-file-row wait";
  row.innerHTML = '<span class="dot"></span><span class="dlname"></span>';
  row.querySelector(".dlname").textContent = file + (total ? " · " + fmtMB(total) : "");
  list.appendChild(row);
  dlRows[file] = row;
}
function markDlRowRun(file, total) {
  const row = dlRows[file];
  if (!row) return;
  row.className = "dl-file-row run";
  if (total) row.querySelector(".dlname").textContent = file + " · " + fmtMB(total);
}
function markDlRowDone(file) {
  const row = dlRows[file];
  if (row) row.className = "dl-file-row ok";
}

function buildProviderDD() {
  makeDropdown($("#ddProvider"), {
    value: providerChoice,
    options: Object.keys(PROVIDERS).map((k) => ({ id: k, label: providerLabel(k) })),
    ariaLabel: T("providerDDAria"),
    onChange: (id) => {
      providerChoice = id;
      saveSettings({ lastProvider: id });
      buildProviderDD();
      renderKeyPortal(id);
      const tr = $("#testResult"); if (tr) { tr.textContent = ""; tr.className = "test-result"; }
    }
  });
}
function buildLocalDD() {
  const s = loadSettings();
  const opts = [
    { id: "onnx-community/whisper-tiny", label: T("localTiny") },
    { id: "onnx-community/whisper-base", label: T("localBase") }
  ];
  const val = opts.some((o) => o.id === s.localModel) ? s.localModel : opts[0].id;
  makeDropdown($("#ddLocal"), {
    value: val,
    options: opts,
    ariaLabel: T("localDDAria"),
    onChange: (id) => {
      saveSettings({ localModel: id });
      asr = null; activeModel = null;
      buildLocalDD();
    }
  });
}

/* ===== UI TL;DR ===== */
function syncTldrUi() {
  const t = tldrSettings();
  document.querySelectorAll(".seg[data-group]").forEach((g) => {
    const k = g.dataset.group;
    g.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === t[k]));
  });
  const ci = $("#tldrCustom");
  if (ci && document.activeElement !== ci) ci.value = t.custom || "";
  const p = I18N[LANG].prompt;
  $("#promptBox").textContent = composeInstruction(t) + "\n\n" + p.textIntro + "\n" + p.textPh;
  updateTldrMeta();
}
function updateTldrMeta() {
  const t = tldrSettings();
  const m = I18N[LANG].metaLabel;
  $("#tldrMeta").textContent =
    m.style + ": " + I18N[LANG].metaStyle[t.style] +
    " · " + m.len + ": " + I18N[LANG].metaLen[t.len] +
    " · " + m.lang + ": " + I18N[LANG].metaLang[t.lang];
}
function renderPresets() {
  const row = $("#presetRow");
  row.innerHTML = "";
  const presets = Array.isArray(loadSettings().tldrPresets) ? loadSettings().tldrPresets : [];
  presets.forEach((p, i) => {
    const c = document.createElement("span");
    c.className = "preset-chip";
    const lab = document.createElement("span");
    lab.textContent = p.name;
    const x = document.createElement("span");
    x.className = "x"; x.title = "×"; x.textContent = "×";
    lab.onclick = () => {
      saveSettings({ tldr: { len: p.len, style: p.style, lang: p.lang, custom: p.custom || "" } });
      syncTldrUi();
      stat(T("stPresetApplied")(p.name), 100);
      announce(T("anPresetApplied")(p.name));
    };
    x.onclick = (e) => {
      e.stopPropagation();
      const s = loadSettings();
      s.tldrPresets = s.tldrPresets.filter((_, k) => k !== i);
      saveSettings({ tldrPresets: s.tldrPresets });
      renderPresets();
      announce(T("anPresetDeleted"));
    };
    c.appendChild(lab); c.appendChild(x);
    row.appendChild(c);
  });
}

/* ===== Catena in bozza ===== */
function markDirty() {
  chainDirty = true;
  const chip = $("#unsavedChip");
  if (chip) chip.hidden = false;
}
function updatePrefMsg() { $("#prefMsg").textContent = T("chainActive")(chainLabel()); }

function renderKeyList() {
  const list = $("#keyList");
  list.innerHTML = "";
  for (const entry of draftKeys) {
    const li = document.createElement("li");
    li.className = "chain-item";
    if (entry.isNew) li.classList.add("draftnew");
    li.dataset.id = entry.id;

    const handle = document.createElement("span");
    handle.className = "handle"; handle.dataset.handle = "1"; handle.textContent = "⋮⋮";
    li.appendChild(handle);

    const lab = document.createElement("span");
    lab.className = "chain-label";
    lab.textContent = entry.id === "local" ? T("localEntry") : entryLabel(entry);
    li.appendChild(lab);

    if (entry.id !== "local") {
      const tog = document.createElement("button");
      tog.className = "btn"; tog.textContent = T("detailsBtn");
      tog.style.minHeight = "32px"; tog.style.padding = "0 12px"; tog.style.fontSize = ".75rem";
      li.appendChild(tog);
      const det = document.createElement("div");
      det.className = "details";
      li.appendChild(det);
      tog.onclick = () => {
        if (det.classList.contains("open")) det.classList.remove("open");
        else openDetails(det, entry, false);
      };
    }
    list.appendChild(li);
  }
  enableSort(list);
}

async function openDetails(det, entry, force) {
  det.classList.add("open");
  if (det.dataset.filled && !force) {
    refreshKeyNotes(entry, det);
    refreshLastErr(det, entry);
    return;
  }
  const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
  det.innerHTML = `
    <button class="kmodels btn" style="align-self:flex-start">${T("modelsBtn")}</button>
    <p class="kmsg muted"></p>
    ${p.chatOnly ? '' : `
    <label class="muted">${T("sttModelLabel")}</label>
    <div class="ddhost" data-slot="stt"></div>
    <div class="chip" data-sugg="stt" style="margin-top:var(--space-xs)"></div>
    <p class="note" data-note="stt" style="margin-top:var(--space-xs)"></p>
    <div class="actions">
      <button class="btn primary" data-savepref="stt">${T("saveModelPref")}</button>
      <span class="chip ok" data-chip="stt" hidden></span>
    </div>
    `}
    <label class="muted" style="margin-top:var(--space-md)">${T("llmModelLabel")}</label>
    <div class="ddhost" data-slot="llm"></div>
    <div class="chip" data-sugg="llm" style="margin-top:var(--space-xs)"></div>
    <p class="note" data-note="llm" style="margin-top:var(--space-xs)"></p>
    <div class="actions">
      <button class="btn primary" data-savepref="llm">${T("saveModelPref")}</button>
      <span class="chip ok" data-chip="llm" hidden></span>
    </div>
    <div class="lasterr"></div>
    <button class="kremove btn" style="align-self:flex-start">${T("removeKey")}</button>`;

  const msg = det.querySelector(".kmsg");
  msg.textContent = T("modelsLoading");
  let cls = null;
  try {
    cls = await ensureModels(entry, !!force);
    if (!p.chatOnly) entry.suggStt = suggestModel(cls.stt, "stt", entry.provider);
    entry.suggLlm = suggestModel(cls.chat, "llm", entry.provider);
    if (!p.chatOnly && !entry.sttModel) entry.sttModel = entry.suggStt;
    if (!entry.llmModel) entry.llmModel = entry.suggLlm;
    msg.textContent = p.chatOnly ? T("modelsFoundChatOnly")(cls.chat.length) : T("modelsFound")(cls.stt.length, cls.chat.length);
  } catch (error) {
    if (!p.chatOnly) {
      entry.suggStt = entry.suggStt || p.recommended.stt;
      if (!entry.sttModel) entry.sttModel = entry.suggStt;
    }
    entry.suggLlm = entry.suggLlm || p.recommended.llm;
    if (!entry.llmModel) entry.llmModel = entry.suggLlm;
    cls = {
      stt: p.chatOnly ? [] : [{ id: entry.suggStt, label: entry.suggStt }],
      chat: [{ id: entry.suggLlm, label: entry.suggLlm }]
    };
    msg.textContent = T("modelsFailedPre") + (error?.message || error) + T("modelsFailedPost");
  }
  det._cls = cls;
  buildKeyDropdowns(det, entry);
  wireDetails(det, entry);
  det.dataset.filled = "1";
  refreshKeyNotes(entry, det);
  refreshLastErr(det, entry);
}

function buildKeyDropdowns(det, entry) {
  const cls = det._cls || { stt: [], chat: [] };
  const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
  if (!p.chatOnly) {
    makeDropdown(det.querySelector('[data-slot="stt"]'), {
      value: entry.sttModel,
      options: cls.stt,
      suggId: entry.suggStt,
      ariaLabel: T("sttModelLabel"),
      onChange: (id) => {
        entry.sttModel = id;
        markDirty();
        buildKeyDropdowns(det, entry);
        refreshKeyNotes(entry, det);
      }
    });
  }
  makeDropdown(det.querySelector('[data-slot="llm"]'), {
    value: entry.llmModel,
    options: cls.chat,
    suggId: entry.suggLlm,
    ariaLabel: T("llmModelLabel"),
    onChange: (id) => {
      entry.llmModel = id;
      markDirty();
      buildKeyDropdowns(det, entry);
      refreshKeyNotes(entry, det);
    }
  });
}

function wireDetails(det, entry) {
  det.querySelector(".kmodels").onclick = () => openDetails(det, entry, true);
  det.querySelector(".kremove").onclick = () => {
    draftKeys = draftKeys.filter((k) => k.id !== entry.id);
    markDirty();
    renderKeyList();
    renderStatusBadges();
    announce(T("removeKey"));
  };
  const sttBtn = det.querySelector('[data-savepref="stt"]');
  if (sttBtn) sttBtn.onclick = () => savePref(entry, "stt", det);
  det.querySelector('[data-savepref="llm"]').onclick = () => savePref(entry, "llm", det);
}

function savePref(entry, slot, det) {
  if (slot === "stt") entry.prefStt = entry.sttModel;
  else entry.prefLlm = entry.llmModel;
  updateEntry(entry.id, {
    sttModel: entry.sttModel, llmModel: entry.llmModel,
    suggStt: entry.suggStt, suggLlm: entry.suggLlm,
    prefStt: entry.prefStt, prefLlm: entry.prefLlm
  });
  refreshKeyNotes(entry, det);
  stat(T("prefSaved")(slot === "stt" ? entry.sttModel : entry.llmModel), 100);
  announce(T("prefSaved")(slot === "stt" ? entry.sttModel : entry.llmModel));
}

function refreshKeyNotes(entry, det) {
  const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
  const slots = p.chatOnly ? ["llm"] : ["stt", "llm"];
  slots.forEach((slot) => {
    const model = slot === "stt" ? entry.sttModel : entry.llmModel;
    const sugg = slot === "stt" ? entry.suggStt : entry.suggLlm;
    const suggEl = det.querySelector('[data-sugg="' + slot + '"]');
    const noteEl = det.querySelector('[data-note="' + slot + '"]');
    const chip = det.querySelector('[data-chip="' + slot + '"]');
    if (suggEl) suggEl.textContent = T("suggModel")(sugg);
    if (noteEl) noteEl.textContent = model !== sugg ? T("noteNonBinding")(model, sugg) : T("noteSuggested");
    if (chip) {
      const pref = slot === "stt" ? entry.prefStt : entry.prefLlm;
      chip.hidden = pref !== model;
      if (!chip.hidden) chip.textContent = T("prefSaved")(model);
    }
  });
}

function refreshLastErr(det, entry) {
  const box = det.querySelector(".lasterr");
  if (box) box.textContent = T("lastErrPre") + (loadLastErrors()[entry.id] || T("lastErrNone"));
}

function enableSort(listEl) {
  let item = null;
  listEl.addEventListener("pointerdown", (e) => {
    const h = e.target.closest("[data-handle]");
    if (!h) return;
    item = h.closest("li");
    item.classList.add("dragging");
    e.preventDefault();
  });
  document.addEventListener("pointermove", (e) => {
    if (!item) return;
    const siblings = [...listEl.querySelectorAll("li:not(.dragging)")];
    const next = siblings.find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (next) listEl.insertBefore(item, next); else listEl.appendChild(item);
  });
  document.addEventListener("pointerup", () => {
    if (!item) return;
    item.classList.remove("dragging"); item = null;
    const order = [...listEl.querySelectorAll("li")].map((li) => li.dataset.id);
    draftKeys.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    markDirty();
    renderKeyList();
  });
}

/* ===== Modelli locali ===== */
async function decode(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio decoding unsupported");
  const context = new AudioContextClass();
  try {
    const audioBuffer = await context.decodeAudioData(await file.arrayBuffer());
    const sampleRate = 16000;
    const offlineContext = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * sampleRate), sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    const rendered = await offlineContext.startRendering();
    return rendered.getChannelData(0);
  } finally { await context.close().catch(() => {}); }
}

function makeProgressCallback() {
  let lastPct = -1;
  return (p) => {
    if (!p || !p.file) return;
    if (p.status === "initiate") { addDlRow(p.file, p.total || 0); return; }
    if (p.status === "done") { markDlRowDone(p.file); return; }
    if (p.status === "progress" && p.total) {
      const pct = (p.loaded / p.total) * 100;
      if (Math.abs(pct - lastPct) < 0.5 && p.loaded !== p.total) return;
      lastPct = pct;
      updateDlProgress(pct, p.loaded, p.total, p.file);
      markDlRowRun(p.file, p.total);
    }
  };
}

async function createPipeline(task, model, dtype, showProgress) {
  const { pipeline } = await getTF();
  const cb = showProgress ? makeProgressCallback() : undefined;
  try {
    stat(T("stWebgpu"), 15);
    return await pipeline(task, model, { dtype, device: "webgpu", progress_callback: cb });
  } catch (webgpuError) {
    console.warn("WebGPU unavailable, trying WASM:", webgpuError);
    stat(T("stWasm"), 20);
    return await pipeline(task, model, { dtype: "q8", device: "wasm", progress_callback: cb });
  }
}
async function getASR(showProgress) {
  const model = loadSettings().localModel || "onnx-community/whisper-tiny";
  if (asr && activeModel === model) return asr;
  asr = null; activeModel = model;
  asr = await createPipeline("automatic-speech-recognition", model, "fp32", showProgress);
  return asr;
}
async function getLLM(showProgress) {
  if (llm) return llm;
  llm = await createPipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", "q4", showProgress);
  return llm;
}
async function localTranscribe(file, audio) {
  const a = audio || await decode(file);
  stat(asr ? T("stAsrRunning") : T("stFirstAsr"), 30);
  const transcriber = await getASR(false);
  /* La lingua di trascrizione segue la lingua dell'app (sincronizzata) */
  const result = await transcriber(a, {
    language: LANG === "it" ? "italian" : "english",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5
  });
  localStorage.setItem("ss-local-ready", "1");
  return (result.text || "").trim();
}
async function localSummarize(transcript, instruction) {
  stat(llm ? T("stLlmRunning") : T("stFirstLlm"), 75);
  const summarizer = await getLLM(false);
  const p = I18N[LANG].prompt;
  const prompt = instruction + "\n\n" + p.textIntro + "\n" + transcript;
  const output = await summarizer(prompt, { max_new_tokens: 200, temperature: 0.2, do_sample: false });
  localStorage.setItem("ss-local-ready", "1");
  return (output[0]?.generated_text || "").replace(prompt, "").trim();
}

/* ===== Retry ===== */
async function callWithRetry(entry, slot, pct, makeCall) {
  const chosen = slot === "stt" ? entry.sttModel : entry.llmModel;
  const sugg = entrySugg(entry, slot);
  const seq = [chosen];
  if (sugg && sugg !== chosen) seq.push(sugg);

  for (let s = 0; s < seq.length; s++) {
    const model = seq[s];
    if (s > 0) stat(T("stChosenFail")(entryLabel(entry), model), pct);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await makeCall(entry, model);
        if (s > 0) saveLastError(entry.id, T("stChosenFail")(entryLabel(entry), model));
        else clearLastError(entry.id);
        return out;
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        saveLastError(entry.id, describeError(err));
        const st = err && err.status;
        if (st === 401 || st === 403 || st === 402) throw err;
        if (st === 429 || (st >= 500 && st <= 599) || !st) {
          if (attempt === 0) {
            const why = st === 429 ? T("whyRate") : (st ? T("whyServer") : T("whyNet"));
            stat(T("stRateRetry")(entryLabel(entry), why), pct);
            await sleep(1500);
            continue;
          }
          break;
        }
        break;
      }
    }
  }
  throw new Error(T("errExhausted")(entryLabel(entry)));
}

async function runSummaryChain(transcript, start, signal) {
  const t0 = performance.now();
  const chain = loadSettings().keys;
  const instruction = composeInstruction(tldrSettings());
  const reasons = [];
  for (let i = start; i < chain.length; i++) {
    const entry = chain[i];
    if (signal && signal.aborted) throwAbort();
    try {
      let summary;
      if (entry.id === "local") {
        summary = await localSummarize(transcript, instruction);
        if (signal && signal.aborted) throwAbort();
      } else {
        stat(T("stSumWith")(entryLabel(entry)), 70);
        summary = await callWithRetry(entry, "llm", 70,
          (e, m) => apiSummarize(transcript, Object.assign({}, e, { llmModel: m }), instruction, signal));
      }
      if (summary) {
        return {
          summary,
          engine: entry.id === "local" ? T("localEngine") : "API " + entryLabel(entry),
          reasons,
          ms: performance.now() - t0
        };
      }
      reasons.push(T("reasonEmpty")(entryLabel(entry)));
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      console.warn("Summary failed (" + entryLabel(entry) + "):", error);
      reasons.push(entryLabel(entry) + ": " +
        (entry.id === "local"
          ? (error?.message || T("reasonLocal"))
          : (loadLastErrors()[entry.id] || error?.message || T("errGeneric"))));
      stat(T("stSumFail")(entryLabel(entry)), 70);
    }
  }
  return { summary: "", engine: "", reasons, ms: performance.now() - t0 };
}

async function process(file) {
  if (busy) { stat(T("stWaitBusy")); return; }
  if (!file || file.size === 0) { stat(T("stEmptyFile")); return; }
  busy = true;
  hasSummary = false;
  abortCtrl = new AbortController();
  const signal = abortCtrl.signal;
  const cancelBtn = $("#cancelBtn");
  if (cancelBtn) cancelBtn.hidden = false;
  const fileInput = $("#file");
  if (fileInput) fileInput.disabled = true;
  try {
    stat(T("stPreparing"), 5);
    let audio = null, duration = null;
    try {
      audio = await decode(file);
      duration = audio.length / 16000;
    } catch (decErr) {
      console.warn("Decode failed: unknown duration.", decErr);
    }
    if (signal.aborted) throwAbort();
    const autoTldr = duration === null || duration >= TLDR_AUTO_SECONDS;

    const tStt = performance.now();
    const chain = loadSettings().keys;
    let transcript = "", sttEngine = "", okIndex = -1;
    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      if (signal.aborted) throwAbort();
      try {
        if (entry.id === "local") {
          transcript = await localTranscribe(file, audio);
          if (signal.aborted) throwAbort();
          sttEngine = T("localEngine");
        } else {
          stat(T("stSttWith")(entryLabel(entry)), 30);
          transcript = await callWithRetry(entry, "stt", 30,
            (e, m) => apiTranscribe(file, Object.assign({}, e, { sttModel: m }), signal));
          sttEngine = "API " + entryLabel(entry);
        }
        if (transcript) { okIndex = i; break; }
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        console.warn("Chain entry failed (" + entryLabel(entry) + "):", error);
        stat(T("stSttFail")(entryLabel(entry), loadLastErrors()[entry.id] || T("errGeneric")), 30);
      }
    }
    if (!transcript) throw new Error(T("stNoText"));
    showTranscript(transcript, sttEngine, duration, performance.now() - tStt);
    attachAudio(file);

    if (autoTldr) {
      $("#autoNote").textContent = duration === null ? T("stDurUnknown") : T("stDurLong")(fmtDur(duration));
      const r = await runSummaryChain(transcript, okIndex, signal);
      if (r.summary) showTldr(r.summary, r.engine, null, r.ms);
      else showTldrFail(r.reasons);
    } else {
      $("#autoNote").textContent = T("stDurShort")(fmtDur(duration));
      $("#sum").textContent = T("stNoTldrYet");
      $("#regen").textContent = T("genTldr");
      writeDraft();
    }
    pushHistoryEntry();
    renderStatusBadges();
    notifyDone();
    stat(T("stCompleted"), 100);
  } catch (error) {
    if (error && error.name === "AbortError") {
      stat(T("stAborted"), 0);
      announce(T("anAborted"));
    } else {
      console.error("Processing error:", error);
      stat(T("stProcErr")(error?.message || String(error)), 0);
    }
  } finally {
    busy = false;
    abortCtrl = null;
    const cb2 = $("#cancelBtn"); if (cb2) cb2.hidden = true;
    if (fileInput) fileInput.disabled = false;
  }
}

function showTranscript(transcript, engine, duration, ms) {
  lastSttEngine = engine;
  lastDurSec = duration;
  lastProcessDate = new Date();
  $("#resultStt").classList.remove("hidden");
  $("#engStt").textContent = engine + " · " + fmtMs(ms);
  $("#durStt").textContent = duration === null ? T("notAvailable") : fmtDur(duration);
  $("#txt").value = transcript;
  $("#all").disabled = false;
  writeDraft();
}
function showTldr(summary, engine, note, ms) {
  hasSummary = true;
  const ft = $("#faqTldr"); if (ft) ft.open = true;
  const sum = $("#sum");
  sum.classList.remove("loading");
  sum.textContent = summary;
  $("#engLlm").textContent = engine + (ms != null ? " · " + fmtMs(ms) : "");
  $("#chipLlm").hidden = false;
  $("#regen").textContent = "⟳ " + T("genTldr");
  if (note) $("#autoNote").textContent = note;
  updateTldrMeta();
  $("#all").disabled = false;
  attachSummaryToLatest(summary);
  writeDraft();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const textarea = document.createElement("textarea");
  textarea.value = text; textarea.style.position = "fixed"; textarea.style.opacity = "0";
  document.body.appendChild(textarea); textarea.select();
  const copied = document.execCommand("copy"); textarea.remove();
  if (!copied) throw new Error("copy failed");
}

async function loadShared() {
  const params = new URLSearchParams(location.search);
  if (params.has("share-error")) { history.replaceState({}, "", location.pathname); stat(T("stShareCant"), 0); return; }
  if (params.get("shared") !== "1") return;
  try {
    if (!("caches" in window)) throw new Error("cache unavailable");
    const cache = await caches.open(SHARE_CACHE);
    const audioUrlShared = new URL("shared-audio", document.baseURI).href;
    const response = await cache.match(audioUrlShared);
    if (!response) { stat(T("stShareNotFound"), 0); return; }
    const blob = await response.blob();
    const encoded = response.headers.get("X-SoundScript-Filename") || "audio";
    let filename = "audio";
    try { filename = decodeURIComponent(encoded); } catch { filename = "audio"; }
    await cache.delete(audioUrlShared);
    history.replaceState({}, "", location.pathname);
    await process(new File([blob], filename, { type: blob.type || "audio/ogg" }));
  } catch (error) {
    console.error("Shared audio error:", error);
    history.replaceState({}, "", location.pathname);
    stat(T("stShareErr"), 0);
  }
}

render();
