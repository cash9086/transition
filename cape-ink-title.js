/*
 * cape-ink-title — il titolo della sezione ink-bleed di The Cape Studio.
 *
 * Il titolo non e' piu' testo dipinto dal browser: e' il buco che
 * l'inchiostro non riempie. La lettera viene consegnata alla simulazione
 * come ostacolo — l'inchiostro ci sbatte contro, rallenta, le gira intorno —
 * e cio' che resta scoperto e' la slide scura di sotto. Il nero delle
 * lettere quindi non e' un colore scelto: e' quello che c'e' sotto
 * l'inchiostro.
 *
 * Sopra ci sta l'assorbimento: appena l'inchiostro arriva, la riserva e'
 * larga quanto la lettera sfocata — una macchia gonfia dal bordo morbido —
 * e si ritira fino alla forma esatta man mano che la carta beve. Ogni
 * lettera comincia quando l'inchiostro ci arriva, quindi si asciugano
 * sfalsate senza che nessuna sequenza sia scritta da qualche parte.
 *
 * COSA SERVE IN PAGINA: niente. Due tag <script> nel footer, questo dopo
 * ink-transition.js. Tutti i numeri stanno qui sotto: per cambiarli si
 * cambia questo file e si aggiorna lo SHA nell'indirizzo, senza rientrare
 * nel custom code di Webflow.
 *
 * IL TESTO invece resta in Webflow, dentro .ink-title, e si modifica dal
 * Designer come qualunque altro testo: questo modulo lo legge, lo nasconde
 * agli occhi (non agli screen reader) e lo ridisegna dentro l'inchiostro
 * con il carattere e il corpo che gli trova addosso.
 */
