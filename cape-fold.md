# cape-fold — la piega del titolo

`ART & FASHION` non sfuma nel titolo dell'opera: ci si **piega** dentro. Ogni
lettera della scritta gigante prende il posto della lettera che le sta nella
stessa posizione nel titolo del carosello, e ci arriva ruotando e allungando i
propri tratti.

Un file solo, nessuna dipendenza.

> **Stato: incompleto.** Il motore della piega funziona e i due estremi sono
> esatti, ma c'è ancora un difetto visivo nel terzo centrale della corsa, e
> l'aggancio alla pagina (scroll, sticky, consegna dall'inchiostro, comparsa
> della sezione) non è ancora scritto. Vedi **Cosa manca**, in fondo.

---

## Il vincolo sul titolo

I due titoli si leggono **per posizione**: il primo carattere diventa il primo,
il secondo il secondo. Perché ogni lettera si trasformi davvero, nessun
carattere del titolo d'arrivo può coincidere con quello di partenza nella
stessa posizione — una lettera che "diventa se stessa" resta ferma mentre le
vicine si muovono, e si legge come un errore.

`ART & FASHION` ha 13 caratteri, con gli spazi in **posizione 4 e 6**. Ne
seguono due regole:

- il titolo d'arrivo è di **13 caratteri**;
- lo stacco fra le parole **non può cadere in 4 o in 6**, quindi la prima
  parola è di 4, 6, 7, 8 o 9 lettere — mai di 3 o di 5.

Titoli verificati conformi: `VOID AND MARK` (quello scelto), `PALE INTERVAL`,
`PALE HORIZONS`, `ONLY THE DARK`, `COLD PORTRAIT`, `DARK INTERVAL`,
`SOFT INTERVAL`, `NEAR DARKNESS`, `SLOW DISTANCE`, `BLUE CONTOURS`,
`SALT ON PAPER`, `EVENING FIELD`, `WINTER BLOOMS`, `WHISPER FIELD`.

**Una conseguenza che val la pena conoscere.** La regola vieta gli spazi in 4 e
6, ma è proprio lì che la sorgente ha i suoi: quindi nessun titolo con due
parole può avere una partner per ogni lettera. Con `VOID AND MARK` si hanno 9
trasformazioni vere, 2 lettere che nascono (la `D` in posizione 4 e la `A` in 6)
e 2 che muoiono (la `&` e la `S`). L'unico modo per arrivare a 11
trasformazioni e 0 morti è **una parola sola da 13 lettere**.

---

## Come funziona

### 1. Le sagome sono quelle vere

Il file del font non serve e non si scarica. Ogni lettera viene disegnata una
volta in un canvas nascosto, col carattere e il peso che il browser ha già
caricato, e il contorno si legge dal raster con *marching squares*. Funziona con
qualunque font, anche uno commerciale servito da Webflow, perché non si legge il
file — si legge il risultato.

Tre numeri governano questa lettura e vanno letti insieme, perché sono tarati
sul caso peggiore: un didone. In `Bodoni Moda` o `PP Editorial New` la traversa
della `A` è decine di volte più sottile delle aste. A 220px quel filetto è
spesso un pixel o due, l'antialiasing lo porta sotto metà opacità e **la lettera
si sfalda**: la `A` perde la traversa e resta una lambda, la `H` si spezza in due
aste separate, la `S` va in otto pezzi. Non è un difetto che si vede come "un po'
impreciso" — la lettera cambia identità.

| Manopola | Default | Cosa fa |
|---|---|---|
| `corpoTraccia` | `440` | px a cui si disegna la lettera per leggerla |
| `sogliaAlfa` | `72` | su 255. A 128 i filetti si perdono |
| `minArea` | `6e-4` | em²: sotto, è pulviscolo dell'antialiasing, non un anello |

### 2. Lo scheletro è scritto a mano

Sotto ogni lettera c'è un disegno di pochi tratti — la `A` sono tre segmenti, la
`T` due — nella tabella `SCHELETRI`. **Non si vede mai**: serve solo a dire quale
pezzo va su quale pezzo. È la differenza fra una piega e una colata.

**L'ordine dei tratti conta**, ed è l'unica cosa da capire per modificare la
tabella. Si scrive prima il tratto portante, poi il secondo per importanza, poi i
dettagli, perché l'accoppiamento è **per indice**:

```
A: [diagonale sinistra, diagonale destra, traversa]
T: [asta, trattino]
```

Da cui: la sinistra della `A` si raddrizza nell'asta della `T`, la destra si alza
nel trattino, e la traversa — che non ha partner — si ripiega sull'asta e
sparisce. Esattamente la piega che si voleva, e viene dall'ordine delle righe,
non da un caso speciale nel codice.

Accoppiare per somiglianza geometrica sembra più furbo e non lo è: la `I`, che è
un'asta sola, finisce sulla **traversa** della `A` perché è la più vicina di
centro, e si vede una `I` che si corica invece di una `I` che diventa il fianco
di una `A`.

