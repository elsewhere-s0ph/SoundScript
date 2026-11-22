/* ===== SoundScript · ponte condivisione nativa (Capacitor) =====
   Nell'APK bundled l'audio condiviso arriva come intent Android.
   Il plugin nativo ShareReceiver lo legge e lo restituisce in base64.
   Qui lo trasformiamo in File, lo depositiamo nella STESSA cache usata
   dalla condivisione WhatsApp della PWA, e ricarichiamo con ?shared=1:
   main.js lo prende in carico con il percorso già collaudato.
   Sulla PWA web questo modulo non si attiva. */

const SHARE_CACHE = "soundscript-share-v1";

function isNative() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) { return false; }
}

function plugin() {
  try { return window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.ShareReceiver : null; }
  catch (e) { return null; }
}

async function pull() {
  if (!isNative()) return;
  const p = plugin();
  if (!p || typeof p.takePendingShare !== "function") return;

  let res = null;
  try { res = await p.takePendingShare(); } catch (e) { return; }
  if (!res || res.none || !res.base64) return;

  try {
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], res.name || "audio", { type: res.type || "audio/ogg" });
    if (!file.size) return;

    if (!("caches" in window)) return;
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      new URL("shared-audio", location.href).href,
      new Response(file, {
        headers: {
          "Content-Type": file.type || "audio/ogg",
          "X-SoundScript-Filename": encodeURIComponent(file.name || "audio")
        }
      })
    );

    const u = new URL(location.href);
    u.searchParams.set("shared", "1");
    location.replace(u.toString());
  } catch (e) {
    console.warn("Native share handoff failed:", e);
  }
}

if (isNative()) {
  window.addEventListener("load", () => setTimeout(pull, 250), { once: true });
  window.addEventListener("focus", pull);
  window.addEventListener("capacitorResume", pull);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pull();
  });
}