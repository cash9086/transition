/*
 * cape-ink-title — il titolo della sezione ink-bleed di The Cape Studio.
 *
 * Fa due cose che stanno insieme perche' sono la stessa cosa: come e' fatto
 * il titolo, e come arriva.
 *
 *   ASPETTO   colore, carattere, corpo. Stanno qui e non nel custom code
 *             della pagina apposta: cosi' si cambiano da GitHub, cambiando
 *             solo lo SHA nell'indirizzo, senza rientrare in Webflow.
 *
 *   ARRIVO    ogni lettera chiede a ink-transition a che progresso
 *             l'inchiostro le passa sopra — una lettura sola, a calcolo
 *             finito — e da li' si asciuga per conto suo: arriva come
 *             macchia bagnata e gonfia, la carta beve, il segno si stringe
 *             fino a diventare lettera. Non c'e' nessuna sequenza scritta a
 *             mano: l'ordine in cui si accendono e' quello vero della
 *             pennellata, che serpeggia da destra a sinistra.
 *
 * Uso, nel footer della pagina, dopo ink-transition.js:
 *
 *   var titolo = CapeInkTitle.prepara();
 *   InkTransition.mount({
 *     ...,
 *     onProgress: titolo.onProgress,
 *     onReady:    titolo.onReady
 *   });
 *
 * NOTA sul foglio di stile: il blocco qui sotto viene aggiunto in fondo alla
 * head, quindi vince per ordine su una regola .ink-title scritta nel custom
 * code della pagina. Se li' dentro c'e' ancora un vecchio colore, non e' piu'
 * lui a comandare: si puo' cancellare quando capita.
 */
