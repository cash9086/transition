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

## Il difetto che resta, e come misurarlo senza sbagliare

Nel terzo centrale della corsa alcune lettere si chiudono in macchie nere. La
causa non e' un'impressione: il contorno **si attraversa da solo**, e
`prova/singola.html` lo conta disegnandolo a filo invece che riempito. Dove un
osso ruota di 90 gradi e quello accanto sta fermo, la fascia di lettera in mezzo
si torce e il contorno si ripiega.

Le ossa, invece, fanno gia' la cosa giusta: nel disegno a filo si vede la `A`
che ribalta le diagonali nella `V`, la `H` che piega le aste nella `V` centrale
della `M`, la `F` che alza il braccio nella diagonale della `N`. Il difetto e'
solo nella pelle che le segue.

### Due misure, e quale delle due conta

**Auto-attraversamenti** (`prova/scatta-singola.js`), su `A>V`, `R>O`, `H>M`,
`F>N` a cinque progressioni:

| Variante | Incroci |
|---|---|
| allineamento dei contorni sulle sagome ferme | 60 |
| **allineamento dopo che lo scheletro ha mosso la sagoma** | **40** |
| media degli angoli invece che delle posizioni | 55 |

**Inchiostro per fotogramma** (`prova/scatta.js`), area scura sul quadrato del
corpo, rispetto a `p=0`:

| | a meta' corsa | a fine corsa |
|---|---|---|
| due caratteri diversi (Cormorant 300 -> Bodoni 400) | **+53%** | +49% |
| lo stesso carattere da entrambe le parti | **+11%** | -5% |

Il secondo numero e' quello che decide come si legge la piega, e il primo no.
Passando allo stesso carattere da entrambe le parti gli incroci restano quanti
erano — 40 contro 41 — ma la fascia illeggibile si dimezza, da `p` 0.30-0.50 a
0.30-0.40, e i fotogrammi a 0.50 e 0.60 diventano puliti. **Un ripiegamento
dentro un filetto sottile e' una sovrapposizione che non si vede; lo stesso
ripiegamento dentro un'asta grassa e' una macchia nera.** Contare i
ripiegamenti misura quanti sono, non quanto costano.

Per questo il sito usa `PP Editorial New` da entrambe le parti: non e' solo
coerenza tipografica — toglie anche il cambio di carattere in volo, ed e' finora
la cosa che ha migliorato di piu' il terzo centrale.

I due banchi prendono i caratteri dall'indirizzo, cosi' la domanda si rifa' in
un secondo:

```
node scatta.js                      # come sta il sito adesso
node scatta-uguali.js               # con lo stesso carattere da entrambe le parti
node scatta-confronto.js            # il conteggio degli incroci, tre configurazioni
```

### Vicoli ciechi, perche' non si rifacciano

- **Riempimento non-zero con verso deciso per annidamento**, al posto del
  pari-dispari: e' corretto e piu' robusto, quindi e' rimasto — ma sulle macchie
  non ha cambiato niente. Non erano inversioni del criterio di riempimento.
- **Media degli angoli** invece delle posizioni ruotate: e' la mossa da manuale
  contro lo schiacciamento della pelle. Coi perni degli ossi lontani fra loro
  sposta piu' di quanto raddrizzi, e il fotogramma e' identico.
- **"Le lettere si ingrassano a meta' corsa"**: falso, misurato. Con due
  caratteri diversi l'inchiostro sale in modo monotono dal peso di uno al peso
  dell'altro, senza nessun gonfiore in mezzo. Guardando i fotogrammi sembrava
  vero.

## Il criterio vero: dritte, e non spezzate

Le rette della lettera devono restare **rette** per tutta la corsa, e i pezzi non
devono **spezzarsi**. Se un'asta si incurva, la piega non si legge come una
piega: si legge come liquido. Questo non e' un desiderata estetico da inseguire
con le manopole — e' il criterio di accettazione, e decide l'architettura.

**Una pelle continua non puo' soddisfarlo, e non e' questione di taratura.** Se
ogni punto riceve una media pesata delle trasformazioni dei suoi ossi, e due
ossi vicini ruotano di angoli diversi, la media curva per forza cio' che sta in
mezzo: e' aritmetica, non un difetto da correggere. Tutto quello che si puo'
fare e' scegliere *quanto* curva. Ed e' il motivo per cui ogni variante provata
qui sopra — pesi su due ossi, pesi su tutti, media delle posizioni, media degli
angoli — dava lo stesso fotogramma: cambiavano la forma della curva, non il
fatto che ci fosse.

Quello che serve e' un **metro da falegname**: ogni pezzo di lettera resta
rigido, e i pezzi ruotano l'uno rispetto all'altro. Una trasformazione rigida
manda rette in rette, sempre. I giunti non si spezzano perche' i pezzi si
sovrappongono invece di stirarsi, e il riempimento non-zero li fonde in un
solido unico.

### Come e' fatto adesso: barre e regioni

Ogni tratto dello scheletro e' una **barra**. Una barra fa tre cose e nessun'altra:
ruota, trasla, e si allunga o si accorcia **lungo il proprio asse**. Non e' una
similitudine: quella scala uguale in tutte le direzioni, quindi una barra che si
accorcia diventerebbe anche piu' sottile e la lettera cambierebbe peso mentre si
piega. Qui lo spessore non si tocca. Resta comunque una trasformazione affine,
quindi manda rette in rette — ed e' tutto quello che serve perche' le aste
restino dritte e dure.

