/*
 * cape-fold — la piega del titolo, fra la sezione ink-bleed e il carosello.
 *
 * ART & FASHION non sfuma nel titolo dell'opera: ci si PIEGA dentro. Ogni
 * lettera della prima scritta prende il posto della lettera che le sta nella
 * stessa posizione nella seconda, e ci arriva ruotando e allungando i propri
 * tratti, non sciogliendosi a caso.
 *
 * COME FA, IN QUATTRO MOSSE
 *
 * 1. LE SAGOME SONO QUELLE VERE. Il file del font non ci serve e non si
 *    scarica: ogni lettera viene disegnata una volta in un canvas nascosto,
 *    col carattere e il peso che il browser ha gia' caricato, e il suo
 *    contorno viene letto dal raster con marching squares. Funziona con
 *    qualunque font, anche uno commerciale servito da Webflow, perche' non
 *    si legge il file — si legge il risultato.
 *
 * 2. LO SCHELETRO E' SCRITTO A MANO. Sotto ogni lettera c'e' un disegno di
 *    pochi tratti — la A sono tre segmenti, la T due — che sta qui sotto
 *    nella tabella SCHELETRI. Non si vede mai: serve solo a dire QUALE pezzo
 *    va su QUALE pezzo. E' la differenza fra una piega e una colata: la
 *    diagonale destra della A finisce sul trattino alto della T perche' e'
 *    scritto li', non perche' l'ha deciso una distanza euclidea.
 *
 *    Uno scheletro dedotto dal raster per assottigliamento sarebbe stato
 *    automatico e sbagliato: su un didone le grazie generano rami spuri,
 *    e il ramo spurio di una grazia si sarebbe accoppiato con l'asta di
 *    un'altra lettera.
 *
 * 3. LO SCHELETRO TIRA IL CONTORNO. I tratti accoppiati si spostano dalla
 *    posizione di partenza a quella d'arrivo, e il contorno vero li segue
 *    con una deformazione ai minimi quadrati mobili, in versione SIMILITUDINE
 *    (Schaefer 2006): conserva gli angoli, quindi un tratto che deve ruotare
 *    di 90 gradi fa ruotare il pezzo di lettera che ha intorno invece di
 *    stirarlo. E' da qui che nasce la lettura "si piega".
 *
 * 4. L'ARRIVO E' ESATTO. La deformazione da sola non finirebbe mai sulla
 *    sagoma precisa della lettera nuova — i due caratteri hanno grazie e
 *    contrasti diversi. Quindi nell'ultimo tratto di corsa il punto
 *    deformato si fonde col punto corrispondente della lettera d'arrivo,
 *    e a piega finita quello che si vede e' la lettera vera, non
 *    un'approssimazione.
 *
 * COSA SERVE IN PAGINA
 *   - la sezione ink-bleed con .ink-title (il testo di partenza si legge da li')
 *   - la sezione del carosello con [data-studio] e .studio-headline__row
 *   - il foglio di stile che accompagna questo file (vedi README)
 *
 * NON TOCCA il canvas dell'inchiostro: entra in scena quando quello ha finito.
 */
