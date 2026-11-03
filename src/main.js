import { PROVIDERS, listModels, classifyModels, apiTranscribe, apiSummarize } from "./providers.js";
import { t, getLang, setLang, applyLang, changeLang, detectLang } from "./i18n.js";
import "./style.css";

const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===== Transformers.js on-demand ===== */
let TF = null;
async function getTF() {
  if (!TF) {
    TF = await import("@huggingface/transformers");
    TF.env.allowLocalModels = false;
    TF.env.useBrowserCache = true;
  }
  return TF;
}

const SHARE_CACHE = "soundscript-share-v1";
const SETTINGS_KEY = "vtt-settings";
const LASTERR_KEY = "vtt-lasterr";
const TLDR_AUTO_SECONDS = 60;
const APP_VERSION = (typeof __APP_VERSION__ === "string") ? __APP_VERSION__ : "build dev";

const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

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

let lastSttEngine = "";
let lastDurSec = null;
let lastProcessDate = new Date();
let histShowAll = false;
const HIST_LIMIT = 5;

let audioEl = null;
let audioUrl = null;
let playerDragging = false;
let playerSpeedIdx = 0;
const PLAYER_SPEEDS = [1, 1.25, 1.5, 2, 0.75];

let abortCtrl = null;
function throwAbort() {
  const e = new Error("Operazione annullata");
  e.name = "AbortError";
  throw e;
}

/* ===== Draft ===== */
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
    if (sumEl) sumEl.textContent = (s !== null && s !== "") ? s : t("tldr.empty");
    lastSttEngine = sessionStorage.getItem(DRAFT_KEYS.eng) || "";
    const d = sessionStorage.getItem(DRAFT_KEYS.dur);
    lastDurSec = (d !== null && d !== "") ? Number(d) : null;
    const dt = sessionStorage.getItem(DRAFT_KEYS.date);
    if (dt) {
      const p = new Date(dt);
      if (!isNaN(p.getTime())) lastProcessDate = p;
    }
    $("#resultStt").classList.remove("hidden");
    $("#engStt").textContent = (lastSttEngine || "—") + " · " + t("misc.session.restored");
    $("#durStt").textContent = lastDurSec != null ? fmtDur(lastDurSec) : t("misc.duration.unknown");
    $("#all").disabled = false;
    $("#chipLlm").hidden = true;
    $("#regen").textContent = hasSummary ? t("tldr.regenerate") : t("tldr.generate");
    announce(t("toast.draft.restored"));
  } catch (e) {}
}

/* ===== Incolla file ===== */
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
      announce(t("toast.paste.ok"));
      process(f);
      return;
    }
  }
  stat(t("toast.paste.error"), 0);
});

/* ===== Scorciatoie ===== */
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
      stat(t("toast.shortcut.new"), 0);
      announce(t("toast.shortcut.new"));
    } else if (action === "history") {
      const hist = $("#faqHist");
      if (hist) {
        hist.open = true;
        setTimeout(() => {
          hist.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
        announce(t("toast.shortcut.history"));
      }
    }
  }, 400);
}

/* ===== Portali chiavi ===== */
const KEY_PORTALS = {
  openai:    { name: "OpenAI",         url: "https://platform.openai.com/api-keys" },
  groq:      { name: "Groq",           url: "https://console.groq.com/keys" },
  google:    { name: "Google AI Studio", url: "https://aistudio.google.com/apikey" },
  anthropic: { name: "Anthropic",      url: "https://console.anthropic.com/settings/keys" },
  mistral:   { name: "Mistral",        url: "https://console.mistral.ai/api-keys/" },
  custom:    null
};

/* ===== Logo stampa ===== */
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

/* ===== Service worker ===== */
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
        <div class="toast-title">${t("info.update.success")}</div>
        <button class="toast-close" data-toast-close aria-label="${t("toast.close")}">${TOAST_ICONS.close}</button>
      </div>
      <div class="toast-desc">${t("info.update.success.desc", { version: APP_VERSION })}</div>
    `, false);
  } else {
    renderToast(`
      <div class="toast-head">
        <div class="toast-ico warning">${TOAST_ICONS.warning}</div>
        <div class="toast-title">${t("info.update.error")}</div>
        <button class="toast-close" data-toast-close aria-label="${t("toast.close")}">${TOAST_ICONS.close}</button>
      </div>
      <div class="toast-desc">${t("info.update.error.desc")}</div>
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
      <button class="toast-close" data-toast-close aria-label="${t("toast.close")}">${TOAST_ICONS.close}</button>
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
    if (!("serviceWorker" in navigator) || !swReg) throw new Error("sw-non-disponibile");
    const before = navigator.serviceWorker.controller;
    await swReg.update();
    await sleep(1500);
    const after = navigator.serviceWorker.controller;
    if (after && after !== before) {
      showInfoToast(t("info.update.new"), t("info.update.new.desc"));
      announce(t("info.update.new") + ". " + t("info.update.new.desc"));
    } else {
      showStatusToast("success");
      announce(t("info.update.success") + ". " + t("info.update.success.desc", { version: APP_VERSION }));
    }
  } catch (err) {
    showStatusToast("warning");
    announce(t("info.update.error"));
  } finally {
    swCheckInProgress = false;
    if (btn) btn.disabled = false;
    if (label) label.textContent = t("info.update.check");
  }
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swHadController && !swCheckInProgress) {
      showInfoToast(t("info.update.new"), t("info.update.new.desc"));
    }
  });
  window.addEventListener("load", async () => {
    try {
      swHadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register("./sw.js");
      swReg = reg;
      try { await reg.update(); } catch (e) {}
    } catch (error) {
      console.error(t("error.sw"), error);
    }
  });
}

function fmtDur(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return m + ":" + String(ss).padStart(2, "0");
}
function fmtMB(bytes) { return (bytes / 1048576).toFixed(1) + " MB"; }
function fmtMs(ms) {
  if (ms < 10000) return (ms / 1000).toFixed(1).replace(".", ",") + " " + t("misc.seconds");
  if (ms < 60000) return Math.round(ms / 1000) + " " + t("misc.seconds");
  return fmtDur(ms / 1000);
}
function fmtHistDate(iso) {
  try {
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return iso; }
}
function nowLabel() {
  return new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ===== TL;DR ===== */
const TLR_LEN = {
  breve: "Massimo 1 frase.",
  medio: "Massimo 3 frasi.",
  lungo: "Un paragrafo (5-8 frasi)."
};
const TLR_STYLE = {
  narrativo: (l) => `Riassumi ${l} il seguente messaggio vocale in forma discorsiva.`,
  elenco: (l) => `Riassumi ${l} il seguente messaggio vocale come elenco puntato.`,
  azioni: (l) => `Estrai ${l} dal seguente messaggio vocale le azioni, gli impegni e le scadenze, come elenco puntato.`,
  formale: (l) => `Riassumi ${l} il seguente messaggio vocale in tono formale.`,
  informale: (l) => `Riassumi ${l} il seguente messaggio vocale in tono amichevole.`
};
const TLR_LANG = { it: "in italiano", auto: "nella stessa lingua del testo trascritto" };
const TLR_LABEL = {
  len: { breve: "breve", medio: "medio", lungo: "lungo" },
  style: { narrativo: "narrativo", elenco: "elenco puntato", azioni: "azioni e scadenze", formale: "formale", informale: "amichevole" },
  lang: { it: "italiano", auto: "automatica" }
};
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
function entryLabel(entry) {
  if (entry.id === "local") return t("keys.local");
  return PROVIDERS[entry.provider]?.label || entry.provider;
}
function chainLabel() { return loadSettings().keys.map(entryLabel).join(" → "); }

function tldrSettings() {
  return { ...DEFAULT_TLR, ...(loadSettings().tldr || {}) };
}
function composeInstruction(t) {
  let p = TLR_STYLE[t.style](TLR_LANG[t.lang]) + " " + TLR_LEN[t.len];
  p += " Conserva solo le informazioni importanti. Non inventare dettagli.";
  if (t.custom && t.custom.trim()) p += " " + t.custom.trim();
  return p;
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
}

/* ===== Notifiche ===== */
function updateNotifDesc() {
  const d = $("#notifDesc");
  if (!d) return;
  const on = !!loadSettings().notify;
  if (!on) { d.textContent = t("info.notif.desc"); return; }
  if (!("Notification" in window)) { d.textContent = t("info.notif.desc.vibration"); return; }
  if (Notification.permission === "granted") d.textContent = t("info.notif.desc.active");
  else if (Notification.permission === "denied") d.textContent = t("info.notif.desc.denied");
  else d.textContent = t("info.notif.desc.pending");
}
function notifyDone() {
  const s = loadSettings();
  if (!s.notify) return;
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  try {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification("SoundScript", { body: "Trascrizione pronta" });
    }
  } catch (e) {}
}