(function (global) {
  "use strict";

  var I = {
    /* ——— dove ——————————————————————————————————————————————————— */
    pin:    ".ink-pin",
    stick:  ".ink-stick",
    titolo: "[data-ink-reveal], .ink-title",

    /* ——— aspetto del titolo ————————————————————————————————————— */
    famiglia:   '"Glamor-LightCondensed","Oswald","Archivo Narrow",sans-serif',
    peso:       "300",
    corpo:      "150px",   /* su schermo largo; sotto scende, vedi vesti() */
    interlinea: ".9",
    spaziatura: ".02em",
    colore:     "#141416", /* conta solo nel ripiego a testo visibile */

    /* ——— l'inchiostro ———————————————————————————————————————————
       freno        quanto l'inchiostro rallenta dentro la lettera.
                    Basso = ci passa quasi attraverso e la scia dietro la
                    lettera e' leggera; alto = la aggira del tutto e lascia
                    una scia scura piu' lunga.
       asciugatura  quanto ci mette la macchia gonfia a ritirarsi fino alla
                    lettera. A 0 la lettera e' netta dal primo istante.
       pulizia      raggio, in celle, entro cui i micro-buchi
                    dell'inchiostro vengono chiusi ACCANTO alle lettere.
                    Fuori da quella fascia il foglio resta sporco: e' lo
                    sporco a far sembrare inchiostro l'inchiostro.
       bagnato      quanto e' larga la macchia nel primo istante. */
    freno:       0.70,
    asciugatura: 0.10,
    pulizia:     5,
    bagnato:     7,

    inkTime: 6.999,
    dyeRes:  768,

    /* ——— il cursore del sito ————————————————————————————————————
       Il cursore su misura decide il proprio colore leggendo il DOM sotto
       il puntatore. Sopra questa sezione pero' non c'e' un elemento da
       leggere: c'e' una simulazione. Quindi glielo diciamo noi.
         cursore        l'elemento, e la variabile CSS con cui si colora
         suBianco       colore sul bianco dell'inchiostro
         suScuro        colore sulla lettera, o dove l'inchiostro non e'
                        ancora arrivato e sotto si vede la slide */
    cursore:     "#capecur",
    cursoreVar:  "--cc",
    suBianco:    "#141416",
    suScuro:     "#ffffff",

    /* ——— avvio ——————————————————————————————————————————————————
       Su desktop il calcolo si paga sotto il preloader, mentre l'utente sta
       gia' aspettando. Su telefono no: allungherebbe troppo l'apertura. */
    preparaDa:    992,
    salvagenteMs: 15000,
    attesaFont:   3000
  };

  var titolo = null, sezione = null, partito = false;
  var pin = null, copriva = false, svegliaCursore = null;
  var pronto = false, salvagente = 0;

  /* ——— il preloader: invariato ————————————————————————————————— */
  function annuncia() {
    if (pronto) return;
    pronto = true;
    clearTimeout(salvagente);
    document.documentElement.classList.add("ink-pronto");
    document.dispatchEvent(new CustomEvent("cape:ink-pronto"));
  }

  /* ——— si puo' fare l'inchiostro su questa macchina? ————————————
     Va chiesto PRIMA di nascondere il titolo. Se si nasconde e poi il
     modulo ripiega su una spazzata senza simulazione, il titolo non lo
     disegna piu' nessuno e sparisce per sempre. */
  function haInchiostro() {
    if (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    try {
      var c = document.createElement("canvas");
      var g = c.getContext("webgl2", { alpha: true, depth: false, stencil: false });
      return !!(g && g.getExtension("EXT_color_buffer_float"));
    } catch (e) { return false; }
  }

  /* ——— il vestito ————————————————————————————————————————————
     Le stesse proprieta' servono due volte: al browser per dare al testo
     una misura, e a noi per rileggerle da li' e ridisegnarlo dentro
     l'inchiostro. Una sola fonte, quindi, e resta sovrascrivibile dal
     custom code della pagina se un domani serve. */
  /* Il testo vero sparisce dagli occhi solo adesso, e solo perche' al suo
     posto c'e' il disegno. Resta nel documento, quindi uno screen reader e
     Google continuano a leggerlo. */
  function nascondi() {
    var css = document.getElementById("cape-ink-title-css");
    if (css && css.textContent.indexOf(".ink-title{opacity:0}") < 0) {
      css.textContent += "\n.ink-title{opacity:0}";
    }
  }

  function vesti(nascondere) {
    if (document.getElementById("cape-ink-title-css")) return;
    var s = document.createElement("style");
    s.id = "cape-ink-title-css";
    s.textContent =
      ".ink-title{" +
        "font-family:" + I.famiglia + ";" +
        "font-weight:" + I.peso + ";" +
        "font-size:" + I.corpo + ";" +
        "line-height:" + I.interlinea + ";" +
        "letter-spacing:" + I.spaziatura + ";" +
        "color:" + I.colore + ";" +
      "}\n" +
      /* Il corpo pieno vale finche' c'e' schermo. Sotto scende in
         proporzione e non risale mai oltre: e' min(), non una seconda
         misura fissa. */
      "@media (max-width:1200px){.ink-title{font-size:min(" + I.corpo + ",12.5vw)}}\n" +
      "@media (max-width:600px){.ink-title{font-size:11vw;line-height:1}}\n" +
      /* Mentre l'inchiostro copre lo schermo, il mouse e' suo. Senza questa
         riga gli eventi passano attraverso e arrivano alla sezione di sotto,
         che e' li' ma non si vede: si finisce a illuminare lo stato di una
         foto che l'utente non sta guardando. Si accende solo a inchiostro
         avviato — prima la sezione e' trasparente e sotto c'e' roba vera con
         cui ha senso poter interagire. */
      ".ink-pin.ink-copre .ink-stick{pointer-events:auto}\n" +
      /* Invisibile, non rimosso: resta nel documento con la sua misura,
         perche' e' da li' che si legge come va disegnato, e resta leggibile
         da uno screen reader e da Google. Se questo file non gira, questa
         riga non viene mai scritta e il titolo si vede normalmente. */
      (nascondere ? ".ink-title{opacity:0}\n" : "");
    document.head.appendChild(s);
  }

  /* ——— lo scoglio ————————————————————————————————————————————
     Il motore passa un contesto 2D grande quanto la griglia dell'inchiostro
     e chiede di dipingere di bianco cio' che e' solido. Non sa che siano
     lettere, e non deve saperlo. */
  function scoglio(ctx, w, h) {
    if (!titolo) return;
    var rect = titolo.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var st = global.getComputedStyle(titolo);
    var testo = (titolo.textContent || "").replace(/\s+/g, " ").trim();
    if (!testo) return;

    /* Da pixel CSS a celle della griglia. */
    var k = w / rect.width;
    var corpo = (parseFloat(st.fontSize) || 150) * k;
    var sp = (st.letterSpacing === "normal" ? 0 : parseFloat(st.letterSpacing) || 0) * k;
    var alt = (parseFloat(st.lineHeight) || (corpo / k)) * k;

    ctx.font = st.fontWeight + " " + corpo + "px " + st.fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    function largo(t) {
      var l = 0;
      for (var i = 0; i < t.length; i++) l += ctx.measureText(t[i]).width + sp;
      return l - (t.length ? sp : 0);
    }

    /* Le righe: si va a capo solo se non ci sta, e solo su uno spazio —
       come fa il titolo in pagina sotto i 600px. */
    var righe = [], corrente = "", parole = testo.split(" "), i;
    var tetto = w * 0.94;
    for (i = 0; i < parole.length; i++) {
      var prova = corrente ? corrente + " " + parole[i] : parole[i];
      if (corrente && largo(prova) > tetto) { righe.push(corrente); corrente = parole[i]; }
      else corrente = prova;
    }
    if (corrente) righe.push(corrente);

    /* Le maiuscole si centrano sull'altezza delle maiuscole, non sulla
       riga: con un titolo tutto in maiuscolo, centrare sulla riga lo fa
       sedere basso. */
    var m = ctx.measureText("H");
    var mezzeMaiuscole = (m.actualBoundingBoxAscent || corpo * 0.7) / 2;
    var y0 = h / 2 - (righe.length - 1) * alt / 2 + mezzeMaiuscole;

    for (i = 0; i < righe.length; i++) {
      var r = righe[i], x = w / 2 - largo(r) / 2, y = y0 + i * alt;
      for (var j = 0; j < r.length; j++) {
        var c = r[j], lc = ctx.measureText(c).width;
        ctx.fillText(c, x + lc / 2, y);
        x += lc + sp;
      }
    }
  }

  /* ——— il colore del cursore ————————————————————————————————————
     Si scrive la VARIABILE, non la classe. La classe la gestisce gia' lo
     script del cursore, che la ricalcola a ogni movimento del mouse: in due
     a scrivere la stessa cosa ci si accapiglia e si vede sfarfallare. Uno
     stile inline sulla variabile invece vince su tutte e due le regole del
     suo foglio di stile, e lui puo' continuare a fare quello che ha sempre
     fatto senza che nessuno dei due debba sapere dell'altro.

     Fuori da questa sezione la variabile viene tolta, non impostata: il
     controllo torna intero a chi ce l'aveva. */
  function pilotaCursore() {
    if (!global.matchMedia || !global.matchMedia("(min-width:992px) and (hover:hover)").matches) return null;
    var cc = document.querySelector(I.cursore);
    if (!cc || !sezione || typeof sezione.inkLightAt !== "function") return null;

    var mx = -1, my = -1, atteso = false, ultimo = null;

    function applica() {
      atteso = false;
      var l = sezione.inkLightAt(mx, my);
      var v = l === null ? null : (l ? I.suBianco : I.suScuro);
      if (v === ultimo) return;
      ultimo = v;
      if (v) cc.style.setProperty(I.cursoreVar, v);
      else cc.style.removeProperty(I.cursoreVar);
    }

    function sveglia() {
      if (atteso) return;
      atteso = true;
      global.requestAnimationFrame(applica);
    }

    global.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      sveglia();
    }, { passive: true });

    /* Serve anche a mouse fermo: sotto scorre la sezione e l'inchiostro
       avanza, quindi cambia il fondo senza che il puntatore si muova. */
    return sveglia;
  }

  /* ——— avvio ————————————————————————————————————————————————— */
  function monta(conInchiostro) {
    if (partito) return;
    partito = true;

    var opzioni = {
      pin: I.pin,
      stick: I.stick,
      transparent: true,
      letterColor: I.colore,
      bakeBudgetMs: 4,
      params: {
        inkTime: I.inkTime,
        dyeRes:  I.dyeRes,
        block:   I.freno,
        dry:     I.asciugatura,
        clean:   I.pulizia,
        wet:     I.bagnato
      },
      onProgress: function (p) {
        if (svegliaCursore) svegliaCursore();
        if (!pin) return;
        var copre = p > 0.015;
        if (copre !== copriva) { copriva = copre; pin.classList.toggle("ink-copre", copre); }
      },
      onBakeProgress: function (p) {
        document.documentElement.style.setProperty("--ink-avanzamento", (p * 100).toFixed(1) + "%");
      },
      onReady: function () {
        if (conInchiostro && sezione && sezione.hasObstacle && sezione.hasObstacle()) nascondi();
        if (conInchiostro && !svegliaCursore) svegliaCursore = pilotaCursore();
        annuncia();
      }
    };

    if (conInchiostro) opzioni.obstacle = scoglio;
    /* Senza inchiostro il titolo resta testo vero e si limita a comparire,
       come faceva prima che tutto questo esistesse. */
    else opzioni.reveal = I.titolo;

    sezione = InkTransition.mount(opzioni);
    global.inkSection = sezione;


    var anticipa = sezione && global.innerWidth >= I.preparaDa && sezione.prepare();
    if (!anticipa) annuncia();
  }

  function boot() {
    /* rete di sicurezza: se il calcolo non finisce mai — scheda che
       rinuncia, scheda del browser aperta in secondo piano — il preloader
       non deve restare su per sempre */
    salvagente = setTimeout(annuncia, I.salvagenteMs);

    pin = document.querySelector(I.pin);
    if (!global.InkTransition || !pin) { annuncia(); return; }

    titolo = document.querySelector(I.titolo);
    var conInchiostro = haInchiostro();
    /* Il vestito si mette subito, il nascondere no: quello si decide a
       calcolo finito, quando si sa che lo scoglio e' stato davvero
       disegnato. Nascondere un titolo che poi nessuno disegna vuol dire
       perderlo, ed e' esattamente il tipo di guasto che non si nota in
       prova e si nota in pagina. */
    if (titolo) vesti(false);

    /* Lo scoglio ha la forma del carattere: aspettarlo non e' un vezzo, con
       il ripiego la lettera avrebbe un'altra larghezza e un altro spessore.
       Non basta document.fonts.ready: quello promette solo che non ci sono
       caricamenti IN CORSO, e un font che nessuno ha ancora chiesto non e'
       un caricamento in corso. Si chiede esattamente la combinazione che
       servira' al canvas. Ma non si aspetta all'infinito. */
    if (conInchiostro && titolo && document.fonts && document.fonts.load) {
      var fatto = false;
      var poi = function () { if (fatto) return; fatto = true; monta(true); };
      var t = setTimeout(poi, I.attesaFont);
      var st = global.getComputedStyle(titolo);
      var spec = st.fontStyle + " " + st.fontWeight + " " + st.fontSize + " " + st.fontFamily;
      var attese = [];
      try { attese.push(document.fonts.load(spec, "AHMO")); } catch (e) {}
      if (document.fonts.ready) attese.push(document.fonts.ready);
      Promise.all(attese).then(function () { clearTimeout(t); poi(); },
                               function () { clearTimeout(t); poi(); });
    } else {
      monta(conInchiostro);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.CapeInkTitle = { impostazioni: I, ridisegna: function () { if (sezione && sezione.redrawObstacle) sezione.redrawObstacle(); } };
})(typeof window !== "undefined" ? window : this);
