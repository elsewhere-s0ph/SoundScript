# Condivisione audio nella TWA · diagnosi e rimedio

## Sintomo

La PWA riceve i vocali da WhatsApp. L'APK TWA installato compare nel menu
Condividi, si apre, ma non trova l'audio.

## Diagnosi

Due strumenti hanno isolato il guasto, senza Android Studio.

**1. Diagnostica dentro l'app** (`public/share-debug.html`, raggiungibile da
Info e aggiornamenti). Una POST sintetica verso `share-target.html` con un file
audio generato sul posto viene intercettata dal service worker, scritta in
cache e riletta. Tutto verde **dentro l'APK**. Il livello web è sano.

Lo storico avvii mostra l'unica prova decisiva:
