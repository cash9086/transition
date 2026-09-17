/* ============================================================================
   CAPE-PIEGA — la piega delle lettere della sezione ink-bleed
   The Cape Studio.  Un file solo, nessuna dipendenza.

   ART AND FASHION diventa il titolo del carosello piegandosi come un
   origami: le assi sono rigide, i giunti tengono, e una piega comincia
   quando la precedente ha finito.

   BANCO DI PROVA, non ancora il modulo del sito: qui si guarda solo se la
   piega e come deve essere. Manca il passaggio di consegne
   dall aggancio allo scroll vero e la sezione che si apre.

     CapePiega.banco({ dentro: "#piega", da: "ART AND FASHION",
                       a: "VELVET SILENCE", famiglia: "...", peso: "200" });
============================================================================ */

/* ============================================================================
   CAPE — MOTORE DELLA PIEGA  ·  nucleo geometrico

   Il problema: far diventare una A una V senza che la lettera si spezzi e
   senza che diventi liquida.

   Come NON si fa: interpolare punto per punto i due contorni. Il computer non
   sa cosa sia un'asta, quindi il punto 47 della A finisce dove capita nella V
   e la lettera si sbriciola. E' quello che si vede negli screen dei tentativi
   precedenti.

   Come si fa qui, in tre mosse.

   1. SPINA. Ogni lettera ha uno scheletro scritto a mano: due o tre linee che
      passano in mezzo alle aste, quelle che un calligrafo traccerebbe col
      dito. Sono in coordinate della scatola della lettera, quindi non
      dipendono dal font.

   2. NASTRO. Il contorno vero — tracciato dai pixel del font, non
      approssimato — viene misurato RISPETTO alla spina: per ogni punto lungo
      l'asta si segna quanto sporge da una parte e quanto dall'altra. L'asta
      diventa un nastro. La lettera e' l'unione dei suoi nastri.

      Questo risolve da solo il problema dei buchi. L'occhiello della A non e'
      un contorno da tenere in vita: e' il triangolo che nessun nastro copre.
      Quando la traversa si piega via, il buco si chiude perche' non c'e' piu'
      niente a delimitarlo. Nessuna topologia da gestire, nessun anello che
      deve nascere o morire.

   3. PIEGA. La spina non si muove interpolando i suoi punti — quello
      stiracchierebbe. Si muove interpolando LUNGHEZZE e ANGOLI DI STERZATA:
      una linea che deve ruotare ruota, una che deve incurvarsi si incurva, e
      la sua lunghezza resta la sua. E' la differenza fra un braccio che si
      alza e un braccio che si allunga.

   Le aste che avanzano non spariscono in dissolvenza: si piegano SOPRA
   un'altra asta finche' non ci stanno dentro, e non si vedono piu' perche'
   sono coperte dall'inchiostro della lettera, non perche' sono trasparenti.
============================================================================ */
(function (global) {
  "use strict";

  var CORPO   = 400;  /* corpo in px a cui si traccia ogni glifo           */
  var MARGINE = 60;   /* aria intorno, per grazie e sbordature             */
  var SOGLIA  = 0.5;  /* isolinea dell'alfa                                */
  var CAMP    = 128;  /* quanti campioni lungo il nastro                   */
  var CODA    = 0.04; /* quanto si allunga la spina oltre l'inchiostro,
                         in frazione della sua lunghezza. Senza questo
                         l'apice della A — che sta SOPRA l'inizio della
                         spina — verrebbe tagliato.                        */

  /* ======================================================================
     1. IL CONTORNO VERO DEL FONT

     Non serve il file del font: si disegna la lettera grande su un canvas e
     si legge dove finisce l'inchiostro. Marching squares con interpolazione
     sulla soglia: il bordo che ne esce ha precisione sotto il pixel, quindi
     a 400px di corpo il contorno e' il contorno, non una scaletta.

     E' anche il motivo per cui questo modulo non ha bisogno del file del
     carattere: legge quello che il browser ha gia' caricato. Se un domani
     cambi font, continua a funzionare.
     ================================================================== */

  function glifo(ch, famiglia, peso) {
    var cv = document.createElement("canvas");
    var ctx = cv.getContext("2d");
    var font = peso + " " + CORPO + "px " + famiglia;

    ctx.font = font;
    var m = ctx.measureText(ch);
    var aL = m.actualBoundingBoxLeft, aR = m.actualBoundingBoxRight;
    var aA = m.actualBoundingBoxAscent, aD = m.actualBoundingBoxDescent;

    var sx = Math.ceil(aL) + MARGINE, sy = Math.ceil(aA) + MARGINE;
    cv.width  = sx + Math.ceil(aR) + MARGINE;
    cv.height = sy + Math.ceil(aD) + MARGINE;

    ctx = cv.getContext("2d");
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#000";
    ctx.fillText(ch, sx, sy);

    var img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    var alfa = new Float32Array(cv.width * cv.height);
    for (var i = 0, n = alfa.length; i < n; i++) alfa[i] = img[i * 4 + 3] / 255;

    /* La scatola dell'inchiostro: e' il riferimento delle spine. */
    var bx = sx - aL, by = sy - aA, bw = aL + aR, bh = aA + aD;

    return {
      ch: ch,
      alfa: alfa, w: cv.width, h: cv.height,
      box: { x: bx, y: by, w: bw || 1, h: bh || 1 },
      /* tutto in em, cosi' la composizione della riga non dipende dal corpo */
      avanzamento: m.width / CORPO,
      largo: bw / CORPO,
      alto:  bh / CORPO,
      /* dove sta l'inchiostro rispetto all'origine del glifo, in em */
      scarto: { x: -aL / CORPO, y: -aA / CORPO }
    };
  }

  /* ======================================================================
     2. LA SPINA, IN FORMA INTRINSECA

     Punto di partenza, angolo di partenza, e poi solo lunghezze e sterzate.
     E' questa la rappresentazione che si interpola.
     ================================================================== */

  function norm(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function intrinseca(pts) {
    var a0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    var segs = [], ang = a0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      var a = Math.atan2(dy, dx);
      segs.push({ len: Math.hypot(dx, dy), giro: i === 1 ? 0 : norm(a - ang) });
      ang = a;
    }
    return { x0: pts[0].x, y0: pts[0].y, a0: a0, segs: segs };
  }

  function srotola(I) {
    var pts = [{ x: I.x0, y: I.y0 }], ang = I.a0, x = I.x0, y = I.y0;
    for (var i = 0; i < I.segs.length; i++) {
      ang += I.segs[i].giro;
      x += Math.cos(ang) * I.segs[i].len;
      y += Math.sin(ang) * I.segs[i].len;
      pts.push({ x: x, y: y });
    }
    return pts;
  }

  function campionaSpina(pts, n, ring) {
    var L = [0], tot = 0, i;
    for (i = 1; i < pts.length; i++) {
      tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      L.push(tot);
    }
    var out = [], j = 1;
    for (i = 0; i < n; i++) {
      var d = tot * i / (ring ? n : n - 1);
      while (j < L.length - 1 && L[j] < d) j++;
      var t = (d - L[j - 1]) / ((L[j] - L[j - 1]) || 1);
      out.push({
        x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t,
        y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * t
      });
    }
    return out;
  }

  /* Due spine con lo stesso numero di segmenti si mescolano numero per
     numero. Se non ce l'hanno, si ridistribuiscono prima. */
  function riparti(I, n) {
    if (I.segs.length === n) return I;
    return intrinseca(campionaSpina(srotola(I), n + 1));
  }

  function mescola(A, B, t) {
    var n = Math.max(A.segs.length, B.segs.length);
    var a = riparti(A, n), b = riparti(B, n), segs = [];
    for (var i = 0; i < n; i++) {
      segs.push({
        len:  a.segs[i].len  + (b.segs[i].len  - a.segs[i].len)  * t,
        giro: a.segs[i].giro + norm(b.segs[i].giro - a.segs[i].giro) * t
      });
    }
    return {
      x0: a.x0 + (b.x0 - a.x0) * t,
      y0: a.y0 + (b.y0 - a.y0) * t,
      a0: a.a0 + norm(b.a0 - a.a0) * t,
      segs: segs
    };
  }

  /* ======================================================================
     3. IL NASTRO  —  misurato, non dedotto

     Per ogni punto lungo la spina si guarda quanto e' spesso l'inchiostro
     li': si parte dalla spina e si cammina di lato finche' l'inchiostro
     finisce. Da una parte e dall'altra. Due profili, e l'asta e' descritta.

     Il primo tentativo assegnava ogni punto del contorno alla spina piu'
     vicina e ne prendeva l'inviluppo. Negli incroci — l'apice della A, dove
     due gambe si fondono — quell'assegnazione e' una monetina, e il profilo
     usciva a denti di sega: la lettera aveva tacche bianche gia' ferma.
     Camminare di lato invece non ha ambiguita': il primo bordo che incontri
     e' il bordo della TUA asta, per definizione.

     Dove la spina esce dall'inchiostro il nastro va a zero: e' cosi' che
     un'asta finisce di netto, col suo taglio e le sue grazie, invece di
     sfilacciarsi.
     ================================================================== */

  /* Allunga la spina un filo oltre l'inchiostro alle due estremita': l'apice
     della A sta sopra l'inizio della sua spina e senza questo verrebbe
     tagliato. Le spine chiuse — l'anello della O — non si allungano: si
     ritroverebbero due codine fuori dall'anello. */
  function prolunga(pts) {
    var n = pts.length, tot = 0, i;
    for (i = 1; i < n; i++) tot += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    var e = tot * CODA;
    function versore(a, b) {
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      return { x: dx / L, y: dy / L };
    }
    var u0 = versore(pts[1], pts[0]), u1 = versore(pts[n - 2], pts[n - 1]);
    var out = [{ x: pts[0].x + u0.x * e, y: pts[0].y + u0.y * e }];
    for (i = 0; i < n; i++) out.push(pts[i]);
    out.push({ x: pts[n - 1].x + u1.x * e, y: pts[n - 1].y + u1.y * e });
    return out;
  }

  var PASSO  = 0.35;  /* passo del cammino, in px del canvas di traccia   */
  var GRAZIA = 0.13;  /* quanto e' lunga la testa (e la coda) di un'asta,
                         in unita' mondo. E' la zona che NON si stira e non
                         si storce: la grazia e il suo raccordo.            */
  var NCAP   = 44;    /* campioni di una testa o di una coda               */
  var FITTI  = 320;   /* campioni con cui si misura, prima di ridistribuire */

  function alfaIn(g, x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= g.w - 1 || y0 >= g.h - 1) return 0;
    var fx = x - x0, fy = y - y0, i = y0 * g.w + x0;
    var a = g.alfa[i], b = g.alfa[i + 1], c = g.alfa[i + g.w], d = g.alfa[i + g.w + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  function cammina(g, px, py, nx, ny, scala, max) {
    var d = 0;
    while (d < max) {
      d += PASSO;
      if (alfaIn(g, px + nx * d, py + ny * d) < SOGLIA) {
        var lo = d - PASSO, hi = d;
        for (var k = 0; k < 6; k++) {
          var m = (lo + hi) / 2;
          if (alfaIn(g, px + nx * m, py + ny * m) < SOGLIA) hi = m; else lo = m;
        }
        return lo / scala;
      }
    }
    return max / scala;
  }

  function normali(pts) {
    var n = pts.length, out = [];
    for (var i = 0; i < n; i++) {
      var a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      out.push({ x: dy / L, y: -dx / L });
    }
    return out;
  }

  /* ======================================================================
     3. LA CARNE  —  un corpo che si piega, due capi che no

     Prima misura: dalla spina si cammina di lato finche' l'inchiostro
     finisce, da una parte e dall'altra. Fin qui niente di strano.

     Poi pero' la misura si spezza in tre, e QUESTA e' la parte che conta.

       TESTA e CODA  i primi e gli ultimi millimetri dell'asta, dove stanno
                     le grazie. Si conservano come una figura in coordinate
                     LOCALI — riferite al capo dell'asta — e quando l'asta
                     si muove vengono ristampate rigide: ruotate e spostate,
                     mai stirate, mai storte.

       CORPO         tutto il resto: quello si', segue la spina e si piega
                     con lei.

     Perche' cosi'. Una grazia NON e' una sporgenza perpendicolare all'asta:
     e' un trattino attaccato al suo capo. Su un'asta verticale la differenza
     non si vede, perche' il trattino e' perpendicolare per conto suo. Ma la
     gamba della A e' diagonale, e la sua grazia misurata di traverso viene
     fuori lunga il doppio e sghemba: finche' l'asta sta ferma torna lo
     stesso, perche' quei numeri ricadono esattamente sull'inchiostro vero.
     Appena l'asta ruota, quella sporgenza ruota con lei e diventa uno
     sperone nel vuoto. Erano quelli i morsi e le punte.
     ================================================================== */

  function misura(pts, g, scala) {
    var camp = campionaSpina(pts, FITTI);
    var nor = normali(camp);
    var f = new Float32Array(FITTI), d = new Float32Array(FITTI);
    var maxPx = g.box.h * 1.2;

    for (var i = 0; i < FITTI; i++) {
      var px = g.box.x + camp[i].x * scala, py = g.box.y + camp[i].y * scala;
      if (alfaIn(g, px, py) < SOGLIA) continue;
      f[i] =  cammina(g, px, py,  nor[i].x,  nor[i].y, scala, maxPx);
      d[i] = -cammina(g, px, py, -nor[i].x, -nor[i].y, scala, maxPx);
    }
    liscia(f); liscia(d);
    return { camp: camp, nor: nor, f: f, d: d };
  }

  function liscia(v) {
    var n = v.length, c = new Float32Array(v);
    for (var i = 1; i < n - 1; i++) v[i] = (c[i - 1] + c[i] * 2 + c[i + 1]) / 4;
  }

  /* Il bordo dell'asta a un dato campione, dai due lati. */
  function bordi(m, i) {
    return [
      { x: m.camp[i].x + m.nor[i].x * m.f[i], y: m.camp[i].y + m.nor[i].y * m.f[i] },
      { x: m.camp[i].x + m.nor[i].x * m.d[i], y: m.camp[i].y + m.nor[i].y * m.d[i] }
    ];
  }

  /* Una testa (o una coda) in coordinate locali: origine sul punto dove
     comincia il corpo, asse x lungo la spina. Da li' in poi si ristampa
     rigida e non la tocca piu' nessuno. */
  /* L'ultimo campione in cui c'e' ancora inchiostro. La spina sconfina
     apposta oltre la lettera — serve a non tagliare l'apice della A — ma la
     figura del capo non deve arrivare fin la': li' la carne e' zero, il
     poligono si strozza a punta e il capo esce a spillo. */
  function ultimoPieno(m, da, a) {
    var passo = a > da ? 1 : -1;
    for (var i = a; i !== da; i -= passo) {
      if (m.f[i] - m.d[i] > 1e-4) return i;
    }
    return da;
  }

  function capo(m, da, a, ancora) {
    a = ultimoPieno(m, da, a);
    var ox = m.camp[ancora].x, oy = m.camp[ancora].y;
    var ax = -m.nor[ancora].y, ay = m.nor[ancora].x;   /* tangente */
    var su = [], giu = [], i;
    for (i = 0; i < NCAP; i++) {
      var k = Math.round(da + (a - da) * i / (NCAP - 1));
      if (k < 0) k = 0; if (k > FITTI - 1) k = FITTI - 1;
      var b = bordi(m, k);
      su.push(loc(b[0])); giu.push(loc(b[1]));
    }
    return su.concat(giu.reverse());

    function loc(p) {
      var dx = p.x - ox, dy = p.y - oy;
      return { x: dx * ax + dy * ay, y: -dx * ay + dy * ax };
    }
  }

  /* Il corpo: il profilo ridistribuito su CAMP campioni fra le due ancore. */
  function corpo(m, da, a) {
    var f = new Float32Array(CAMP), d = new Float32Array(CAMP);
    for (var i = 0; i < CAMP; i++) {
      var k = Math.round(da + (a - da) * i / (CAMP - 1));
      if (k < 0) k = 0; if (k > FITTI - 1) k = FITTI - 1;
      f[i] = m.f[k]; d[i] = m.d[k];
    }
    return { fuori: f, dentro: d };
  }

  /* ---- il tetto ---------------------------------------------------------
     Dove due aste si fondono — la traversa della H che incontra l'asta,
     l'apice della A — il raggio non trova nessun bordo da attraversare: se
     ne va lungo l'altra asta e esce dalla parte opposta della lettera. La
     misura torna 0.75 invece di 0.02, e quella carne di troppo, finche' la
     lettera sta ferma, cade esattamente sopra l'inchiostro dell'altra asta,
     quindi non si vede. Appena l'asta ruota se la porta dietro, e diventa
     un cuneo nero nel vuoto.

     Il rimedio e' un tetto, ricavato dall'asta stessa: la MEDIANA delle
     larghezze misurate. La mediana non la smuovono quattro campioni
     impazziti, mentre una media si'. Tagliare li' non toglie niente alla
     lettera ferma — quella carne in piu' era gia' coperta dall'altra asta —
     e toglie tutto il guaio a quella in movimento. */

  /* Multipli della SEMI-larghezza mediana, perche' il tetto si applica a un
     lato per volta. Sulla larghezza intera — com'era prima — il corpo poteva
     gonfiarsi al doppio dell'asta senza che il tetto se ne accorgesse. */
  var TETTO_CORPO = 1.35;
  var TETTO_CAPO  = 3.20;  /* le grazie sporgono piu' del corpo, giustamente */

  function mediana(v) {
    var c = [];
    for (var i = 0; i < v.length; i++) if (v[i] > 1e-5) c.push(v[i]);
    if (!c.length) return 0;
    c.sort(function (a, b) { return a - b; });
    return c[c.length >> 1];
  }

  function tetta(m, da, a, k) {
    var lar = [], i;
    for (i = da; i <= a; i++) lar.push(m.f[i] - m.d[i]);
    var sp = mediana(lar);
    if (sp <= 0) return;
    var t = sp * k;
    for (i = da; i <= a; i++) {
      if (m.f[i] >  t) m.f[i] =  t;
      if (m.d[i] < -t) m.d[i] = -t;
    }
  }

  function carne(pts, g, scala, ring) {
    var m = misura(pts, g, scala);
    var L = lunghezza(pts);

    if (ring) {
      /* un anello non ha capi: e' tutto corpo */
      tetta(m, 0, FITTI - 1, TETTO_CORPO / 2);
      return { corpo: corpo(m, 0, FITTI - 1), testa: null, coda: null, gr: 0, ring: 1 };
    }

    /* su un'asta corta la grazia non puo' prendersi piu' di un terzo per
       parte, se no non resta corpo da piegare */
    var gr = Math.min(GRAZIA, L * 0.33);
    var k = Math.round(gr / L * (FITTI - 1));
    if (k < 2) k = 2;
    /* i capi sconfinano un po' nel corpo: due figure che si toccano appena
       lascerebbero una cucitura visibile */
    var ov = Math.round(k * 0.35);

    /* Il tetto si calcola sul CORPO — dove l'asta e' asta e basta — e poi si
       applica anche ai capi, piu' largo: una grazia sporge piu' dell'asta,
       ma non dieci volte tanto. */
    var lar = [], grezzo = new Float32Array(FITTI), q;
    for (q = 0; q < FITTI; q++) grezzo[q] = m.f[q] - m.d[q];
    for (q = k; q <= FITTI - 1 - k; q++) lar.push(grezzo[q]);
    var sp = mediana(lar) / 2;
    if (sp > 0) {
      var tc = sp * TETTO_CORPO, tg = sp * TETTO_CAPO;
      for (q = 0; q < FITTI; q++) {
        var t = (q < k || q > FITTI - 1 - k) ? tg : tc;
        if (m.f[q] >  t) m.f[q] =  t;
        if (m.d[q] < -t) m.d[q] = -t;
      }
    }

    /* ---- terminale o incrocio? -----------------------------------------
       Un capo puo' essere due cose diverse, e vanno trattate diversamente.

       TERMINALE  l'asta finisce li', e quello che sporge e' la sua grazia.
                  Va conservata rigida, se no ruotando si sfilaccia.

       INCROCIO   l'asta finisce dentro un'altra asta — l'apice della A, la
                  traversa che incontra l'asta. Li' NON c'e' nessuna grazia:
                  c'e' l'inchiostro dell'altra asta, che e' gia' disegnato da
                  lei. Trattarlo come una grazia vuol dire portarsi dietro un
                  pezzo dell'altra asta, e ruotando diventa una bandierina.

       Si distinguono dalla misura grezza, prima del tetto: una grazia e'
       larga due o tre volte l'asta, un incrocio molto di piu'. */
    var largo = function (da, a) {
      var w = 0;
      for (var z = Math.min(da, a); z <= Math.max(da, a); z++) w = Math.max(w, grezzo[z]);
      return w;
    };
    var soglia = sp * 2 * 4.0;

    return {
      corpo: corpo(m, k, FITTI - 1 - k),
      testa: largo(0, k + ov) < soglia ? capo(m, k + ov, 0, k) : null,
      coda:  largo(FITTI - 1 - k - ov, FITTI - 1) < soglia ? capo(m, FITTI - 1 - k - ov, FITTI - 1, FITTI - 1 - k) : null,
      gr: gr, ring: 0
    };
  }

  /* ---- la spina si centra da sola --------------------------------------
     Le spine si scrivono a mano guardando la lettera, e a mano si sbaglia:
     l'asta sinistra di una N sembra stare sul bordo sinistro della scatola,
     ma su quel bordo c'e' solo la punta della GRAZIA — il centro dell'asta
     e' piu' dentro. Scritta male, la spina esce dall'inchiostro a meta'
     altezza e li' la carne va a zero: l'asta sparisce e resta un trattino
     in cima e uno in fondo.

     Invece di misurare quel rientro font per font, la spina se lo trova da
     sola: da ogni campione si guarda di lato, si cercano i due bordi e ci
     si mette in mezzo. Le coordinate scritte a mano diventano cosi'
     un'indicazione — devono azzeccare QUALE asta, non dove passa al
     millesimo. */

  var CERCA  = 0.10;  /* quanto lontano si cerca l'inchiostro, in mondo */
  var SPOSTA = 0.14;  /* quanto al massimo un campione puo' spostarsi. Non e'
                         un dettaglio: a 0.09 l'asta sinistra della N si
                         fermava a meta' strada, restava fuori
                         dall'inchiostro, e quell'asta finiva per non essere
                         disegnata da nessuno — la copriva la diagonale, che
                         sbordava. Piu' di questo pero' no: la traversa della
                         A verrebbe risucchiata dentro una gamba invece di
                         restare una traversa.                           */

  function centra(pts, g, scala) {
    var fitti = campionaSpina(pts, 48);
    var nor = normali(fitti);
    var out = [], i;

    for (i = 0; i < fitti.length; i++) {
      var p = fitti[i], n = nor[i];
      var px = g.box.x + p.x * scala, py = g.box.y + p.y * scala;

      if (alfaIn(g, px, py) < SOGLIA) {
        var trovato = 0;
        for (var d = PASSO; d <= CERCA * scala; d += PASSO) {
          if (alfaIn(g, px + n.x * d, py + n.y * d) >= SOGLIA) { px += n.x * d; py += n.y * d; trovato = 1; break; }
          if (alfaIn(g, px - n.x * d, py - n.y * d) >= SOGLIA) { px -= n.x * d; py -= n.y * d; trovato = 1; break; }
        }
        if (!trovato) { out.push(p); continue; }
      }

      var a = cammina(g, px, py,  n.x,  n.y, scala, CERCA * scala) * scala;
      var b = cammina(g, px, py, -n.x, -n.y, scala, CERCA * scala) * scala;
      var m = (a - b) / 2;

      var nx = (px + n.x * m - g.box.x) / scala, ny = (py + n.y * m - g.box.y) / scala;
      var sp = Math.hypot(nx - p.x, ny - p.y);
      if (sp > SPOSTA) { var f = SPOSTA / sp; nx = p.x + (nx - p.x) * f; ny = p.y + (ny - p.y) * f; }
      out.push({ x: nx, y: ny });
    }

    /* una lisciata: il centraggio campione per campione trema, e su una
       spina il tremito diventa una piega */
    for (var giro = 0; giro < 3; giro++) {
      var c = out.map(function (q) { return { x: q.x, y: q.y }; });
      for (i = 1; i < out.length - 1; i++) {
        out[i] = { x: (c[i-1].x + c[i].x * 2 + c[i+1].x) / 4,
                   y: (c[i-1].y + c[i].y * 2 + c[i+1].y) / 4 };
      }
    }
    return out;
  }

  /* ======================================================================
     4. MONTARE UNA LETTERA

     Tutto quello che segue vive in uno spazio ISOTROPO: le misure sono
     normalizzate sull'altezza delle maiuscole, uguale per tutte le lettere
     dello stesso carattere. Percio' un'asta larga X in una A e' larga X
     anche in una I, e mescolando una lettera larga con una stretta gli
     spessori restano veri invece di schiacciarsi in orizzontale.

     Le spine pero' si scrivono in proporzioni della scatola (u da 0 a 1 in
     larghezza) perche' e' l'unico modo umano di scriverle. La conversione
     e' qui, una riga.
     ================================================================== */

  /* ---- un'asta dritta resta dritta ------------------------------------
     Il centraggio segue la linea di mezzo dell'inchiostro, e alle estremita'
     — dove la traversa si fonde con la gamba — la tira verso il centro della
     gamba. Risultato: un'asta che nel carattere e' perfettamente dritta esce
     con due gomiti ai capi, e quando ruota si vede piegarsi. Un'asta non si
     piega: o e' un'asta, e allora e' rigida, o e' un arco, e allora era
     scritta come un arco.

     La regola percio' e' la spina scritta a mano: due punti = asta rigida,
     e il centraggio le puo' solo spostare la retta, non incurvarla. Piu' di
     due punti = arco, e li' la curvatura e' voluta e resta.

     La retta si ricava ai minimi quadrati su tutti i campioni centrati,
     cosi' il centraggio serve lo stesso: sposta l'asta dove sta davvero
     l'inchiostro, senza poterla storcere. */
  function raddrizza(pts) {
    var n = pts.length, i, sx = 0, sy = 0;
    for (i = 0; i < n; i++) { sx += pts[i].x; sy += pts[i].y; }
    var mx = sx / n, my = sy / n, sxx = 0, sxy = 0, syy = 0;
    for (i = 0; i < n; i++) {
      var dx = pts[i].x - mx, dy = pts[i].y - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    /* la direzione principale: l'autovettore maggiore della nuvola */
    var ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    var ux = Math.cos(ang), uy = Math.sin(ang);
    /* si proietta ogni campione sulla retta e si tengono i due estremi */
    var t0 = Infinity, t1 = -Infinity;
    for (i = 0; i < n; i++) {
      var t = (pts[i].x - mx) * ux + (pts[i].y - my) * uy;
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
    }
    var p0 = { x: mx + ux * t0, y: my + uy * t0 };
    var p1 = { x: mx + ux * t1, y: my + uy * t1 };

    /* Il VERSO va tenuto quello di prima. La direzione principale di una
       nuvola di punti ha segno arbitrario — la stessa retta esce alto-basso
       o basso-alto a seconda di come cadono i numeri — e ordinare i due capi
       su quella vuol dire che l'asta di una lettera puo' uscire rovesciata
       rispetto a quella dell'altra. Il capo alto di una si accoppierebbe col
       capo basso dell'altra e la lettera si ribalta a meta' strada. */
    var vx = pts[n - 1].x - pts[0].x, vy = pts[n - 1].y - pts[0].y;
    if ((p1.x - p0.x) * vx + (p1.y - p0.y) * vy < 0) { var q = p0; p0 = p1; p1 = q; }
    return [p0, p1];
  }

  function chiusa(raw) {
    var a = raw[0], b = raw[raw.length - 1];
    return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  }

  function monta(ch, famiglia, peso, spine) {
    var g = glifo(ch, famiglia, peso);
    var scala = g.box.h;                 /* px per unita' di mondo          */
    var largo = g.box.w / g.box.h;       /* larghezza in unita' di mondo    */

    var aste = [];
    for (var i = 0; i < spine.length; i++) {
      var ring = chiusa(spine[i]);
      var pts = spine[i].map(function (p) { return { x: p[0] * largo, y: p[1] }; });
      pts = centra(pts, g, scala);
      /* due punti scritti a mano = asta rigida: il centraggio puo' spostarla
         ma non storcerla */
      if (spine[i].length === 2) pts = raddrizza(pts);
      if (!ring) pts = prolunga(pts);
      aste.push({
        I: intrinseca(pts),
        carne: carne(pts, g, scala, ring),
        chiusa: ring
      });
    }
    return {
      ch: ch, aste: aste, glifo: g,
      largo: largo,
      avanzamento: g.avanzamento / (g.box.h / CORPO),
      scarto: { x: g.scarto.x / (g.box.h / CORPO), y: g.scarto.y / (g.box.h / CORPO) }
    };
  }

  /* ======================================================================
     5. DISEGNARE

     Tre figure per asta: il corpo, che segue la spina, e la testa e la coda,
     che si ristampano rigide sui due capi. Sono dello stesso nero e si
     sovrappongono un po', quindi si leggono come una forma sola — ma solo il
     corpo si piega, e percio' le grazie restano grazie a qualunque
     inclinazione.

     Una lettera e' l'unione delle sue aste, dipinte una sopra l'altra.
     Niente pari-dispari, niente anelli: i buchi restano buchi perche'
     nessuno li dipinge.
     ================================================================== */

  function campionaTratto(pts, u0, u1, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(puntoSu(pts, u0 + (u1 - u0) * i / (n - 1)));
    return out;
  }

  function nastroPoli(camp, prof) {
    var su = [], giu = [], n = camp.length;
    for (var i = 0; i < n; i++) {
      var a = camp[i], nx = Math.sin(a.ang), ny = -Math.cos(a.ang);
      su.push({ x: a.x + nx * prof.fuori[i],  y: a.y + ny * prof.fuori[i] });
      giu.push({ x: a.x + nx * prof.dentro[i], y: a.y + ny * prof.dentro[i] });
    }
    return su.concat(giu.reverse());
  }

  function stampa(figura, ancora) {
    var ax = Math.cos(ancora.ang), ay = Math.sin(ancora.ang), out = [];
    for (var i = 0; i < figura.length; i++) {
      var p = figura[i];
      out.push({ x: ancora.x + p.x * ax - p.y * ay, y: ancora.y + p.x * ay + p.y * ax });
    }
    return out;
  }

  function disegna(spina, c) {
    var L = lunghezza(spina);
    if (c.ring) return [nastroPoli(campionaTratto(spina, 0, 1, CAMP), c.corpo)];

    var gr = Math.min(c.gr, L * 0.33), u = gr / (L || 1);
    /* dove non c'e' una grazia da ristampare, il corpo arriva fino in fondo */
    var u0 = c.testa ? u : 0, u1 = c.coda ? 1 - u : 1;
    var out = [nastroPoli(campionaTratto(spina, u0, u1, CAMP), c.corpo)];
    if (c.testa) out.push(stampa(c.testa, puntoSu(spina, u)));
    if (c.coda)  out.push(stampa(c.coda,  puntoSu(spina, 1 - u)));
    return out;
  }

  /* Dove si trova, e in che direzione punta, un punto a frazione u lungo una
     spezzata. Serve ad attaccarci sopra un osso figlio: e' il GIUNTO. */
  function puntoSu(pts, u) {
    var L = [0], tot = 0, i;
    for (i = 1; i < pts.length; i++) {
      tot += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
      L.push(tot);
    }
    var d = (u < 0 ? 0 : u > 1 ? 1 : u) * tot, j = 1;
    while (j < L.length - 1 && L[j] < d) j++;
    var seg = (L[j] - L[j-1]) || 1, t = (d - L[j-1]) / seg;
    var a = pts[j-1], b = pts[j];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      ang: Math.atan2(b.y - a.y, b.x - a.x)
    };
  }

  /* Il contrario: a che frazione della spezzata cade il punto p, e quanto ne
     sta discosto di lato. */
  function doveSu(pts, p) {
    var L = [0], tot = 0, i;
    for (i = 1; i < pts.length; i++) {
      tot += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
      L.push(tot);
    }
    var best = null;
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i+1];
      var dx = b.x - a.x, dy = b.y - a.y, L2 = dx*dx + dy*dy;
      var t = L2 > 0 ? ((p.x - a.x)*dx + (p.y - a.y)*dy) / L2 : 0;
      var tc = t < 0 ? 0 : (t > 1 ? 1 : t);
      var qx = a.x + dx*tc, qy = a.y + dy*tc;
      var d2 = (p.x-qx)*(p.x-qx) + (p.y-qy)*(p.y-qy);
      if (!best || d2 < best.d2) {
        var len = Math.sqrt(L2) || 1;
        best = {
          d2: d2,
          u: (L[i] + len*tc) / (tot || 1),
          off: ((p.x - a.x)*dy - (p.y - a.y)*dx) / len,
          ang: Math.atan2(dy, dx)
        };
      }
    }
    return best;
  }

  function lunghezza(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    }
    return L;
  }

  global.CapeMorph = {
    CAMP: CAMP,
    monta: monta,
    mescola: mescola,
    disegna: disegna,
    srotola: srotola,
    intrinseca: intrinseca,
    campionaSpina: campionaSpina,
    puntoSu: puntoSu,
    doveSu: doveSu,
    lunghezza: lunghezza,
    riparti: riparti,
    norm: norm
  };
})(typeof window !== "undefined" ? window : this);

