/* SoundScript · diagnostica condivisione.
   File esterno perché il CSP dell'app ha script-src 'self' senza unsafe-inline.
   Riproduce la catena WhatsApp → service worker → cache → lettura, dentro l'APK. */
(function () {
  "use strict";

  var SHARE_CACHE = "soundscript-share-v1";
  var LAUNCH_KEY = "ss-launch-log";
  var CFG_KEY = "ss-share-diag";
  var PKG = "studio.littleelsewhere.soundscript";

  var DEF = {
    freq: 440, dur: 0.6, rate: 16000, name: "diagnostica.wav",
    mime: "audio/wav", field: "audio", repeat: 1, target: "share-target.html",
    auto: true, keep: false, verbose: true, remote: true,
    theme: "dark", sound: true
  };
  var S = load();
  function load() {
    try {
      var r = JSON.parse(localStorage.getItem(CFG_KEY) || "{}"), o = {};
      for (var k in DEF) o[k] = (r[k] !== undefined) ? r[k] : DEF[k];
      return o;
    } catch (e) { var q = {}; for (var j in DEF) q[j] = DEF[j]; return q; }
  }
  function save() { try { localStorage.setItem(CFG_KEY, JSON.stringify(S)); } catch (e) {} }
  function $(i) { return document.getElementById(i); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmtBytes(n) { if (n < 1024) return n + " B"; if (n < 1048576) return (n / 1024).toFixed(1) + " KB"; return (n / 1048576).toFixed(2) + " MB"; }
  function now() { try { return new Date().toLocaleTimeString("it-IT", { hour12: false }); } catch (e) { return new Date().toISOString().slice(11, 19); } }

  /* ---------- tema + audio ---------- */
  var SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SND_ON = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var SND_OFF = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m17 9 5 6M22 9l-5 6"/></svg>';
  function paintTheme() { document.documentElement.setAttribute("data-theme", S.theme); $("themeBtn").innerHTML = S.theme === "dark" ? SUN : MOON; }
  function paintSound() { $("soundBtn").innerHTML = S.sound ? SND_ON : SND_OFF; $("soundBtn").classList.toggle("on", !!S.sound); }
  $("themeBtn").addEventListener("click", function () { S.theme = S.theme === "dark" ? "light" : "dark"; save(); paintTheme(); drawScope(); });
  $("soundBtn").addEventListener("click", function () { S.sound = !S.sound; save(); paintSound(); toast(S.sound ? "Audio del tono attivo" : "Audio silenziato"); });
  paintTheme(); paintSound();

  var tT = null;
  function toast(m) { var t = $("toast"); $("toastTxt").textContent = m; t.classList.add("show"); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove("show"); }, 2200); }
  function copy(txt, m) {
    var done = function () { toast(m || "Copiato"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fb(txt, done); });
    else fb(txt, done);
  }
  function fb(txt, done) {
    var a = document.createElement("textarea"); a.value = txt; a.style.position = "fixed"; a.style.opacity = "0";
    document.body.appendChild(a); a.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copia non riuscita"); } a.remove();
  }

  /* ---------- log ---------- */
  var LOGLINES = [];
  function log(kind, msg) {
    LOGLINES.push({ t: now(), k: kind, m: msg });
    var box = $("log");
    if (box.querySelector(".dim") && LOGLINES.length === 1) box.innerHTML = "";
    var d = document.createElement("div");
    d.className = kind;
    d.textContent = "[" + now() + "] " + msg;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    buildReport();
  }
  function dbg(msg) { if (S.verbose) log("dim", msg); }
  $("btnClearLog").addEventListener("click", function () { LOGLINES = []; $("log").innerHTML = '<div class="dim">// log pulito</div>'; buildReport(); });

  /* ---------- WAV ---------- */
  function makeWav(freq, dur, rate) {
    var n = Math.max(1, Math.floor(rate * dur));
    var buf = new ArrayBuffer(44 + n * 2);
    var dv = new DataView(buf);
    function str(off, s) { for (var i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); }
    str(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
    str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, "data"); dv.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var env = Math.min(1, i / (rate * 0.01)) * Math.min(1, (n - i) / (rate * 0.02));
      var v = Math.sin(2 * Math.PI * freq * i / rate) * 0.6 * env;
      dv.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.round(v * 32767))), true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  function drawScope() {
    var c = $("scope"); if (!c || !c.getContext) return;
    var ctx = c.getContext("2d"); if (!ctx) return;
    var w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    var cs = getComputedStyle(document.documentElement);
    var cy = cs.getPropertyValue("--cyan").trim() || "#22d3ee";
    var vi = cs.getPropertyValue("--violet").trim() || "#8b5cf6";
    var ln = cs.getPropertyValue("--line").trim() || "#1e2f49";
    ctx.strokeStyle = ln; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, cy); g.addColorStop(1, vi);
    ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath();
    var cycles = Math.max(2, Math.min(24, S.freq / 60));
    for (var x = 0; x <= w; x++) {
      var p = x / w;
      var env = Math.min(1, p * 14) * Math.min(1, (1 - p) * 8);
      var y = h / 2 - Math.sin(p * cycles * 2 * Math.PI) * (h / 2 - 8) * 0.72 * env;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  var actx = null;
  $("btnPlay").addEventListener("click", function () {
    if (!S.sound) { toast("Audio silenziato: riattivalo in alto"); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { toast("WebAudio non disponibile"); return; }
      if (!actx) actx = new AC();
      if (actx.state === "suspended" && actx.resume) actx.resume();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = S.freq;
      var t0 = actx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.setValueAtTime(0.16, t0 + Math.max(0.05, S.dur - 0.05));
      g.gain.linearRampToValueAtTime(0, t0 + S.dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + S.dur + 0.02);
      log("cy", "Tono riprodotto: " + S.freq + " Hz per " + S.dur + " s");
    } catch (e) { log("warn", "Riproduzione non riuscita: " + e.message); }
  });

  /* ---------- contesto ---------- */
  var CTX = {};
  function readCtx() {
    var standalone = false, dm = "browser";
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) { standalone = true; dm = "standalone"; }
      else if (window.matchMedia("(display-mode: fullscreen)").matches) { standalone = true; dm = "fullscreen"; }
      else if (window.matchMedia("(display-mode: minimal-ui)").matches) { dm = "minimal-ui"; }
    } catch (e) {}
    if (navigator.standalone === true) { standalone = true; dm = "ios-standalone"; }
    CTX = {
      dm: dm,
      standalone: standalone,
      controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      swSupport: "serviceWorker" in navigator,
      cacheSupport: "caches" in window,
      referrer: document.referrer || "(vuoto)",
      href: location.href,
      search: location.search || "(nessuna)",
      ua: navigator.userAgent,
      online: navigator.onLine,
      lang: navigator.language || "?",
      scope: null,
      launches: readLaunches()
    };
    var badge = $("ctxBadge");
    var label = standalone ? (dm === "ios-standalone" ? "iOS installata" : "app installata") : "browser";
    var fromTwa = CTX.launches.some(function (l) { return l.ref.indexOf("android-app://" + PKG) === 0; });
    var fromApk = CTX.launches.some(function (l) { return l.ref.indexOf("org.chromium.webapk") > 0; });
    if (fromTwa) label = "TWA · APK";
    else if (fromApk) label = "WebAPK · PWA";
    badge.innerHTML = "contesto: <b>" + esc(label) + "</b>";
    CTX.label = label;
    paintTel();
    paintLaunches();
  }
  function paintTel() {
    var rows = [
      ["display-mode", CTX.dm, CTX.standalone ? "ok" : "warn"],
      ["pagina controllata dal SW", CTX.controlled ? "sì" : "NO", CTX.controlled ? "ok" : "bad"],
      ["scope del worker", CTX.scope || "in lettura…", CTX.scope ? "" : "warn"],
      ["Cache API", CTX.cacheSupport ? "disponibile" : "assente", CTX.cacheSupport ? "ok" : "bad"],
      ["query string", CTX.search, /shared=1/.test(CTX.search) ? "ok" : (/share-error/.test(CTX.search) ? "bad" : "")],
      ["referrer", CTX.referrer, CTX.referrer.indexOf("android-app://") === 0 ? "ok" : ""],
      ["rete", CTX.online ? "online" : "offline", CTX.online ? "ok" : "warn"],
      ["lingua", CTX.lang, ""]
    ];
    var box = $("tel"); box.innerHTML = "";
    rows.forEach(function (r) {
      var d = document.createElement("div"); d.className = "t" + (r[2] ? " " + r[2] : "");
      d.innerHTML = "<b>" + esc(r[0]) + "</b><span>" + esc(r[1]) + "</span>";
      box.appendChild(d);
    });
  }
  function readLaunches() {
    try { var a = JSON.parse(sessionStorage.getItem(LAUNCH_KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function paintLaunches() {
    var box = $("launches"); box.innerHTML = "";
    var L = readLaunches();
    if (!L.length) {
      box.innerHTML = '<div class="vl warn"><i>!</i><div><b>Nessun avvio registrato in questa sessione.</b> Lo storico vive in <code>sessionStorage</code>: si azzera chiudendo l\'app. Condividi un vocale verso SoundScript, poi riapri questa pagina dall\'app senza chiuderla.</div></div>';
      return;
    }
    L.slice().reverse().forEach(function (l) {
      var kind = "warn", glyph = "!";
      var note = "Avvio senza parametro di condivisione: il worker non ha consegnato nulla.";
      if (/shared=1/.test(l.url)) { kind = "ok"; glyph = "✓"; note = "Il worker ha intercettato la POST e ha rediretto con ?shared=1."; }
      else if (/share-error=1/.test(l.url)) { kind = "bad"; glyph = "✕"; note = "Il worker ha intercettato ma handleShare è fallito: file assente o non leggibile."; }
      else if (l.ref.indexOf("android-app://") !== 0) { kind = "ok"; glyph = "·"; note = "Apertura normale, non da condivisione."; }
      var d = document.createElement("div"); d.className = "vl " + kind;
      d.innerHTML = "<i>" + glyph + "</i><div><b>" + esc(l.time) + "</b> · " + esc(note) +
        "<br><code>ref: " + esc(l.ref || "(vuoto)") + "</code><br><code>url: " + esc(l.url) + "</code>" +
        "<br><code>display: " + esc(l.dm) + " · controlled: " + esc(String(l.controlled)) + "</code></div>";
      box.appendChild(d);
    });
  }
  $("btnClearLaunch").addEventListener("click", function () {
    try { sessionStorage.removeItem(LAUNCH_KEY); } catch (e) {}
    readCtx(); buildHyps(); buildReport(); toast("Storico avvii azzerato");
  });

  function readScope() {
    if (!navigator.serviceWorker) return Promise.resolve();
    return navigator.serviceWorker.getRegistration().then(function (r) {
      CTX.scope = r ? r.scope : "(nessuna registrazione)";
      paintTel();
    }).catch(function () { CTX.scope = "(lettura fallita)"; paintTel(); });
  }

  /* ---------- cache ---------- */
  var CACHE_ROWS = [];
  function keyUrl() { return new URL("shared-audio", location.href).href; }
  function readCache() {
    CACHE_ROWS = [];
    if (!("caches" in window)) { paintCache(); return Promise.resolve(); }
    return caches.open(SHARE_CACHE).then(function (c) {
      return c.keys().then(function (reqs) {
        if (!reqs.length) { paintCache(); return; }
        var chain = Promise.resolve();
        reqs.forEach(function (req) {
          chain = chain.then(function () {
            return c.match(req).then(function (res) {
              if (!res) return;
              return res.clone().blob().then(function (b) {
                CACHE_ROWS.push({
                  url: req.url,
                  size: b.size,
                  type: res.headers.get("Content-Type") || b.type || "(nessuno)",
                  file: res.headers.get("X-SoundScript-Filename") || "(assente)"
                });
              });
            }).catch(function () {});
          });
        });
        return chain.then(paintCache);
      });
    }).catch(function (e) { log("warn", "Lettura cache fallita: " + e.message); paintCache(); });
  }
  function paintCache() {
    var tb = $("cacheTable").querySelector("tbody"); tb.innerHTML = "";
    if (!CACHE_ROWS.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td"); td0.colSpan = 5;
      td0.innerHTML = '<span style="color:var(--dim)">Cache vuota: nessun audio in attesa.</span>';
      tr0.appendChild(td0); tb.appendChild(tr0);
      buildHyps(); buildReport(); return;
    }
    CACHE_ROWS.forEach(function (r) {
      var tr = document.createElement("tr");
      function td(cls, txt) { var d = document.createElement("td"); if (cls) d.className = cls; d.textContent = txt; return d; }
      tr.appendChild(td("m", r.url.replace(location.origin, "")));
      tr.appendChild(td("", fmtBytes(r.size)));
      tr.appendChild(td("m", r.type));
      var fn = r.file; try { fn = decodeURIComponent(r.file); } catch (e) {}
      tr.appendChild(td("m", fn));
      var c = document.createElement("td"); c.className = "cc";
      var b = document.createElement("button"); b.type = "button"; b.className = "mini";
      b.setAttribute("aria-label", "Elimina voce");
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>';
      b.addEventListener("click", function () {
        caches.open(SHARE_CACHE).then(function (cc) { return cc.delete(r.url); })
          .then(function () { log("warn", "Voce eliminata: " + r.url); return readCache(); })
          .catch(function (e) { log("bad", "Eliminazione fallita: " + e.message); });
      });
      c.appendChild(b); tr.appendChild(c);
      tb.appendChild(tr);
    });
    buildHyps(); buildReport();
  }
  $("btnCache").addEventListener("click", function () { readCache().then(function () { toast("Cache riletta"); }); });
  $("btnPurge").addEventListener("click", function () {
    if (!("caches" in window)) return;
    caches.delete(SHARE_CACHE).then(function () {
      log("warn", "Cache " + SHARE_CACHE + " eliminata interamente.");
      return readCache();
    }).then(function () { toast("Cache svuotata"); }).catch(function (e) { log("bad", "Purge fallito: " + e.message); });
  });

  /* ---------- controlli remoti ---------- */
  var REMOTE = { manifest: null, sw: null, dal: null, rows: [] };
  function readRemote() {
    if (!S.remote) { REMOTE.rows = [["warn", "Controlli remoti disattivati."]]; paintRemote(); return Promise.resolve(); }
    REMOTE.rows = [];
    var origin = location.origin;
    return fetch(origin + "/manifest.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (m) {
      REMOTE.manifest = m;
      var st = m.share_target;
      if (!st) { REMOTE.rows.push(["bad", "<b>share_target assente nel manifest.</b> Android non può esporre l'app nel menu Condividi."]); return; }
      REMOTE.rows.push(["ok", "share_target presente · action <code>" + esc(st.action || "?") + "</code>"]);
      REMOTE.rows.push([st.method === "POST" ? "ok" : "bad", "method: <code>" + esc(st.method || "GET") + "</code> — per i file serve POST"]);
      REMOTE.rows.push([st.enctype === "multipart/form-data" ? "ok" : "bad", "enctype: <code>" + esc(st.enctype || "assente") + "</code>"]);
      var params = st.params || {};
      var files = params.files || [];
      var audioField = null;
      files.forEach(function (f) { if (f && f.name) audioField = f.name; });
      REMOTE.rows.push([files.length ? "ok" : "bad", files.length ? "params.files dichiarato, campo <code>" + esc(audioField) + "</code>" : "<b>params.files assente:</b> nessun audio può essere consegnato"]);
      var accepts = [];
      files.forEach(function (f) { (f.accept || []).forEach(function (a) { accepts.push(a); }); });
      var okAudio = accepts.some(function (a) { return /^audio\//i.test(a) || /\.(ogg|opus|m4a|mp3|wav)$/i.test(a); });
      REMOTE.rows.push([okAudio ? "ok" : "bad", "accept: <code>" + esc(accepts.join(", ") || "vuoto") + "</code>"]);
      var lh = m.launch_handler && m.launch_handler.client_mode;
      if (lh === "focus-existing") REMOTE.rows.push(["bad", "<b>launch_handler: focus-existing.</b> Mette a fuoco la finestra esistente senza consegnare la condivisione: è un blocco certo."]);
      else if (lh) REMOTE.rows.push(["ok", "launch_handler: <code>" + esc(lh) + "</code>"]);
      else REMOTE.rows.push(["warn", "launch_handler assente: va bene, il default non interferisce."]);
    }).catch(function (e) {
      REMOTE.rows.push(["bad", "manifest.json non leggibile: " + esc(e.message)]);
    }).then(function () {
      return fetch(origin + "/sw.js", { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
        REMOTE.sw = t;
        var hasShare = /share-target/.test(t);
        var bothForms = /share-target\(\?:\\\.html\)\?/.test(t) || /share-target(?:\.html)?/.test(t);
        var absRedirect = /registration\.scope/.test(t) || /new URL\([^)]*scope/.test(t);
        var postGuard = /method\s*===\s*["']POST["']/.test(t);
        REMOTE.rows.push([hasShare ? "ok" : "bad", "sw.js contiene un gestore per share-target"]);
        REMOTE.rows.push([bothForms ? "ok" : "warn", "sw.js accetta anche la forma clean URL <code>/share-target</code>"]);
        REMOTE.rows.push([absRedirect ? "ok" : "bad", "sw.js costruisce redirect assoluti (i relativi lanciano TypeError)"]);
        REMOTE.rows.push([postGuard ? "ok" : "warn", "sw.js intercetta esplicitamente le POST"]);
      }).catch(function (e) { REMOTE.rows.push(["warn", "sw.js non leggibile: " + esc(e.message)]); });
    }).then(function () {
      return fetch(origin + "/.well-known/assetlinks.json", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (d) {
        REMOTE.dal = d;
        var arr = Array.isArray(d) ? d : [d];
        var s = arr[0] || {}, tg = s.target || {};
        var relOk = (s.relation || []).indexOf("delegate_permission/common.handle_all_urls") >= 0;
        var pkgOk = tg.package_name === PKG;
        var fps = tg.sha256_cert_fingerprints || [];
        REMOTE.rows.push([relOk ? "ok" : "bad", "assetlinks relation corretta"]);
        REMOTE.rows.push([pkgOk ? "ok" : "bad", "assetlinks package_name: <code>" + esc(tg.package_name || "assente") + "</code>"]);
        REMOTE.rows.push([fps.length ? "ok" : "bad", fps.length + " fingerprint pubblicati"]);
        if (!relOk || !pkgOk || !fps.length) REMOTE.rows.push(["bad", "<b>Associazione non valida:</b> senza verifica Chrome ripiega su Custom Tab, che non può consegnare una POST."]);
      }).catch(function (e) {
        REMOTE.rows.push(["bad", "<b>assetlinks.json non raggiungibile:</b> " + esc(e.message) + ". Senza, la TWA non è verificata e la condivisione non può arrivare al worker."]);
      });
    }).then(function () { paintRemote(); buildHyps(); buildReport(); });
  }
  function paintRemote() {
    var box = $("remote"); box.innerHTML = "";
    if (!REMOTE.rows.length) { box.innerHTML = '<div class="vl"><i>·</i><div>Non ancora letti.</div></div>'; return; }
    REMOTE.rows.forEach(function (r) {
      var d = document.createElement("div"); d.className = "vl " + r[0];
      d.innerHTML = "<i>" + (r[0] === "ok" ? "✓" : (r[0] === "bad" ? "✕" : "!")) + "</i><div>" + r[1] + "</div>";
      box.appendChild(d);
    });
  }

  /* ---------- probe ---------- */
  var RUNNING = false;
  var PROBE = { ran: false, intercepted: null, cached: null, error: null, redirect: null };
  function setRunState(kind, txt) {
    var el = $("runState");
    el.className = "pill " + kind;
    el.innerHTML = '<span class="dot"></span>' + esc(txt);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function runProbe() {
    if (RUNNING) return;
    if (!("caches" in window)) { log("bad", "Cache API assente: impossibile proseguire."); return; }
    RUNNING = true;
    $("btnRun").disabled = true;
    setRunState("cy", "in corso");
    PROBE = { ran: true, intercepted: null, cached: null, error: null, redirect: null };
    LOGLINES = []; $("log").innerHTML = "";

    var blob = makeWav(S.freq, S.dur, S.rate);
    var fname = S.name || "diagnostica.wav";
    var file = new File([blob], fname, { type: S.mime || blob.type });
    var key = keyUrl();
    var backup = null;

    log("cy", "── Inizio diagnosi ──");
    log("dim", "Contesto: " + CTX.label + " · display-mode " + CTX.dm + " · pagina controllata: " + (CTX.controlled ? "sì" : "NO"));
    dbg("Chiave cache: " + key);
    dbg("File generato: " + fname + " · " + fmtBytes(file.size) + " · mime dichiarato '" + (S.mime || "(vuoto)") + "'");
    dbg("Destinazione: " + S.target + " · campo multipart '" + S.field + "' · ripetizioni " + S.repeat);

    if (!CTX.controlled) {
      log("bad", "La pagina NON è controllata dal service worker: una POST non verrebbe intercettata.");
      log("warn", "Provo comunque: se il worker è registrato ma non ha ancora preso il controllo, la fetch potrebbe passare alla rete.");
    }

    caches.open(SHARE_CACHE).then(function (c) {
      return c.match(key).then(function (existing) {
        if (!existing) { dbg("Nessun audio in attesa: nessuna precauzione necessaria."); return null; }
        log("warn", "Trovato un audio in attesa: lo preservo e lo ripristino alla fine.");
        return existing.clone().blob().then(function (b) {
          backup = { blob: b, type: existing.headers.get("Content-Type") || b.type, fn: existing.headers.get("X-SoundScript-Filename") || "" };
          return backup;
        });
      });
    }).then(function () {
      var pass = 0, fail = 0;
      var chain = Promise.resolve();
      for (var i = 0; i < Math.max(1, Math.min(10, S.repeat)); i++) {
        chain = chain.then(function () {
          var fd = new FormData();
          fd.append(S.field, file, fname);
          log("cy", "POST verso " + S.target + " (tentativo " + (pass + fail + 1) + ")");
          return fetch(S.target, { method: "POST", body: fd, redirect: "follow", cache: "no-store" }).then(function (res) {
            PROBE.redirect = res.url;
            log(res.ok ? "ok" : "warn", "Risposta HTTP " + res.status + " · url finale " + res.url.replace(location.origin, ""));
            if (/shared=1/.test(res.url)) { log("ok", "Il worker ha rediretto a ?shared=1: la POST è stata intercettata."); PROBE.intercepted = true; }
            else if (/share-error=1/.test(res.url)) { log("bad", "Il worker ha rediretto a ?share-error=1: handleShare ha rifiutato il file."); PROBE.intercepted = true; PROBE.error = "share-error"; }
            else { log("bad", "Nessun redirect del worker: la POST è finita alla rete. Il service worker non ha intercettato."); PROBE.intercepted = false; }
            return sleep(220);
          }).then(function () {
            return caches.open(SHARE_CACHE).then(function (c) { return c.match(key); }).then(function (hit) {
              if (hit) {
                return hit.clone().blob().then(function (b) {
                  var got = hit.headers.get("X-SoundScript-Filename") || "";
                  var isOurs = false;
                  try { isOurs = decodeURIComponent(got) === fname; } catch (e) { isOurs = got === fname; }
                  if (isOurs) { pass++; PROBE.cached = true; log("ok", "Audio trovato in cache · " + fmtBytes(b.size) + " · header nome '" + got + "'"); }
                  else { fail++; log("warn", "In cache c'è altro (" + got + "): il nostro file non è stato scritto."); }
                });
              }
              fail++; PROBE.cached = false;
              log("bad", "Nessuna voce in cache dopo la POST: i byte non sono mai arrivati al livello web.");
            });
          }).catch(function (e) {
            fail++; PROBE.error = e.message;
            log("bad", "POST fallita: " + e.message);
          });
        });
      }
      return chain.then(function () { return { pass: pass, fail: fail }; });
    }).then(function (r) {
      log("cy", "── Esito: " + r.pass + " successi, " + r.fail + " fallimenti ──");
      if (S.auto) {
        if (r.pass > 0 && PROBE.intercepted) {
          log("ok", "Il livello web funziona: worker intercetta, cache scrive, lettura riesce.");
          log("hi", "Quindi il guasto è a monte: Android → Chrome non consegna il file all'app installata.");
        } else if (PROBE.intercepted && !PROBE.cached) {
          log("bad", "Il worker intercetta ma non scrive: handleShare rifiuta il payload.");
          if (S.field !== "audio") log("warn", "Hai usato il campo '" + S.field + "': il worker cerca 'audio'. Riprova con 'audio'.");
        } else {
          log("bad", "Il worker non intercetta nemmeno una POST sintetica: il problema è nel livello web, non in Android.");
        }
      }
      if (S.keep) { log("warn", "Lascio il file di prova in cache come richiesto."); return null; }
      return caches.open(SHARE_CACHE).then(function (c) {
        return c.delete(key).then(function () {
          dbg("Voce di prova rimossa.");
          if (backup) {
            return c.put(key, new Response(backup.blob, {
              headers: { "Content-Type": backup.type || "audio/ogg", "X-SoundScript-Filename": backup.fn }
            })).then(function () { log("ok", "Audio in attesa ripristinato."); });
          }
        });
      });
    }).catch(function (e) {
      PROBE.error = e.message;
      log("bad", "Diagnosi interrotta: " + e.message);
    }).then(function () {
      return readCache();
    }).then(function () {
      RUNNING = false;
      $("btnRun").disabled = false;
      var good = PROBE.intercepted && PROBE.cached;
      setRunState(good ? "ok" : "bad", good ? "livello web OK" : "guasto rilevato");
      buildHyps(); buildReport();
      toast(good ? "Livello web verificato" : "Guasto rilevato: leggi le ipotesi");
    });
  }
  $("btnRun").addEventListener("click", runProbe);

  /* ---------- ipotesi ---------- */
  function buildHyps() {
    var L = readLaunches();
    var twaLaunch = L.filter(function (l) { return l.ref.indexOf("android-app://") === 0; });
    var withParam = twaLaunch.filter(function (l) { return /shared=1|share-error=1/.test(l.url); });
    var dalBad = REMOTE.rows.some(function (r) { return r[0] === "bad" && /assetlinks|Associazione/.test(r[1]); });
    var dalOk = REMOTE.dal && REMOTE.rows.some(function (r) { return r[0] === "ok" && /fingerprint pubblicati/.test(r[1]); });
    var focusExisting = REMOTE.manifest && REMOTE.manifest.launch_handler && REMOTE.manifest.launch_handler.client_mode === "focus-existing";
    var noFiles = REMOTE.manifest && REMOTE.manifest.share_target && !(REMOTE.manifest.share_target.params || {}).files;
    var webOk = PROBE.ran && PROBE.intercepted && PROBE.cached;
    var webBad = PROBE.ran && (!PROBE.intercepted || !PROBE.cached);

    var H = [
      {
        n: "Associazione Android non verificata",
        s: "Senza Digital Asset Links validi, Chrome apre la TWA come Custom Tab: e i Custom Tab non possono consegnare una POST.",
        st: dalBad ? "hit" : (dalOk ? "out" : "unk"),
        fix: dalBad
          ? "Pubblica <code>public/.well-known/assetlinks.json</code> con package e fingerprint dell'APK, poi reinstalla l'APK. È il prerequisito: senza, nessun'altra correzione serve."
          : "Se l'app a schermo intero non mostra la barra degli indirizzi, l'associazione è già verificata e questa ipotesi cade."
      },
      {
        n: "L'intent arriva ma senza payload",
        s: "Android lancia l'app, però l'audio non viene convertito in POST verso il service worker.",
        st: (twaLaunch.length && !withParam.length && webOk) ? "hit" : (withParam.length ? "out" : "unk"),
        fix: "È il guasto tipico delle TWA quando la consegna del file non è abilitata nel pacchetto. Rigenera l'APK assicurandoti che lo <b>share target</b> sia incluso, con <code>method: POST</code>, <code>enctype: multipart/form-data</code> e <code>params.files</code> per l'audio. In alternativa, installa la PWA da Chrome: la WebAPK usa la consegna nativa di Chrome, che funziona."
      },
      {
        n: "launch_handler swallow dell'avvio",
        s: "focus-existing mette a fuoco la finestra già aperta senza navigare: la condivisione viene ignorata.",
        st: focusExisting ? "hit" : (REMOTE.manifest ? "out" : "unk"),
        fix: "Rimuovi <code>launch_handler</code> dal manifest o usa <code>navigate-existing</code>, poi rigenera l'APK. Con <code>focus-existing</code> la condivisione non può funzionare."
      },
      {
        n: "share_target non dichiara i file",
        s: "Se params.files manca, o accept non copre l'audio, Android non consegna il vocale.",
        st: noFiles ? "hit" : (REMOTE.manifest ? "out" : "unk"),
        fix: "Nel manifest serve <code>params.files: [{ name: \"audio\", accept: [\"audio/*\", \".ogg\", \".opus\", \".m4a\", \".mp3\", \".wav\"] }]</code>. Il campo deve chiamarsi <b>audio</b>: è quello che il worker legge."
      },
      {
        n: "Il service worker non controlla la pagina",
        s: "Senza controllore, la POST finisce alla rete e il file statico non può salvare nulla.",
        st: (!CTX.controlled && CTX.swSupport) ? "hit" : (CTX.controlled ? "out" : "unk"),
        fix: "Chiudi completamente l'app e riaprila: <code>clients.claim()</code> prende il controllo. Se resta non controllata, la registrazione è fallita: controlla che <code>sw.js</code> risponda 200 e che lo scope copra la root."
      },
      {
        n: "handleShare rifiuta il payload",
        s: "Il worker intercetta ma non riesce a leggere il file, e redirige a ?share-error=1.",
        st: (PROBE.error === "share-error" || L.some(function (l) { return /share-error=1/.test(l.url); })) ? "hit" : (webOk ? "out" : "unk"),
        fix: "Guarda il nome del campo multipart: il worker cerca <code>audio</code>. Verifica anche che il file non sia vuoto. Il trace qui sopra distingue i due casi."
      },
      {
        n: "Guasto nel livello web",
        s: "La catena si rompe dentro l'app, non nel passaggio da Android.",
        st: webBad ? "hit" : (webOk ? "out" : "unk"),
        fix: "Se la POST sintetica non viene intercettata, il problema è nel service worker pubblicato, non nell'APK. I controlli remoti qui sopra dicono quale pezzo manca."
      }
    ];

    var box = $("hyps"); box.innerHTML = "";
    H.sort(function (a, b) { var r = { hit: 0, unk: 1, out: 2 }; return r[a.st] - r[b.st]; });
    H.forEach(function (h) {
      var d = document.createElement("div"); d.className = "hyp";
      var glyph = h.st === "hit" ? "✕" : (h.st === "out" ? "✓" : "?");
      var lbl = h.st === "hit" ? "CONFERMATA" : (h.st === "out" ? "esclusa" : "da verificare");
      d.innerHTML = '<div class="hyp-h"><span class="hyp-s ' + h.st + '">' + glyph + '</span>' +
        '<span class="hyp-t"><b>' + esc(h.n) + '</b><small>' + esc(h.s) + ' · <b>' + lbl + '</b></small></span></div>' +
        '<div class="hyp-fix">' + h.fix + '</div>';
      box.appendChild(d);
    });

    var al = $("alerts"); al.innerHTML = "";
    function add(cls, icon, html) {
      var d = document.createElement("div"); d.className = "call " + cls;
      d.innerHTML = '<svg viewBox="0 0 24 24">' + icon + '</svg><div>' + html + '</div>';
      al.appendChild(d);
    }
    var WARN = '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>';
    var INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>';
    var OK = '<path d="M20 6 9 17l-5-5"/>';
    if (!CTX.standalone) add("warn", WARN, "<b>Stai leggendo questa pagina in un browser, non nell'APK.</b> Il test qui dirà se il livello web funziona, ma non può riprodurre il passaggio da Android. Apri l'app installata, vai in <b>Info e aggiornamenti → Diagnostica condivisione</b>, e riesegui.");
    if (dalBad) add("bad", WARN, "<b>L'associazione Android non è verificata.</b> È un prerequisito assoluto: senza, la TWA non può ricevere condivisioni, qualunque altra cosa sia a posto.");
    if (focusExisting) add("bad", WARN, "<b>launch_handler è focus-existing.</b> Blocca la consegna della condivisione per costruzione.");
    if (webOk && twaLaunch.length && !withParam.length) add("bad", WARN, "<b>Diagnosi chiusa:</b> il livello web funziona, ma gli avvii registrati non hanno mai ricevuto <code>?shared=1</code>. Il file si perde tra Android e Chrome: va rigenerato il pacchetto con lo share target abilitato.");
    if (webOk && !twaLaunch.length) add("cy", INFO, "Il livello web è sano. Ora condividi un vocale verso l'app, poi <b>senza chiuderla</b> torna qui: comparirà l'avvio reale e sapremo se Android ha consegnato qualcosa.");
    if (!al.children.length) add("cy", INFO, "Premi <b>Esegui diagnosi</b>: ricostruisce la catena con un audio generato qui e dice dove si rompe.");
  }

  /* ---------- referto ---------- */
  function buildReport() {
    var L = readLaunches();
    var lines = [];
    lines.push("SOUNDSCRIPT · REFERTO CONDIVISIONE");
    lines.push("quando: " + new Date().toISOString());
    lines.push("");
    lines.push("[contesto]");
    lines.push("etichetta: " + (CTX.label || "?"));
    lines.push("display-mode: " + CTX.dm);
    lines.push("standalone: " + CTX.standalone);
    lines.push("sw controlling: " + CTX.controlled);
    lines.push("sw scope: " + (CTX.scope || "?"));
    lines.push("caches: " + CTX.cacheSupport);
    lines.push("href: " + CTX.href);
    lines.push("referrer: " + CTX.referrer);
    lines.push("online: " + CTX.online);
    lines.push("ua: " + CTX.ua);
    lines.push("");
    lines.push("[avvii registrati]");
    if (!L.length) lines.push("(nessuno in questa sessione)");
    L.forEach(function (l) { lines.push(l.time + " | ref=" + (l.ref || "-") + " | url=" + l.url + " | dm=" + l.dm + " | ctrl=" + l.controlled); });
    lines.push("");
    lines.push("[probe]");
    lines.push("eseguito: " + PROBE.ran);
    lines.push("intercettato: " + PROBE.intercepted);
    lines.push("scritto in cache: " + PROBE.cached);
    lines.push("redirect finale: " + (PROBE.redirect || "-"));
    lines.push("errore: " + (PROBE.error || "-"));
    lines.push("parametri: " + S.freq + "Hz " + S.dur + "s " + S.rate + "Hz field=" + S.field + " mime=" + (S.mime || "(vuoto)") + " target=" + S.target + " repeat=" + S.repeat);
    lines.push("");
    lines.push("[cache]");
    if (!CACHE_ROWS.length) lines.push("(vuota)");
    CACHE_ROWS.forEach(function (r) { lines.push(r.url + " | " + r.size + "B | " + r.type + " | " + r.file); });
    lines.push("");
    lines.push("[config pubblicata]");
    if (!REMOTE.rows.length) lines.push("(non letta)");
    REMOTE.rows.forEach(function (r) { lines.push(r[0].toUpperCase() + " · " + r[1].replace(/<[^>]+>/g, "")); });
    lines.push("");
    lines.push("[trace]");
    LOGLINES.forEach(function (l) { lines.push(l.t + " " + l.k.toUpperCase() + " " + l.m); });
    var txt = lines.join("\n");
    var box = $("report");
    box.innerHTML = "";
    var d = document.createElement("div"); d.textContent = txt; box.appendChild(d);
    $("repSize").textContent = fmtBytes(txt.length);
    window.__report = txt;
  }
  $("btnCopy").addEventListener("click", function () { copy(window.__report || "", "Referto copiato: incollalo in chat"); });
  $("btnDl").addEventListener("click", function () {
    var blob = new Blob([window.__report || ""], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "soundscript-share-report.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1200);
    toast("Referto scaricato");
  });

  /* ---------- binding controlli ---------- */
  function bindRange(id, key, fmt, vid) {
    var el = $(id); el.value = S[key];
    var out = $(vid);
    function paint() { if (out) out.textContent = fmt(S[key]); }
    paint();
    el.addEventListener("input", function () {
      S[key] = parseFloat(this.value); save(); paint(); drawScope(); buildReport();
    });
  }
  bindRange("fFreq", "freq", function (v) { return v + " Hz"; }, "vFreq");
  bindRange("fDur", "dur", function (v) { return v.toFixed(1).replace(".", ",") + " s"; }, "vDur");
  [["fRate", "rate", true], ["fName", "name", false], ["fMime", "mime", false], ["fField", "field", false], ["fTarget", "target", false]].forEach(function (p) {
    var el = $(p[0]); el.value = S[p[1]];
    var ev = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, function () {
      S[p[1]] = p[2] ? parseInt(this.value, 10) : this.value; save(); drawScope(); buildReport();
    });
  });
  $("fRepeat").value = S.repeat;
  $("fRepeat").addEventListener("input", function () { S.repeat = Math.max(1, Math.min(10, parseInt(this.value || "1", 10) || 1)); save(); buildReport(); });
  document.querySelectorAll(".tg").forEach(function (el) {
    var k = el.dataset.k, inp = el.querySelector("input");
    inp.checked = !!S[k]; el.classList.toggle("on", inp.checked);
    inp.addEventListener("change", function () {
      S[k] = inp.checked; el.classList.toggle("on", inp.checked); save();
      if (k === "remote" && inp.checked) readRemote();
      buildReport();
    });
  });

  window.addEventListener("online", function () { readCtx(); buildHyps(); buildReport(); });
  window.addEventListener("offline", function () { readCtx(); buildHyps(); buildReport(); });
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      log("warn", "Il service worker ha cambiato controllore: rileggo il contesto.");
      readCtx(); readScope().then(function () { buildHyps(); buildReport(); });
    });
  }

  /* ---------- avvio ---------- */
  drawScope();
  readCtx();
  readScope().then(function () {
    return readCache();
  }).then(function () {
    return readRemote();
  }).then(function () {
    buildHyps(); buildReport();
    log("dim", "Diagnostica pronta. Contesto: " + CTX.label + " · worker " + (CTX.controlled ? "attivo" : "assente") + " · cache " + (CACHE_ROWS.length ? CACHE_ROWS.length + " voci" : "vuota"));
    if (!CTX.standalone) log("warn", "Questa pagina è aperta in un browser: per diagnosticare l'APK, aprila dall'app installata.");
  }).catch(function (e) {
    log("bad", "Inizializzazione parziale: " + e.message);
    buildHyps(); buildReport();
  });
})();