(function (global) {
  "use strict";

  /* ======================== IMPOSTAZIONI ================================= */

  var C = {
    /* ——— dove ——————————————————————————————————————————————————— */
    partenza:  ".ink-title",             /* la scritta gigante              */
    sezione:   "[data-studio]",          /* la sezione che deve accogliere  */
    arrivo:    ".studio-headline__row",  /* il titolo su cui atterrare      */

    /* Tutto quello che deve restare nascosto finche' la piega non e' finita.
       Riceve .cape-fold-attesa, che il foglio di stile traduce in invisibile
       e non cliccabile. */
    daNascondere: [".studio-stats", ".studio-info", ".studio-pager"],

    /* ——— la corsa ————————————————————————————————————————————————
       Quanto scroll dura la piega. La sezione resta incollata per tutta la
       corsa: il bersaglio deve stare fermo, altrimenti il titolo insegue un
       punto che scappa. */
    corsa:     2.0,        /* in schermi. 2 = due viewport di scroll        */
    corsaMob:  1.4,        /* sotto 992px: su un pollice lo scroll costa    */

    /* ——— il carattere del movimento —————————————————————————————
       La piega non e' lineare: parte piano, il grosso succede in mezzo, e
       si posa. Cosi' l'occhio ha il tempo di riconoscere la parola vecchia
       prima che cambi e quella nuova quando e' arrivata. */
    ease:      [0.38, 0.00, 0.24, 1],

    /* Quando comincia la fusione sulla sagoma esatta d'arrivo, e con quanta
       pendenza. Prima di questo punto si vede solo la deformazione; dopo, la
       lettera vera prende il sopravvento. Alzarlo rende l'arrivo piu' secco. */
    fusioneDa: 0.28,

    /* Quanto un osso puo' allungare o accorciare la pelle che porta.
       Il compito degli ossi e' RUOTARE i pezzi di lettera; la misura esatta
       d'arrivo la mette la fusione, non loro. Senza questo tetto un osso che
       deve allungarsi di due volte e mezzo — capita, per esempio nella F che
       diventa N — gonfia la sua meta' di lettera mentre l'osso accanto la
       lascia com'e': il contorno si attraversa e il riempimento pari-dispari
       chiude tutto in una macchia nera. */
    scalaOsso: [0.82, 1.22],

    /* ——— la qualita' del tracciamento ———————————————————————————
       Questi tre numeri vanno letti insieme, e sono tarati su un didone,
       cioe' sul caso peggiore. In un carattere a contrasto estremo — Bodoni,
       PP Editorial — la traversa della A e il filetto della S sono decine di
       volte piu' sottili delle aste. A 220px quei filetti sono spessi uno o
       due pixel, l'antialiasing li porta sotto meta' opacita', e la lettera
       si SFALDA: la A perde la traversa e resta una lambda, la H si spezza
       in due aste separate, la S va in otto pezzi. Non e' un difetto che si
       vede come "un po' impreciso" — la lettera cambia identita'.

       Percio': si legge piu' grande (il filetto diventa spesso 3-4 pixel),
       si conta come inchiostro anche cio' che e' semitrasparente (il filetto
       antialiasato arriva a ~90 su 255, non a 128), e si butta via il
       pulviscolo che la soglia bassa tira dentro. */
    corpoTraccia: 440,     /* px a cui si disegna la lettera per leggerla    */
    sogliaAlfa:    72,     /* su 255. Meta' opacita' perderebbe i filetti    */
    minArea:    6e-4,      /* in em quadri: sotto, e' sporco, non un anello  */
    passoPunti:   0.014,   /* distanza fra due punti del contorno, in em.
                              0.014 su un contorno lungo 3 em fa ~210 punti. */
    minPunti:     28,
    maxPunti:     190,
    campioniTratto: 9,     /* punti di controllo per ogni tratto di scheletro */

    /* ——— la corrispondenza fra tratti ————————————————————————————
       Quando le due lettere hanno lo STESSO numero di tratti si accoppiano
       per indice: le tabelle qui sotto sono scritte in ordine di importanza
       — prima l'asta portante, poi il resto — quindi l'indice da solo fa la
       cosa giusta, ed e' cosi' che la A trova la T.
       Quando i numeri non coincidono si accoppia per somiglianza, e questi
       tre pesi dicono cosa conta: dove sta il tratto, quanto e' lungo, come
       e' orientato. */
    pesoCentro:  1.00,
    pesoLungh:   0.55,
    pesoAngolo:  0.85,

    /* ——— i colori ————————————————————————————————————————————————
       Si interpolano: la scritta parte del nero dell'inchiostro e arriva
       al verde-inchiostro del titolo di sezione. */
    coloreDa:  "#141416",
    coloreA:   "#252a22",

    /* ——— soglie ——————————————————————————————————————————————————
       Sotto questa progressione si vede il testo vero di partenza, sopra
       quest'altra il testo vero d'arrivo: le sagome tracciate non si vedono
       mai da ferme, solo in movimento. Cosi' un'eventuale morbidezza del
       raster non e' mai sotto gli occhi di nessuno. */
    consegnaDa: 0.012,
    consegnaA:  0.988,

    telefonoDa: 0                /* 0 = la piega e' attiva a ogni larghezza.
                                    Alzalo a 992 per spegnerla sul mobile.  */
  };

  /* ——— gli scheletri ———————————————————————————————————————————————
     Un tratto e' una spezzata. Le coordinate stanno in un quadrato 0..1
     appoggiato sul rettangolo d'inchiostro della lettera: x da sinistra a
     destra, y dall'alto in basso (0 = tetto della maiuscola, 1 = linea di
     base). Non e' un disegno della lettera — e' la sua ossatura, e serve
     solo a portare i punti di controllo.

     L'ORDINE CONTA. Primo il tratto portante, poi il secondo per importanza,
     poi i dettagli: e' l'ordine che decide gli accoppiamenti quando due
     lettere hanno lo stesso numero di tratti. La A sta scritta
     [diagonale sinistra, diagonale destra, traversa] e la T sta scritta
     [asta, trattino]: per questo la sinistra della A si raddrizza nell'asta,
     la destra si alza nel trattino, e la traversa — che non ha partner —
     si ripiega sull'asta e sparisce. Esattamente la piega che si voleva. */
  var SCHELETRI = {
    "A": [[[0,1],[0.5,0]], [[0.5,0],[1,1]], [[0.18,0.63],[0.82,0.63]]],
    "B": [[[0,0],[0,1]], [[0,0],[0.72,0.10],[0.74,0.36],[0,0.5]], [[0,0.5],[0.86,0.62],[0.88,0.88],[0,1]]],
    "C": [[[1,0.17],[0.55,0],[0,0.5],[0.55,1],[1,0.83]]],
    "D": [[[0,0],[0,1]], [[0,0],[0.72,0.16],[0.72,0.84],[0,1]]],
    "E": [[[0,0],[0,1]], [[0,0],[1,0]], [[0,1],[1,1]], [[0,0.5],[0.78,0.5]]],
    "F": [[[0,0],[0,1]], [[0,0],[1,0]], [[0,0.48],[0.78,0.48]]],
    "G": [[[1,0.17],[0.55,0],[0,0.5],[0.55,1],[1,0.80],[1,0.56]], [[0.58,0.56],[1,0.56]]],
    "H": [[[0,0],[0,1]], [[1,0],[1,1]], [[0,0.5],[1,0.5]]],
    "I": [[[0.5,0],[0.5,1]]],
    "J": [[[0.72,0],[0.72,0.78],[0.36,1],[0,0.80]]],
    "K": [[[0,0],[0,1]], [[1,0],[0,0.55]], [[0.34,0.42],[1,1]]],
    "L": [[[0,0],[0,1]], [[0,1],[1,1]]],
    "M": [[[0,1],[0,0]], [[0,0],[0.5,0.78]], [[0.5,0.78],[1,0]], [[1,0],[1,1]]],
    "N": [[[0,1],[0,0]], [[0,0],[1,1]], [[1,1],[1,0]]],
    "O": [[[0.5,0],[1,0.5],[0.5,1],[0,0.5],[0.5,0]]],
    "P": [[[0,0],[0,1]], [[0,0],[0.84,0.13],[0.84,0.43],[0,0.57]]],
    "Q": [[[0.5,0],[1,0.5],[0.5,1],[0,0.5],[0.5,0]], [[0.58,0.74],[1,1.06]]],
    "R": [[[0,0],[0,1]], [[0,0],[0.80,0.13],[0.80,0.43],[0,0.57]], [[0.44,0.57],[1,1]]],
    "S": [[[1,0.15],[0.45,0],[0.05,0.29],[0.90,0.67],[0.55,1],[0,0.85]]],
    "T": [[[0.5,0],[0.5,1]], [[0,0],[1,0]]],
    "U": [[[0,0],[0,0.72],[0.5,1],[1,0.72],[1,0]]],
    "V": [[[0,0],[0.5,1]], [[0.5,1],[1,0]]],
    "W": [[[0,0],[0.27,1]], [[0.27,1],[0.5,0.26]], [[0.5,0.26],[0.73,1]], [[0.73,1],[1,0]]],
    "X": [[[0,0],[1,1]], [[1,0],[0,1]]],
    "Y": [[[0,0],[0.5,0.52]], [[1,0],[0.5,0.52]], [[0.5,0.52],[0.5,1]]],
    "Z": [[[0,0],[1,0]], [[1,0],[0,1]], [[0,1],[1,1]]],
    "&": [[[1,1],[0.16,0.27],[0.5,0],[0.80,0.26],[0,0.79],[0.36,1],[0.82,0.71]]],
    "-": [[[0,0.55],[1,0.55]]],
    ",": [[[0.5,0.82],[0.35,1.10]]],
    ".": [[[0.5,0.94],[0.5,1]]],
    "'": [[[0.5,0],[0.4,0.25]]]
  };

  /* ======================= UTILITA' GEOMETRICHE =========================== */

  function bezier(x1, y1, x2, y2) {
    /* Serve la curva, non la sua derivata: qui basta Newton su x. */
    var ax = 3 * x1, bx = 3 * (x2 - x1) - ax, cx = 1 - ax - bx,
        ay = 3 * y1, by = 3 * (y2 - y1) - ay, cy = 1 - ay - by;
    function X(t) { return ((cx * t + bx) * t + ax) * t; }
    function dX(t) { return (3 * cx * t + 2 * bx) * t + ax; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x, i, e, d;
      for (i = 0; i < 8; i++) {
        e = X(t) - x;
        if (e > -1e-6 && e < 1e-6) break;
        d = dX(t);
        if (d > -1e-6 && d < 1e-6) break;
        t -= e / d;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
      }
      return ((cy * t + by) * t + ay) * t;
    };
  }

  function morbida(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Lunghezza cumulata di una spezzata, e campionamento a passo costante.
     Torna sempre esattamente n punti, primo e ultimo compresi. */
  function campiona(pts, n, chiusa) {
    var i, d, acc = [0], tot = 0, P = pts.slice();
    if (chiusa) P.push(pts[0]);
    for (i = 1; i < P.length; i++) {
      d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      tot += d;
      acc.push(tot);
    }
    var out = [], k = 1;
    if (tot === 0) {
      for (i = 0; i < n; i++) out.push([P[0][0], P[0][1]]);
      return out;
    }
    var passi = chiusa ? n : n - 1;
    for (i = 0; i < n; i++) {
      var s = tot * (i / passi);
      while (k < acc.length - 1 && acc[k] < s) k++;
      var t = (s - acc[k - 1]) / ((acc[k] - acc[k - 1]) || 1);
      out.push([lerp(P[k - 1][0], P[k][0], t), lerp(P[k - 1][1], P[k][1], t)]);
    }
    return out;
  }

  function areaFirmata(p) {
    var a = 0, n = p.length, i, j;
    for (i = 0, j = n - 1; i < n; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
    return a / 2;
  }

  /* ===================== IL CONTORNO, DAL RASTER ========================== */

  /* Marching squares.
     Ogni punto del contorno cade su uno SPIGOLO del reticolo, e lo spigolo
     ha un numero intero. E' questo che tiene insieme tutto: due celle
     confinanti interpolano lo stesso spigolo e ne ricavano lo stesso numero,
     esatto — non "quasi uguale". Riagganciare i segmenti confrontando le
     coordinate avrebbe funzionato quasi sempre, e il quasi sono contorni che
     si aprono e lettere che si sfaldano.

     La tabella e' orientata in modo che l'inchiostro resti sempre a DESTRA
     del verso di percorrenza. Cosi' ogni spigolo attraversato ha esattamente
     un segmento che ne esce e uno che ci entra — una cella lo vede come
     uscita, la cella accanto come entrata — e la concatenazione e' una
     biiezione: non puo' interrompersi a meta'.

     I due casi a sella (5 e 10) sono gli unici ambigui: due angoli opposti
     d'inchiostro e due vuoti si possono leggere come due punte che si
     sfiorano o come una strozzatura. Si decide con la media dei quattro
     angoli, che e' la lettura coerente col campo continuo sottostante.
     Sbagliarli non spezza niente e proprio per questo e' insidioso: collega
     i rami giusti nell'ordine sbagliato, e la lettera si riempie di corde
     che la attraversano da parte a parte. */
  function contorni(alfa, w, h, soglia) {
    var x, y, i;
    var quanti = w * h * 2;
    var vaA = new Int32Array(quanti).fill(-1);   /* spigolo -> spigolo seguente */
    var cx = new Float32Array(quanti);
    var cy = new Float32Array(quanti);
    var visto = new Uint8Array(quanti);

    function idH(x, y) { return (y * w + x) * 2; }
    function idV(x, y) { return (y * w + x) * 2 + 1; }

    function segna(id, px, py) { cx[id] = px; cy[id] = py; }

    function pH(x, y) {
      var id = idH(x, y);
      var a = alfa[y * w + x], b = alfa[y * w + x + 1];
      segna(id, x + (soglia - a) / ((b - a) || 1e-6), y);
      return id;
    }
    function pV(x, y) {
      var id = idV(x, y);
      var a = alfa[y * w + x], b = alfa[(y + 1) * w + x];
      segna(id, x, y + (soglia - a) / ((b - a) || 1e-6));
      return id;
    }

    for (y = 0; y < h - 1; y++) {
      for (x = 0; x < w - 1; x++) {
        var vtl = alfa[y * w + x], vtr = alfa[y * w + x + 1],
            vbr = alfa[(y + 1) * w + x + 1], vbl = alfa[(y + 1) * w + x];
        var tl = vtl >= soglia, tr = vtr >= soglia,
            br = vbr >= soglia, bl = vbl >= soglia;
        var c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
        if (c === 0 || c === 15) continue;

        var T, B, L, R;
        switch (c) {
          case 1:  L = pV(x, y);     B = pH(x, y + 1); vaA[L] = B; break;
          case 2:  B = pH(x, y + 1); R = pV(x + 1, y); vaA[B] = R; break;
          case 3:  L = pV(x, y);     R = pV(x + 1, y); vaA[L] = R; break;
          case 4:  R = pV(x + 1, y); T = pH(x, y);     vaA[R] = T; break;
          case 6:  B = pH(x, y + 1); T = pH(x, y);     vaA[B] = T; break;
          case 7:  L = pV(x, y);     T = pH(x, y);     vaA[L] = T; break;
          case 8:  T = pH(x, y);     L = pV(x, y);     vaA[T] = L; break;
          case 9:  T = pH(x, y);     B = pH(x, y + 1); vaA[T] = B; break;
          case 11: T = pH(x, y);     R = pV(x + 1, y); vaA[T] = R; break;
          case 12: R = pV(x + 1, y); L = pV(x, y);     vaA[R] = L; break;
          case 13: R = pV(x + 1, y); B = pH(x, y + 1); vaA[R] = B; break;
          case 14: B = pH(x, y + 1); L = pV(x, y);     vaA[B] = L; break;
          case 5:  /* sella: inchiostro in alto a destra e in basso a sinistra */
            T = pH(x, y); B = pH(x, y + 1); L = pV(x, y); R = pV(x + 1, y);
            if ((vtl + vtr + vbr + vbl) / 4 >= soglia) { vaA[R] = B; vaA[L] = T; }
            else { vaA[R] = T; vaA[L] = B; }
            break;
          case 10: /* sella: inchiostro in alto a sinistra e in basso a destra */
            T = pH(x, y); B = pH(x, y + 1); L = pV(x, y); R = pV(x + 1, y);
            if ((vtl + vtr + vbr + vbl) / 4 >= soglia) { vaA[T] = R; vaA[B] = L; }
            else { vaA[T] = L; vaA[B] = R; }
            break;
        }
      }
    }

    var anelli = [];
    for (i = 0; i < quanti; i++) {
      if (vaA[i] < 0 || visto[i]) continue;
      var anello = [], cur = i, guardia = 0;
      while (cur >= 0 && !visto[cur] && guardia++ < 1000000) {
        visto[cur] = 1;
        anello.push([cx[cur], cy[cur]]);
        cur = vaA[cur];
      }
      if (anello.length >= 8) anelli.push(anello);
    }
    return anelli;
  }

  /* Disegna una lettera fuori schermo e ne restituisce contorni e misure,
     tutto in em: cosi' il risultato non dipende dal corpo a cui l'abbiamo
     letta e vale a qualunque dimensione poi la si mostri. */
  var cacheTraccia = {};

  /* Il corpo NON e' un parametro: se lo fosse, chi chiama potrebbe passarne
     uno diverso da C.corpoTraccia, e tutte le misure qui dentro — il margine,
     la conversione in em, la lettura del raster — sono calcolate su quello.
     Un disallineamento non da' errore: da' lettere sfaldate e coordinate
     scalate a caso, cioe' un guasto che sembra tipografico e non lo e'.
     Qui si passa la famiglia e il peso, la dimensione la mette il modulo. */
  function traccia(ch, famiglia, peso) {
    var S = C.corpoTraccia;
    var font = (peso || 400) + " " + S + "px " + famiglia;
    /* Risoluzione e soglia fanno parte dell'identita' del risultato: se non
       entrano nella chiave, cambiarle a caldo restituisce il tracciamento
       vecchio e ogni messa a punto misura il numero sbagliato. */
    var chiave = font + "|" + ch + "|" + C.sogliaAlfa;
    if (cacheTraccia[chiave]) return cacheTraccia[chiave];

    var cnv = document.createElement("canvas");
    var g = cnv.getContext("2d", { willReadFrequently: true });

    g.font = font;
    var m = g.measureText(ch);
    var avanzo = m.width;
    var su = m.actualBoundingBoxAscent, giu = m.actualBoundingBoxDescent;
    if (!isFinite(su)) su = S;
    if (!isFinite(giu)) giu = S * 0.25;

    var pad = Math.ceil(S * 0.35);
    var W = Math.max(4, Math.ceil(avanzo + pad * 2));
    var H = Math.max(4, Math.ceil(su + giu + pad * 2));
    cnv.width = W; cnv.height = H;

    /* Ridimensionare il canvas azzera il contesto: il font va riscritto. */
    g.font = font;
    g.textBaseline = "alphabetic";
    g.fillStyle = "#000";
    g.fillText(ch, pad, pad + su);

    var px = g.getImageData(0, 0, W, H).data;
    var alfa = new Float32Array(W * H);
    var i, vuoto = true;
    for (i = 0; i < W * H; i++) {
      alfa[i] = px[i * 4 + 3];
      if (alfa[i] > 8) vuoto = false;
    }

    var res = {
      avanzo: avanzo / S,
      anelli: [],
      box: null,
      vuoto: vuoto
    };

    if (!vuoto) {
      var anelli = contorni(alfa, W, H, C.sogliaAlfa);
      var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;

      /* In em, con l'origine sulla linea di base a sinistra dell'avanzo. */
      anelli.forEach(function (an) {
        var conv = an.map(function (p) {
          var X = (p[0] - pad) / S, Y = (p[1] - (pad + su)) / S;
          if (X < minx) minx = X; if (X > maxx) maxx = X;
          if (Y < miny) miny = Y; if (Y > maxy) maxy = Y;
          return [X, Y];
        });
        if (areaFirmata(conv) < 0) conv.reverse();   /* tutti nello stesso verso */
        /* Il pulviscolo: anelli da pochi punti e area quasi nulla, che la
           soglia bassa raccoglie sui bordi antialiasati. Non sono parti
           della lettera e in fusione diventerebbero schegge nere. */
        if (Math.abs(areaFirmata(conv)) >= C.minArea) res.anelli.push(conv);
      });
      res.box = { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
      res.anelli.sort(function (a, b) {
        return Math.abs(areaFirmata(b)) - Math.abs(areaFirmata(a));
      });
    }

    cacheTraccia[chiave] = res;
    return res;
  }

  /* ===================== LO SCHELETRO, IN EM ============================== */

  /* Lo scheletro normalizzato viene appoggiato sul rettangolo d'inchiostro
     vero della lettera: cosi' una A stretta e una A larga hanno lo stesso
     disegno di tratti, ciascuno alla propria misura. */
  function scheletro(ch, tr) {
    var base = SCHELETRI[ch];
    if (!base || !tr.box) return [];
    var b = tr.box;
    return base.map(function (tratto) {
      return campiona(tratto.map(function (p) {
        return [b.x + p[0] * b.w, b.y + p[1] * b.h];
      }), C.campioniTratto, false);
    });
  }

  /* ====================== LA CORRISPONDENZA =============================== */

  /* Due tratti, quanto si somigliano. Meno e' meglio. */
  function costo(a, b) {
    function centro(t) {
      var x = 0, y = 0, i;
      for (i = 0; i < t.length; i++) { x += t[i][0]; y += t[i][1]; }
      return [x / t.length, y / t.length];
    }
    function lungh(t) {
      var L = 0, i;
      for (i = 1; i < t.length; i++) L += Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]);
      return L;
    }
    function ang(t) {
      var dx = t[t.length - 1][0] - t[0][0], dy = t[t.length - 1][1] - t[0][1];
      return Math.atan2(dy, dx);
    }
    var ca = centro(a), cb = centro(b);
    var dc = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
    var dl = Math.abs(lungh(a) - lungh(b));
    /* L'orientamento e' modulo pi: un tratto percorso al contrario e' lo
       stesso tratto, e il verso lo sistema la coppia di punti, non il costo. */
    var da = Math.abs(((ang(a) - ang(b)) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2) / (Math.PI / 2);
    return C.pesoCentro * dc + C.pesoLungh * dl + C.pesoAngolo * (1 - da) * 0.5;
  }

  /* Il moto di un tratto, letto come similitudine: dove si sposta, di quanto
     ruota, di quanto si allunga. Serve perche' i capi di un tratto NON vanno
     interpolati in linea retta.

     Un tratto che deve ruotare di 90 gradi, se gli si fanno scivolare i due
     capi verso la destinazione, a meta' strada e' lungo quanto la corda —
     cioe' quasi zero. I punti di controllo della deformazione collassano uno
     sull'altro, la configurazione degenera, e la lettera intorno esplode. E'
     il motivo per cui la piega era giusta agli estremi e illeggibile in mezzo.

     Interpolando invece l'ANGOLO, il tratto ruota davvero: resta lungo per
     tutta la corsa e la lettera gli gira intorno. Il residuo — cio' che
     distingue il tratto d'arrivo da quello di partenza ruotato e scalato,
     per esempio una curva contro una retta — si aggiunge a parte, cosi'
     l'arrivo resta esatto. */
  /* Un tratto non ha un verso. L'asta della F e' scritta dall'alto in basso,
     quella della N dal basso in alto: e' la stessa retta, ma confrontandole
     cosi' come sono la similitudine ci legge un'inversione e fa girare la
     lettera di mezzo giro su se' stessa. Quindi si prova anche col tratto
     d'arrivo percorso al contrario, e si tiene il verso che ruota meno. */
  function similitudineLibera(A, B) {
    var dritta = similitudine(A, B);
    var rovescia = similitudine(A, B.slice().reverse());
    return Math.abs(rovescia.ang) < Math.abs(dritta.ang) - 1e-9 ? rovescia : dritta;
  }

  function similitudine(A, B) {
    var n = Math.min(A.length, B.length), i;
    var ax = 0, ay = 0, bx = 0, by = 0;
    for (i = 0; i < n; i++) { ax += A[i][0]; ay += A[i][1]; bx += B[i][0]; by += B[i][1]; }
    ax /= n; ay /= n; bx /= n; by /= n;
    var c = 0, d = 0, nn = 0;
    for (i = 0; i < n; i++) {
      var px = A[i][0] - ax, py = A[i][1] - ay;
      var qx = B[i][0] - bx, qy = B[i][1] - by;
      c += px * qx + py * qy;
      d += px * qy - py * qx;
      nn += px * px + py * py;
    }
    var ang = Math.atan2(d, c);
    var sc = nn > 1e-12 ? Math.sqrt(c * c + d * d) / nn : 1;
    if (!isFinite(sc) || sc <= 1e-6) sc = 1;
    /* Il residuo, misurato dopo aver applicato la similitudine intera. */
    var res = [];
    for (i = 0; i < n; i++) {
      var rx = A[i][0] - ax, ry = A[i][1] - ay;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      res.push([B[i][0] - (bx + sc * (rx * ca - ry * sa)),
                B[i][1] - (by + sc * (rx * sa + ry * ca))]);
    }
    return { ax: ax, ay: ay, bx: bx, by: by, ang: ang, sc: sc, res: res };
  }

  function tratoA(A, m, t, fuori) {
    var ca = Math.cos(m.ang * t), sa = Math.sin(m.ang * t);
    var sc = 1 + (m.sc - 1) * t;
    var cx = lerp(m.ax, m.bx, t), cy = lerp(m.ay, m.by, t);
    var i, n = m.res.length;
    for (i = 0; i < n; i++) {
      var rx = A[i][0] - m.ax, ry = A[i][1] - m.ay;
      fuori[i][0] = cx + sc * (rx * ca - ry * sa) + m.res[i][0] * t;
      fuori[i][1] = cy + sc * (rx * sa + ry * ca) + m.res[i][1] * t;
    }
  }

  /* Accoppia i tratti di partenza con quelli d'arrivo.
     Torna un array lungo quanto i tratti di PARTENZA: per ogni tratto di
     partenza, l'indice del tratto d'arrivo su cui va a finire.
     La direzione non e' simmetrica per un motivo preciso: i punti di
     controllo della deformazione sono quelli di partenza, e ognuno puo'
     avere una sola destinazione. Se due tratti d'arrivo si contendessero
     gli stessi punti di partenza, la deformazione farebbe la media delle
     due destinazioni e la lettera si sbaverebbe invece di piegarsi. Quindi:
     ogni tratto di partenza ha esattamente un arrivo; piu' tratti di
     partenza possono confluire sullo stesso arrivo (e' cosi' che la traversa
     della A si ripiega sull'asta della T e sparisce); e i tratti d'arrivo
     che restano senza nessuno semplicemente non vincolano niente — quella
     parte di lettera nasce con la fusione finale sulla sagoma vera, non
     con la deformazione.

     Stesso numero di tratti -> per indice, perche' le tabelle SCHELETRI sono
     scritte in ordine di importanza ed e' esattamente l'accoppiamento che
     si vuole: e' cosi' che la A trova la T.
     Numeri diversi -> avido per somiglianza, e gli avanzi di partenza si
     appoggiano al tratto d'arrivo del loro vicino piu' somigliante. */
  function accoppia(sa, sb) {
    var dove = new Array(sa.length), i, j;
    if (sa.length === 0 || sb.length === 0) return dove;

    /* Per indice, sempre. Le tabelle SCHELETRI sono scritte in ordine di
       importanza — prima l'asta portante, poi il resto — e l'indice porta
       dentro quell'ordine. Accoppiare per somiglianza geometrica sembra piu'
       furbo e non lo e': la I, che e' un'asta sola, finisce sulla TRAVERSA
       della A perche' e' la piu' vicina di centro, e si vede una I che si
       corica invece di una I che diventa il fianco di una A. */
    var m = Math.min(sa.length, sb.length);
    for (i = 0; i < m; i++) dove[i] = i;

    /* Gli avanzi di partenza — la traversa della A quando l'arrivo e' una T —
       si appoggiano alla destinazione del tratto gia' assegnato a cui
       somigliano di piu': ci si ripiegano sopra e spariscono. */
    for (i = m; i < sa.length; i++) {
      var best = dove[0], bc = Infinity;
      for (j = 0; j < m; j++) {
        var v = costo(sa[i], sa[j]);
        if (v < bc) { bc = v; best = dove[j]; }
      }
      dove[i] = best;
    }
    return dove;
  }

  /* Gli anelli: il piu' grande col piu' grande, e cosi' via. Chi resta senza
     partner collassa in un punto sull'anello che gli e' rimasto piu' vicino —
     e' il contropunzone della A che si chiude quando la A diventa una T. */
  function accoppiaAnelli(A, B) {
    var n = Math.max(A.length, B.length), out = [], i;
    for (i = 0; i < n; i++) {
      out.push({
        a: i < A.length ? A[i] : null,
        b: i < B.length ? B[i] : null
      });
    }
    return out;
  }

  /* Allineamento circolare: fra tutti gli scorrimenti possibili si prende
     quello che fa percorrere ai punti la strada piu' corta nel complesso.
     Senza, due anelli ugualissimi possono partire da punti opposti e la
     lettera si attorciglia su se' stessa prima di arrivare. */
  function allinea(a, b) {
    var n = a.length, best = 0, bestV = Infinity, k, i, v;
    var passo = n > 64 ? 2 : 1;
    for (k = 0; k < n; k += passo) {
      v = 0;
      for (i = 0; i < n; i += 4) {
        var q = b[(i + k) % n];
        v += (a[i][0] - q[0]) * (a[i][0] - q[0]) + (a[i][1] - q[1]) * (a[i][1] - q[1]);
      }
      if (v < bestV) { bestV = v; best = k; }
    }
    var out = [];
    for (i = 0; i < n; i++) out.push(b[(i + best) % n]);
    return out;
  }

  /* ===================== LA PELLE SULLO SCHELETRO ========================= */

  /* Ogni tratto e' un OSSO: si sposta, ruota e si allunga, tutto insieme, e
     porta con se' la parte di lettera che gli sta intorno. Un punto del
     contorno pesa sui due ossi che ha piu' vicini, e la sua posizione a
     meta' corsa e' la media delle due posizioni che i due ossi gli
     assegnerebbero. E' l'ossatura di una marionetta, non un campo di forze.

     Perche' cosi' e non altrimenti, in due passaggi che ho fatto e scartato:

     - I minimi quadrati mobili — la risposta da manuale — mettono tutti i
       punti di controllo in un'unica media pesata. Quando due tratti vicini
       ruotano in verso opposto, come le due diagonali di una A che diventa
       una V, quella media passa per configurazioni impossibili e il contorno
       si lacera.

     - Agganciare il punto al singolo SEGMENTO piu' vicino, conservando anche
       di quanto sborda oltre il capo del segmento, sembra piu' preciso ed e'
       peggio: un punto che sta lontano dal tratto ha uno sbordo grande, e
       appena il tratto ruota quello sbordo diventa una scodata. A meta' corsa
       le lettere si chiudevano in macchie nere.

     Un osso rigido non ha nessuno di questi due problemi: qualunque cosa
     faccia, ai punti che porta applica una rotazione — e una rotazione al
     massimo capovolge una lettera, non la strappa. */

  /* Quanto dista un punto da un tratto: la minima distanza dai suoi segmenti. */
  function distanzaDaTratto(v, linea) {
    var best = Infinity, i;
    for (i = 0; i < linea.length - 1; i++) {
      var ax = linea[i][0], ay = linea[i][1];
      var dx = linea[i + 1][0] - ax, dy = linea[i + 1][1] - ay;
      var L2 = dx * dx + dy * dy;
      var t = L2 < 1e-12 ? 0 : ((v[0] - ax) * dx + (v[1] - ay) * dy) / L2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var d = Math.hypot(v[0] - (ax + dx * t), v[1] - (ay + dy * t));
      if (d < best) best = d;
    }
    return best === Infinity ? Math.hypot(v[0] - linea[0][0], v[1] - linea[0][1]) : best;
  }

  /* I pesi si calcolano una volta: dipendono solo dalla posizione di partenza.
     Due ossi e non di piu': con tutti, le parti lontane della lettera si
     tirano a vicenda e gli spigoli si smussano; con uno solo, il contorno si
     spacca sulla linea dove cambia l'osso piu' vicino. */
  function preparaPelle(punti, tratti) {
    var N = punti.length, T = tratti.length, i, j;
    var ganci = new Array(N);
    for (i = 0; i < N; i++) {
      var lista = [];
      for (j = 0; j < T; j++) lista.push({ osso: j, d: distanzaDaTratto(punti[i], tratti[j].A) });
      /* Tutti gli ossi, non i due piu' vicini. Prendendone due soltanto, il
         peso cambia DI SCATTO sulla linea dove il secondo osso piu' vicino
         cambia identita': due punti vicinissimi del contorno — e soprattutto
         un punto del bordo esterno e quello del controinterno che gli sta di
         fronte attraverso un'asta sottile — finiscono su ossi diversi e si
         allontanano. Il controinterno esce dal bordo, il pari-dispari si
         inverte, e la lettera si riempie di nero.
         Con tutti gli ossi il peso e' una funzione continua della posizione:
         due punti vicini si muovono insieme, sempre. L'esponente alto tiene
         comunque l'influenza locale. */
      var somma = 0, k;
      for (k = 0; k < lista.length; k++) {
        var dd = lista[k].d + 0.02;
        lista[k].peso = 1 / (dd * dd * dd);
        somma += lista[k].peso;
      }
      for (k = 0; k < lista.length; k++) lista[k].peso /= somma;
      ganci[i] = lista;
    }
    return ganci;
  }

  /* La stessa similitudine che muove l'osso, applicata ai punti che porta. */
  function applicaPelle(ganci, src, tratti, t, fuori) {
    var T = tratti.length, i, j;
    var ca = new Float64Array(T), sa = new Float64Array(T), sc = new Float64Array(T),
        cx = new Float64Array(T), cy = new Float64Array(T),
        ax = new Float64Array(T), ay = new Float64Array(T);
    for (j = 0; j < T; j++) {
      var m = tratti[j].mot;
      ca[j] = Math.cos(m.ang * t); sa[j] = Math.sin(m.ang * t);
      var sm = m.sc < C.scalaOsso[0] ? C.scalaOsso[0]
             : (m.sc > C.scalaOsso[1] ? C.scalaOsso[1] : m.sc);
      sc[j] = 1 + (sm - 1) * t;
      cx[j] = lerp(m.ax, m.bx, t); cy[j] = lerp(m.ay, m.by, t);
      ax[j] = m.ax; ay[j] = m.ay;
    }
    for (i = 0; i < ganci.length; i++) {
      var g = ganci[i], px = 0, py = 0;
      for (var k = 0; k < g.length; k++) {
        j = g[k].osso;
        var rx = src[i][0] - ax[j], ry = src[i][1] - ay[j];
        px += g[k].peso * (cx[j] + sc[j] * (rx * ca[j] - ry * sa[j]));
        py += g[k].peso * (cy[j] + sc[j] * (rx * sa[j] + ry * ca[j]));
      }
      fuori[i][0] = px;
      fuori[i][1] = py;
    }
  }

  /* ========================= IL MONTAGGIO ================================= */

  /* Dove cade ogni lettera lungo la riga, in em. La spaziatura si somma a
     mano invece di affidarla al contesto: ctx.letterSpacing e' recente e non
     ovunque, e qui un carattere fuori posto di mezzo em si vedrebbe. */
  function misuraRiga(testo, famiglia, peso, spaziatura) {
    var S = C.corpoTraccia;
    var cnv = document.createElement("canvas");
    var g = cnv.getContext("2d");
    g.font = (peso || 400) + " " + S + "px " + famiglia;
    var x = 0, out = [], i;
    for (i = 0; i < testo.length; i++) {
      var ch = testo[i];
      var a = g.measureText(ch).width / S;
      out.push({ ch: ch, x: x, avanzo: a });
      x += a + spaziatura;
    }
    return { glifi: out, larghezza: x - (testo.length ? spaziatura : 0) };
  }

  function centroide(anello) {
    var x = 0, y = 0, i;
    for (i = 0; i < anello.length; i++) { x += anello[i][0]; y += anello[i][1]; }
    return [x / anello.length, y / anello.length];
  }

  /* Prepara tutto quello che non dipende dallo scroll. Si paga una volta.
     Torna il "modello": per ogni posizione della riga, come la lettera di
     partenza diventa quella d'arrivo. */
  function costruisci(opt) {
    var rDa = misuraRiga(opt.da.testo, opt.da.famiglia, opt.da.peso, opt.da.spaziatura || 0);
    var rA  = misuraRiga(opt.a.testo,  opt.a.famiglia,  opt.a.peso,  opt.a.spaziatura  || 0);
    var n = Math.max(opt.da.testo.length, opt.a.testo.length);
    var posti = [], i;

    for (i = 0; i < n; i++) {
      var gDa = rDa.glifi[i], gA = rA.glifi[i];
      var chDa = gDa ? gDa.ch : " ", chA = gA ? gA.ch : " ";
      var tDa = traccia(chDa, opt.da.famiglia, opt.da.peso),
          tA  = traccia(chA,  opt.a.famiglia,  opt.a.peso);

      var posto = {
        chDa: chDa, chA: chA,
        xDa: gDa ? gDa.x : rDa.larghezza,
        xA:  gA  ? gA.x  : rA.larghezza,
        avDa: gDa ? gDa.avanzo : 0,
        avA:  gA  ? gA.avanzo  : 0,
        tipo: "nulla", anelli: []
      };

      if (tDa.vuoto && tA.vuoto) { posti.push(posto); continue; }

      /* Una lettera che nasce dal niente, o una che sparisce: niente
         deformazione da fare, solo una sagoma che si apre o si chiude sul
         posto. Il centro su cui lo fa e' il piede della lettera, cosi' si
         schiude dalla linea di base come le altre invece che dal nulla. */
      if (tDa.vuoto || tA.vuoto) {
        var viva = tDa.vuoto ? tA : tDa;
        posto.tipo = tDa.vuoto ? "nasce" : "muore";
        posto.anelli = viva.anelli.map(function (an) {
          var N = numPunti(an);
          return { sola: campiona(an, N, true) };
        });
        posto.perno = [viva.box.x + viva.box.w / 2, 0];
        posti.push(posto);
        continue;
      }

      /* Il caso vero: due lettere, una piega. */
      posto.tipo = "piega";

      var skDa = scheletro(chDa, tDa), skA = scheletro(chA, tA);
      var mappa = accoppia(skDa, skA);
      var ctrlDa = [], ctrlA = [], s, k;
      posto.tratti = [];
      for (s = 0; s < skDa.length; s++) {
        var dest = skA[mappa[s]] || skA[0];
        var mot = similitudineLibera(skDa[s], dest);
        var vista = [];
        for (k = 0; k < C.campioniTratto; k++) {
          ctrlDa.push(skDa[s][k]);
          ctrlA.push(dest[k]);
          var cella = [skDa[s][k][0], skDa[s][k][1]];
          ctrlA.length;           /* ctrlA resta solo come riferimento */
          vista.push(cella);
        }
        posto.tratti.push({ A: skDa[s], mot: mot, vista: vista });
      }

      /* L'ossatura al contrario: gli stessi tratti visti dalla lettera
         d'arrivo, che tornano verso quella di partenza. Serve per deformare
         anche la sagoma d'arrivo, all'indietro. Un tratto d'arrivo su cui
         confluiscono piu' tratti di partenza diventa un osso solo: la strada
         di ritorno e' una, anche se all'andata ci si arrivava da piu' parti. */
      posto.tratti2 = [];
      var visti = {};
      for (s = 0; s < skDa.length; s++) {
        var d2 = mappa[s];
        if (visti[d2] || !skA[d2]) continue;
        visti[d2] = 1;
        posto.tratti2.push({ A: skA[d2], mot: similitudineLibera(skA[d2], skDa[s]) });
      }
      if (!posto.tratti2.length) posto.tratti2 = posto.tratti;
      /* Il vettore piatto dei punti di controllo, nello stesso ordine in cui
         i tratti lo riempiranno a ogni fotogramma. Le celle sono condivise:
         i tratti scrivono dentro queste, e la deformazione legge di qui. */
      posto.ctrlVivo = [];
      posto.tratti.forEach(function (tr) {
        tr.vista.forEach(function (c) { posto.ctrlVivo.push(c); });
      });
      /* Senza scheletro in tabella (un carattere che non ho previsto) la
         lettera non resta indietro: si usano i quattro angoli del suo
         rettangolo d'inchiostro come punti di controllo. Non e' una piega,
         e' una trasformazione affine — ma e' meglio di una lettera ferma. */
      if (!ctrlDa.length) {
        var bd = tDa.box, ba = tA.box, angoliDa = [], angoliA = [];
        [[0,0],[1,0],[1,1],[0,1]].forEach(function (c) {
          angoliDa.push([bd.x + c[0] * bd.w, bd.y + c[1] * bd.h]);
          angoliA.push([ba.x + c[0] * ba.w, ba.y + c[1] * ba.h]);
        });
        ctrlDa = angoliDa;
        var vistaA = angoliDa.map(function (c) { return [c[0], c[1]]; });
        posto.tratti = [{ A: angoliDa, mot: similitudineLibera(angoliDa, angoliA), vista: vistaA }];
        posto.ctrlVivo = vistaA;
      }
      posto.ctrlDa = ctrlDa;

      var coppie = accoppiaAnelli(tDa.anelli, tA.anelli);
      coppie.forEach(function (cp) {
        var a = cp.a, b = cp.b;
        if (!a && !b) return;
        if (!a) {
          /* Un contorno che all'arrivo c'e' e alla partenza no: germoglia
             da un punto, e il punto e' il centro del contorno che gli
             corrisponde di meno — cioe' il centro della lettera. */
          var Nb = numPunti(b);
          var cen = centroide(tDa.anelli[0]);
          var dst = campiona(b, Nb, true);
          var src = dst.map(function () { return [cen[0], cen[1]]; });
          posto.anelli.push(prepara(src, dst, posto.tratti, posto.tratti2));
          return;
        }
        var Na = numPunti(a);
        if (!b) {
          /* Un contropunzone che si chiude: il contorno collassa sul proprio
             centro, e il centro lo porta la deformazione dove deve andare.
             E' il buco della A che si tappa quando la A diventa una T. */
          var srcA = campiona(a, Na, true);
          var cenA = centroide(srcA);
          var dstA = srcA.map(function () { return [cenA[0], cenA[1]]; });
          var pz = prepara(srcA, srcA, posto.tratti);
          pz.collassa = true;
          posto.anelli.push(pz);
          return;
        }
        var N = Math.max(Na, numPunti(b));
        N = Math.min(N, C.maxPunti);
        var src2 = campiona(a, N, true);
        var dst2 = allinea(src2, campiona(b, N, true));
        posto.anelli.push(prepara(src2, dst2, posto.tratti, posto.tratti2));
      });

      posti.push(posto);
    }

    return {
      posti: posti,
      largDa: rDa.larghezza, largA: rA.larghezza,
      ease: bezier(C.ease[0], C.ease[1], C.ease[2], C.ease[3])
    };
  }

  function numPunti(anello) {
    var L = 0, i;
    for (i = 1; i < anello.length; i++)
      L += Math.hypot(anello[i][0] - anello[i - 1][0], anello[i][1] - anello[i - 1][1]);
    var n = Math.round(L / C.passoPunti);
    return Math.max(C.minPunti, Math.min(C.maxPunti, n));
  }

  function prepara(src, dst, tratti, tratti2) {
    return {
      src: src, dst: dst,
      ganci:  preparaPelle(src, tratti),
      ganci2: tratti2 ? preparaPelle(dst, tratti2) : null,
      buf:  src.map(function () { return [0, 0]; }),
      buf2: src.map(function () { return [0, 0]; })
    };
  }

  /* ========================== IL DISEGNO ================================= */

  function mescolaColore(a, b, t) {
    function leggi(h) {
      return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
    }
    var A = leggi(a), B = leggi(b);
    return "rgb(" + Math.round(lerp(A[0], B[0], t)) + "," +
                    Math.round(lerp(A[1], B[1], t)) + "," +
                    Math.round(lerp(A[2], B[2], t)) + ")";
  }

  /* geo.da e geo.a: dove sta la riga sullo schermo, in px CSS.
     x,y = piede della prima lettera (linea di base, bordo sinistro);
     corpo = corpo del carattere. */
  function disegna(ctx, mod, p, geo) {
    var e = mod.ease(p < 0 ? 0 : (p > 1 ? 1 : p));
    var fus = morbida(C.fusioneDa, 1, e);

    var corpo = lerp(geo.da.corpo, geo.a.corpo, e);
    ctx.fillStyle = mescolaColore(C.coloreDa, C.coloreA, e);
    ctx.beginPath();

    mod.posti.forEach(function (po) {
      if (po.tipo === "nulla") return;

      var ox = lerp(geo.da.x + po.xDa * geo.da.corpo, geo.a.x + po.xA * geo.a.corpo, e);
      var oy = lerp(geo.da.y, geo.a.y, e);

      if (po.tipo === "nasce" || po.tipo === "muore") {
        /* Si apre da zero, o si chiude a zero, intorno al proprio piede. */
        var q = po.tipo === "nasce" ? fus : 1 - morbida(0, C.fusioneDa, e);
        if (q <= 0.001) return;
        po.anelli.forEach(function (an) {
          traccia1(ctx, an.sola, function (pt) {
            return [
              ox + (po.perno[0] + (pt[0] - po.perno[0]) * q) * corpo,
              oy + (po.perno[1] + (pt[1] - po.perno[1]) * q) * corpo
            ];
          });
        });
        return;
      }

      /* La piega. Ogni tratto ruota verso la sua destinazione, il contorno
         gli gira intorno, e nell'ultimo pezzo di corsa si fonde sulla sagoma
         vera d'arrivo. */
      po.anelli.forEach(function (an) {
        applicaPelle(an.ganci, an.src, po.tratti, e, an.buf);

        if (an.collassa) {
          /* Un contropunzone che si chiude si stringe sul proprio centro
             DOV'E' ADESSO, non dov'era alla partenza: il centro se l'e'
             portato via lo scheletro insieme al resto della lettera. */
          var cx = 0, cy = 0, n = an.buf.length, i;
          for (i = 0; i < n; i++) { cx += an.buf[i][0]; cy += an.buf[i][1]; }
          cx /= n; cy /= n;
          var fc = morbida(0.2, 0.8, e);
          if (fc >= 0.999) return;
          traccia1(ctx, an.buf, function (pt) {
            return [ox + lerp(pt[0], cx, fc) * corpo, oy + lerp(pt[1], cy, fc) * corpo];
          });
          return;
        }

        /* La fusione e' simmetrica: da una parte la lettera di partenza
           deformata IN AVANTI, dall'altra quella d'arrivo deformata
           ALL'INDIETRO, e le due si incontrano a meta'. Fondere invece la
           partenza deformata con un arrivo fermo e' la versione ingenua, e
           al centro della corsa mette insieme due forme che non si
           somigliano per niente: il contorno si attraversa e il riempimento
           pari-dispari lo chiude in una macchia. Qui a meta' corsa le due
           forme sono tutte e due a mezza rotazione, quindi si assomigliano
           abbastanza da potersi mediare.
           Agli estremi non c'e' approssimazione: a zero pesa solo la
           partenza, a uno solo l'arrivo, e tutte e due sono esatte. */
        applicaPelle(an.ganci2, an.dst, po.tratti2, 1 - e, an.buf2);
        traccia1(ctx, an.buf, function (pt, i) {
          var b = an.buf2[i];
          return [
            ox + lerp(pt[0], b[0], e) * corpo,
            oy + lerp(pt[1], b[1], e) * corpo
          ];
        });
      });
    });

    ctx.fill("evenodd");
  }

  function traccia1(ctx, pts, mappa) {
    var i, q = mappa(pts[0], 0);
    ctx.moveTo(q[0], q[1]);
    for (i = 1; i < pts.length; i++) {
      q = mappa(pts[i], i);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
  }

  global.capeFold = {
    C: C,
    SCHELETRI: SCHELETRI,
    costruisci: costruisci,
    disegna: disegna,
    /* esposti per la messa a punto */
    _core: {
      traccia: traccia, scheletro: scheletro, accoppia: accoppia,
      campiona: campiona, areaFirmata: areaFirmata, misuraRiga: misuraRiga,
      preparaPelle: preparaPelle, applicaPelle: applicaPelle,
      similitudine: similitudine, similitudineLibera: similitudineLibera
    }
  };

})(typeof window !== "undefined" ? window : this);