/* ============================================================================
   CAPE — LE SPINE DELLE LETTERE E LE COPPIE

   Coordinate della SCATOLA della lettera: (0,0) e' l'angolo alto-sinistra
   dell'inchiostro, (1,1) il basso-destra. Non sono coordinate del font:
   sono proporzioni. Percio' queste righe valgono per qualunque carattere
   con grazie, e se un domani cambi font non si toccano.

   Ogni spina passa IN MEZZO all'asta, non sul suo bordo.
============================================================================ */
(function (global) {
  "use strict";

  /* Le coordinate stanno sul CENTRO dell'asta, non sul bordo della scatola.
     La differenza non e' un pelo: fra il bordo sinistro della scatola di una
     N e il centro della sua asta sinistra c'e' di mezzo tutta la grazia, che
     sporge. Scritte sul bordo, le spine restano fuori dall'inchiostro e
     quell'asta non la disegna nessuno. Il centraggio automatico le aggiusta,
     ma ha un limite di spostamento: deve azzeccare QUALE asta, il resto lo
     trova lui. */

  var SPINE = {
    /* ---- di partenza: ART AND FASHION ---- */

    A: [
      [[0.50, 0.03], [0.11, 0.97]],            /* gamba sinistra   */
      [[0.50, 0.03], [0.89, 0.97]],            /* gamba destra     */
      [[0.24, 0.71], [0.76, 0.71]]             /* traversa         */
    ],
    R: [
      [[0.13, 0.03], [0.13, 0.97]],            /* asta             */
      [[0.15, 0.06], [0.55, 0.09], [0.74, 0.27],
       [0.55, 0.46], [0.15, 0.50]],            /* occhiello        */
      [[0.44, 0.52], [0.86, 0.95]]             /* gamba            */
    ],
    T: [
      [[0.50, 0.08], [0.50, 0.96]],            /* asta             */
      [[0.08, 0.07], [0.92, 0.07]]             /* traversa         */
    ],
    N: [
      [[0.13, 0.04], [0.13, 0.96]],            /* asta sinistra    */
      [[0.13, 0.06], [0.87, 0.94]],            /* diagonale        */
      [[0.87, 0.04], [0.87, 0.96]]             /* asta destra      */
    ],
    D: [
      [[0.13, 0.03], [0.13, 0.97]],            /* asta             */
      [[0.15, 0.05], [0.55, 0.10], [0.88, 0.40],
       [0.88, 0.60], [0.55, 0.90], [0.15, 0.95]] /* pancia         */
    ],
    F: [
      [[0.13, 0.03], [0.13, 0.97]],            /* asta             */
      [[0.13, 0.07], [0.88, 0.07]],            /* traversa alta    */
      [[0.13, 0.49], [0.72, 0.49]]             /* traversa media   */
    ],
    S: [
      [[0.86, 0.17], [0.70, 0.07], [0.38, 0.07], [0.17, 0.19], [0.26, 0.34]],
      [[0.26, 0.34], [0.50, 0.48], [0.74, 0.62]],
      [[0.74, 0.62], [0.84, 0.79], [0.64, 0.93], [0.30, 0.93], [0.13, 0.82]]
    ],
    H: [
      [[0.13, 0.04], [0.13, 0.96]],            /* asta sinistra    */
      [[0.13, 0.50], [0.87, 0.50]],            /* traversa         */
      [[0.87, 0.04], [0.87, 0.96]]             /* asta destra      */
    ],
    I: [
      [[0.50, 0.04], [0.50, 0.96]]             /* asta             */
    ],
    O: [
      /* Anello chiuso: i due capi coincidono, quindi il poligono si chiude
         con una fessura di larghezza zero — invisibile. E' quella fessura
         che, aprendosi, diventera' la bocca della C: percio' la cucitura va
         messa esattamente li', a meta' del fianco destro, e non in cima.
         Il verso — orario sullo schermo — deve essere lo stesso della C:
         se uno girasse al contrario, il "fuori" di una sarebbe il "dentro"
         dell'altra e a meta' strada il nastro passerebbe per zero. */
      [[0.90, 0.50], [0.89, 0.62], [0.74, 0.86], [0.50, 0.93],
       [0.26, 0.86], [0.11, 0.62], [0.11, 0.38], [0.26, 0.14],
       [0.50, 0.07], [0.74, 0.14], [0.89, 0.38], [0.90, 0.50]]
    ],

    /* ---- di arrivo: VELVET SILENCE ---- */

    V: [
      /* Dall'alto al basso come tutte le altre, anche se il vertice della V
         sta in fondo mentre quello della A sta in cima. Il giunto non e'
         legato al capo dell'osso: e' il punto dove le due gambe si toccano,
         e quel punto e' libero di scorrere — nella A e' in cima, nella V in
         fondo, e per strada scende.

         Scrivendole dal vertice in su, le gambe della V puntavano in SENSO
         OPPOSTO a quelle della A e per arrivarci ruotavano di 128 gradi
         passando per l'orizzontale: a meta' strada la lettera era una
         scheggia sdraiata. */
      [[0.11, 0.04], [0.50, 0.96]],            /* gamba sinistra   */
      [[0.89, 0.04], [0.50, 0.96]]             /* gamba destra     */
    ],
    E: [
      [[0.13, 0.03], [0.13, 0.97]],            /* asta             */
      [[0.13, 0.07], [0.88, 0.07]],            /* traversa alta    */
      [[0.13, 0.50], [0.74, 0.50]],            /* traversa media   */
      [[0.13, 0.93], [0.90, 0.93]]             /* traversa bassa   */
    ],
    L: [
      [[0.13, 0.03], [0.13, 0.97]],            /* asta             */
      [[0.13, 0.93], [0.90, 0.93]]             /* piede            */
    ],
    C: [
      /* stesso verso della O: si parte dal labbro basso della bocca */
      [[0.88, 0.78], [0.70, 0.92], [0.38, 0.92], [0.11, 0.64],
       [0.11, 0.36], [0.38, 0.08], [0.70, 0.08], [0.88, 0.22]]
    ]
  };

  /* ========================================================================
     LE COPPIE

     mappa[i] = a quale asta della lettera di arrivo va l'asta i di quella di
                partenza. -1 vuol dire che quell'asta non ha un seguito.
     piega[i] = solo per le aste senza seguito: su quale asta di ARRIVO si
                ripiega fino a sparirci dentro.
     nasce[j] = solo per le aste di arrivo che non vengono da nessuna parte:
                da quale asta di PARTENZA si apre, come un compasso.

     Le coppie sono 11, non 13: A>V e N>E tornano due volte.
     ==================================================================== */

  var COPPIE = {
    /* 1 e 4 — la traversa si ripiega nel vertice della V e ci sparisce
       dentro. E' l'esempio che ha fatto lui: la A che diventa T. */
    "A>V": { mappa: [0, 1, -1], piega: { 2: 0 } },

    /* 2 — l'occhiello si SROTOLA nella traversa alta, la gamba ruota fino
       all'orizzontale e diventa la traversa bassa. La media nasce dall'asta. */
    "R>E": { mappa: [0, 1, 3], nasce: { 2: 0 } },

    /* 3 — la traversa scivola lungo l'asta, da sopra a sotto, mentre l'asta
       trasla a sinistra. Due movimenti soli, nessuna nascita, nessuna morte. */
    "T>L": { mappa: [0, 1] },

    /* 5 e 13 — la diagonale si alza fino all'orizzontale, l'asta destra
       ruota di 90 gradi attorno al suo piede. */
    "N>E": { mappa: [0, 1, 3], nasce: { 2: 0 } },

    /* 6 — la pancia si srotola nella traversa, l'asta scivola al centro. */
    "D>T": { mappa: [0, 1] },

    /* 7 — nessuna muore, e si appaiano nell'ordine in cui stanno sulla
       pagina: traversa alta -> arco alto, asta -> diagonale di mezzo,
       traversa media -> arco basso. */
    "F>S": { mappa: [1, 0, 2] },

    /* 8 — la gamba sinistra si raddrizza, la destra e la traversa si piegano
       sull'asta e ci spariscono dentro. */
    "A>I": { mappa: [0, -1, -1], piega: { 1: 0, 2: 0 } },

    /* 9 — la diagonale si raddrizza in asta, l'arco basso si srotola nel
       piede, l'arco alto si ripiega sull'asta. */
    "S>L": { mappa: [-1, 0, 1], piega: { 0: 0 } },

    /* 10 — l'asta destra ruota di 90 gradi e diventa la traversa alta, la
       traversa resta al centro, la bassa nasce dal piede dell'asta. */
    "H>E": { mappa: [0, 2, 1], nasce: { 3: 0 } },

    /* 11 — l'asta scivola a sinistra; diagonale e asta destra si aprono da
       lei come un compasso. */
    "I>N": { mappa: [0], nasce: { 1: 0, 2: 0 } },

    /* 12 — l'anello si apre. La fessura di larghezza zero in cima alla O
       diventa la bocca della C: nessun contorno nasce, nessuno muore, e'
       sempre stato lo stesso nastro. */
    "O>C": { mappa: [0] }
  };

  global.CapeLettere = { SPINE: SPINE, COPPIE: COPPIE };
})(typeof window !== "undefined" ? window : this);

