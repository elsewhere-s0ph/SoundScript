/* SoundScript · ricezione audio condiviso (fallback quando il SW non intercetta la POST).
   File esterno perché il CSP dell'app ha script-src 'self' senza unsafe-inline:
   gli script inline in share-target.html venivano bloccati. */
(function () {
  "use strict";

  var CACHE = "soundscript-share-v1";
  var SETTINGS_KEY = "vtt-settings";

  function lang() {
    try {
      var c = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").lang || "auto";
      if (c === "it" || c === "en") return c;
    } catch (e) {}
    return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
  }
  var L = lang();
  document.documentElement.lang = L;

  var TXT = {
    it: {
      waitT: "Ricezione audio…",
      waitD: "Recupero l'audio condiviso da WhatsApp.",
      firstT: "Quasi fatto!",
      firstD1: "È la prima condivisione su questo dispositivo: SoundScript si è appena <strong>attivato</strong> per ricevere gli audio.",
      firstD2: "<strong>Condividi di nuovo lo stesso vocale da WhatsApp ora:</strong> questo secondo tentativo funzionerà, e da qui in poi sempre.",
      errT: "Audio non ricevuto",
      errD: "Non ho trovato l'audio condiviso. Riprova a condividerlo da WhatsApp.",
      open: "Apri SoundScript"
    },
    en: {
      waitT: "Receiving audio…",
      waitD: "Fetching the audio shared from WhatsApp.",
      firstT: "Almost there!",
      firstD1: "This is the first share on this device: SoundScript has just <strong>activated</strong> to receive audio.",
      firstD2: "<strong>Share the same voice message again now:</strong> this second attempt will work, and every one after it.",
      errT: "Audio not received",
      errD: "I couldn't find the shared audio. Please share it again from WhatsApp.",
      open: "Open SoundScript"
    }
  };
  var t = TXT[L] || TXT.it;

  function paint() {
    var set = function (id, html) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };
    set("waitT", t.waitT); set("waitD", t.waitD);
    set("firstT", t.firstT); set("firstD1", t.firstD1); set("firstD2", t.firstD2);
    set("errT", t.errT); set("errD", t.errD);
    document.querySelectorAll("[data-open]").forEach(function (a) { a.textContent = t.open; });
  }

  function show(id) {
    ["wait", "first", "err"].forEach(function (x) {
      var el = document.getElementById(x);
      if (el) el.hidden = (x !== id);
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  paint();

  if (!("serviceWorker" in navigator) || !("caches" in window)) { show("err"); return; }

  /* Il controllore, non la registrazione, dice se il SW poteva intercettare la POST. */
  var hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register("./sw.js").catch(function () {});

  (async function () {
    try { await navigator.serviceWorker.ready; } catch (e) {}

    var KEY = new URL("shared-audio", location.href).href;
    /* Senza controllore la POST non è stata intercettata: l'audio non arriverà.
       Pochi tentativi, solo per un eventuale residuo, poi messaggio utile subito. */
    var tries = hadController ? 12 : 3;
    var found = null;
    for (var i = 0; i < tries && !found; i++) {
      try {
        var c = await caches.open(CACHE);
        found = await c.match(KEY);
      } catch (e) {}
      if (!found) await sleep(300);
    }
    if (found) { location.replace("./?shared=1"); return; }
    show(hadController ? "err" : "first");
  })();
})();