/* ===== Badge ===== */
function renderStatusBadges() {
  const row = $("#badgeRow");
  if (!row) return;
  const keys = loadSettings().keys.filter((k) => k.id !== "local").length;
  const offline = localStorage.getItem("ss-local-ready") === "1";
  let html = "";
  if (offline) html += '<span class="hbadge ok"><span class="dot"></span>' + t("info.status.offline") + '</span>';
  if (keys > 0) html += '<span class="hbadge api"><span class="dot"></span>' + t("info.status.api", { count: keys }) + '</span>';
  if (!keys && !offline) html += '<span class="hbadge warn"><span class="dot"></span>' + t("info.status.local.only") + '</span>';
  if (!keys && offline) html += '<span class="hbadge warn"><span class="dot"></span>' + t("info.status.local") + '</span>';
  row.innerHTML = html;
}

/* ===== Cronologia storage ===== */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem("vtt-history") || "[]"); }
  catch { return []; }
}
function saveHistoryList(items) {
  localStorage.setItem("vtt-history", JSON.stringify(items.slice(0, 20)));
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
    announce(t("status.complete"));
  } catch (e) {
    console.warn(t("error.history.save"), e);
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

/* ===== Export cronologia ===== */
function buildHistoryMD(list) {
  let s = "# SoundScript — Cronologia\n\nGenerato: " + nowLabel() + " · " + list.length + (list.length === 1 ? " voce" : " voci") + "\n";
  list.forEach((h) => {
    s += "\n---\n\n## " + fmtHistDate(h.date) + " · " + (h.engine || "—") +
      (h.dur != null && h.dur !== "" ? " · " + fmtDur(Number(h.dur)) : "") + "\n\n**Trascrizione**\n\n" + (h.transcript || "") + "\n";
    if (h.summary) s += "\n**TL;DR**\n\n" + h.summary + "\n";
  });
  return s;
}
function buildHistoryTXT(list) {
  let s = "SOUNDSCRIPT — CRONOLOGIA\nGenerato: " + nowLabel() + " · " + list.length + (list.length === 1 ? " voce" : " voci") + "\n";
  list.forEach((h) => {
    s += "\n[" + fmtHistDate(h.date) + "] " + (h.engine || "—") + "\nTRASCRIZIONE:\n" + (h.transcript || "") + "\n";
    if (h.summary) s += "TL;DR:\n" + h.summary + "\n";
    s += "================================\n";
  });
  return s;
}
function exportHistoryFormat(kind) {
  const items = loadHistory();
  if (!items.length) { stat(t("toast.history.empty"), 0); return; }
  const name = "soundscript-cronologia-" + fileStamp();
  if (kind === "json") { downloadFile(name + ".json", JSON.stringify(items, null, 2), "application/json"); announce(t("toast.exported.history")); }
  if (kind === "md") { downloadFile(name + ".md", buildHistoryMD(items), "text/markdown;charset=utf-8"); announce(t("toast.exported.history")); }
  if (kind === "txt") { downloadFile(name + ".txt", buildHistoryTXT(items), "text/plain;charset=utf-8"); announce(t("toast.exported.history")); }
  stat(t("toast.exported.history"), 100);
}
function exportSingleEntry(h) {
  downloadFile("soundscript-voce-" + fileStamp() + ".md", buildHistoryMD([h]), "text/markdown;charset=utf-8");
  stat(t("toast.exported.single"), 100);
  announce(t("toast.exported.single"));
}

/* ===== Import cronologia ===== */
async function importHistoryFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error("struttura");
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
    const msg = t("history.imported", { added, dup }) + (over ? t("history.imported.over", { over }) : "");
    stat(msg + ".", 100);
    announce(msg);
  } catch (e) {
    stat(t("history.import.error"), 0);
    announce(t("history.import.error"));
  }
}

/* ===== Backup impostazioni ===== */
function buildSettingsBackup(full) {
  const s = loadSettings();
  const out = {
    app: "SoundScript",
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: s.theme || "auto",
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
    if (d.app !== "SoundScript" || d.version !== 1) throw new Error("formato");
    const patch = {};
    if (d.theme) patch.theme = d.theme;
    if (typeof d.notify === "boolean") patch.notify = d.notify;
    if (d.tldr) patch.tldr = d.tldr;
    if (Array.isArray(d.tldrPresets)) patch.tldrPresets = d.tldrPresets;
    if (d.localModel) patch.localModel = d.localModel;
    if (d.lastProvider) patch.lastProvider = d.lastProvider;
    let keysMsg = "";
    if (Array.isArray(d.keys) && d.keys.length) {
      if (confirm(t("info.backup.import.confirm", { count: d.keys.length }))) {
        patch.keys = d.keys;
        keysMsg = t("info.backup.imported.keys");
      }
    }
    saveSettings(patch);
    stat(t("info.backup.imported", { keys: keysMsg }), 100);
    announce(t("info.backup.imported", { keys: keysMsg }));
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    stat(t("info.backup.import.error"), 0);
    announce(t("info.backup.import.error"));
  }
}

/* ===== Player ===== */
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
    sp.textContent = String(PLAYER_SPEEDS[playerSpeedIdx]).replace(".", ",") + "×";
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
    console.warn(t("error.player"), e);
  }
}
function detachAudio() {
  if (audioEl) audioEl.pause();
  const pl = $("#player");
  if (pl) pl.hidden = true;
  setPlayingUI(false);
}

/* ===== Test chiave ===== */
async function testApiKey() {
  const out = $("#testResult");
  if (!out) return;
  out.className = "test-result";
  const key = ($("#apiKey").value || "").trim();
  if (!key) { out.textContent = t("keys.test.empty"); out.classList.add("err"); return; }
  out.textContent = t("keys.test.testing");
  const temp = {
    id: "test",
    provider: providerChoice,
    apiKey: key,
    baseUrl: ($("#baseUrl").value || "").trim()
  };
  try {
    const models = await listModels(temp);
    const cls = classifyModels(models, (PROVIDERS[providerChoice] || PROVIDERS.openai).family);
    out.textContent = t("keys.test.valid", { stt: cls.stt.length, llm: cls.chat.length });
    out.classList.add("ok");
    announce(t("keys.test.valid", { stt: cls.stt.length, llm: cls.chat.length }));
  } catch (err) {
    out.textContent = t("keys.test.invalid", { error: describeError(err) || t("error.unknown") });
    out.classList.add("err");
    announce(t("keys.test.invalid", { error: describeError(err) }));
  }
}

