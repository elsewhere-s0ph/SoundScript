# SoundScript · architettura Android (Capacitor)

L'APK è una **WebView nativa Capacitor** con il bundle web incluso (`assets/public`),
non una Trusted Web Activity. Questo elimina il ponte intent→Chrome che rompeva la
condivisione nelle TWA: l'intent lo legge un plugin nostro, in-process.

## Flusso condivisione

1. WhatsApp → `ACTION_SEND` / `audio/*` → `MainActivity` (intent-filter nel manifest)
2. `ShareReceiverPlugin.takePendingShare()` legge `EXTRA_STREAM`, copia i byte, restituisce base64
3. `src/native-share.js` converte in `File`, lo deposita in `soundscript-share-v1`, ricarica con `?shared=1`
4. `main.js loadShared()` lo prende in carico (percorso identico alla PWA)

## Moduli nativi vs web

- `src/native-env.js` (primo modulo): in APK forza `display-mode: standalone` così i moduli web
  credono di essere installati; imposta `__SS_NATIVE__`.
- `src/native-share.js`: ponte condivisione, attivo solo in APK.
- `src/install.js`: in APK mostra "App installata · versione nativa", nessun pulsante.
- `main.js checkForUpdates()`: in APK spiega che gli aggiornamenti sono una nuova APK.
- Sul web tutti questi rami sono inerti.

## File nativi

Generati/aggiornati da `.github/workflows/android-init.yml` (idempotente):
- `android/app/src/main/AndroidManifest.xml` (intent-filter SEND/SEND_MULTIPLE audio/*)
- `.../MainActivity.java` (registra il plugin)
- `.../ShareReceiverPlugin.java`
- `android/app/build.gradle` (firma da env, versionCode da run number)

## Build e release

- `android-native.yml`: a ogni push su path rilevanti → APK+AAB come artifact CI.
- `release.yml`: al push di un tag `v*` → build APK, gate, e **allega solo APK + SHA256SUMS**
  alla GitHub Release. Niente AAB in release (serve solo al Play Store).
- `versionName` = tag senza `v`; `versionCode` = numero di run.

## Asset

- `scripts/gen-android-icons.mjs`: icone launcher dalle PNG della PWA (tutte le densità),
  rimuove la adaptive-icon di default.
- `scripts/gen-og-image.mjs` + `assets.yml`: rigenera `public/icons/og-1200.png` dal banner SVG.

## Trade-off del bundled

- L'APK invecchia: la web avanza a ogni deploy, l'APK resta allo snapshot finché non se ne installa una nuova.
- Storage separato: origine `https://localhost` nell'APK vs `pages.dev` nel web → cronologie e cache modelli distinte.
