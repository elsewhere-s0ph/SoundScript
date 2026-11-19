/* ===== SoundScript · Crediti e riferimenti =====
   Modulo autonomo: blocca footer con attribuzione a Little Elsewhere e link
   alla landing page, più una voce "Vuoi saperne di più?" in coda alle FAQ.
   Non modifica main.js, i18n.js né support.js: si aggancia al DOM renderizzato
   e si ricostruisce a ogni re-render, sopravvivendo al cambio lingua.
   Solo link esterni: nessuno script di terze parti, CSP invariato. */

import "./credits.css";

const SETTINGS_KEY = "vtt-settings";
const LANDING_URL = "https://soundscript-home.pages.dev/";
const STUDIO_URL = "https://littlelsewhere.pages.dev/";
const CREDITS_ID = "ssCredits";
const MORE_ID = "ssMoreFaq";
const MORE_BODY_ID = "ssMoreFaqBody";

/* ---------- dizionario (allineato alla lingua dell'app) ---------- */
const STR = {
  it: {
    credit: "Un progetto di",
    studio: "Little Elsewhere",
    studioAria: "Little Elsewhere, sito dello studio (si apre in una nuova scheda)",
    landing: "Tutte le funzionalità",
    landingAria: "Tutte le funzionalità di SoundScript, sulla pagina del progetto (si apre in una nuova scheda)",
    more: "Vuoi saperne di più?",
    moreLead: "La pagina del progetto racconta come funziona SoundScript, tutte le funzionalità, la privacy e come installarlo su telefono e computer.",
    moreBtn: "Apri la pagina del progetto",
    moreBtnAria: "Apri la pagina del progetto SoundScript (si apre in una nuova scheda)",
    moreAlt: "oppure visita lo studio",
    moreAltAria: "Visita il sito dello studio Little Elsewhere (si apre in una nuova scheda)"
  },
  en: {
    credit: "A project by",
    studio: "Little Elsewhere",
    studioAria: "Little Elsewhere, studio website (opens in a new tab)",
    landing: "All features",
    landingAria: "All SoundScript features, on the project page (opens in a new tab)",
    more: "Want to know more?",
    moreLead: "The project page explains how SoundScript works, every feature, the privacy model and how to install it on phone and desktop.",
    moreBtn: "Open the project page",
    moreBtnAria: "Open the SoundScript project page (opens in a new tab)",
    moreAlt: "or visit the studio",
    moreAltAria: "Visit the Little Elsewhere studio website (opens in a new tab)"
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
const ICON_GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/></svg>';
const ICON_CHEV = '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const ARROW = '<span class="ss-ext" aria-hidden="true">↗</span>';

/* ---------- link ---------- */
function makeLink(cls, href, aria, inner) {
  const a = document.createElement("a");
  a.className = cls;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.setAttribute("aria-label", aria);
  a.innerHTML = inner;
  return a;
}

/* ---------- blocco footer ---------- */
function mountCredits() {
  const app = document.getElementById("app");
  if (!app) return;
  const host = app.querySelector("main") || app;
  if (!host) return;

  let box = host.querySelector(":scope > #" + CREDITS_ID);
  if (!box) {
    box = document.createElement("div");
    box.className = "ss-credits";
    box.id = CREDITS_ID;
    host.appendChild(box);
  }
  box.innerHTML = "";

  const rule = document.createElement("hr");
  rule.className = "ss-credits-rule";
  box.appendChild(rule);

  const line = document.createElement("p");
  line.className = "ss-credits-line";
  line.appendChild(document.createTextNode(T("credit") + " "));
  line.appendChild(
    makeLink("ss-credits-studio", STUDIO_URL, T("studioAria"),
      '<span class="ss-credits-studio-name"></span>' + ARROW)
  );
  line.querySelector(".ss-credits-studio-name").textContent = T("studio");
  box.appendChild(line);

  const wrap = document.createElement("p");
  wrap.className = "ss-credits-pillwrap";
  wrap.appendChild(
    makeLink("ss-credits-pill", LANDING_URL, T("landingAria"),
      ICON_GLOBE + '<span class="ss-credits-pill-label"></span>' + ARROW)
  );
  wrap.querySelector(".ss-credits-pill-label").textContent = T("landing");
  box.appendChild(wrap);
}

/* ---------- corpo della voce FAQ ---------- */
function buildMoreBody() {
  const frag = document.createDocumentFragment();

  const lead = document.createElement("p");
  lead.className = "ss-more-lead";
  lead.textContent = T("moreLead");
  frag.appendChild(lead);

  frag.appendChild(
    makeLink("ss-more-btn", LANDING_URL, T("moreBtnAria"),
      ICON_GLOBE + '<span class="ss-more-btn-label"></span>' + ARROW)
  );

  const alt = document.createElement("p");
  alt.className = "ss-more-alt";
  alt.appendChild(
    makeLink("ss-more-alt-link", STUDIO_URL, T("moreAltAria"),
      '<span class="ss-more-alt-label"></span>' + ARROW)
  );
  frag.appendChild(alt);

  return frag;
}

function fillMoreBody(container) {
  container.innerHTML = "";
  container.appendChild(buildMoreBody());
  container.querySelector(".ss-more-btn-label").textContent = T("moreBtn");
  container.querySelector(".ss-more-alt-label").textContent = T("moreAlt");
}

/* ---------- titolo della sotto-accordion clonata ---------- */
function retitle(summary, label) {
  if (!summary) return;
  const named = summary.querySelector(".ttl, .faq-sub-title, .summary-title");
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

/* ---------- voce FAQ: ultima dell'elenco ---------- */
function mountMoreFaq() {
  const faq = document.getElementById("faqFaq");
  if (!faq) return;
  const body = faq.querySelector(".faq-body");
  if (!body) return;

  const previous = body.querySelector("#" + MORE_ID);
  if (previous) previous.remove();

  const model = body.querySelector(".faq-sub");
  let node;

  if (model) {
    node = model.cloneNode(true);
    node.removeAttribute("open");
    node.id = MORE_ID;

    const summary = node.querySelector("summary");
    retitle(summary, T("more"));

    let sub = node.querySelector(".faq-sub-body");
    if (!sub) {
      const kids = Array.from(node.children).filter((e) => e.tagName !== "SUMMARY");
      sub = kids.length ? kids[kids.length - 1] : null;
    }
    if (!sub) {
      sub = document.createElement("div");
      sub.className = "faq-sub-body";
      node.appendChild(sub);
    }
    if (sub.id) {
      if (summary && summary.getAttribute("aria-controls") === sub.id) {
        summary.setAttribute("aria-controls", MORE_BODY_ID);
      }
      sub.id = MORE_BODY_ID;
    }
    fillMoreBody(sub);
  } else {
    node = document.createElement("details");
    node.className = "faq-sub";
    node.id = MORE_ID;
    node.innerHTML =
      '<summary><span class="ttl"></span>' + ICON_CHEV + '</summary>' +
      '<div class="faq-sub-body" id="' + MORE_BODY_ID + '"></div>';
    node.querySelector(".ttl").textContent = T("more");
    fillMoreBody(node.querySelector(".faq-sub-body"));
  }

  body.appendChild(node);
}

/* ---------- aggancio ai re-render ---------- */
function afterRender() {
  mountMoreFaq();
  mountCredits();
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