/* ===== Nuovo ===== */
function resetSession() {
  detachAudio();
  hasSummary = false;
  const r = $("#resultStt"); if (r) r.classList.add("hidden");
  const txt = $("#txt"); if (txt) txt.value = "";
  const sum = $("#sum"); if (sum) sum.textContent = t("tldr.empty");
  const chip = $("#chipLlm"); if (chip) chip.hidden = true;
  const regen = $("#regen"); if (regen) regen.textContent = t("tldr.generate");
  const all = $("#all"); if (all) all.disabled = true;
  const bar = $("#bar"); if (bar) bar.style.width = "0%";
  clearDraft();
  stat(t("status.ready"), 0);
  announce(t("status.ready"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ===== Export TXT/MD/PDF ===== */
function fileStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}
function docDateLabel() {
  try {
    return lastProcessDate.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return String(lastProcessDate); }
}
function currentSum() {
  return hasSummary ? (($("#sum") && $("#sum").textContent) || "") : "";
}
function buildTXT() {
  const sum = currentSum();
  let s = "SoundScript — " + docDateLabel() + "\n";
  s += "Motore: " + (lastSttEngine || "—") + " | Durata: " + (lastDurSec != null ? fmtDur(lastDurSec) : "n/d") + "\n\n";
  s += "TRASCRIZIONE\n" + (($("#txt") && $("#txt").value) || "") + "\n";
  if (sum) s += "\nTL;DR\n" + sum + "\n";
  return s;
}
function buildMD() {
  const sum = currentSum();
  let s = "# SoundScript — Trascrizione vocale\n\n";
  s += "- **Data:** " + docDateLabel() + "\n";
  s += "- **Motore:** " + (lastSttEngine || "—") + "\n";
  s += "- **Durata:** " + (lastDurSec != null ? fmtDur(lastDurSec) : "n/d") + "\n\n";
  s += "## Trascrizione\n\n" + (($("#txt") && $("#txt").value) || "") + "\n";
  if (sum) s += "\n## TL;DR\n\n" + sum + "\n";
  return s;
}
function buildDocHTML() {
  const sum = currentSum();
  let h = "";
  h += '<div class="pv-head">' + PRINT_LOGO_SVG + '<span class="pv-kind">Trascrizione vocale</span></div>';
  h += '<div class="pv-meta"><span>Data: ' + docDateLabel() + '</span><span>Motore: ' + (lastSttEngine || "—") + '</span><span>Durata: ' + (lastDurSec != null ? fmtDur(lastDurSec) : "n/d") + '</span></div>';
  h += "<h2>Trascrizione</h2><p></p>";
  if (sum) h += "<h2>TL;DR</h2><p></p>";
  h += '<div class="pv-foot"><span>Generato con SoundScript</span><span>soundscript · ' + fileStamp() + '</span></div>';
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

/* ===== Errori ===== */
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
  if (err && err.name === "AbortError") return t("error.abort");
  const st = err && err.status;
  if (st === 401 || st === 403) return t("error.key.invalid", { status: st });
  if (st === 402) return t("error.credits");
  if (st === 429) return t("error.rate");
  if (st === 400) return t("error.model");
  if (st === 404) return t("error.notfound");
  if (st >= 500) return t("error.server", { status: st });
  return t("error.network");
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
    console.warn(t("error.wl"), e);
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
    b.textContent = t("local.wl.ok");
  } else if (mode === "warn") {
    b.hidden = false;
    b.className = "wl-banner warn";
    b.textContent = t("local.wl.warn");
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
const TICK_SVG = `<svg class="tick" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M378-246 154-470l43-43 181 181 384-384 43 43-427 427Z"/></svg>`;

/* ===== Dropdown ===== */
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

/* ===== Portale chiavi ===== */
function renderKeyPortal(providerId) {
  const box = $("#keyPortal");
  if (!box) return;
  const p = KEY_PORTALS[providerId];
  let html = "";
  if (!p) {
    html = '<span class="kp-ico">ℹ️</span>' +
           '<span>' + t("keys.portal.custom") + '</span>';
  } else {
    html = '<span class="kp-ico">🔑</span>' +
           '<span>' + t("keys.portal", { url: p.url, name: p.name }) + '</span>';
  }
  if (providerId === "anthropic") {
    html += '<div class="kp-note">' + t("keys.portal.anthropic") + '</div>';
  }
  box.innerHTML = html;
}

/* ===== Cronologia rendering ===== */
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
        <button class="icon-btn expone" title="${t("history.export.single")}" aria-label="${t("history.export.single")}">${DL_SVG}</button>
        <button class="icon-btn del" title="${t("history.delete")}" aria-label="${t("history.delete.label")}">
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
    row.querySelector(".expone").onclick = (e) => {
      e.stopPropagation();
      exportSingleEntry(h);
    };
    row.querySelector(".del").onclick = (e) => {
      e.stopPropagation();
      items.splice(idx, 1);
      saveHistoryList(items);
      renderHistory();
      stat(t("history.deleted"), 100);
      announce(t("history.deleted"));
    };
    listEl.appendChild(row);
  });

  const empty = $("#histEmpty");
  if (empty) empty.hidden = filtered.length > 0;
  const shownLbl = $("#histShown");
  if (shownLbl) shownLbl.textContent = filtered.length ? "mostro " + shown.length + " di " + filtered.length : "";
  const more = $("#histMore");
  if (more) {
    if (filtered.length <= HIST_LIMIT) more.hidden = true;
    else {
      more.hidden = false;
      more.textContent = histShowAll ? t("history.show.recent") : t("history.show.all") + " (" + filtered.length + ")";
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
  $("#engStt").textContent = (h.engine || "—") + " · " + t("misc.from.history");
  $("#durStt").textContent = lastDurSec != null ? fmtDur(lastDurSec) : t("misc.duration.unknown");
  const sum = $("#sum");
  if (h.summary) {
    hasSummary = true;
    sum.textContent = h.summary;
    const ft = $("#faqTldr"); if (ft) ft.open = true;
  } else {
    hasSummary = false;
    sum.textContent = "Nessun TL;DR salvato per questa voce.";
  }
  $("#chipLlm").hidden = true;
  $("#regen").textContent = t("tldr.generate");
  $("#all").disabled = false;
  writeDraft();
  stat(t("history.loaded"), 100);
  announce(t("history.loaded"));
  $("#resultStt").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearHistory() {
  const items = loadHistory();
  if (!items.length) return;
  if (confirm(t("history.cleared.confirm", { count: items.length }))) {
    saveHistoryList([]);
    renderHistory();
    stat(t("history.cleared"), 100);
    announce(t("history.cleared"));
  }
}

function render() {
  $("#app").innerHTML = `
    <main>
      <div class="hero">
        <img class="hero-logo hero-logo-light" alt="SoundScript" src="logo-light.svg" width="320" height="80">
        <img class="hero-logo hero-logo-dark" alt="SoundScript" src="logo-dark.svg" width="320" height="80">
        <p class="sub" data-i18n="hero.sub">Condividi un audio da WhatsApp oppure selezionalo qui. L'app prova le chiavi in ordine e chiude con i modelli locali.</p>
      </div>

      <section class="card" style="margin-top:0">
        <div class="card-label" data-i18n="features.label">Cosa fa l'app</div>
        <div class="feature-grid">
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </div>
            <div>
              <h3 data-i18n="features.local.title">Elaborazione locale</h3>
              <p data-i18n="features.local.desc">I modelli Whisper e Qwen girano sul tuo dispositivo. Zero dati al cloud.</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <h3 data-i18n="features.chain.title">Catena API intelligente</h3>
              <p data-i18n="features.chain.desc">Configura più provider. Se uno esaurisce i crediti, l'app passa al successivo.</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div>
              <h3 data-i18n="features.share.title">Condivisione diretta</h3>
              <p data-i18n="features.share.desc">Condividi un vocale da WhatsApp direttamente a SoundScript.</p>
            </div>
          </div>
        </div>
      </section>

      <div class="drop" id="drop">
        ${DROP_MARK_SVG}
        <strong data-i18n="drop.title">Trascina qui un audio</strong>
        <span data-i18n="drop.sub">oppure tocca per scegliere un file, o incollalo con Ctrl+V</span>
        <button id="pick" class="btn primary" style="margin-top:var(--space-md)" data-i18n="drop.pick">Scegli audio</button>
        <input id="file" class="hidden" type="file"
          accept="audio/*,.ogg,.opus,.m4a,.mp3,.wav,.aac">
      </div>

      <div class="status-row">
        <div class="spinner" id="eq" hidden></div>
        <div id="status" class="status" role="status" aria-live="polite" data-i18n="status.ready">Pronto.</div>
        <button class="btn danger" id="cancelBtn" hidden data-i18n="status.cancel">Annulla</button>
      </div>
      <div class="progress"><div id="bar" class="progress-bar"></div></div>

      <div id="resultStt" class="card hidden">
        <div class="card-head">
          <div class="card-label" data-i18n="transcript.label">Trascrizione</div>
          <button class="btn ghostline" id="newBtn" style="min-height:36px;padding:0 14px" data-i18n-title="transcript.new.title" title="Svuota i campi e riparti da zero"><span data-i18n="transcript.new">↺ Nuovo</span></button>
        </div>
        <div class="chips">
          <span class="chip"><span data-i18n="transcript.engine">Motore:</span> <b id="engStt"></b></span>
          <span class="chip"><span data-i18n="transcript.duration">Durata:</span> <b id="durStt"></b></span>
        </div>

        <div class="player" id="player" hidden>
          <button class="p-btn" id="pPlay" data-i18n-aria="player.play" aria-label="Riproduci o metti in pausa">
            <svg id="icoPlay" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg id="icoPause" viewBox="0 0 24 24" hidden><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          </button>
          <button class="p-btn" id="pBack" data-i18n-aria="player.back" aria-label="Indietro di 10 secondi">-10</button>
          <button class="p-btn" id="pFwd" data-i18n-aria="player.fwd" aria-label="Avanti di 10 secondi">+10</button>
          <span class="p-time" id="pCur">0:00</span>
          <div class="p-seek" id="pSeek">
            <div class="p-fill" id="pFill"></div>
            <div class="p-knob" id="pKnob"></div>
          </div>
          <span class="p-time" id="pDur">0:00</span>
          <button class="p-speed" id="pSpeed" data-i18n-aria="player.speed" aria-label="Velocità di riproduzione">1×</button>
        </div>

        <textarea id="txt" aria-label="Testo della trascrizione"></textarea>
        <div class="actions">
          <button id="copy" class="btn" data-i18n="transcript.copy">Copia trascrizione</button>
          <button id="share" class="btn" data-i18n="transcript.share">Condividi</button>
          <div class="export-wrap">
            <button class="btn" id="exportBtn" aria-haspopup="menu" aria-expanded="false"><span data-i18n="transcript.export">Esporta</span></button>
            <div class="export-menu" id="exportMenu" hidden role="menu">
              <button class="xm-item" id="expTxt" role="menuitem">
                <span class="xm-ico txt">📄</span>
                <span><span class="xm-t" data-i18n="export.txt">Testo (.txt)</span><br><span class="xm-d" data-i18n="export.txt.desc">Solo testo, per appunti rapidi</span></span>
              </button>
              <button class="xm-item" id="expMd" role="menuitem">
                <span class="xm-ico md">Ⓜ️</span>
                <span><span class="xm-t" data-i18n="export.md">Markdown (.md)</span><br><span class="xm-d" data-i18n="export.md.desc">Con intestazioni e metadata</span></span>
              </button>
              <button class="xm-item" id="expPdf" role="menuitem">
                <span class="xm-ico pdf">🖨️</span>
                <span><span class="xm-t" data-i18n="export.pdf">PDF (stampa)</span><br><span class="xm-d" data-i18n="export.pdf.desc">Foglio con logo → "Salva come PDF"</span></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="faq">
        <details class="faq-item t0" id="faqTldr">
          <summary>
            <span class="si" aria-hidden="true">${TLDR_SVG}</span>
            <span class="ttl" data-i18n="tldr.title">Riepilogo TL;DR</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <p class="note" id="autoNote" style="margin:0 0 var(--space-sm)"></p>

            <div class="field-label" style="margin-top:0" data-i18n="tldr.length">Lunghezza</div>
            <div class="seg" data-group="len">
              <button data-v="breve" data-i18n="tldr.length.short">Breve · 1 frase</button>
              <button data-v="medio" data-i18n="tldr.length.medium">Medio · 3 frasi</button>
              <button data-v="lungo" data-i18n="tldr.length.long">Lungo · paragrafo</button>
            </div>

            <div class="field-label" data-i18n="tldr.style">Stile</div>
            <div class="seg" data-group="style">
              <button data-v="narrativo" data-i18n="tldr.style.narrative">Narrativo</button>
              <button data-v="elenco" data-i18n="tldr.style.list">Elenco puntato</button>
              <button data-v="azioni" data-i18n="tldr.style.actions">Azioni e scadenze</button>
              <button data-v="formale" data-i18n="tldr.style.formal">Formale</button>
              <button data-v="informale" data-i18n="tldr.style.friendly">Amichevole</button>
            </div>

            <div class="field-label" data-i18n="tldr.lang">Lingua del riepilogo</div>
            <div class="seg" data-group="lang">
              <button data-v="it" data-i18n="tldr.lang.it">Italiano</button>
              <button data-v="auto" data-i18n="tldr.lang.auto">Automatica · lingua dell'audio</button>
            </div>

            <div class="field-label"><span data-i18n="tldr.custom">Istruzioni personalizzate</span> <span class="muted">(opzionali)</span></div>
            <input id="tldrCustom" type="text" data-i18n-placeholder="tldr.custom.placeholder" placeholder="es. evidenzia solo date e nomi di persone">

            <div class="field-label" data-i18n="tldr.prompt">Anteprima del prompt inviato al modello</div>
            <div class="prompt-box" id="promptBox"></div>

            <div class="field-label" data-i18n="tldr.presets">Preset salvati</div>
            <div class="preset-row" id="presetRow"></div>
            <div class="preset-row">
              <input id="presetName" type="text" data-i18n-placeholder="tldr.presets.name" placeholder="Nome del preset (es. Scadenze rapide)" style="flex:1;min-width:160px">
              <button id="savePreset" class="btn" data-i18n="tldr.presets.save">Salva preset</button>
            </div>

            <div class="actions">
              <button id="regen" class="btn primary" data-i18n="tldr.generate">Genera TL;DR</button>
            </div>

            <div class="chips" style="margin-top:var(--space-md)">
              <span class="chip" id="chipLlm" hidden><span data-i18n="transcript.engine">Motore:</span> <b id="engLlm"></b></span>
            </div>
            <div id="sum" class="tldr-box" data-i18n="tldr.empty">Il TL;DR comparirà qui dopo l'elaborazione.</div>
            <p id="tldrMeta" class="muted" style="margin-top:var(--space-sm)"></p>

            <div class="actions">
              <button id="all" class="btn primary" disabled data-i18n="transcript.copy.all">Copia tutto</button>
            </div>
          </div>
        </details>

        <details class="faq-item t4" id="faqHist">
          <summary>
            <span class="si" aria-hidden="true">${HIST_SVG}</span>
            <span class="ttl" data-i18n="history.title">Cronologia</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div class="search-wrap">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input class="search-input" id="histSearch" type="text" data-i18n-placeholder="history.search" data-i18n-aria="history.search.label" placeholder="Cerca qui…" aria-label="Cerca nella cronologia">
            </div>
            <div class="hist-list" id="histList"></div>
            <div class="empty" id="histEmpty" hidden><span class="em">🗂️</span><span data-i18n="history.empty">Nessuna trascrizione salvata, oppure nessun risultato per la ricerca.</span></div>
            <div class="hist-footer">
              <button class="btn ghostline" id="histMore" data-i18n="history.show.all">Mostra tutte</button>
              <div class="export-wrap">
                <button class="btn" id="histExpBtn" aria-haspopup="menu" aria-expanded="false"><span data-i18n="history.export">Esporta</span></button>
                <div class="export-menu" id="histExpMenu" hidden role="menu">
                  <button class="xm-item" id="histExpJson" role="menuitem">
                    <span class="xm-ico txt">{ }</span>
                    <span><span class="xm-t" data-i18n="history.export.json">JSON</span><br><span class="xm-d" data-i18n="history.export.json.desc">Backup completo, re-importabile</span></span>
                  </button>
                  <button class="xm-item" id="histExpMd" role="menuitem">
                    <span class="xm-ico md">Ⓜ️</span>
                    <span><span class="xm-t" data-i18n="history.export.md">Markdown</span><br><span class="xm-d" data-i18n="history.export.md.desc">Documento unico leggibile</span></span>
                  </button>
                  <button class="xm-item" id="histExpTxt" role="menuitem">
                    <span class="xm-ico pdf">📄</span>
                    <span><span class="xm-t" data-i18n="history.export.txt">Testo</span><br><span class="xm-d" data-i18n="history.export.txt.desc">Versione lineare semplice</span></span>
                  </button>
                </div>
              </div>
              <button class="btn ghostline" id="histImpBtn" data-i18n="history.import">⤒ Importa JSON</button>
              <input type="file" id="histImpFile" accept=".json,application/json" hidden>
              <button class="btn danger" id="histClear" data-i18n="history.clear">Svuota cronologia</button>
              <span class="hist-count" id="histShown"></span>
            </div>
            <p class="muted" style="margin-top:var(--space-sm)" data-i18n="history.note">
              Le elaborazioni completate si salvano da sole su questo dispositivo (massimo 20 voci).
              L'audio non viene conservato: il player è disponibile solo per il file appena elaborato.
              Usa Esporta/Importa JSON per trasferire la cronologia tra dispositivi.
            </p>
          </div>
        </details>

        <details class="faq-item t1" id="faqKeys">
          <summary>
            <span class="si" aria-hidden="true">${KEY_SVG}</span>
            <span class="ttl" data-i18n="keys.title">Chiavi API e priorità</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div class="dd" id="ddProvider"></div>
            <div class="key-portal" id="keyPortal"></div>
            <div class="test-row">
              <input id="apiKey" type="password" data-i18n-placeholder="keys.test.placeholder" placeholder="Incolla qui la chiave API">
              <button class="btn" id="testKeyBtn" data-i18n="keys.test">Testa</button>
            </div>
            <div class="test-result" id="testResult"></div>
            <input id="baseUrl" type="text" data-i18n-placeholder="keys.base" placeholder="URL base (solo Personalizzato)" style="margin-top:var(--space-sm)">
            <div class="actions">
              <button id="saveKey" class="btn primary" data-i18n="keys.save">Salva API key</button>
            </div>
            <p id="keysMsg" class="muted" style="margin-top:var(--space-sm)"></p>
            <ul id="keyList" class="chain-list"></ul>
            <div class="actions">
              <button id="saveChain" class="btn primary" data-i18n="keys.chain.save">Salva ordine provider</button>
              <span id="unsavedChip" class="chip warn" hidden data-i18n="keys.chain.unsaved">Modifiche non salvate</span>
            </div>
            <p id="prefMsg" class="muted" style="margin-top:var(--space-sm)"></p>
            <p class="muted" style="margin-top:var(--space-sm)" data-i18n="keys.chain.note">
              Le modifiche alla catena restano in bozza finché non premi "Salva ordine provider".
            </p>
          </div>
        </details>

        <details class="faq-item t2" id="faqLocal">
          <summary>
            <span class="si" aria-hidden="true">${CHIP_SVG}</span>
            <span class="ttl" data-i18n="local.title">Modelli locali (fallback offline)</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div id="ddLocal"></div>
            <div class="actions">
              <button id="preload" class="btn" data-i18n="local.download">Scarica modelli locali ora</button>
            </div>
            <div class="wl-banner" id="wlBanner" hidden></div>
            <div class="disclaimer">
              <span class="ic">ⓘ</span>
              <span data-i18n-html="local.disclaimer">
                Il fallback offline scarica i modelli sul dispositivo al primo utilizzo:
                <b>trascrizione (Whisper)</b> poche decine di MB, <b>riepilogo (modello lingua)</b> alcune centinaia di MB.
                Preparali in <b>Wi‑Fi</b> con "Scarica modelli locali ora": durante il download
                <b>l'app mantiene lo schermo acceso</b>.
              </span>
            </div>
            <div class="dl-area" id="dlArea" hidden>
              <div class="dl-head">
                <div class="spinner" id="dlSpinner"></div>
                <div class="dl-step" id="dlStep" data-i18n="local.step.stt">Modello trascrizione (Whisper)</div>
                <div class="dl-stepcount" id="dlStepCount">1 di 2</div>
              </div>
              <div class="dl-file">
                <span id="dlFile">…</span>
                <span id="dlPct">0%</span>
              </div>
              <div class="dl-bar"><div class="dl-fill" id="dlFill"></div></div>
              <div class="dl-meta" style="display:flex;justify-content:space-between;margin-top:var(--space-xs);font-size:.8125rem;color:var(--on-surface-variant)">
                <span id="dlLoaded">0 MB</span>
                <span id="dlTotal">di 0 MB</span>
              </div>
              <div class="dl-list" id="dlList"></div>
              <div class="dl-done" id="dlDone" hidden>
                <span class="dl-check">✓</span>
                <span data-i18n="local.done">Modelli locali pronti in cache. Il fallback funzionerà anche senza rete.</span>
              </div>
            </div>
          </div>
        </details>

        <details class="faq-item t5" id="faqFaq">
          <summary>
            <span class="si" aria-hidden="true">${FAQ_SVG}</span>
            <span class="ttl" data-i18n="faq.title">Domande frequenti</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            ${IS_IOS ? `
            <details class="faq-sub" open>
              <summary>
                <span class="ttl" data-i18n="faq.ios.title">Perché su iPhone non posso condividere audio da WhatsApp?</span>
                ${CHEV_SVG}
              </summary>
              <div class="faq-sub-body" data-i18n-html="faq.ios.body">
                <p>È un limite di iOS: il sistema non consente alle app web installate di comparire nel menu Condividi di WhatsApp (su Android e desktop invece funziona).</p>
                <p><b>Percorso alternativo su iPhone/iPad:</b></p>
                <ol>
                  <li>In WhatsApp, tieni premuto il vocale → <b>Inoltra/Condividi</b> → <b>Salva su File</b></li>
                  <li>Apri SoundScript e tocca <b>"Scegli audio"</b></li>
                  <li>Seleziona il file appena salvato dall'app <b>File</b></li>
                </ol>
                <p>Il risultato è identico: trascrizione, TL;DR e player funzionano come al solito.</p>
              </div>
            </details>` : ""}
            <details class="faq-sub">
              <summary>
                <span class="ttl" data-i18n="faq.data.title">Dove vengono salvati i miei audio e le trascrizioni?</span>
                ${CHEV_SVG}
              </summary>
              <div class="faq-sub-body" data-i18n-html="faq.data.body">
                <p>Gli audio <b>non</b> vengono conservati: restano in memoria solo per la sessione corrente (player). Le trascrizioni e i TL;DR vivono nella cronologia locale del dispositivo, mai su server. Se ricarichi la pagina per errore, l'ultima sessione resta recuperata come bozza.</p>
              </div>
            </details>
            <details class="faq-sub">
              <summary>
                <span class="ttl" data-i18n="faq.tldr.title">Perché i vocali brevi non ricevono il TL;DR automatico?</span>
                ${CHEV_SVG}
              </summary>
              <div class="faq-sub-body" data-i18n-html="faq.tldr.body">
                <p>Sotto i 60 secondi il riepilogo è spesso superfluo: lo generi tu con <b>"Genera TL;DR"</b> se ti serve. Sopra il minuto parte da solo.</p>
              </div>
            </details>
          </div>
        </details>

        <details class="faq-item t3" id="faqInfo">
          <summary>
            <span class="si" aria-hidden="true">${REFRESH_SVG}</span>
            <span class="ttl" data-i18n="info.title">Info e aggiornamenti</span>
            ${CHEVRON_SVG}
          </summary>
          <div class="faq-body">
            <div class="settings-item stack">
              <div>
                <div class="settings-item-title" data-i18n="info.status">Stato app</div>
                <div class="settings-item-desc" data-i18n="info.status.desc">Si aggiorna quando salvi la catena o scarichi i modelli locali</div>
              </div>
              <div class="hbadge-row" id="badgeRow"></div>
            </div>
            <div class="settings-item">
              <div>
                <div class="settings-item-title" data-i18n="info.theme">Tema</div>
                <div class="settings-item-desc" data-i18n="info.theme.desc">Auto segue il sistema; Chiaro/Scuro restano fissi</div>
              </div>
              <div class="seg" id="themeSeg" style="margin:0">
                <button data-t="auto" data-i18n="info.theme.auto">Auto</button>
                <button data-t="light" data-i18n="info.theme.light">Chiaro</button>
                <button data-t="dark" data-i18n="info.theme.dark">Scuro</button>
              </div>
            </div>
            <div class="settings-item">
              <div>
                <div class="settings-item-title" data-i18n="info.lang">Lingua</div>
                <div class="settings-item-desc" data-i18n="info.lang.desc">Auto rileva la lingua del browser; IT/EN restano fissi</div>
              </div>
              <div class="seg" id="langSeg" style="margin:0">
                <button data-l="auto" data-i18n="info.lang.auto">Auto</button>
                <button data-l="it">IT</button>
                <button data-l="en">EN</button>
              </div>
            </div>
            <div class="settings-item">
              <div>
                <div class="settings-item-title" data-i18n="info.notif">Avvisami a fine elaborazione</div>
                <div class="settings-item-desc" id="notifDesc" data-i18n="info.notif.desc">Vibrazione (Android) e notifica se sei su un'altra scheda</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="notifToggle">
                <span class="track"></span>
              </label>
            </div>
            <div class="settings-item stack">
              <div>
                <div class="settings-item-title" data-i18n="info.backup">Backup impostazioni</div>
                <div class="settings-item-desc" data-i18n="info.backup.desc">Tema, notifiche, preset e catena provider. Le chiavi API solo nel backup completo.</div>
              </div>
              <div class="actions" style="margin:0;justify-content:flex-end">
                <div class="export-wrap">
                  <button class="btn" id="setExpBtn" aria-haspopup="menu" aria-expanded="false"><span data-i18n="info.backup.export">⤓ Esporta</span></button>
                  <div class="export-menu" id="setExpMenu" hidden role="menu">
                    <button class="xm-item" id="setExpSafe" role="menuitem">
                      <span class="xm-ico txt">🛡️</span>
                      <span><span class="xm-t" data-i18n="info.backup.export.safe">Sicuro · senza chiavi</span><br><span class="xm-d" data-i18n="info.backup.export.safe.desc">Condivisibile senza rischi</span></span>
                    </button>
                    <button class="xm-item" id="setExpFull" role="menuitem">
                      <span class="xm-ico md">🔑</span>
                      <span><span class="xm-t" data-i18n="info.backup.export.full">Completo · con chiavi</span><br><span class="xm-d" data-i18n="info.backup.export.full.desc">Per migrare su un tuo dispositivo — non condividerlo</span></span>
                    </button>
                  </div>
                </div>
                <button class="btn ghostline" id="setImpBtn" data-i18n="info.backup.import">⤒ Importa</button>
                <input type="file" id="setImpFile" accept=".json,application/json" hidden>
              </div>
            </div>
            <div class="settings-item">
              <div>
                <div class="settings-item-title" data-i18n="info.update">Aggiornamenti</div>
                <div class="settings-item-desc" data-i18n="info.update.desc">Automatici e silenziosi: le nuove versioni si attivano in background</div>
              </div>
              <button class="btn" id="checkUpdateBtn"><span id="checkUpdateLabel" data-i18n="info.update.check">Controlla</span></button>
            </div>
            <div class="settings-item">
              <div>
                <div class="settings-item-title" data-i18n="info.version">Versione corrente</div>
                <div class="settings-item-desc" id="appVersion">—</div>
              </div>
            </div>
            <p class="muted" style="margin-top:var(--space-sm)" data-i18n="info.note">
              Nessun toast da confermare: quando esce una nuova versione il service worker si aggiorna da solo
              e te lo segnaliamo con un avviso leggero. "Controlla" serve solo per una verifica manuale.
            </p>
          </div>
        </details>
      </div>

      <div id="srStatus" class="sr-only" role="status" aria-live="polite"></div>
      <div class="toast" id="toast"></div>
    </main>
  `;

  const toastEl = $("#toast");
  if (toastEl) {
    toastEl.addEventListener("click", (e) => {
      if (e.target.closest("[data-toast-close]")) { hideToast(); return; }
    });
  }

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
    downloadFile("soundscript-impostazioni-" + fileStamp() + "-sicuro.json", JSON.stringify(buildSettingsBackup(false), null, 2), "application/json");
    stat(t("info.backup.exported.safe"), 100);
    announce(t("info.backup.exported.safe"));
  };
  const setFull = $("#setExpFull");
  if (setFull) setFull.onclick = () => {
    closeAllMenus();
    downloadFile("soundscript-impostazioni-" + fileStamp() + "-completo.json", JSON.stringify(buildSettingsBackup(true), null, 2), "application/json");
    stat(t("info.backup.exported.full"), 100);
    announce(t("info.backup.exported.full"));
  };
  const setImpBtn = $("#setImpBtn");
  if (setImpBtn) setImpBtn.onclick = () => $("#setImpFile").click();
  const setImpFile = $("#setImpFile");
  if (setImpFile) setImpFile.onchange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) importSettingsFile(f);
  };

  const cb = $("#cancelBtn"); if (cb) cb.onclick = () => { if (abortCtrl) abortCtrl.abort(); };
  const nb = $("#newBtn"); if (nb) nb.onclick = resetSession;
  const tk = $("#testKeyBtn"); if (tk) tk.onclick = testApiKey;

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
    stat(t("toast.exported.txt"), 100);
    announce(t("toast.exported.txt"));
  };
  const exMd = $("#expMd");
  if (exMd) exMd.onclick = () => {
    closeAllMenus();
    downloadFile("soundscript-" + fileStamp() + ".md", buildMD(), "text/markdown;charset=utf-8");
    stat(t("toast.exported.md"), 100);
    announce(t("toast.exported.md"));
  };
  const exPdf = $("#expPdf");
  if (exPdf) exPdf.onclick = () => {
    closeAllMenus();
    ensurePrintView().innerHTML = buildDocHTML();
    window.print();
    announce(t("toast.exported.pdf"));
  };

  /* Tema */
  const savedTheme = loadSettings().theme || "auto";
  applyTheme(savedTheme);
  document.querySelectorAll("#themeSeg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.t === savedTheme);
    b.onclick = () => {
      document.querySelectorAll("#themeSeg button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      saveSettings({ theme: b.dataset.t });
      applyTheme(b.dataset.t);
      stat(t("toast.theme", { theme: b.textContent }), 100);
      announce(t("toast.theme", { theme: b.textContent }));
    };
  });

  /* Lingua */
  const savedLang = getLang();
  applyLang(savedLang);
  document.querySelectorAll("#langSeg button").forEach((b) => {
    const isAuto = b.dataset.l === "auto";
    const matchesAuto = isAuto && savedLang === detectLang();
    const matchesExplicit = !isAuto && b.dataset.l === savedLang;
    b.classList.toggle("active", matchesAuto || matchesExplicit);
    b.onclick = () => {
      document.querySelectorAll("#langSeg button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const lang = isAuto ? detectLang() : b.dataset.l;
      changeLang(lang);
      const langName = lang === "it" ? "italiano" : "English";
      stat(t("toast.lang", { lang: langName }), 100);
      announce(t("toast.lang", { lang: langName }));
    };
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
      stat(nt.checked ? t("toast.notif.on") : t("toast.notif.off"), 100);
      announce(nt.checked ? t("toast.notif.on") : t("toast.notif.off"));
    };
  }

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
      setDlStep(t("local.step.stt"), t("local.step.count", { current: 1, total: 2 }));
      await getASR(true);
      setDlStep(t("local.step.llm"), t("local.step.count", { current: 2, total: 2 }));
      await getLLM(true);
      hideDlSpinner();
      showDlDone();
      localStorage.setItem("ss-local-ready", "1");
      renderStatusBadges();
      stat(t("local.done"), 100);
      announce(t("local.done"));
    } catch (error) {
      hideDlSpinner();
      stat(t("local.error", { error: error?.message || error }), 0);
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
    queueDraft();
  };
  $("#savePreset").onclick = () => {
    const name = $("#presetName").value.trim();
    if (!name) { stat(t("toast.preset.empty"), 0); return; }
    const s = loadSettings();
    const presets = Array.isArray(s.tldrPresets) ? s.tldrPresets : [];
    presets.push({ name, ...tldrSettings() });
    saveSettings({ tldrPresets: presets });
    $("#presetName").value = "";
    renderPresets();
    stat(t("toast.preset.saved", { name }), 100);
    announce(t("toast.preset.saved", { name }));
  };
  $("#regen").onclick = async () => {
    const transcript = $("#txt").value.trim();
    if (!transcript) { stat(t("toast.no.transcript"), 0); return; }
    if (busy) { stat(t("toast.busy"), 0); return; }
    busy = true;
    const sum = $("#sum");
    sum.classList.add("loading");
    sum.textContent = "Genero il TL;DR con le regole impostate…";
    try {
      const r = await runSummaryChain(transcript, 0, null);
      if (r.summary) showTldr(r.summary, r.engine, "Riepilogo generato con le regole impostate.", r.ms);
      else showTldrFail(r.reasons);
      stat(t("status.complete"), 100);
    } catch (error) {
      sum.classList.remove("loading");
      stat(t("status.error", { error: error?.message || error }), 0);
    } finally { busy = false; }
  };

  $("#copy").onclick = async () => {
    await copyText($("#txt").value);
    stat(t("toast.copied"), 100);
    announce(t("toast.copied"));
  };
  $("#all").onclick = async () => {
    await copyText(fullText());
    stat(hasSummary ? t("toast.copied.all") : t("toast.copied"), 100);
    announce(hasSummary ? t("toast.copied.all") : t("toast.copied"));
  };
  $("#share").onclick = async () => {
    const text = fullText();
    try {
      if (navigator.share) await navigator.share({ title: "SoundScript", text });
      else { await copyText(text); stat(t("toast.shared"), 100); }
    } catch (error) { if (error?.name !== "AbortError") { console.error(error); stat(t("toast.share.error"), 0); } }
  };

  $("#checkUpdateBtn").onclick = checkForUpdates;
  const ver = $("#appVersion");
  if (ver) ver.textContent = APP_VERSION;

  $("#saveKey").onclick = async () => {
    const key = $("#apiKey").value.trim();
    const msg = $("#keysMsg");
    if (!key) { msg.textContent = t("keys.save.empty"); return; }
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
    msg.textContent = t("keys.added");
    announce(t("keys.added"));
    try {
      const cls = await ensureModels(entry, true);
      entry.suggStt = suggestModel(cls.stt, "stt", entry.provider);
      entry.suggLlm = suggestModel(cls.chat, "llm", entry.provider);
      entry.sttModel = entry.suggStt;
      entry.llmModel = entry.suggLlm;
      msg.textContent = t("keys.added.models", { stt: entry.suggStt || "—", llm: entry.suggLlm || "—" });
    } catch (error) {
      const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
      entry.suggStt = entry.suggStt || p.recommended.stt;
      entry.suggLlm = entry.suggLlm || p.recommended.llm;
      entry.sttModel = entry.suggStt; entry.llmModel = entry.suggLlm;
      msg.textContent = t("keys.added.error", { error: error?.message || error });
    }
    renderKeyList();
  };

  $("#saveChain").onclick = () => {
    draftKeys.forEach((k) => delete k.isNew);
    saveSettings({ keys: JSON.parse(JSON.stringify(draftKeys)) });
    chainDirty = false;
    $("#unsavedChip").hidden = true;
    $("#keysMsg").textContent = t("keys.chain.saved");
    updatePrefMsg();
    renderKeyList();
    renderStatusBadges();
    announce(t("keys.chain.saved"));
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
  const reasonsText = reasons && reasons.length ? reasons.join("\n• ") : t("tldr.fail.unknown");
  sum.textContent = t("tldr.fail", { reasons: reasonsText });
  $("#chipLlm").hidden = true;
  $("#regen").textContent = t("tldr.regenerate");
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
  const t = $("#dlTotal"); if (t) t.textContent = "di " + fmtMB(total);
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
    options: Object.keys(PROVIDERS).map((k) => ({ id: k, label: PROVIDERS[k].label })),
    ariaLabel: "Provider",
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
    { id: "onnx-community/whisper-tiny", label: t("local.model.tiny") },
    { id: "onnx-community/whisper-base", label: t("local.model.base") }
  ];
  const val = opts.some((o) => o.id === s.localModel) ? s.localModel : opts[0].id;
  makeDropdown($("#ddLocal"), {
    value: val,
    options: opts,
    ariaLabel: t("local.model"),
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
  $("#promptBox").textContent = composeInstruction(t) + "\n\nTESTO:\n[trascrizione del vocale]";
  updateTldrMeta();
}
function updateTldrMeta() {
  const t = tldrSettings();
  $("#tldrMeta").textContent =
    "Stile: " + TLR_LABEL.style[t.style] +
    " · Lunghezza: " + TLR_LABEL.len[t.len] +
    " · Lingua: " + TLR_LABEL.lang[t.lang];
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
    x.className = "x"; x.title = "Elimina"; x.textContent = "×";
    lab.onclick = () => {
      saveSettings({ tldr: { len: p.len, style: p.style, lang: p.lang, custom: p.custom || "" } });
      syncTldrUi();
      stat(t("toast.preset.applied", { name: p.name }), 100);
      announce(t("toast.preset.applied", { name: p.name }));
    };
    x.onclick = (e) => {
      e.stopPropagation();
      const s = loadSettings();
      s.tldrPresets = s.tldrPresets.filter((_, k) => k !== i);
      saveSettings({ tldrPresets: s.tldrPresets });
      renderPresets();
      announce(t("toast.preset.deleted"));
    };
    c.appendChild(lab); c.appendChild(x);
    row.appendChild(c);
  });
}

