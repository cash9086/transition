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

    /* ——— avvio ——————————————————————————————————————————————————
       Su desktop il calcolo si paga sotto il preloader, mentre l'utente sta
       gia' aspettando. Su telefono no: allungherebbe troppo l'apertura. */
    preparaDa:    992,
    salvagenteMs: 15000,
    attesaFont:   3000
  };

  var titolo = null, sezione = null, partito = false;
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
  function vesti(nascondi) {
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
      /* Invisibile, non rimosso: resta nel documento con la sua misura,
         perche' e' da li' che si legge come va disegnato, e resta leggibile
         da uno screen reader e da Google. Se questo file non gira, questa
         riga non viene mai scritta e il titolo si vede normalmente. */
      (nascondi ? ".ink-title{opacity:0}\n" : "");
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

  /* ——— avvio ————————————————————————————————————————————————— */
  function monta(conInchiostro) {
    if (partito) return;
    partito = true;

    var opzioni = {
      pin: I.pin,
      stick: I.stick,
      transparent: true,
      bakeBudgetMs: 4,
      params: {
        inkTime: I.inkTime,
        dyeRes:  I.dyeRes,
        block:   I.freno,
        dry:     I.asciugatura,
        clean:   I.pulizia,
        wet:     I.bagnato
      },
      onBakeProgress: function (p) {
        document.documentElement.style.setProperty("--ink-avanzamento", (p * 100).toFixed(1) + "%");
      },
      onReady: annuncia
    };

    if (conInchiostro) opzioni.obstacle = scoglio;
    /* Senza inchiostro il titolo resta testo vero e si limita a comparire,
       come faceva prima che tutto questo esistesse. */
    else opzioni.reveal = I.titolo;

    sezione = InkTransition.mount(opzioni);
    global.inkSection = sezione;

    /* Ultima rete: haInchiostro() copre i casi noti, ma se il modulo ripiega
       lo stesso — uno shader che non compila su una scheda strana — il titolo
       resterebbe nascosto senza che nessuno lo disegni. Qui lo si riaccende. */
    if (conInchiostro && sezione && typeof sezione.redrawObstacle !== "function") {
      var css = document.getElementById("cape-ink-title-css");
      if (css) css.textContent = css.textContent.replace(".ink-title{opacity:0}", "");
    }

    var anticipa = sezione && global.innerWidth >= I.preparaDa && sezione.prepare();
    if (!anticipa) annuncia();
  }

  function boot() {
    /* rete di sicurezza: se il calcolo non finisce mai — scheda che
       rinuncia, scheda del browser aperta in secondo piano — il preloader
       non deve restare su per sempre */
    salvagente = setTimeout(annuncia, I.salvagenteMs);

    if (!global.InkTransition || !document.querySelector(I.pin)) { annuncia(); return; }

    titolo = document.querySelector(I.titolo);
    var conInchiostro = haInchiostro();
    if (titolo) vesti(conInchiostro);

    /* Lo scoglio ha la forma del carattere: aspettarlo non e' un vezzo, con
       il ripiego la lettera avrebbe un'altra larghezza. Ma non si aspetta
       all'infinito. */
    if (conInchiostro && document.fonts && document.fonts.ready) {
      var t = setTimeout(function () { monta(true); }, I.attesaFont);
      document.fonts.ready.then(function () { clearTimeout(t); monta(true); });
    } else {
      monta(conInchiostro);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.CapeInkTitle = { impostazioni: I, ridisegna: function () { if (sezione && sezione.redrawObstacle) sezione.redrawObstacle(); } };
})(typeof window !== "undefined" ? window : this);