Un tratto **non ha un verso**. L'asta della `F` è scritta dall'alto in basso e
quella della `N` dal basso in alto: è la stessa retta, ma confrontandole così
com'erano la lettera faceva un mezzo giro su se stessa. Si prova anche col
tratto d'arrivo percorso al contrario e si tiene il verso che ruota meno — da
solo questo ha tolto tre rotazioni da 180°.

### 3. Lo scheletro tira il contorno

Ogni tratto è un **osso**: si sposta, ruota e si allunga, e porta con sé la parte
di lettera che gli sta intorno. Un punto del contorno pesa su tutti gli ossi con
una caduta ripida, quindi l'influenza è locale ma **continua**.

Due strade tentate e scartate, perché il motivo per cui non vanno è la cosa
più utile da sapere se un domani si rimette mano qui:

- **Minimi quadrati mobili** (Schaefer 2006), la risposta da manuale: mettono
  tutti i punti di controllo in un'unica media pesata. Quando due tratti vicini
  ruotano in verso opposto — le due diagonali di una `A` che diventa una `V` —
  quella media passa per configurazioni impossibili e il contorno si lacera.
- **Aggancio al singolo segmento più vicino**, conservando anche di quanto il
  punto sborda oltre il capo del segmento: sembra più preciso ed è peggio. Un
  punto lontano dal tratto ha uno sbordo grande, e appena il tratto ruota quello
  sbordo diventa una scodata.

Gli ossi hanno un **tetto di scala** (`scalaOsso`, `[0.82, 1.22]`). Il loro
compito è ruotare i pezzi di lettera; la misura esatta d'arrivo la mette la
fusione. Senza il tetto, un osso che deve allungarsi di 2,5 volte — capita nella
`F` che diventa `N` — gonfia la sua metà di lettera mentre l'osso accanto la
lascia com'è, il contorno si attraversa e il riempimento pari-dispari lo chiude
in una macchia nera.

### 4. La fusione è simmetrica

Da una parte la lettera di partenza deformata **in avanti**, dall'altra quella
d'arrivo deformata **all'indietro**, e le due si incontrano a metà.

Fondere invece la partenza deformata con un arrivo fermo è la versione ingenua:
al centro della corsa mette insieme due forme che non si somigliano per niente.
Agli estremi non c'è approssimazione — a zero pesa solo la partenza, a uno solo
l'arrivo, e tutte e due sono esatte.

---

## Le manopole

Tutte in cima al file, nel blocco `IMPOSTAZIONI`.

| Manopola | Default | Cosa fa |
|---|---|---|
| `corsa` / `corsaMob` | `2.0` / `1.4` | durata della piega, in schermi di scroll |
| `ease` | `[.38,0,.24,1]` | la curva del tempo |
| `scalaOsso` | `[0.82,1.22]` | quanto un osso può allungare la pelle |
| `passoPunti` | `0.014` | distanza fra due punti del contorno, in em |
| `campioniTratto` | `9` | punti di controllo per tratto |
| `coloreDa` / `coloreA` | `#141416` / `#252a22` | si interpolano |
| `telefonoDa` | `0` | `0` = attiva ovunque; `992` la spegne sul mobile |

---

## Il banco di prova

`prova/` contiene un banco che disegna la stessa piega a progressioni diverse,
una sotto l'altra, e una lente che sovrappone i contorni tracciati al testo vero.
Gira in Chromium headless via Playwright.

```
cd prova
./scarica-font.sh          # una volta: i due font di prova, da Google Fonts
node scatta.js             # striscia.png — la piega a otto progressioni
node scatta-lente.js       # lente.png — contorni tracciati sul testo vero
node scatta-sweep.js       # conteggio anelli al variare di soglia e risoluzione
```

I font stanno su disco e non si prendono dalla rete apposta: una richiesta
andata male fa ripiegare il browser su un font di sistema, e si finisce a
giudicare la piega su sagome che non sono quelle vere. Per questo il banco
controlla `document.fonts.check` e lo scrive nel referto.

Il **conteggio degli anelli** è il controllo più utile che ci sia qui dentro: una
`A` deve fare 2 anelli, una `M` 1, una `O` 2. Se non torna, la lettera si è
sfaldata e non serve nemmeno guardarla.

---

## Cosa manca

1. **Il terzo centrale della corsa** (`p` fra 0.30 e 0.50) ha ancora lettere che
   si chiudono in macchie: i controinterni escono dal bordo esterno e il
   riempimento pari-dispari si inverte. Gli estremi e tutto il resto della corsa
   sono puliti.
2. **L'aggancio alla pagina** non è scritto: il binario di scroll, lo sticky
   della sezione, la consegna dal canvas dell'inchiostro all'SVG, la comparsa
   della sezione al 100% e il pannello bianco che cade via dalle immagini.
3. **Il blocco dell'autoplay** del carosello finché la piega non è finita
   (richiede una modifica a `cape-studio-carousel.js`).
4. Il titolo della prima opera va cambiato in `VOID AND MARK` nei dati del
   carosello.
