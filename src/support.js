/* ===== SoundScript · Sostegno volontario (Ko-fi) =====
   Modulo autonomo: accordion "Sostieni il progetto" come ULTIMO elemento
   dell'area Info + micro-riga nel footer dell'app che lo apre.
   Non modifica main.js né i18n.js: clona la struttura dell'accordion
   esistente per ereditare classi, chevron e animazioni già in uso,
   poi sostituisce l'icona ereditata con la tazzina.
   La card interna è solo testo + Ko-fi: nessuna icona ripetuta.
   Solo link esterno: nessuno script di terze parti, CSP invariato. */

import "./support.css";

const SETTINGS_KEY = "vtt-settings";
const KOFI_URL = "https://ko-fi.com/littlelsewhere";
const FAQ_ID = "ssSupportFaq";
const BODY_ID = "ssSupportBody";

/* ---------- dizionario (allineato alla lingua dell'app) ---------- */
const STR = {
  it: {
    sum: "Sostieni il progetto",
    title: "Sostieni SoundScript",
    desc: "L'app è gratis, senza pubblicità e senza account. Se ti torna utile, un caffè aiuta a tenerla viva e a farla crescere.",
    btn: "Offrimi un caffè su Ko-fi",
    btnAria: "Offrimi un caffè su Ko-fi (si apre in una nuova scheda)",
    note: "Nessun obbligo, nessun contenuto bloccato.",
    free: "Tutto resta gratis per tutti",
    foot: "Sostieni",
    footAria: "Apri la sezione Sostieni il progetto"
  },
  en: {
    sum: "Support the project",
    title: "Support SoundScript",
    desc: "The app is free, with no ads and no accounts. If it helps you, a coffee keeps it alive and growing.",
    btn: "Buy me a coffee on Ko-fi",
    btnAria: "Buy me a coffee on Ko-fi (opens in a new tab)",
    note: "No obligation, nothing locked behind a paywall.",
    free: "Everything stays free for everyone",
    foot: "Support",
    footAria: "Open the Support the project section"
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

/* ---------- icone ---------- */
const ICON_CUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>';
const ICON_HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

function announce(msg) {
  const live = document.getElementById("srStatus");
  if (!live) return;
  live.textContent = "";
  setTimeout(() => { live.textContent = msg; }, 40);
}

/* ---------- card: solo testo, Ko-fi, nota e badge ---------- */
function buildCard() {
  const box = document.createElement("div");
  box.className = "ss-support";
  box.innerHTML =
    '<span class="ss-support-aura" aria-hidden="true"></span>' +
    '<div class="ss-support-head">' +
      '<div class="ss-support-text">' +
        '<p class="ss-support-title"></p>' +
        '<p class="ss-support-desc"></p>' +
      '</div>' +
    '</div>' +
    '<a class="ss-support-btn" target="_blank" rel="noopener">' +
      ICON_HEART + '<span class="ss-support-btn-label"></span>' +
      '<span class="ss-support-ext" aria-hidden="true">↗</span>' +
    '</a>' +
    '<p class="ss-support-note"></p>' +
    '<p class="ss-support-freewrap"><span class="ss-support-free">' +
      ICON_CHECK + '<span class="ss-support-free-label"></span>' +
    '</span></p>';

  box.querySelector(".ss-support-title").textContent = T("title");
  box.querySelector(".ss-support-desc").textContent = T("desc");
  box.querySelector(".ss-support-note").textContent = T("note");
  box.querySelector(".ss-support-free-label").textContent = T("free");
  box.querySelector(".ss-support-btn-label").textContent = T("btn");

  const link = box.querySelector(".ss-support-btn");
  link.href = KOFI_URL;
  link.setAttribute("aria-label", T("btnAria"));

  return box;
}

/* ---------- titolo dell'accordion clonato ---------- */
function retitle(summary, label) {
  if (!summary) return;
  const named = summary.querySelector(".ttl, .faq-title, .summary-title");
  if (named) { named.textContent = label; }
  else {
    const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.trim()) { n.nodeValue = label; break; }
    }
  }
  if (summary.hasAttribute("aria-label")) summary.setAttribute("aria-label", label);
}

/* ---------- icona dell'accordion: tazzina al posto dell'ereditata ---------- */
function resymbol(summary) {
  if (!summary) return;
  const holder = summary.querySelector(".si, .faq-ico, .summary-ico");
  if (holder) {
    holder.innerHTML = ICON_CUP;
    holder.setAttribute("aria-hidden", "true");
  }
}

/* ---------- accordion: ultimo dell'area Info ---------- */
function mountAccordion() {
  const info = document.getElementById("faqInfo");
  if (!info || !info.parentElement) return null;
  const container = info.parentElement;

  const previous = container.querySelector("#" + FAQ_ID);
  if (previous) previous.remove();

  const node = info.cloneNode(true);
  node.id = FAQ_ID;
  node.removeAttribute("open");

  const summary = node.querySelector("summary");
  retitle(summary, T("sum"));
  resymbol(summary);

  let body = node.querySelector(".faq-body");
  if (!body) {
    const kids = Array.from(node.children).filter((e) => e.tagName !== "SUMMARY");
    body = kids.length ? kids[kids.length - 1] : null;
  }
  if (!body) { node.remove(); return null; }

  if (body.id) {
    if (summary && summary.getAttribute("aria-controls") === body.id) summary.setAttribute("aria-controls", BODY_ID);
    body.id = BODY_ID;
  }
  body.innerHTML = "";
  body.appendChild(buildCard());

  const peers = Array.from(container.children).filter((e) => e.tagName === info.tagName);
  const anchor = peers.length ? peers[peers.length - 1] : info;
  anchor.after(node);

  return node;
}

/* ---------- apertura dalla micro-riga ---------- */
function openSupport() {
  const node = document.getElementById(FAQ_ID) || mountAccordion();
  if (!node) return;
  node.setAttribute("open", "");
  let smooth = true;
  try { smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  node.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  const sum = node.querySelector("summary");
  if (sum && sum.focus) { try { sum.focus({ preventScroll: true }); } catch (e) { sum.focus(); } }
  announce(T("sum"));
}

/* ---------- micro-riga nel footer dell'app ---------- */
function mountFootRow() {
  const app = document.getElementById("app");
  if (!app) return;
  const host = app.querySelector("footer") || app.querySelector("main") || app;
  if (!host) return;

  let row = host.querySelector(":scope > .ss-support-foot");
  if (!row) {
    row = document.createElement("div");
    row.className = "ss-support-foot";
    host.appendChild(row);
  }
  row.innerHTML = "";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ss-support-foot-btn";
  btn.setAttribute("aria-label", T("footAria"));
  btn.innerHTML = '<span class="ss-support-foot-ico" aria-hidden="true">' + ICON_CUP + '</span><span class="ss-support-foot-label"></span>';
  btn.querySelector(".ss-support-foot-label").textContent = T("foot");
  btn.addEventListener("click", openSupport);
  row.appendChild(btn);
}

/* ---------- aggancio ai re-render ---------- */
function afterRender() {
  mountAccordion();
  mountFootRow();
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