/* ===== Catena ===== */
function markDirty() {
  chainDirty = true;
  const chip = $("#unsavedChip");
  if (chip) chip.hidden = false;
}
function updatePrefMsg() { $("#prefMsg").textContent = "Catena attiva: " + chainLabel() + "."; }

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
    lab.textContent = entry.id === "local"
      ? t("keys.local")
      : entryLabel(entry);
    li.appendChild(lab);

    if (entry.id !== "local") {
      const tog = document.createElement("button");
      tog.className = "btn"; tog.textContent = t("keys.details"); tog.style.minHeight = "32px"; tog.style.padding = "0 12px"; tog.style.fontSize = ".75rem";
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
    <button class="kmodels btn" style="align-self:flex-start" data-i18n="keys.details.models">Aggiorna modelli disponibili</button>
    <p class="kmsg muted"></p>
    ${p.chatOnly ? '' : `
    <label class="muted" data-i18n="keys.details.stt">Modello trascrizione (solo audio)</label>
    <div class="ddhost" data-slot="stt"></div>
    <div class="chip" data-sugg="stt" style="margin-top:var(--space-xs)"></div>
    <p class="note" data-note="stt" style="margin-top:var(--space-xs)"></p>
    <div class="actions">
      <button class="btn primary" data-savepref="stt" data-i18n="keys.details.save.pref">Salva preferenza modello</button>
      <span class="chip ok" data-chip="stt" hidden></span>
    </div>
    `}
    <label class="muted" style="margin-top:var(--space-md)" data-i18n="keys.details.llm">Modello riepilogo (solo chat)</label>
    <div class="ddhost" data-slot="llm"></div>
    <div class="chip" data-sugg="llm" style="margin-top:var(--space-xs)"></div>
    <p class="note" data-note="llm" style="margin-top:var(--space-xs)"></p>
    <div class="actions">
      <button class="btn primary" data-savepref="llm" data-i18n="keys.details.save.pref">Salva preferenza modello</button>
      <span class="chip ok" data-chip="llm" hidden></span>
    </div>
    <div class="lasterr"></div>
    <button class="kremove btn" style="align-self:flex-start" data-i18n="keys.details.remove">Rimuovi chiave</button>`;

  const msg = det.querySelector(".kmsg");
  msg.textContent = t("keys.details.loading");
  let cls = null;
  try {
    cls = await ensureModels(entry, !!force);
    if (!p.chatOnly) entry.suggStt = suggestModel(cls.stt, "stt", entry.provider);
    entry.suggLlm = suggestModel(cls.chat, "llm", entry.provider);
    if (!p.chatOnly && !entry.sttModel) entry.sttModel = entry.suggStt;
    if (!entry.llmModel) entry.llmModel = entry.suggLlm;
    msg.textContent = (p.chatOnly ? "" : cls.stt.length + " modelli audio e ") + cls.chat.length + " modelli chat trovati.";
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
    msg.textContent = t("keys.details.error", { error: error?.message || error });
  }
  det._cls = cls;
  buildKeyDropdowns(det, entry);
  wireDetails(det, entry);
  det.dataset.filled = "1";
  refreshKeyNotes(entry, det);
  refreshLastErr(det, entry);
  applyLang(getLang());
}

function buildKeyDropdowns(det, entry) {
  const cls = det._cls || { stt: [], chat: [] };
  const p = PROVIDERS[entry.provider] || PROVIDERS.openai;
  if (!p.chatOnly) {
    makeDropdown(det.querySelector('[data-slot="stt"]'), {
      value: entry.sttModel,
      options: cls.stt,
      suggId: entry.suggStt,
      ariaLabel: t("keys.details.stt"),
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
    ariaLabel: t("keys.details.llm"),
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
    announce(t("keys.details.removed"));
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
  stat(t("keys.details.saved.pref", { model: slot === "stt" ? entry.sttModel : entry.llmModel }), 100);
  announce(t("keys.details.saved.pref", { model: slot === "stt" ? entry.sttModel : entry.llmModel }));
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
    if (suggEl) suggEl.textContent = t("keys.details.suggested", { model: sugg || "—" });
    if (noteEl) {
      noteEl.textContent = model !== sugg
        ? t("keys.details.note.unbound", { model, suggested: sugg })
        : t("keys.details.note.bound");
    }
    if (chip) {
      const pref = slot === "stt" ? entry.prefStt : entry.prefLlm;
      chip.hidden = pref !== model;
      if (!chip.hidden) chip.textContent = t("keys.details.saved.pref", { model });
    }
  });
}

function refreshLastErr(det, entry) {
  const box = det.querySelector(".lasterr");
  if (box) box.textContent = t("keys.details.lasterr", { error: loadLastErrors()[entry.id] || t("keys.details.lasterr.none") });
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
  if (!AudioContextClass) throw new Error(t("error.audio.decode"));
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
    stat(t("local.webgpu"), 15);
    return await pipeline(task, model, { dtype, device: "webgpu", progress_callback: cb });
  } catch (webgpuError) {
    console.warn("WebGPU non disponibile, provo WASM:", webgpuError);
    stat(t("local.webgpu.fail"), 20);
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
  if (!asr) {
    stat(t("local.first.stt"), 30);
  } else {
    stat(t("local.transcribing"), 30);
  }
  const transcriber = await getASR(false);
  const result = await transcriber(a, { language: "italian", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
  localStorage.setItem("ss-local-ready", "1");
  return (result.text || "").trim();
}
async function localSummarize(transcript, instruction) {
  if (!llm) {
    stat(t("local.first.llm"), 75);
  } else {
    stat(t("local.summarizing"), 75);
  }
  const summarizer = await getLLM(false);
  const prompt = instruction + "\n\nTESTO:\n" + transcript;
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
    if (s > 0) {
      stat(entryLabel(entry) + ": il modello scelto ha dato errore, uso il suggerito " + model + "…", pct);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await makeCall(entry, model);
        if (s > 0) saveLastError(entry.id, "il modello scelto ha dato errore; completato con il suggerito " + model);
        else clearLastError(entry.id);
        return out;
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        saveLastError(entry.id, describeError(err));
        const st = err && err.status;
        if (st === 401 || st === 403 || st === 402) throw err;
        if (st === 429 || (st >= 500 && st <= 599) || !st) {
          if (attempt === 0) {
            const why = st === 429 ? t("toast.chain.retry.rate") : (st ? t("toast.chain.retry.server") : t("toast.chain.retry.network"));
            stat(entryLabel(entry) + ": " + why + ", riprovo tra 1,5 s…", pct);
            await sleep(1500);
            continue;
          }
          break;
        }
        break;
      }
    }
  }
  throw new Error("Tentativi esauriti per " + entryLabel(entry));
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
        stat(t("status.summarizing", { engine: entryLabel(entry) }), 70);
        summary = await callWithRetry(entry, "llm", 70,
          (e, m) => apiSummarize(transcript, Object.assign({}, e, { llmModel: m }), instruction, signal));
      }
      if (summary) {
        return {
          summary,
          engine: entry.id === "local" ? t("misc.engine.local") : t("misc.engine.api", { engine: entryLabel(entry) }),
          reasons,
          ms: performance.now() - t0
        };
      }
      reasons.push(entryLabel(entry) + ": risposta vuota");
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      console.warn("Riepilogo fallito (" + entryLabel(entry) + "):", error);
      reasons.push(entryLabel(entry) + ": " +
        (entry.id === "local"
          ? (error?.message || "errore del modello locale")
          : (loadLastErrors()[entry.id] || error?.message || "errore")));
      stat(t("toast.tldr.fallback", { engine: entryLabel(entry) }), 70);
    }
  }
  return { summary: "", engine: "", reasons, ms: performance.now() - t0 };
}

async function process(file) {
  if (busy) { stat(t("toast.busy")); return; }
  if (!file || file.size === 0) { stat(t("toast.empty")); return; }
  busy = true;
  hasSummary = false;
  abortCtrl = new AbortController();
  const signal = abortCtrl.signal;
  const cancelBtn = $("#cancelBtn");
  if (cancelBtn) cancelBtn.hidden = false;
  const fileInput = $("#file");
  if (fileInput) fileInput.disabled = true;
  try {
    stat(t("status.preparing"), 5);
    let audio = null, duration = null;
    try {
      audio = await decode(file);
      duration = audio.length / 16000;
    } catch (decErr) {
      console.warn("Decodifica non riuscita: durata sconosciuta.", decErr);
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
          sttEngine = t("misc.engine.local");
        } else {
          stat(t("status.transcribing", { engine: entryLabel(entry) }), 30);
          transcript = await callWithRetry(entry, "stt", 30,
            (e, m) => apiTranscribe(file, Object.assign({}, e, { sttModel: m }), signal));
          sttEngine = t("misc.engine.api", { engine: entryLabel(entry) });
        }
        if (transcript) { okIndex = i; break; }
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        console.warn("Voce catena fallita (" + entryLabel(entry) + "):", error);
        stat(t("toast.chain.fallback", { engine: entryLabel(entry), error: loadLastErrors()[entry.id] || "errore" }), 30);
      }
    }
    if (!transcript) throw new Error(t("toast.chain.exhausted"));
    showTranscript(transcript, sttEngine, duration, performance.now() - tStt);
    attachAudio(file);

    if (autoTldr) {
      const noteKey = duration === null ? "tldr.auto.note.unknown" : "tldr.auto.note";
      $("#autoNote").textContent = t(noteKey, { duration: duration != null ? fmtDur(duration) : "" });
      const r = await runSummaryChain(transcript, okIndex, signal);
      if (r.summary) showTldr(r.summary, r.engine, null, r.ms);
      else showTldrFail(r.reasons);
    } else {
      $("#autoNote").textContent = t("tldr.auto.note.short", { duration: fmtDur(duration) });
      $("#sum").textContent = "Nessun TL;DR per ora: tocca Genera TL;DR se ti serve.";
      $("#regen").textContent = t("tldr.generate");
      writeDraft();
    }
    pushHistoryEntry();
    renderStatusBadges();
    notifyDone();
    stat(t("status.complete"), 100);
  } catch (error) {
    if (error && error.name === "AbortError") {
      stat(t("status.aborted"), 0);
      announce(t("toast.cancelled"));
    } else {
      console.error("Errore durante l'elaborazione:", error);
      stat(t("status.error", { error: error?.message || String(error) }), 0);
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
  $("#durStt").textContent = duration === null ? t("misc.duration.unknown") : fmtDur(duration);
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
  $("#regen").textContent = t("tldr.regenerate");
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
  if (!copied) throw new Error(t("error.copy"));
}

async function loadShared() {
  const params = new URLSearchParams(location.search);
  if (params.has("share-error")) { history.replaceState({}, "", location.pathname); stat(t("toast.share.error.receive"), 0); return; }
  if (params.get("shared") !== "1") return;
  try {
    if (!("caches" in window)) throw new Error(t("error.cache"));
    const cache = await caches.open(SHARE_CACHE);
    const audioUrlShared = new URL("shared-audio", document.baseURI).href;
    const response = await cache.match(audioUrlShared);
    if (!response) { stat(t("toast.share.error.notfound"), 0); return; }
    const blob = await response.blob();
    const encoded = response.headers.get("X-SoundScript-Filename") || "audio";
    let filename = "audio";
    try { filename = decodeURIComponent(encoded); } catch { filename = "audio"; }
    await cache.delete(audioUrlShared);
    history.replaceState({}, "", location.pathname);
    await process(new File([blob], filename, { type: blob.type || "audio/ogg" }));
  } catch (error) {
    console.error("Errore nel recupero dell'audio condiviso:", error);
    history.replaceState({}, "", location.pathname);
    stat(t("toast.share.error.generic"), 0);
  }
}

render();