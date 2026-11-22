/* ===== SoundScript · ambiente nativo =====
   Dentro l'APK Capacitor la WebView non è una PWA standalone:
   display-mode risulta "browser" e i moduli (install.js, main.js)
   credono di essere sul web non installato. Qui, solo in nativo,
   sovrapponiamo matchMedia per le query display-mode così il resto
   dell'app si comporta come "già installata". Nessun effetto sul web. */

(function () {
  "use strict";

  function isNative() {
    try {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    } catch (e) { return false; }
  }

  function apply() {
    if (!isNative()) return false;
    window.__SS_NATIVE__ = true;
    if (!window.matchMedia || window.__SS_MM_PATCHED__) return true;
    const orig = window.matchMedia.bind(window);
    window.matchMedia = function (q) {
      const s = String(q || "");
      if (/display-mode/.test(s) && /(standalone|fullscreen|minimal-ui)/.test(s)) {
        return {
          matches: true, media: s, onchange: null,
          addEventListener() {}, removeEventListener() {},
          addListener() {}, removeListener() {},
          dispatchEvent() { return false; }
        };
      }
      return orig(s);
    };
    window.__SS_MM_PATCHED__ = true;
    return true;
  }

  // Il bridge Capacitor può comparire dopo i primi script: riprova.
  if (!apply()) {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
    window.addEventListener("load", apply, { once: true });
    setTimeout(apply, 120);
    setTimeout(apply, 600);
  }
})();