/* ============================================================================
   CAPE — L'OSSATURA DI UNA COPPIA DI LETTERE

   Una lettera si piega come una striscia di carta: un lembo alla volta, e
   ogni lembo RUOTA attorno a una piega. Non e' un morphing, e' un origami.
   Da qui discende tutto quello che c'e' in questo file.

   1. I GIUNTI, NON LE OSSA

   Il disegno non e' fatto di ossa che si muovono: e' fatto di GIUNTI che si
   muovono, e le ossa stanno fra un giunto e l'altro. Cosi' non c'e' modo che
   un'osso si stacchi: non ha una posizione propria da cui staccarsi.

   Due capi che nella lettera di partenza stanno nello stesso punto E nella
   lettera di arrivo pure sono lo STESSO giunto: si muovono insieme per
   costruzione. Due capi che coincidono solo in una delle due — l'apice della
   A, che nella V non esiste piu' — restano due giunti distinti che partono
   sovrapposti e si aprono. E' cosi' che un apice si apre senza strapparsi.

   2. IN ARCO, NON IN LINEA RETTA

   Ogni giunto e' appeso al suo genitore, e quello che si interpola non e' la
   sua posizione ma ANGOLO e RAGGIO rispetto a lui. Un capo che ruota di
   novanta gradi descrive un quarto di cerchio, non la corda che lo taglia.
   Interpolando le posizioni — che e' la cosa ovvia — l'osso a meta' strada
   risulta piu' corto del vero e la piega sembra molle. E' tutta qui la
   differenza fra un braccio che si alza e un elastico che si accorcia.

   3. UNA PIEGA ALLA VOLTA

   Ogni giunto si muove nella sua finestra di tempo, sfalsata secondo quanto
   e' lontano dalla radice. La prima piega finisce mentre la seconda comincia,
   e la lettera si compone per gradi invece di sciogliersi tutta insieme.

   NASCERE E MORIRE

   Un'osso che nell'altra lettera non c'e' non svanisce e non spunta dal
   nulla: sta PIEGATO PIATTO sopra l'osso vicino — stessa lunghezza, angolo
   zero — e da li' si apre come un compasso. Mentre e' chiuso sta dentro
   l'inchiostro dell'altro e non si vede, esattamente come la traversa della A
   che si corica sull'asta della T. Nell'ultimo tratto rientra nel giunto,
   cosi' non resta nemmeno un filo sopra l'osso che lo ospita.
============================================================================ */
(function (global) {
  "use strict";

  var M = global.CapeMorph, LET = global.CapeLettere;

  /* ——— il ritmo dell'origami ——————————————————————————————————————
     Le pieghe NON si sovrappongono: una comincia quando la precedente ha
     finito. Non e' una scelta di gusto, e' l'unico modo perche' regga.

     Facendole accavallare, un lembo ruota attorno a un giunto che si sta
     ancora muovendo: le rotazioni si sommano e a meta' strada il pezzo e'
     da tutt'altra parte. Su una catena di tre o quattro giunti la lettera
     esce dal foglio. Nell'origami vero non si piega un lembo mentre quello
     sotto e' ancora in movimento — si aspetta che si sia posato.

     Il risultato e' anche quello giusto da guardare: un movimento alla
     volta, ognuno con un principio e una fine. */
  var SOVRAPPONE = 0.06;  /* quel filo di accavallamento che toglie lo stacco
                             fra una piega e l'altra senza farle interferire */

  /* Secca: parte decisa, arriva decisa, non striscia. */
  function scatto(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  var cache = {};

  function lettera(ch, famiglia, peso) {
    var k = ch + "|" + famiglia + "|" + peso;
    if (!cache[k]) {
      var spine = LET.SPINE[ch];
      if (!spine) throw new Error("manca la spina per " + ch);
      var L = M.monta(ch, famiglia, peso, spine);
      L.aste.forEach(function (a) { a.pts = M.srotola(a.I); });
      cache[k] = L;
    }
    return cache[k];
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* ——— il lembo chiuso ——————————————————————————————————————————————
     Un osso che nell'altra lettera non c'e' sta PIEGATO PIATTO su un altro
     osso: stessa lunghezza, disteso lungo di lui, incernierato nel punto in
     cui lo tocca. Da li' si apre come un compasso.

     Due cose che sembrano dettagli e non lo sono.

     SU QUALE OSSO. Non il piu' vicino qualunque: quello a cui il lembo e'
     ATTACCATO nella lettera dove esiste. La traversa della A tocca la gamba
     sinistra, quindi si corica sulla gamba sinistra della V — parallela a
     lei — e sparisce dentro il suo inchiostro. Coricata altrove resterebbe
     un trattino di traverso in mezzo alla V.

     DA QUALE CAPO. Dal capo con cui lo tocca, non sempre dal primo. L'asta
     destra della N tocca la diagonale in FONDO: quindi e' incernierata la',
     e si apre dalla fine della diagonale. Incernierandola in cima come la
     diagonale, dallo stesso vertice uscirebbero tre assi a ventaglio invece
     di due — che e' esattamente l'errore da non fare.

     E se l'osso che ospita e' a sua volta un lembo — l'asta destra della N
     si appoggia alla diagonale, che nella I non c'e' — si risolve prima
     quello: cosi' nella I sono tutti e due coricati sull'asta, e si aprono
     uno dopo l'altro. */

  /* A quale osso e' attaccato un lembo, e con quale dei suoi due capi. Si
     guarda solo fra gli ossi GIA' RISOLTI: se no la diagonale della N e la
     sua asta destra si eleggono a vicenda — si toccano, e ognuna e' la piu'
     vicina all'altra — e nessuna delle due si risolve mai. Risolvendole in
     ordine, la diagonale trova l'asta che c'e' gia' e l'asta destra trova la
     diagonale: lo stesso ordine in cui si aprono. */
  function attacco(mio, altri, ioStesso, pronto) {
    var best = null;
    for (var k = 0; k < altri.length; k++) {
      if (k === ioStesso || !altri[k] || !pronto[k]) continue;
      for (var e = 0; e < 2; e++) {
        var capo = e === 0 ? mio[0] : mio[mio.length - 1];
        var d = M.doveSu(altri[k], capo);
        if (!best || d.d2 < best.d2) best = { d2: d.d2, ospite: k, capo: e, u: d.u };
      }
    }
    return best;
  }

  function coricato(lung, ospite, u, capo) {
    var giu = M.puntoSu(ospite, u);
    /* verso il corpo dell'ospite, non fuori: un lembo chiuso sta dentro la
       lettera, non le sporge accanto */
    var a = u > 0.5 ? giu.ang + Math.PI : giu.ang;
    var via = { x: giu.x + Math.cos(a) * lung, y: giu.y + Math.sin(a) * lung };
    /* la cerniera e' il capo con cui tocca: se e' il secondo, il lembo si
       distende all'indietro */
    return capo === 0 ? { p0: { x: giu.x, y: giu.y }, p1: via, ang: a }
                      : { p0: via, p1: { x: giu.x, y: giu.y }, ang: a + Math.PI };
  }

  /* ====================================================================== */

  function coppia(chA, chB, famiglia, peso) {
    var A = lettera(chA, famiglia, peso), B = lettera(chB, famiglia, peso);
    var R = LET.COPPIE[chA + ">" + chB];
    if (!R) throw new Error("manca la coppia " + chA + ">" + chB);

    var righe = [], presi = {}, i, j;
    for (i = 0; i < A.aste.length; i++) {
      var dest = R.mappa ? R.mappa[i] : -1;
      if (dest >= 0) presi[dest] = 1;
      righe.push({ a: i, b: dest >= 0 ? dest : -1 });
    }
    for (j = 0; j < B.aste.length; j++) if (!presi[j]) righe.push({ a: -1, b: j });

    /* ---- i capi di ogni osso nelle due lettere ------------------------- */
    var ossa = righe.map(function (r) {
      var pa = r.a >= 0 ? A.aste[r.a].pts : null;
      var pb = r.b >= 0 ? B.aste[r.b].pts : null;
      return {
        a: r.a, b: r.b, ptsA: pa, ptsB: pb,
        posA: pa ? [pa[0], pa[pa.length - 1]] : null,
        posB: pb ? [pb[0], pb[pb.length - 1]] : null,
        segsA: pa ? M.intrinseca(pa).segs : null,
        segsB: pb ? M.intrinseca(pb).segs : null,
        angA:  pa ? M.intrinseca(pa).a0 : null,
        angB:  pb ? M.intrinseca(pb).a0 : null,
        carneA: r.a >= 0 ? A.aste[r.a].carne : B.aste[r.b].carne,
        carneB: r.b >= 0 ? B.aste[r.b].carne : A.aste[r.a].carne,
        muore: r.b < 0, nasce: r.a < 0
      };
    });

    /* ---- i lembi chiusi, risolti in ordine di dipendenza --------------- */
    /* due capi bastano a fare una retta: serve a coricare un lembo su un
       altro lembo, che di polilinea non ne ha una */
    function linea(capi) {
      if (!capi) return null;
      return [capi[0], capi[1]];
    }

    function risolvi(dove) {
      /* dove = "a": gli ossi che mancano nella lettera B */
      var qui = dove === "a" ? "ptsA" : "ptsB";    /* dove il lembo esiste  */
      var la  = dove === "a" ? "posB" : "posA";    /* dove va coricato      */
      var alt = dove === "a" ? "ptsB" : "ptsA";
      var manca = dove === "a" ? "muore" : "nasce";

      /* la posa nell'altra lettera: per chi c'e' e' quella vera, per chi
         manca e' il lembo chiuso, e si riempie man mano */
      ossa.forEach(function (o) { if (o[manca]) o[la] = null; });

      /* Si risolve un lembo per volta, sempre il piu' attaccato a qualcosa
         che c'e' gia'. La prima passata ne trova uno solo — quello che tocca
         un osso vero — e da li' in poi ogni lembo risolto diventa a sua volta
         un appoggio possibile. */
      var pronto = ossa.map(function (o) { return !o[manca]; });
      var restano = ossa.filter(function (o) { return o[manca]; }).length;

      while (restano > 0) {
        var scelto = -1, migliore = null;
        ossa.forEach(function (o, k) {
          if (pronto[k]) return;
          var A = attacco(o[qui], ossa.map(function (x) { return x[qui]; }), k, pronto);
          if (A && (!migliore || A.d2 < migliore.d2)) { migliore = A; scelto = k; }
        });
        if (scelto < 0) break;

        var osp = ossa[migliore.ospite][alt] || linea(ossa[migliore.ospite][la]);
        var c = coricato(M.lunghezza(ossa[scelto][qui]), osp, migliore.u, migliore.capo);
        ossa[scelto][la] = [c.p0, c.p1];
        ossa[scelto].cerniera = ossa[scelto].cerniera || {};
        ossa[scelto].cerniera[la] = c.ang;
        pronto[scelto] = true;
        restano--;
      }

      /* se qualcuno e' rimasto — un anello di dipendenze — lo si corica sul
         primo osso che c'e' in tutte e due le lettere */
      ossa.forEach(function (o, k) {
        if (!o[manca] || o[la]) return;
        for (var j = 0; j < ossa.length; j++) {
          if (j === k || !ossa[j].ptsA || !ossa[j].ptsB) continue;
          var d = M.doveSu(ossa[j][alt], M.puntoSu(o[qui], 0.5));
          var c = coricato(M.lunghezza(o[qui]), ossa[j][alt], d.u, 0);
          o[la] = [c.p0, c.p1];
          o.cerniera = o.cerniera || {};
          o.cerniera[la] = c.ang;
          return;
        }
      });
    }
    risolvi("a"); risolvi("b");

    ossa.forEach(function (o) {
      o.capiA = o.nasce ? o.posA : [o.ptsA[0], o.ptsA[o.ptsA.length - 1]];
      o.capiB = o.muore ? o.posB : [o.ptsB[0], o.ptsB[o.ptsB.length - 1]];
      if (o.nasce) { o.segsA = o.segsB; o.angA = o.cerniera.posA; }
      if (o.muore) { o.segsB = o.segsA; o.angB = o.cerniera.posB; }
    });

    /* ---- i giunti ------------------------------------------------------
       Due capi sono lo STESSO giunto solo se coincidono in tutte e due le
       lettere. Se coincidono in una sola — l'apice della A — restano due
       giunti distinti che partono sovrapposti e si aprono. */
    var nodi = [], EPS = 0.02;
    ossa.forEach(function (o, k) {
      o.g = [];
      for (var e = 0; e < 2; e++) {
        var pa = o.capiA[e], pb = o.capiB[e], trovato = -1;
        for (var n = 0; n < nodi.length; n++) {
          if (dist(nodi[n].a, pa) < EPS && dist(nodi[n].b, pb) < EPS) { trovato = n; break; }
        }
        if (trovato < 0) { nodi.push({ a: pa, b: pb }); trovato = nodi.length - 1; }
        o.g.push(trovato);
      }
    });

    /* ---- l'albero dei giunti -------------------------------------------
       Le due estremita' di un osso sono sempre legate fra loro. Il resto si
       collega a chi ha piu' vicino, contando la distanza in tutte e due le
       lettere: un legame che e' corto solo in una delle due non e' un
       legame. La radice e' il giunto che si sposta meno — quello attorno a
       cui e' naturale che ruoti tutto il resto. */
    var N = nodi.length, padre = [], ordine = [], dentro = [], prof = [];

    /* La radice dev'essere il giunto di un osso che c'e' in TUTTE E DUE le
       lettere. Prendendo semplicemente quello che si sposta meno si finisce
       per scegliere il capo di un osso che muore — che non si sposta proprio
       perche' sta per sparire — e allora tutta la lettera penzola da un pezzo
       che se ne sta andando. Fra i candidati buoni si prende comunque quello
       piu' fermo: e' attorno a lui che e' naturale che ruoti il resto. */
    var buono = [];
    for (i = 0; i < N; i++) buono[i] = false;
    ossa.forEach(function (o) {
      if (o.muore || o.nasce) return;
      buono[o.g[0]] = true; buono[o.g[1]] = true;
    });
    var radice = 0, meno = Infinity, trovata = false;
    for (i = 0; i < N; i++) {
      if (!buono[i]) continue;
      var m = dist(nodi[i].a, nodi[i].b);
      if (m < meno) { meno = m; radice = i; trovata = true; }
    }
    if (!trovata) {
      for (i = 0; i < N; i++) {
        var m2 = dist(nodi[i].a, nodi[i].b);
        if (m2 < meno) { meno = m2; radice = i; }
      }
    }

    function costo(x, y) {
      for (var k = 0; k < ossa.length; k++) {
        if ((ossa[k].g[0] === x && ossa[k].g[1] === y) ||
            (ossa[k].g[1] === x && ossa[k].g[0] === y)) return 0;
      }
      return dist(nodi[x].a, nodi[y].a) + dist(nodi[x].b, nodi[y].b);
    }

    for (i = 0; i < N; i++) { padre[i] = -1; dentro[i] = false; prof[i] = 0; }
    dentro[radice] = true; ordine.push(radice); prof[radice] = 0;
    for (var passo = 1; passo < N; passo++) {
      var bx = -1, by = -1, bc = Infinity;
      for (i = 0; i < N; i++) {
        if (!dentro[i]) continue;
        for (j = 0; j < N; j++) {
          if (dentro[j]) continue;
          var c = costo(i, j);
          if (c < bc) { bc = c; bx = i; by = j; }
        }
      }
      if (by < 0) break;
      dentro[by] = true; padre[by] = bx; prof[by] = prof[bx] + 1; ordine.push(by);
    }
    for (i = 0; i < N; i++) if (!dentro[i]) { padre[i] = radice; prof[i] = 1; ordine.push(i); }

    /* ---- angolo e raggio rispetto al genitore --------------------------- */
    var polo = [];
    for (i = 0; i < N; i++) {
      if (padre[i] < 0) { polo.push(null); continue; }
      var p = nodi[padre[i]], q = nodi[i];
      var ragA = dist(p.a, q.a), ragB = dist(p.b, q.b);
      var angA = Math.atan2(q.a.y - p.a.y, q.a.x - p.a.x);
      var angB = Math.atan2(q.b.y - p.b.y, q.b.x - p.b.x);
      /* Su raggio zero l'angolo non vuol dire niente: due giunti sovrapposti
         non hanno una direzione l'uno rispetto all'altro. Lasciandogli lo
         zero che esce da atan2(0,0), il giunto parte spazzando un arco a
         caso — ed e' cosi' che l'apice della A, che nella V si apre da un
         punto solo, mandava la lettera a pezzi a meta' strada. Quando un
         raggio e' nullo si prende l'angolo dell'altro capo: il giunto esce
         dritto da dove sta, che e' l'unica cosa che voglia dire qualcosa. */
      /* Quando un raggio e' molto piu' corto dell'altro, il suo angolo non
         descrive piu' niente di utile: due giunti quasi sovrapposti non
         hanno una direzione l'uno rispetto all'altro, e prenderla sul serio
         vuol dire far percorrere al giunto un giro della morte mentre il
         raggio si chiude. Si copia l'angolo dell'altro capo: il giunto entra
         e esce in linea retta, che e' l'unica cosa che voglia dire qualcosa.
         E' quello che mandava a pezzi la A che diventa V — i due piedi, che
         nella V si toccano, ci arrivavano girando di 159 gradi. */
      var corto = Math.min(ragA, ragB), lungo = Math.max(ragA, ragB);
      if (corto < lungo * 0.12) { if (ragA < ragB) angA = angB; else angB = angA; }
      polo.push({ angA: angA, ragA: ragA, angB: angB, ragB: ragB });
    }

    /* ---- il ritmo ------------------------------------------------------- */
    var profMax = 0;
    for (i = 0; i < N; i++) profMax = Math.max(profMax, prof[i]);
    /* tanti turni quanti sono i livelli: la radice si posa, poi il primo
       lembo, poi quello attaccato a lui, e cosi' via */
    var turni = profMax + 1;
    var passo = 1 / turni;

    /* Il filo di accavallamento si aggiunge solo ai bordi INTERNI: a t=0
       nessuna piega e' cominciata e a t=1 nessuna e' rimasta indietro. Senza
       questo ritaglio la radice risultava gia' partita dell'undici per cento
       nell'istante zero, e la lettera nasceva spostata. */
    function tau(d, t) {
      var da = Math.max(0, d * passo - SOVRAPPONE);
      var a  = Math.min(1, (d + 1) * passo + SOVRAPPONE);
      return scatto((t - da) / (a - da));
    }

    /* ====================================================================
       la forma a un dato istante
       ==================================================================== */

    function posizioni(t) {
      var P = [];
      for (var k = 0; k < ordine.length; k++) {
        var i = ordine[k], s = tau(prof[i], t);
        if (padre[i] < 0) {
          P[i] = { x: nodi[i].a.x + (nodi[i].b.x - nodi[i].a.x) * s,
                   y: nodi[i].a.y + (nodi[i].b.y - nodi[i].a.y) * s };
        } else {
          var w = polo[i], p = P[padre[i]];
          var ang = w.angA + M.norm(w.angB - w.angA) * s;
          var rag = w.ragA + (w.ragB - w.ragA) * s;
          P[i] = { x: p.x + Math.cos(ang) * rag, y: p.y + Math.sin(ang) * rag };
        }
      }
      return P;
    }

    /* Un lembo non esce gia' lungo per poi ruotare: si ALLUNGA MENTRE SI
       APRE, come una striscia che si sfila. La lunghezza segue la stessa
       piega, non una finestra sua — se no il lembo della I resta appeso a
       penzoloni sotto la riga per meta' animazione, lungo quanto la
       diagonale che diventera' ma ancora piegato sull'asta.

       E chi muore fa il contrario: si accorcia rientrando nel giunto, cosi'
       non resta nemmeno un filo sopra l'osso che lo ospita. */
    function ritiro(o, s) {
      if (o.muore) return 1 - s;
      if (o.nasce) return s;
      return 1;
    }

    function pari(segs, n) {
      if (segs.length === n) return segs;
      return M.riparti({ x0: 0, y0: 0, a0: 0, segs: segs }, n).segs;
    }

    function ossoA(o, P, t) {
      var s = (tau(prof[o.g[0]], t) + tau(prof[o.g[1]], t)) / 2;
      var n = Math.max(o.segsA.length, o.segsB.length);
      var sa = pari(o.segsA, n), sb = pari(o.segsB, n), segs = [], i;
      for (i = 0; i < n; i++) {
        segs.push({
          len:  sa[i].len  + (sb[i].len  - sa[i].len)  * s,
          giro: sa[i].giro + M.norm(sb[i].giro - sa[i].giro) * s
        });
      }
      var q0 = P[o.g[0]], q1 = P[o.g[1]];
      var k = ritiro(o, s);
      if (k < 1) {
        q1 = { x: q0.x + (q1.x - q0.x) * k, y: q0.y + (q1.y - q0.y) * k };
      }
      return { segs: segs, p0: q0, p1: q1, s: s, k: k,
               ang: o.angA + M.norm(o.angB - o.angA) * s };
    }

    /* Si srotola la forma interna — ed e' quello che fa incurvare invece di
       stiracchiare — poi la si prende per i capi e la si porta fra i due
       giunti. La seconda mossa e' una similitudine: ruota e scala, non
       deforma. */
    /* L'osso si srotola dalla sua forma interna a partire dalla sua
       inclinazione — ed e' quello che lo fa incurvare invece di
       stiracchiare — poi lo si prende per i capi e lo si porta fra i due
       giunti. La seconda mossa e' una similitudine: ruota e scala, non
       deforma.

       Ma vale solo se l'osso ha una CORDA su cui fare presa. Un anello — la
       O — ha i due capi nello stesso punto: la sua corda e' zero, e il
       rapporto fra due corde quasi nulle non vuol dire niente. Li' la
       correzione fa collassare l'anello a un puntino. Quando la corda e'
       corta rispetto allo sviluppo, quindi, ci si fida dell'inclinazione e
       basta: l'anello resta un anello e si apre da solo srotolandosi. */
    function costruisci(o) {
      var pts = M.srotola({ x0: o.p0.x, y0: o.p0.y, a0: o.ang, segs: o.segs });
      var n = pts.length - 1, sviluppo = 0;
      for (var z = 0; z < o.segs.length; z++) sviluppo += o.segs[z].len;
      var ax = pts[n].x - o.p0.x, ay = pts[n].y - o.p0.y;
      var bx = o.p1.x - o.p0.x,   by = o.p1.y - o.p0.y;
      var la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < sviluppo * 0.25 || lb < sviluppo * 0.25) return pts;
      if (la < 1e-6 || lb < 1e-6) return pts;
      var f = lb / la, rot = Math.atan2(by, bx) - Math.atan2(ay, ax);
      var co = Math.cos(rot) * f, si = Math.sin(rot) * f, out = [];
      for (var i = 0; i <= n; i++) {
        var dx = pts[i].x - o.p0.x, dy = pts[i].y - o.p0.y;
        out.push({ x: o.p0.x + dx * co - dy * si, y: o.p0.y + dx * si + dy * co });
      }
      return out;
    }

    function mescolaCarne(a, b, t) {
      if (t <= 0) return a;
      if (t >= 1) return b;
      var n = a.corpo.fuori.length, f = new Float32Array(n), d = new Float32Array(n), i;
      for (i = 0; i < n; i++) {
        f[i] = a.corpo.fuori[i]  + (b.corpo.fuori[i]  - a.corpo.fuori[i])  * t;
        d[i] = a.corpo.dentro[i] + (b.corpo.dentro[i] - a.corpo.dentro[i]) * t;
      }
      return {
        corpo: { fuori: f, dentro: d },
        testa: mescolaFigura(a.testa, b.testa, t),
        coda:  mescolaFigura(a.coda,  b.coda,  t),
        gr: a.gr + (b.gr - a.gr) * t, ring: a.ring
      };
    }

    function mescolaFigura(a, b, t) {
      if (!a || !b) return a || b;
      var out = [];
      for (var i = 0; i < a.length; i++) {
        out.push({ x: a[i].x + (b[i].x - a[i].x) * t, y: a[i].y + (b[i].y - a[i].y) * t });
      }
      return out;
    }

    /* per il banco: com'e' fatto l'albero dei giunti */
    function radiografia() {
      var r = ['--- ' + chA + '>' + chB + ' ---'];
      for (var i = 0; i < N; i++) {
        r.push('g' + i + ' prof=' + prof[i] + ' padre=' + padre[i] +
               ' A=(' + nodi[i].a.x.toFixed(2) + ',' + nodi[i].a.y.toFixed(2) + ')' +
               ' B=(' + nodi[i].b.x.toFixed(2) + ',' + nodi[i].b.y.toFixed(2) + ')' +
               (polo[i] ? ' rag ' + polo[i].ragA.toFixed(2) + '->' + polo[i].ragB.toFixed(2) +
                          ' ang ' + (polo[i].angA * 180 / Math.PI).toFixed(0) + '->' +
                          (polo[i].angB * 180 / Math.PI).toFixed(0) : ' RADICE'));
      }
      ossa.forEach(function (o, k) {
        r.push('osso' + k + ' g=' + o.g + (o.muore ? ' MUORE' : '') + (o.nasce ? ' NASCE' : ''));
      });
      return r.join('\n');
    }

    function traccia(t) {
      var P = posizioni(t), r = ['t=' + t.toFixed(2)];
      for (var i = 0; i < N; i++) {
        r.push('  g' + i + ' prof=' + prof[i] + ' tau=' + tau(prof[i], t).toFixed(2) +
               ' -> (' + P[i].x.toFixed(2) + ',' + P[i].y.toFixed(2) + ')');
      }
      return r.join('\n');
    }

    return {
      traccia: traccia,
      radiografia: radiografia,
      chA: chA, chB: chB,
      largoA: A.largo, largoB: B.largo,
      avanzA: A.avanzamento, avanzB: B.avanzamento,
      scartoA: A.scarto, scartoB: B.scarto,

      spine: function (t) {
        var P = posizioni(t), out = [];
        ossa.forEach(function (o) {
          var q = ossoA(o, P, t);
          if (q.k > 1e-3) out.push(costruisci(q));
        });
        return out;
      },

      forma: function (t) {
        var P = posizioni(t), out = [];
        ossa.forEach(function (o) {
          var q = ossoA(o, P, t);
          if (q.k <= 1e-3) return;
          var figure = M.disegna(costruisci(q), mescolaCarne(o.carneA, o.carneB, q.s));
          for (var z = 0; z < figure.length; z++) out.push(figure[z]);
        });
        return out;
      }
    };
  }

  global.CapeCoppia = { coppia: coppia, lettera: lettera };
})(typeof window !== "undefined" ? window : this);

/* ============================================================================
   CAPE — LA PAROLA

   Mette in fila le lettere e le fa piegare tutte insieme. Gli spazi non sono
   lettere: sono vuoti fra una lettera e l'altra, e anche loro si
   interpolano — e' cosi' che "ART AND FASHION", che ha i vuoti dopo la terza
   e dopo la sesta, diventa "VELVET SILENCE", che ce l'ha solo dopo la sesta,
   senza che nessuna lettera scavalchi la vicina.

   La riga si RICOMPONE a ogni istante: ogni lettera ha il suo avanzamento
   interpolato e si mette in fila dopo la precedente. Interpolare invece le
   posizioni di arrivo fa scavallare le lettere a meta' strada, perche' le
   larghezze non cambiano allo stesso ritmo delle distanze.
============================================================================ */
(function (global) {
  "use strict";

  var C = global.CapeCoppia;

  function soleLettere(s) { return s.replace(/\s+/g, "").split(""); }

  function vuoti(testo, spaziatura, spazio) {
    var g = [], k = -1;
    for (var i = 0; i < testo.length; i++) {
      if (/\s/.test(testo[i])) { if (k >= 0) g[k] += spazio; }
      else { k++; g[k] = spaziatura; }
    }
    return g;
  }

  function parola(da, a, opz) {
    opz = opz || {};
    var fam  = opz.famiglia || "serif";
    var peso = opz.peso || "400";
    var spazA = opz.spaziaturaDa != null ? opz.spaziaturaDa : 0.045;
    var spazB = opz.spaziaturaA  != null ? opz.spaziaturaA  : 0.070;

    var lettA = soleLettere(da), lettB = soleLettere(a);
    if (lettA.length !== lettB.length) {
      throw new Error("le due parole non hanno lo stesso numero di lettere: " +
                      lettA.length + " contro " + lettB.length);
    }

    var coppie = lettA.map(function (c, i) { return C.coppia(c, lettB[i], fam, peso); });
    var gA = vuoti(da, spazA, 0.30), gB = vuoti(a, spazB, 0.34);

    function riga(t, corpo) {
      var x = 0, out = [];
      for (var i = 0; i < coppie.length; i++) {
        out.push(x * corpo);
        var av = coppie[i].avanzA + (coppie[i].avanzB - coppie[i].avanzA) * t;
        var g  = (gA[i] || 0) + (((gB[i] || 0) - (gA[i] || 0)) * t);
        x += av + g;
      }
      return { x: out, largo: x * corpo };
    }

    return {
      lettere: coppie.length,
      /* quanto e' larga la riga a un dato istante, con un dato corpo */
      largo: function (t, corpo) { return riga(t, corpo).largo; },

      /* Disegna. x,y sono l'angolo sinistro della RIGA DI BASE. */
      disegna: function (ctx, t, x, y, corpo) {
        var R = riga(t, corpo);
        for (var i = 0; i < coppie.length; i++) {
          var cp = coppie[i];
          var sx = (cp.scartoA.x + (cp.scartoB.x - cp.scartoA.x) * t) * corpo;
          var ox = x + R.x[i] + sx, oy = y - corpo;
          var forme = cp.forma(t);
          for (var j = 0; j < forme.length; j++) {
            var p = forme[j];
            if (!p.length) continue;
            ctx.beginPath();
            ctx.moveTo(ox + p[0].x * corpo, oy + p[0].y * corpo);
            for (var q = 1; q < p.length; q++) ctx.lineTo(ox + p[q].x * corpo, oy + p[q].y * corpo);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    };
  }

  global.CapeParola = { parola: parola };
})(typeof window !== "undefined" ? window : this);

/* ============================================================================
   CAPE — BANCO DI PROVA

   Non e' il modulo che andra' sul sito: e' il banco per guardare la piega
   dal vivo, col carattere vero, sullo schermo vero. Si mette in una pagina
   di prova, si scrolla, e la parola si piega.

   Fa una cosa sola: un binario alto qualche schermata, un canvas appiccicato
   in mezzo, e l'avanzamento dello scroll come tempo. Quello che manca —
   l'inchiostro, il viaggio verso il titolo, la sezione che si apre — non c'e'
   apposta: qui si guarda solo se la piega e' bella.
============================================================================ */
(function (global) {
  "use strict";

  function banco(opz) {
    opz = opz || {};
    var host = typeof opz.dentro === "string" ? document.querySelector(opz.dentro) : opz.dentro;
    if (!host) { console.warn("[cape-piega] contenitore non trovato:", opz.dentro); return; }

    var da   = opz.da || "ART AND FASHION";
    var a    = opz.a  || "VELVET SILENCE";
    var fam  = opz.famiglia || "serif";
    var peso = opz.peso || "400";
    var colore  = opz.colore || "#141416";
    var fondo   = opz.fondo  || "#ffffff";
    var corsa   = opz.corsa  || 300;   /* altezza del binario, in vh          */
    var corpoDa = opz.corpoDa != null ? opz.corpoDa : 0.095; /* in frazione di
                                          larghezza schermo: il corpo grande  */
    var corpoA  = opz.corpoA  != null ? opz.corpoA  : 0.034;
    var conBarra = opz.conBarra !== false;

    host.innerHTML =
      '<div class="cape-piega-rail" style="position:relative;height:' + corsa + 'vh">' +
        '<div class="cape-piega-stick" style="position:sticky;top:0;height:100vh;overflow:hidden">' +
          '<canvas style="display:block;width:100%;height:100%"></canvas>' +
          (conBarra ? '<input type="range" min="0" max="1000" value="0" ' +
            'style="position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(420px,70vw)">' : '') +
        '</div>' +
      '</div>';

    var rail = host.firstChild;
    var cv   = rail.querySelector("canvas");
    var barra = rail.querySelector("input");
    var ctx  = cv.getContext("2d");

    var P = null, t = 0, manuale = false;

    function misura() {
      var r = cv.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2);
      cv.width  = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return r;
    }

    function disegna() {
      if (!P) return;
      var r = cv.getBoundingClientRect();
      ctx.fillStyle = fondo;
      ctx.fillRect(0, 0, r.width, r.height);

      var corpo = (corpoDa + (corpoA - corpoDa) * t) * r.width;
      var largo = P.largo(t, corpo);
      /* da centrata e gigante a sinistra e piccola, come sul sito */
      var xDa = (r.width - P.largo(0, corpoDa * r.width)) / 2;
      var xA  = r.width * 0.08;
      var x = xDa + (xA - xDa) * t;
      var y = r.height * (0.56 + 0.04 * t);

      ctx.fillStyle = colore;
      P.disegna(ctx, t, x, y, corpo);
    }

    function daScroll() {
      if (manuale) return;
      var r = rail.getBoundingClientRect();
      var corsaPx = r.height - global.innerHeight;
      var p = corsaPx > 0 ? (-r.top) / corsaPx : 0;
      t = p < 0 ? 0 : (p > 1 ? 1 : p);
      if (barra) barra.value = Math.round(t * 1000);
      disegna();
    }

    if (barra) {
      barra.addEventListener("input", function () {
        manuale = true; t = barra.value / 1000; disegna();
      });
      barra.addEventListener("change", function () { manuale = false; });
    }

    function avvia() {
      try { P = global.CapeParola.parola(da, a, { famiglia: fam, peso: peso }); }
      catch (e) { console.error("[cape-piega]", e.message); return; }
      misura(); daScroll(); disegna();
    }

    global.addEventListener("scroll", daScroll, { passive: true });
    global.addEventListener("resize", function () { misura(); disegna(); }, { passive: true });

    /* Il carattere va aspettato: le spine si centrano sull'inchiostro vero, e
       con il ripiego di sistema l'inchiostro e' un altro. */
    if (document.fonts && document.fonts.load) {
      var spec = peso + " 400px " + fam;
      var t1 = setTimeout(avvia, 4000), fatto = false;
      var poi = function () { if (fatto) return; fatto = true; clearTimeout(t1); avvia(); };
      Promise.all([document.fonts.load(spec, da + a), document.fonts.ready]).then(poi, poi);
    } else avvia();

    return { disegna: disegna };
  }

  global.CapePiega = { banco: banco };
})(typeof window !== "undefined" ? window : this);
