/* Timbro di build: sostituito da vite.config.js a ogni deploy.
   Dà il nome alla cache: ogni deploy ha la sua, le vecchie vengono eliminate. */
const SW_BUILD = "__SW_BUILD__";

const CORE_CACHE = "soundscript-core-" + SW_BUILD;
const SHARE_CACHE = "soundscript-share-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./share-target.html",
  "./share-target.js",
  "./icon-light.svg",
  "./icon-dark.svg",
  "./icon-dark-transparent.svg",
  "./logo-light.svg",
  "./logo-dark.svg"
];

/* Base assoluta: Response.redirect() pretende URL assoluti, i relativi lanciano. */
function abs(path) {
  return new URL(path, self.registration.scope).href;
}

/* Redirect che non può mai rigettare: se Response.redirect fallisce,
   si ripiega su una risposta 303 costruita a mano con header Location. */
function safeRedirect(path) {
  const target = abs(path);
  try {
    return Response.redirect(target, 303);
  } catch (e) {
    return new Response(null, { status: 303, headers: { Location: target } });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("soundscript-core-") && k !== CORE_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  /* Condivisione audio: accetta /share-target e /share-target.html,
     con o senza slash finale (Cloudflare Pages riscrive in clean URL). */
  if (req.method === "POST" && /\/share-target(?:\.html)?\/?$/.test(url.pathname)) {
    event.respondWith(handleShare(req));
    return;
  }

  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  /* Navigazioni: prima la rete. Solo l'app shell viene salvata come index.html,
     così una visita a /share-target non sovrascrive l'app nella cache offline. */
  if (req.mode === "navigate") {
    const scopePath = new URL(self.registration.scope).pathname;
    const isShell = url.pathname === scopePath || /\/index\.html$/.test(url.pathname);
    const isShare = /\/share-target(?:\.html)?\/?$/.test(url.pathname);

    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (isShell && res && res.ok) {
          const copy = res.clone();
          try {
            const cache = await caches.open(CORE_CACHE);
            await cache.put(abs("index.html"), copy);
          } catch (e) {}
        }
        return res;
      } catch (e) {
        const cache = await caches.open(CORE_CACHE);
        if (isShare) {
          const hit = await cache.match(abs("share-target.html"));
          if (hit) return hit;
        }
        const shell = await cache.match(abs("index.html"));
        if (shell) return shell;
        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  /* Manifest sempre dalla rete (fallback cache solo offline):
     le installazioni esistenti ricevono le scorciatoie aggiornate senza reinstallare */
  if (url.pathname.endsWith("/manifest.json")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CORE_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  /* Asset: cache prima, aggiornamento in background */
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CORE_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});

async function handleShare(req) {
  try {
    let file = null;
    try {
      const form = await req.formData();
      const named = form.get("audio");
      if (named instanceof File) file = named;
      else file = Array.from(form.values()).find((v) => v instanceof File) || null;
    } catch (e) {
      file = null;
    }

    if (!file || file.size === 0) return safeRedirect("./?share-error=1");

    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      abs("shared-audio"),
      new Response(file, {
        headers: {
          "Content-Type": file.type || "audio/ogg",
          "X-SoundScript-Filename": encodeURIComponent(file.name || "audio")
        }
      })
    );
    return safeRedirect("./?shared=1");
  } catch (err) {
    return safeRedirect("./?share-error=1");
  }
}