Durante la piega la lettera non viene **ritagliata**: viene **costruita**, una
riga per volta. Di ogni riga si misura, punto per punto, l'intervallo di pieno
che si trova sulla perpendicolare — e da quel profilo esce una sagoma chiusa.
Cosi' una riga e' un oggetto a se' *per definizione*: non esiste nessuna lettera
intera da cui ritagliarla, quindi non esiste nessun bordo che possa restare
sbagliato. Ed e' vettoriale, quindi netta a qualunque corpo.

Tre cose che sono servite per arrivarci, tutte trovate rompendo qualcosa:

- **Il punto della riga non sta necessariamente dentro l'inchiostro.** Gli
  scheletri sono disegnati a mano e su parecchie lettere cadono un po' fuori;
  da un punto fuori la misura da' zero e la riga esce come un capello. Quindi
  si guarda tutta la retta, si prende l'intervallo di pieno piu' vicino e ci si
  *centra* sopra: la riga si aggancia all'inchiostro invece di fidarsi di dov'e'
  stata disegnata.
- **La scelta dell'intervallo va fatta in catena**, non campione per campione.
  Vicino a un giunto ci sono due intervalli — il proprio e quello della riga che
  incrocia — e scegliendo ognuno per conto proprio, due campioni confinanti
  finiscono su intervalli diversi: la sagoma esce a denti di sega.
- **Serve un tetto sullo spessore.** Dove la traversa incrocia l'asta, la
  perpendicolare corre dentro l'asta per tutta la sua altezza: li' l'intervallo
  e' enorme e senza tetto la traversa si ingrassa fino a inghiottire l'asta —
  e siccome l'aggancio e' a catena, se lo porta dietro lungo tutta la riga.

## Dove si e' fermato, e perche'

**La geometria e' pulita: nessuna scheggia, nessun dente, nessun morso.** Ogni
pezzo e' una riga intera con i bordi netti. Ma **le lettere non sono piu'
riconoscibili**: la ricostruzione dal profilo non restituisce il disegno di
Editorial New, restituisce una sua parodia. E l'inchiostro sta il 20-30% sopra
il dovuto.

La causa e' una sola, e non e' una taratura: **gli scheletri sono disegnati a
mano e non coincidono con l'asse vero delle aste del carattere.** Finche' la
riga non e' l'asse vero, ricostruire la lettera dal suo profilo non puo' dare
la lettera.

La strada giusta e' smettere di disegnare gli scheletri e **ricavarli dal
carattere**: assottigliare il raster del glifo fino all'asse mediano, potare i
rami spuri delle grazie, e spezzare quello che resta in righe nei punti di
diramazione. Con l'asse vero e la funzione raggio, la ricostruzione non e'
un'approssimazione — e' esatta per costruzione, ed e' l'unica versione che
puo' stare in piedi senza un "quasi".

Nel frattempo, la versione che taglia la lettera vera resta al commit
`fe751d7`: lettere giuste, qualche scheggia. Questa: geometria giusta, lettere
sbagliate.

**Non si spezza mai una riga.** Una lettera ha le righe che ha: la `H` ne ha
tre, due verticali e una orizzontale. Pareggiare i conti col numero di righe
dell'altra lettera spezzandone una in due significa aprire un'asta della `H` in
due tronconi, e la lettera smette di essere una lettera.

Quando i conti non tornano vale la stessa regola portata fino in fondo: una riga
senza partner **si accorcia, fino a sparire**. Il trattino della `A` che diventa
`T` ruota sull'asta della `T` e si accorcia a niente. Simmetricamente, una riga
che nella lettera d'arrivo c'e' e in quella di partenza no **nasce allungandosi
da zero**, e l'inchiostro che porta viene preso dalla lettera d'arrivo, perche'
in quella di partenza non ce n'e'.

**L'asse di una riga si prende dalla riga intera, non dai suoi due capi.** Su un
anello chiuso — la `O`, la `Q` — primo e ultimo punto sono lo stesso punto:
direzione nulla, lunghezza zero, e il fattore di allungamento diventa un numero
assurdo. La `O` non si piegava, esplodeva. Si usa la direzione principale di
tutti i punti: su una barra dritta coincide con quella dei capi, su un anello
esiste comunque, su un arco e' quella giusta.

In coda si passa alla lettera d'arrivo vera (`consegnaBarre`): l'assemblaggio la
sfiora ma non la centra, perche' porta le grazie della lettera di partenza.

## Cosa manca

1. **Il centro della corsa** resta affollato. Adesso pero' il motivo e' noto e
   non e' un taglio: dove due righe si incrociano, quell'inchiostro viaggia con
   tutte e due, quindi per un istante si vede un tratto in piu'. E' il prezzo
   del non tagliare mai, e si regola con `margineCella` — ma sotto mezzo
   spessore d'asta il giunto torna a tagliarsi.
2. **L'aggancio alla pagina** non e' scritto: il binario di scroll, lo sticky
   della sezione, la consegna dal canvas dell'inchiostro, la comparsa della
   sezione al 100% e il pannello bianco che cade via dalle immagini.
3. **Il blocco dell'autoplay** del carosello finche' la piega non e' finita
   (richiede una modifica a `cape-studio-carousel.js`).
4. Il titolo della prima opera va cambiato in `VOID AND MARK` nei dati del
   carosello.
