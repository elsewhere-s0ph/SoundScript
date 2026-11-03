/* ===== SoundScript · Dizionario i18n IT/EN ===== */
export const I18N = {
  it: {
    /* Hero */
    "hero.sub": "Condividi un audio da WhatsApp oppure selezionalo qui. L'app prova le chiavi in ordine e chiude con i modelli locali.",
    
    /* Features */
    "features.label": "Cosa fa l'app",
    "features.local.title": "Elaborazione locale",
    "features.local.desc": "I modelli Whisper e Qwen girano sul tuo dispositivo. Zero dati al cloud.",
    "features.chain.title": "Catena API intelligente",
    "features.chain.desc": "Configura più provider. Se uno esaurisce i crediti, l'app passa al successivo.",
    "features.share.title": "Condivisione diretta",
    "features.share.desc": "Condividi un vocale da WhatsApp direttamente a SoundScript.",
    
    /* Drop zone */
    "drop.title": "Trascina qui un audio",
    "drop.sub": "oppure tocca per scegliere un file, o incollalo con Ctrl+V",
    "drop.pick": "Scegli audio",
    
    /* Status */
    "status.ready": "Pronto.",
    "status.cancel": "Annulla",
    "status.preparing": "Preparo l'audio…",
    "status.transcribing": "Trascrizione con {engine}…",
    "status.summarizing": "Riepilogo TL;DR con {engine}…",
    "status.complete": "Completato e salvato in cronologia.",
    "status.error": "Impossibile elaborare l'audio: {error}",
    "status.aborted": "Elaborazione annullata. Pronto a riprovare.",
    
    /* Transcript card */
    "transcript.label": "Trascrizione",
    "transcript.new": "↺ Nuovo",
    "transcript.new.title": "Svuota i campi e riparti da zero",
    "transcript.engine": "Motore:",
    "transcript.duration": "Durata:",
    "transcript.copy": "Copia trascrizione",
    "transcript.share": "Condividi",
    "transcript.export": "Esporta",
    "transcript.copy.all": "Copia tutto",
    
    /* Export menu */
    "export.txt": "Testo (.txt)",
    "export.txt.desc": "Solo testo, per appunti rapidi",
    "export.md": "Markdown (.md)",
    "export.md.desc": "Con intestazioni e metadata",
    "export.pdf": "PDF (stampa)",
    "export.pdf.desc": "Foglio con logo → \"Salva come PDF\"",
    
    /* Player */
    "player.play": "Riproduci o metti in pausa",
    "player.back": "Indietro di 10 secondi",
    "player.fwd": "Avanti di 10 secondi",
    "player.speed": "Velocità di riproduzione",
    
    /* TL;DR */
    "tldr.title": "Riepilogo TL;DR",
    "tldr.auto.note": "Audio oltre il minuto ({duration}): il riepilogo viene generato automaticamente.",
    "tldr.auto.note.short": "Audio breve ({duration}): trascrizione completata. Il riepilogo non è stato generato automaticamente.",
    "tldr.auto.note.unknown": "Durata non leggibile: il riepilogo viene generato automaticamente.",
    "tldr.length": "Lunghezza",
    "tldr.length.short": "Breve · 1 frase",
    "tldr.length.medium": "Medio · 3 frasi",
    "tldr.length.long": "Lungo · paragrafo",
    "tldr.style": "Stile",
    "tldr.style.narrative": "Narrativo",
    "tldr.style.list": "Elenco puntato",
    "tldr.style.actions": "Azioni e scadenze",
    "tldr.style.formal": "Formale",
    "tldr.style.friendly": "Amichevole",
    "tldr.lang": "Lingua del riepilogo",
    "tldr.lang.it": "Italiano",
    "tldr.lang.auto": "Automatica · lingua dell'audio",
    "tldr.custom": "Istruzioni personalizzate",
    "tldr.custom.placeholder": "es. evidenzia solo date e nomi di persone",
    "tldr.prompt": "Anteprima del prompt inviato al modello",
    "tldr.presets": "Preset salvati",
    "tldr.presets.name": "Nome del preset (es. Scadenze rapide)",
    "tldr.presets.save": "Salva preset",
    "tldr.generate": "Genera TL;DR",
    "tldr.regenerate": "⟳ Rigenera TL;DR",
    "tldr.empty": "Il TL;DR comparirà qui dopo l'elaborazione.",
    "tldr.fail": "TL;DR non generato. Motivi:\n• {reasons}\n\nSuggerimento: controlla crediti e modelli delle chiavi nei dettagli, oppure prepara il fallback con \"Scarica modelli locali ora\".",
    "tldr.fail.unknown": "errore sconosciuto",
    
    /* History */
    "history.title": "Cronologia",
    "history.search": "Cerca qui…",
    "history.search.label": "Cerca nella cronologia",
    "history.show.all": "Mostra tutte",
    "history.show.recent": "Mostra solo le ultime 5",
    "history.export": "Esporta",
    "history.export.json": "JSON",
    "history.export.json.desc": "Backup completo, re-importabile",
    "history.export.md": "Markdown",
    "history.export.md.desc": "Documento unico leggibile",
    "history.export.txt": "Testo",
    "history.export.txt.desc": "Versione lineare semplice",
    "history.import": "⤒ Importa JSON",
    "history.clear": "Svuota cronologia",
    "history.empty": "Nessuna trascrizione salvata, oppure nessun risultato per la ricerca.",
    "history.note": "Le elaborazioni completate si salvano da sole su questo dispositivo (massimo 20 voci). L'audio non viene conservato: il player è disponibile solo per il file appena elaborato. Usa Esporta/Importa JSON per trasferire la cronologia tra dispositivi.",
    "history.export.single": "Esporta questa voce in Markdown",
    "history.delete": "Elimina",
    "history.delete.label": "Elimina voce",
    "history.deleted": "Voce eliminata dalla cronologia.",
    "history.cleared": "Cronologia svuotata.",
    "history.cleared.confirm": "Eliminare tutte le {count} trascrizioni salvate? L'operazione non si può annullare.",
    "history.loaded": "Voce caricata dalla cronologia.",
    "history.imported": "Importate {added} voci · {dup} duplicati scartati",
    "history.imported.over": " · {over} oltre il limite (20)",
    "history.import.error": "Import non riuscito: il file non è un backup cronologia valido.",
    
    /* Keys */
    "keys.title": "Chiavi API e priorità",
    "keys.portal": "Non hai una chiave? <a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">Ottieni la tua chiave API su {name}<span class=\"kp-ext\">↗</span></a>",
    "keys.portal.custom": "Endpoint personalizzato compatibile OpenAI: inserisci URL base e chiave del tuo fornitore.",
    "keys.portal.anthropic": "⚠️ Anthropic non supporta la trascrizione audio: verrà usato solo per il TL;DR, la trascrizione passerà al prossimo provider della catena.",
    "keys.test": "Testa",
    "keys.test.placeholder": "Incolla qui la chiave API",
    "keys.test.empty": "Incolla prima una chiave da testare.",
    "keys.test.testing": "Verifica in corso…",
    "keys.test.valid": "✓ Chiave valida · {stt} modelli audio e {llm} modelli chat",
    "keys.test.invalid": "✗ {error}",
    "keys.base": "URL base (solo Personalizzato)",
    "keys.save": "Salva API key",
    "keys.save.empty": "Incolla prima una chiave API.",
    "keys.added": "Chiave aggiunta alla bozza. Rilevo i modelli disponibili…",
    "keys.added.models": "Modelli rilevati. Suggeriti: trascrizione {stt}, riepilogo {llm}. Premi Salva ordine provider per attivare.",
    "keys.added.error": "Rilevamento modelli non riuscito ({error}): userò i consigliati del provider. Premi Salva ordine provider per attivare.",
    "keys.chain.save": "Salva ordine provider",
    "keys.chain.unsaved": "Modifiche non salvate",
    "keys.chain.saved": "Ordine provider salvato e attivo.",
    "keys.chain.note": "Le modifiche alla catena restano in bozza finché non premi \"Salva ordine provider\".",
    "keys.details": "dettagli",
    "keys.details.models": "Aggiorna modelli disponibili",
    "keys.details.loading": "Carico i modelli con questa chiave…",
    "keys.details.found": "{stt} modelli audio e {llm} modelli chat trovati.",
    "keys.details.error": "Lettura modelli non riuscita: {error}. Mostro il suggerito.",
    "keys.details.stt": "Modello trascrizione (solo audio)",
    "keys.details.llm": "Modello riepilogo (solo chat)",
    "keys.details.suggested": "Modello suggerito: {model}",
    "keys.details.note.bound": "Stai usando il modello suggerito: in caso di errori l'app passerà al provider successivo.",
    "keys.details.note.unbound": "Preferenza non vincolante: in caso di errori su {model}, l'app proverà {suggested} (stessa chiave) prima di passare al provider successivo.",
    "keys.details.save.pref": "Salva preferenza modello",
    "keys.details.saved.pref": "Preferenza salvata: {model}",
    "keys.details.remove": "Rimuovi chiave",
    "keys.details.removed": "Chiave rimossa dalla bozza.",
    "keys.details.lasterr": "Ultimo errore: {error}",
    "keys.details.lasterr.none": "nessuno",
    "keys.local": "Fallback offline (modelli locali)",
    
    /* Local models */
    "local.title": "Modelli locali (fallback offline)",
    "local.model": "Modello Whisper locale",
    "local.model.tiny": "Tiny — più leggero",
    "local.model.base": "Base — più accurato",
    "local.download": "Scarica modelli locali ora",
    "local.disclaimer": "Il fallback offline scarica i modelli sul dispositivo al primo utilizzo: <b>trascrizione (Whisper)</b> poche decine di MB, <b>riepilogo (modello lingua)</b> alcune centinaia di MB. Preparali in <b>Wi‑Fi</b> con \"Scarica modelli locali ora\": durante il download <b>l'app mantiene lo schermo acceso</b>.",
    "local.wl.ok": "🔆 Schermo mantenuto attivo per il download. Puoi lasciare l'app aperta senza toccare nulla.",
    "local.wl.warn": "⚠️ Il dispositivo non consente di tenere lo schermo acceso: tienilo attivo finché il download non completa.",
    "local.step.stt": "Modello trascrizione (Whisper)",
    "local.step.llm": "Modello riepilogo (TL;DR)",
    "local.step.count": "{current} di {total}",
    "local.done": "✓ Modelli locali pronti in cache. Il fallback funzionerà anche senza rete.",
    "local.error": "Download modelli locali non riuscito: {error}",
    "local.first.stt": "Primo uso della trascrizione locale: scarico il modello Whisper…",
    "local.first.llm": "Primo uso del riepilogo locale: scarico il modello TL;DR…",
    "local.transcribing": "Trascrizione locale in corso…",
    "local.summarizing": "Creo il riepilogo TL;DR locale…",
    "local.webgpu": "Caricamento modello locale con WebGPU…",
    "local.webgpu.fail": "WebGPU non disponibile. Modalità compatibile…",
    
    /* FAQ */
    "faq.title": "Domande frequenti",
    "faq.ios.title": "Perché su iPhone non posso condividere audio da WhatsApp?",
    "faq.ios.body": "È un limite di iOS: il sistema non consente alle app web installate di comparire nel menu Condividi di WhatsApp (su Android e desktop invece funziona).<p><b>Percorso alternativo su iPhone/iPad:</b></p><ol><li>In WhatsApp, tieni premuto il vocale → <b>Inoltra/Condividi</b> → <b>Salva su File</b></li><li>Apri SoundScript e tocca <b>\"Scegli audio\"</b></li><li>Seleziona il file appena salvato dall'app <b>File</b></li></ol><p>Il risultato è identico: trascrizione, TL;DR e player funzionano come al solito.</p>",
    "faq.data.title": "Dove vengono salvati i miei audio e le trascrizioni?",
    "faq.data.body": "Gli audio <b>non</b> vengono conservati: restano in memoria solo per la sessione corrente (player). Le trascrizioni e i TL;DR vivono nella cronologia locale del dispositivo, mai su server. Se ricarichi la pagina per errore, l'ultima sessione resta recuperata come bozza.",
    "faq.tldr.title": "Perché i vocali brevi non ricevono il TL;DR automatico?",
    "faq.tldr.body": "Sotto i 60 secondi il riepilogo è spesso superfluo: lo generi tu con <b>\"Genera TL;DR\"</b> se ti serve. Sopra il minuto parte da solo.",
    
    /* Info */
    "info.title": "Info e aggiornamenti",
    "info.status": "Stato app",
    "info.status.desc": "Si aggiorna quando salvi la catena o scarichi i modelli locali",
    "info.status.offline": "Offline pronto",
    "info.status.api": "API attiva · {count} {count, plural, one {chiave} other {chiavi}}",
    "info.status.local.only": "Solo locale · nessun modello scaricato",
    "info.status.local": "Solo locale",
    "info.theme": "Tema",
    "info.theme.desc": "Auto segue il sistema; Chiaro/Scuro restano fissi",
    "info.theme.auto": "Auto",
    "info.theme.light": "Chiaro",
    "info.theme.dark": "Scuro",
    "info.lang": "Lingua",
    "info.lang.desc": "Auto rileva la lingua del browser; IT/EN restano fissi",
    "info.lang.auto": "Auto",
    "info.notif": "Avvisami a fine elaborazione",
    "info.notif.desc": "Vibrazione (Android) e notifica se sei su un'altra scheda",
    "info.notif.desc.active": "Notifiche attive su questo browser",
    "info.notif.desc.denied": "Permesso negato dal browser: resta la vibrazione",
    "info.notif.desc.pending": "Attivo: il permesso notifiche verrà chiesto alla prossima attivazione",
    "info.notif.desc.vibration": "Attivo: vibrazione (notifiche non supportate qui)",
    "info.backup": "Backup impostazioni",
    "info.backup.desc": "Tema, notifiche, preset e catena provider. Le chiavi API solo nel backup completo.",
    "info.backup.export": "⤓ Esporta",
    "info.backup.export.safe": "🛡️ Sicuro · senza chiavi",
    "info.backup.export.safe.desc": "Condivisibile senza rischi",
    "info.backup.export.full": "🔑 Completo · con chiavi",
    "info.backup.export.full.desc": "Per migrare su un tuo dispositivo — non condividerlo",
    "info.backup.import": "⤒ Importa",
    "info.backup.exported.safe": "Backup sicuro scaricato (senza chiavi API).",
    "info.backup.exported.full": "Backup COMPLETO scaricato: contiene le chiavi API, non condividerlo.",
    "info.backup.import.confirm": "Il backup contiene {count} chiavi API: importare anche la catena provider completa?\n\nOK = importa tutto · Annulla = solo le altre impostazioni",
    "info.backup.imported": "Impostazioni importate.{keys} Ricarico l'app…",
    "info.backup.imported.keys": " Catena e chiavi incluse.",
    "info.backup.import.error": "Import non riuscito: il file non è un backup impostazioni valido.",
    "info.update": "Aggiornamenti",
    "info.update.desc": "Automatici e silenziosi: le nuove versioni si attivano in background",
    "info.update.check": "Controlla",
    "info.update.checking": "Verifica in corso…",
    "info.update.success": "App aggiornata",
    "info.update.success.desc": "Stai usando l'ultima versione disponibile ({version}).",
    "info.update.error": "Errore di connessione",
    "info.update.error.desc": "Impossibile verificare gli aggiornamenti. Riprova più tardi.",
    "info.update.new": "Nuova versione installata",
    "info.update.new.desc": "Sarà attiva dal prossimo avvio dell'app.",
    "info.version": "Versione corrente",
    "info.note": "Nessun toast da confermare: quando esce una nuova versione il service worker si aggiorna da solo e te lo segnaliamo con un avviso leggero. \"Controlla\" serve solo per una verifica manuale.",
    
    /* Toast */
    "toast.close": "Chiudi",
    "toast.copied": "Trascrizione copiata negli appunti.",
    "toast.copied.all": "Trascrizione e riepilogo copiati negli appunti.",
    "toast.shared": "Testo copiato: puoi incollarlo dove vuoi.",
    "toast.share.error": "Impossibile condividere il testo.",
    "toast.exported.txt": "File di testo scaricato.",
    "toast.exported.md": "File Markdown scaricato.",
    "toast.exported.pdf": "Dialogo di stampa aperto.",
    "toast.exported.history": "Cronologia esportata in JSON.",
    "toast.exported.single": "Voce esportata in Markdown.",
    "toast.preset.saved": "Preset salvato: {name}.",
    "toast.preset.applied": "Preset applicato: {name}.",
    "toast.preset.deleted": "Preset eliminato.",
    "toast.preset.empty": "Scrivi un nome per il preset.",
    "toast.theme": "Tema: {theme}.",
    "toast.lang": "Lingua cambiata: {lang}.",
    "toast.notif.on": "Avvisi di fine elaborazione attivati.",
    "toast.notif.off": "Avvisi di fine elaborazione disattivati.",
    "toast.draft.restored": "Bozza ripristinata dopo il ricaricamento.",
    "toast.paste.ok": "Audio ricevuto dagli appunti.",
    "toast.paste.error": "Negli appunti non c'è un audio utilizzabile.",
    "toast.shortcut.new": "Nuova trascrizione: tocca Scegli audio.",
    "toast.shortcut.history": "Cronologia aperta.",
    "toast.share.error.receive": "Non è stato possibile ricevere l'audio. Riprova.",
    "toast.share.error.notfound": "Audio condiviso non trovato. Prova a condividerlo di nuovo.",
    "toast.share.error.generic": "Errore nella ricezione dell'audio condiviso. Riprova.",
    "toast.empty": "Il file audio è vuoto o non valido.",
    "toast.busy": "Attendi che termini l'elaborazione in corso.",
    "toast.no.transcript": "Nessuna trascrizione da riassumere: elabora prima un audio.",
    "toast.cancelled": "Elaborazione annullata.",
    "toast.chain.fallback": "{engine} non disponibile ({error}): provo la successiva…",
    "toast.chain.retry": "{engine}: {reason}, riprovo tra 1,5 s…",
    "toast.chain.retry.rate": "limite di frequenza",
    "toast.chain.retry.server": "errore del provider",
    "toast.chain.retry.network": "rete instabile o timeout",
    "toast.chain.exhausted": "Nessuna chiave né il modello locale hanno riconosciuto testo.",
    "toast.tldr.fallback": "{engine} non disponibile per il TL;DR: provo la successiva…",
    "toast.tldr.model.fallback": "{engine}: il modello scelto ha dato errore, uso il suggerito {model}…",
    "toast.history.empty": "Cronologia vuota: niente da esportare.",
    
    /* Errors */
    "error.abort": "richiesta annullata",
    "error.key.invalid": "chiave non valida (HTTP {status})",
    "error.credits": "crediti esauriti (HTTP 402)",
    "error.rate": "limite di frequenza (HTTP 429)",
    "error.model": "modello o richiesta non valida (HTTP 400)",
    "error.notfound": "modello non trovato (HTTP 404)",
    "error.server": "errore del provider (HTTP {status})",
    "error.network": "errore di rete o CORS",
    "error.unknown": "errore sconosciuto",
    "error.audio.decode": "Il browser non supporta la decodifica audio richiesta.",
    "error.copy": "Copia negli appunti non riuscita.",
    "error.cache": "La cache del browser non è disponibile.",
    "error.sw": "Registrazione service worker fallita:",
    "error.wl": "Wake lock non disponibile:",
    "error.player": "Player audio non disponibile:",
    "error.history.save": "Salvataggio cronologia non riuscito:",
    
    /* Misc */
    "misc.engine.local": "locale",
    "misc.engine.api": "API {engine}",
    "misc.from.history": "dalla cronologia",
    "misc.session.restored": "sessione ripristinata",
    "misc.duration.unknown": "n/d",
    "misc.seconds": "s",
    "misc.minutes": "min"
  },
  
  en: {
    /* Hero */
    "hero.sub": "Share an audio from WhatsApp or pick it here. The app tries the keys in order and falls back to local models.",
    
    /* Features */
    "features.label": "What the app does",
    "features.local.title": "Local processing",
    "features.local.desc": "Whisper and Qwen models run on your device. Zero data to the cloud.",
    "features.chain.title": "Smart API chain",
    "features.chain.desc": "Configure multiple providers. If one runs out of credits, the app moves to the next.",
    "features.share.title": "Direct sharing",
    "features.share.desc": "Share a voice note from WhatsApp straight to SoundScript.",
    
    /* Drop zone */
    "drop.title": "Drop an audio here",
    "drop.sub": "or tap to pick a file, or paste it with Ctrl+V",
    "drop.pick": "Pick audio",
    
    /* Status */
    "status.ready": "Ready.",
    "status.cancel": "Cancel",
    "status.preparing": "Preparing audio…",
    "status.transcribing": "Transcribing with {engine}…",
    "status.summarizing": "Summarizing TL;DR with {engine}…",
    "status.complete": "Completed and saved to history.",
    "status.error": "Unable to process audio: {error}",
    "status.aborted": "Processing cancelled. Ready to retry.",
    
    /* Transcript card */
    "transcript.label": "Transcription",
    "transcript.new": "↺ New",
    "transcript.new.title": "Clear fields and start over",
    "transcript.engine": "Engine:",
    "transcript.duration": "Duration:",
    "transcript.copy": "Copy transcription",
    "transcript.share": "Share",
    "transcript.export": "Export",
    "transcript.copy.all": "Copy all",
    
    /* Export menu */
    "export.txt": "Text (.txt)",
    "export.txt.desc": "Plain text, for quick notes",
    "export.md": "Markdown (.md)",
    "export.md.desc": "With headings and metadata",
    "export.pdf": "PDF (print)",
    "export.pdf.desc": "Sheet with logo → \"Save as PDF\"",
    
    /* Player */
    "player.play": "Play or pause",
    "player.back": "Back 10 seconds",
    "player.fwd": "Forward 10 seconds",
    "player.speed": "Playback speed",
    
    /* TL;DR */
    "tldr.title": "TL;DR summary",
    "tldr.auto.note": "Audio over one minute ({duration}): summary is generated automatically.",
    "tldr.auto.note.short": "Short audio ({duration}): transcription completed. Summary was not generated automatically.",
    "tldr.auto.note.unknown": "Duration unreadable: summary is generated automatically.",
    "tldr.length": "Length",
    "tldr.length.short": "Short · 1 sentence",
    "tldr.length.medium": "Medium · 3 sentences",
    "tldr.length.long": "Long · paragraph",
    "tldr.style": "Style",
    "tldr.style.narrative": "Narrative",
    "tldr.style.list": "Bulleted list",
    "tldr.style.actions": "Actions and deadlines",
    "tldr.style.formal": "Formal",
    "tldr.style.friendly": "Friendly",
    "tldr.lang": "Summary language",
    "tldr.lang.it": "Italian",
    "tldr.lang.auto": "Automatic · audio language",
    "tldr.custom": "Custom instructions",
    "tldr.custom.placeholder": "e.g. highlight only dates and people's names",
    "tldr.prompt": "Prompt preview sent to the model",
    "tldr.presets": "Saved presets",
    "tldr.presets.name": "Preset name (e.g. Quick deadlines)",
    "tldr.presets.save": "Save preset",
    "tldr.generate": "Generate TL;DR",
    "tldr.regenerate": "⟳ Regenerate TL;DR",
    "tldr.empty": "The TL;DR will appear here after processing.",
    "tldr.fail": "TL;DR not generated. Reasons:\n• {reasons}\n\nTip: check credits and models of the keys in details, or prepare the fallback with \"Download local models now\".",
    "tldr.fail.unknown": "unknown error",
    
    /* History */
    "history.title": "History",
    "history.search": "Search here…",
    "history.search.label": "Search in history",
    "history.show.all": "Show all",
    "history.show.recent": "Show only last 5",
    "history.export": "Export",
    "history.export.json": "JSON",
    "history.export.json.desc": "Full backup, re-importable",
    "history.export.md": "Markdown",
    "history.export.md.desc": "Single readable document",
    "history.export.txt": "Text",
    "history.export.txt.desc": "Simple linear version",
    "history.import": "⤒ Import JSON",
    "history.clear": "Clear history",
    "history.empty": "No saved transcriptions, or no results for the search.",
    "history.note": "Completed transcriptions are saved automatically on this device (max 20 entries). Audio is not kept: the player is available only for the file just processed. Use Export/Import JSON to transfer history between devices.",
    "history.export.single": "Export this entry to Markdown",
    "history.delete": "Delete",
    "history.delete.label": "Delete entry",
    "history.deleted": "Entry deleted from history.",
    "history.cleared": "History cleared.",
    "history.cleared.confirm": "Delete all {count} saved transcriptions? This operation cannot be undone.",
    "history.loaded": "Entry loaded from history.",
    "history.imported": "Imported {added} entries · {dup} duplicates discarded",
    "history.imported.over": " · {over} over the limit (20)",
    "history.import.error": "Import failed: the file is not a valid history backup.",
    
    /* Keys */
    "keys.title": "API keys and priority",
    "keys.portal": "Don't have a key? <a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">Get your API key on {name}<span class=\"kp-ext\">↗</span></a>",
    "keys.portal.custom": "Custom OpenAI-compatible endpoint: enter base URL and key from your provider.",
    "keys.portal.anthropic": "⚠️ Anthropic does not support audio transcription: it will be used only for TL;DR, transcription will pass to the next provider in the chain.",
    "keys.test": "Test",
    "keys.test.placeholder": "Paste the API key here",
    "keys.test.empty": "Paste a key to test first.",
    "keys.test.testing": "Testing…",
    "keys.test.valid": "✓ Valid key · {stt} audio models and {llm} chat models",
    "keys.test.invalid": "✗ {error}",
    "keys.base": "Base URL (Custom only)",
    "keys.save": "Save API key",
    "keys.save.empty": "Paste an API key first.",
    "keys.added": "Key added to draft. Detecting available models…",
    "keys.added.models": "Models detected. Suggested: transcription {stt}, summary {llm}. Press Save provider order to activate.",
    "keys.added.error": "Model detection failed ({error}): I'll use the provider's recommendations. Press Save provider order to activate.",
    "keys.chain.save": "Save provider order",
    "keys.chain.unsaved": "Unsaved changes",
    "keys.chain.saved": "Provider order saved and active.",
    "keys.chain.note": "Chain edits stay as draft until you press \"Save provider order\".",
    "keys.details": "details",
    "keys.details.models": "Refresh available models",
    "keys.details.loading": "Loading models with this key…",
    "keys.details.found": "{stt} audio models and {llm} chat models found.",
    "keys.details.error": "Model reading failed: {error}. Showing the suggestion.",
    "keys.details.stt": "Transcription model (audio only)",
    "keys.details.llm": "Summary model (chat only)",
    "keys.details.suggested": "Suggested model: {model}",
    "keys.details.note.bound": "You're using the suggested model: in case of errors the app will move to the next provider.",
    "keys.details.note.unbound": "Non-binding preference: in case of errors on {model}, the app will try {suggested} (same key) before moving to the next provider.",
    "keys.details.save.pref": "Save model preference",
    "keys.details.saved.pref": "Preference saved: {model}",
    "keys.details.remove": "Remove key",
    "keys.details.removed": "Key removed from draft.",
    "keys.details.lasterr": "Last error: {error}",
    "keys.details.lasterr.none": "none",
    "keys.local": "Offline fallback (local models)",
    
    /* Local models */
    "local.title": "Local models (offline fallback)",
    "local.model": "Local Whisper model",
    "local.model.tiny": "Tiny — lighter",
    "local.model.base": "Base — more accurate",
    "local.download": "Download local models now",
    "local.disclaimer": "The offline fallback downloads the models on your device on first use: <b>transcription (Whisper)</b> a few tens of MB, <b>summary (language model)</b> a few hundred MB. Prepare them on <b>Wi-Fi</b> with \"Download local models now\": during download <b>the app keeps the screen on</b>.",
    "local.wl.ok": "🔆 Screen kept on for download. You can leave the app open without touching anything.",
    "local.wl.warn": "⚠️ The device doesn't allow keeping the screen on: keep it active until the download completes.",
    "local.step.stt": "Transcription model (Whisper)",
    "local.step.llm": "Summary model (TL;DR)",
    "local.step.count": "{current} of {total}",
    "local.done": "✓ Local models ready in cache. The fallback will work even offline.",
    "local.error": "Local models download failed: {error}",
    "local.first.stt": "First use of local transcription: downloading Whisper model…",
    "local.first.llm": "First use of local summary: downloading TL;DR model…",
    "local.transcribing": "Local transcription in progress…",
    "local.summarizing": "Creating local TL;DR summary…",
    "local.webgpu": "Loading local model with WebGPU…",
    "local.webgpu.fail": "WebGPU not available. Compatible mode…",
    
    /* FAQ */
    "faq.title": "Frequently asked questions",
    "faq.ios.title": "Why can't I share audio from WhatsApp on iPhone?",
    "faq.ios.body": "It's an iOS limitation: the system doesn't allow installed web apps to appear in WhatsApp's share menu (on Android and desktop it works instead).<p><b>Alternative path on iPhone/iPad:</b></p><ol><li>In WhatsApp, long-press the voice note → <b>Forward/Share</b> → <b>Save to Files</b></li><li>Open SoundScript and tap <b>\"Pick audio\"</b></li><li>Select the file just saved from the <b>Files</b> app</li></ol><p>The result is identical: transcription, TL;DR and player work as usual.</p>",
    "faq.data.title": "Where are my audio and transcriptions saved?",
    "faq.data.body": "Audio is <b>not</b> kept: it stays in memory only for the current session (player). Transcriptions and TL;DRs live in the device's local history, never on servers. If you accidentally reload the page, the last session is recovered as a draft.",
    "faq.tldr.title": "Why don't short voice notes get automatic TL;DR?",
    "faq.tldr.body": "Under 60 seconds the summary is often unnecessary: you generate it with <b>\"Generate TL;DR\"</b> if you need it. Over one minute it starts automatically.",
    
    /* Info */
    "info.title": "Info and updates",
    "info.status": "App status",
    "info.status.desc": "Updates when you save the chain or download local models",
    "info.status.offline": "Offline ready",
    "info.status.api": "API active · {count} {count, plural, one {key} other {keys}}",
    "info.status.local.only": "Local only · no models downloaded",
    "info.status.local": "Local only",
    "info.theme": "Theme",
    "info.theme.desc": "Auto follows the system; Light/Dark stay fixed",
    "info.theme.auto": "Auto",
    "info.theme.light": "Light",
    "info.theme.dark": "Dark",
    "info.lang": "Language",
    "info.lang.desc": "Auto detects browser language; IT/EN stay fixed",
    "info.lang.auto": "Auto",
    "info.notif": "Notify me when done",
    "info.notif.desc": "Vibration (Android) and notification if you're on another tab",
    "info.notif.desc.active": "Notifications active on this browser",
    "info.notif.desc.denied": "Permission denied by browser: vibration remains",
    "info.notif.desc.pending": "Active: notification permission will be asked on next activation",
    "info.notif.desc.vibration": "Active: vibration (notifications not supported here)",
    "info.backup": "Settings backup",
    "info.backup.desc": "Theme, notifications, presets and provider chain. API keys only in the full backup.",
    "info.backup.export": "⤓ Export",
    "info.backup.export.safe": "🛡️ Safe · no keys",
    "info.backup.export.safe.desc": "Shareable without risks",
    "info.backup.export.full": "🔑 Full · with keys",
    "info.backup.export.full.desc": "To migrate to your device — don't share it",
    "info.backup.import": "⤒ Import",
    "info.backup.exported.safe": "Safe backup downloaded (without API keys).",
    "info.backup.exported.full": "FULL backup downloaded: contains API keys, don't share it.",
    "info.backup.import.confirm": "The backup contains {count} API keys: also import the complete provider chain?\n\nOK = import everything · Cancel = other settings only",
    "info.backup.imported": "Settings imported.{keys} Reloading the app…",
    "info.backup.imported.keys": " Chain and keys included.",
    "info.backup.import.error": "Import failed: the file is not a valid settings backup.",
    "info.update": "Updates",
    "info.update.desc": "Automatic and silent: new versions activate in the background",
    "info.update.check": "Check",
    "info.update.checking": "Checking…",
    "info.update.success": "App updated",
    "info.update.success.desc": "You're using the latest available version ({version}).",
    "info.update.error": "Connection error",
    "info.update.error.desc": "Unable to check for updates. Try again later.",
    "info.update.new": "New version installed",
    "info.update.new.desc": "It will be active on next launch.",
    "info.version": "Current version",
    "info.note": "No toast to confirm: when a new version comes out the service worker updates itself and we signal it with a light notification. \"Check\" is only for manual verification.",
    
    /* Toast */
    "toast.close": "Close",
    "toast.copied": "Transcription copied to clipboard.",
    "toast.copied.all": "Transcription and summary copied to clipboard.",
    "toast.shared": "Text copied: you can paste it anywhere.",
    "toast.share.error": "Unable to share text.",
    "toast.exported.txt": "Text file downloaded.",
    "toast.exported.md": "Markdown file downloaded.",
    "toast.exported.pdf": "Print dialog opened.",
    "toast.exported.history": "History exported to JSON.",
    "toast.exported.single": "Entry exported to Markdown.",
    "toast.preset.saved": "Preset saved: {name}.",
    "toast.preset.applied": "Preset applied: {name}.",
    "toast.preset.deleted": "Preset deleted.",
    "toast.preset.empty": "Write a name for the preset.",
    "toast.theme": "Theme: {theme}.",
    "toast.lang": "Language changed: {lang}.",
    "toast.notif.on": "End-of-processing notifications enabled.",
    "toast.notif.off": "End-of-processing notifications disabled.",
    "toast.draft.restored": "Draft restored after reload.",
    "toast.paste.ok": "Audio received from clipboard.",
    "toast.paste.error": "No usable audio in the clipboard.",
    "toast.shortcut.new": "New transcription: tap Pick audio.",
    "toast.shortcut.history": "History opened.",
    "toast.share.error.receive": "Unable to receive audio. Try again.",
    "toast.share.error.notfound": "Shared audio not found. Try sharing it again.",
    "toast.share.error.generic": "Error receiving shared audio. Try again.",
    "toast.empty": "The audio file is empty or invalid.",
    "toast.busy": "Wait for the current processing to finish.",
    "toast.no.transcript": "No transcription to summarize: process an audio first.",
    "toast.cancelled": "Processing cancelled.",
    "toast.chain.fallback": "{engine} not available ({error}): trying the next one…",
    "toast.chain.retry": "{engine}: {reason}, retrying in 1.5s…",
    "toast.chain.retry.rate": "rate limit",
    "toast.chain.retry.server": "provider error",
    "toast.chain.retry.network": "unstable network or timeout",
    "toast.chain.exhausted": "No key nor the local model recognized text.",
    "toast.tldr.fallback": "{engine} not available for TL;DR: trying the next one…",
    "toast.tldr.model.fallback": "{engine}: chosen model gave error, using suggested {model}…",
    "toast.history.empty": "History empty: nothing to export.",
    
    /* Errors */
    "error.abort": "request cancelled",
    "error.key.invalid": "invalid key (HTTP {status})",
    "error.credits": "credits exhausted (HTTP 402)",
    "error.rate": "rate limit (HTTP 429)",
    "error.model": "invalid model or request (HTTP 400)",
    "error.notfound": "model not found (HTTP 404)",
    "error.server": "provider error (HTTP {status})",
    "error.network": "network or CORS error",
    "error.unknown": "unknown error",
    "error.audio.decode": "The browser doesn't support the required audio decoding.",
    "error.copy": "Copy to clipboard failed.",
    "error.cache": "Browser cache is not available.",
    "error.sw": "Service worker registration failed:",
    "error.wl": "Wake lock not available:",
    "error.player": "Audio player not available:",
    "error.history.save": "History save failed:",
    
    /* Misc */
    "misc.engine.local": "local",
    "misc.engine.api": "API {engine}",
    "misc.from.history": "from history",
    "misc.session.restored": "session restored",
    "misc.duration.unknown": "n/a",
    "misc.seconds": "s",
    "misc.minutes": "min"
  }
};