(function (global) {
  "use strict";

  var DEFAULT = {
    /* ——— aspetto ———————————————————————————————————————————————— */
    colore:     "#141416",   /* lo stesso nero della slide sotto l'inchiostro */
    famiglia:   '"Glamor-LightCondensed","Oswald","Archivo Narrow",sans-serif',
    peso:       "300",
    corpo:      "150px",     /* su schermo largo; sotto scende, vedi CSS */
    interlinea: ".9",
    spaziatura: ".02em",

    /* ——— assorbimento ——————————————————————————————————————————— */
    ritardo:    0.015,  /* quanto aspetta una lettera dopo che l'inchiostro l'ha coperta */
    durata:     0.13,   /* quanto ci mette ad asciugare, in frazione di sezione */
    sbavo:      13,     /* px di sbavatura nell'istante piu' bagnato */
    soglia:     0.16,   /* dove si ferma la macchia: piu' basso = piu' gonfia */
    /* Quanto poco ci mette una lettera a prendere colore pieno. Corto
       apposta: l'inchiostro vero non sbiadisce mentre si posa, cade gia'
       nero e cambia solo forma. Alzandolo si torna a una comparsa in
       dissolvenza, cioe' a del grigio. */
    apparizione: 0.12,

    /* ——— dove ——————————————————————————————————————————————————— */
    titolo: "[data-ink-reveal], .ink-title"
  };

  function lisci(a, b, x) { var t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }
  function fuori(t) { return 1 - Math.pow(1 - t, 3); }
  function tre(v) { return Math.round(v * 1000) / 1000; }

  function vesti(o) {
    if (document.getElementById("cape-ink-title-css")) return;
    var s = document.createElement("style");
    s.id = "cape-ink-title-css";
    s.textContent =
      "/* cape-ink-title: aspetto del titolo. Arriva da GitHub, non dal\n" +
      "   custom code della pagina. */\n" +
      ".ink-title{" +
        "font-family:" + o.famiglia + ";" +
        "font-weight:" + o.peso + ";" +
        "font-size:" + o.corpo + ";" +
        "line-height:" + o.interlinea + ";" +
        "letter-spacing:" + o.spaziatura + ";" +
        "color:" + o.colore + ";" +
      "}\n" +
      /* Il corpo pieno vale finche' c'e' schermo. Sotto scende in
         proporzione e non risale mai oltre: e' min(), non una seconda
         misura fissa. */
      "@media (max-width:1200px){.ink-title{font-size:min(" + o.corpo + ",12.5vw)}}\n" +
      "@media (max-width:600px){.ink-title{font-size:11vw;line-height:1}}";
    document.head.appendChild(s);
  }

  function prepara(opzioni) {
    var o = {}, k;
    for (k in DEFAULT) if (Object.prototype.hasOwnProperty.call(DEFAULT, k)) o[k] = DEFAULT[k];
    if (opzioni) for (k in opzioni) if (k in o) o[k] = opzioni[k];

    var muto = { onProgress: function () {}, onReady: function () {} };
    var titolo = document.querySelector(o.titolo);
    if (!titolo) return muto;

    var ridotto = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var pezzi = [], filtri = [], arrivi = [], ultimo = [];
    var misurato = false, ultimoP = 0;

    vesti(o);

    /* Chi ha chiesto meno movimento non vuole tredici lettere che si
       muovono: torna la dissolvenza semplice di prima, sul titolo intero. */
    if (ridotto) {
      titolo.style.opacity = "0";
      return {
        onProgress: function (p) { titolo.style.opacity = lisci(0.86, 1, p).toFixed(3); },
        onReady: function () {}
      };
    }

    /* ——— il titolo, lettera per lettera ——————————————————————————— */
    var testo = (titolo.textContent || "").replace(/\s+/g, " ").trim();
    if (!testo) return muto;
    /* Il nome accessibile resta la frase intera: senza questo uno screen
       reader leggerebbe quindici lettere staccate. */
    titolo.setAttribute("aria-label", testo);
    var guscio = document.createElement("span");
    guscio.setAttribute("aria-hidden", "true");
    for (var i = 0; i < testo.length; i++) {
      /* Gli spazi restano testo nudo, non span: da 600px in giu' il titolo
         puo' andare a capo, e si va a capo solo su uno spazio vero. */
      if (testo[i] === " ") { guscio.appendChild(document.createTextNode(" ")); continue; }
      var s = document.createElement("span");
      s.textContent = testo[i];
      s.style.display = "inline-block";
      /* Nascoste da JS e non da CSS, come faceva il modulo: se questo codice
         non gira, il titolo resta visibile invece di sparire per sempre. */
      s.style.opacity = "0";
      guscio.appendChild(s);
      pezzi.push(s);
    }
    titolo.textContent = "";
    titolo.appendChild(guscio);

    /* ——— un filtro per lettera —————————————————————————————————————
       Acceso solo su quelle che stanno asciugando in quel momento: due o
       tre alla volta, non tutte. */
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.style.position = "absolute";
    var defs = document.createElementNS(ns, "defs");
    for (i = 0; i < pezzi.length; i++) {
      var f = document.createElementNS(ns, "filter");
      f.setAttribute("id", "cape-assorbe-" + i);
      /* Regione larga: nel primo istante la macchia esce parecchio dal
         riquadro della lettera, e il -10%/+10% di default la taglierebbe. */
      f.setAttribute("x", "-70%"); f.setAttribute("y", "-70%");
      f.setAttribute("width", "240%"); f.setAttribute("height", "240%");
      f.setAttribute("color-interpolation-filters", "sRGB");
      var b = document.createElementNS(ns, "feGaussianBlur");
      b.setAttribute("in", "SourceGraphic"); b.setAttribute("stdDeviation", "0");
      var m = document.createElementNS(ns, "feColorMatrix");
      m.setAttribute("type", "matrix");
      m.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0");
      f.appendChild(b); f.appendChild(m); defs.appendChild(f);
      filtri.push({ b: b, m: m, url: "url(#cape-assorbe-" + i + ")" });
      ultimo.push(-1);
    }
    svg.appendChild(defs);
    document.body.appendChild(svg);

    /* ——— dove passa l'inchiostro, lettera per lettera ————————————————
       Una lettura sola per lettera, a calcolo finito. Da qui in poi
       l'animazione e' aritmetica. */
    function misura() {
      var sez = global.inkSection;
      var tela = sez && sez.element;
      if (!tela) return;
      var r = tela.getBoundingClientRect();
      if (!r.width || !r.height) return;
      for (var j = 0; j < pezzi.length; j++) {
        var q = pezzi[j].getBoundingClientRect();
        var u = (q.left + q.width / 2 - r.left) / r.width;
        var v = (q.top + q.height / 2 - r.top) / r.height;
        var a = sez.arrivalAt ? sez.arrivalAt(u, v) : null;
        /* Ripiego, se la mappa non c'e' (niente WebGL, o una versione vecchia
           del modulo rimasta in cache): una rampa da destra a sinistra, che e'
           il verso in cui il pennello va davvero. Somiglia, ma non e'
           agganciata: e' il piano B, non il piano. */
        if (a === null || a === undefined || a !== a) {
          a = 0.62 + 0.22 * (1 - j / Math.max(1, pezzi.length - 1));
        }
        arrivi[j] = a;
        ultimo[j] = -1;
      }
      misurato = true;
      disegna(ultimoP);
    }

    /* ——— un fotogramma ————————————————————————————————————————— */
    function disegna(p) {
      ultimoP = p;
      if (!misurato) return;
      for (var j = 0; j < pezzi.length; j++) {
        var da = Math.min(arrivi[j] + o.ritardo, 0.93);
        var q = lisci(da, Math.min(da + o.durata, 0.995), p);
        /* Salta il lavoro inutile, ma mai i due estremi: sono loro che
           spengono il filtro. */
        if (q > 0 && q < 1 && Math.abs(q - ultimo[j]) < 0.004) continue;
        ultimo[j] = q;
        var st = pezzi[j].style, fl = filtri[j];
        if (q <= 0) { st.opacity = "0"; st.filter = "none"; st.transform = "none"; continue; }
        if (q >= 1) { st.opacity = "1"; st.filter = "none"; st.transform = "none"; continue; }
        /* Sfocare e poi rialzare il contrasto dell'alpha non da' una
           sfocatura: da' una macchia. La soglia bassa allarga il segno invece
           di scioglierlo, ed e' questo che lo fa leggere come inchiostro
           assorbito e non come un fuori fuoco. */
        var pend = 1 + 22 * Math.pow(1 - q, 1.4);
        fl.b.setAttribute("stdDeviation", tre(o.sbavo * Math.pow(1 - q, 1.8)));
        fl.m.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 " +
          tre(pend) + " " + tre(-(pend - 1) * o.soglia));
        st.filter = fl.url;
        st.opacity = lisci(0, o.apparizione, q).toFixed(3);
        st.transform = "scale(" + tre(1 + 0.04 * (1 - fuori(q))) + ")";
      }
    }

    return {
      onProgress: disegna,
      /* Rimandato di un giro: senza WebGL il modulo chiama onReady durante il
         mount, quando inkSection non e' ancora assegnata. Vale anche per i
         ricalcoli dopo un resize: mappa nuova, lettere da rileggere. */
      onReady: function () { setTimeout(misura, 0); }
    };
  }

  global.CapeInkTitle = { prepara: prepara, default: DEFAULT };
})(typeof window !== "undefined" ? window : this);