/* ===== Stato lingua ===== */
const KEY = "ss-app-lang";

export function detectLang() {
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("it") ? "it" : "en";
}

export function getLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "it" || saved === "en") return saved;
  } catch (e) {}
  return detectLang();
}

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch (e) {}
}

/* ===== Funzione t() per recuperare stringhe ===== */
export function t(key, params = {}) {
  const lang = getLang();
  let str = I18N[lang]?.[key] || I18N.it[key] || key;
  
  /* Sostituzione parametri: {key} → value */
  Object.keys(params).forEach(k => {
    str = str.replace(new RegExp(`\\{${k}\\}`, "g"), params[k]);
  });
  
  return str;
}

/* ===== Applicazione lingua al DOM ===== */
export function applyLang(lang) {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const paramsAttr = el.getAttribute("data-i18n-params");
    let params = {};
    if (paramsAttr) {
      try {
        params = JSON.parse(paramsAttr);
      } catch (e) {}
    }
    const text = t(key, params);
    
    /* Se l'elemento contiene HTML (es. link), usa innerHTML */
    if (el.hasAttribute("data-i18n-html")) {
      el.innerHTML = text;
    } else {
      el.textContent = text;
    }
  });
  
  /* Aggiorna placeholder */
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = t(key);
  });
  
  /* Aggiorna aria-label */
  document.querySelectorAll("[data-i18n-aria]").forEach(el => {
    const key = el.getAttribute("data-i18n-aria");
    el.setAttribute("aria-label", t(key));
  });
  
  /* Aggiorna title */
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.getAttribute("data-i18n-title");
    el.setAttribute("title", t(key));
  });
}

export function changeLang(lang) {
  applyLang(lang);
  setLang(lang);
}