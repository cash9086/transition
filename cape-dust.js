/*
 * cape-dust — la fotografia si scompone in pixel e diventa un cielo stellato.
 *
 * Prende la foto dell'ultima slide del rig orizzontale, la legge a griglia e
 * ne stacca i pixel uno per uno: prima i piu' chiari, poi via via i piu' scuri.
 * Quello che si stacca non cade — non c'e' gravita', non c'e' attrito: ogni
 * pixel prende una spinta e da li' in poi va dritto per sempre. Strada facendo
 * si spezza (uno diventa due, due diventano quattro) e sbianca, finche' la
 * luce di tutti insieme satura lo schermo in bianco pieno.
 *
 * NIENTE FRAMMENTI IN MEMORIA. La posizione di ogni pixel e' una FUNZIONE
 * PURA del progresso di scroll: niente stato accumulato, niente integrazione
 * passo passo. Si scrolla indietro e la foto si ricompone esatta, perche' allo
 * stesso progresso corrisponde sempre la stessa scena. Per lo stesso motivo
 * non esistono buffer di particelle da riempire: il vertex shader ricava tutto
 * da gl_VertexID, quindi il costo di montaggio e' zero e il costo per
 * fotogramma e' una draw call.
 *
 * LA PARTE ANCORA ATTACCATA non e' disegnata coi punti: e' la fotografia vera,
 * un rettangolo texturato in cui ogni frammento calcola — con la stessa
 * identica funzione del vertex shader — se il suo pixel se n'e' gia' andato, e
 * in quel caso si scarta. Cosi' a progresso 0 quello che si vede e' la
 * fotografia, non una sua imitazione fatta di puntini, e il passaggio da
 * "attaccato" a "in volo" non ha nessuna cucitura.
 *
 * Uso:
 *   CapeDust.mount();            // i valori qui sotto bastano
 *   CapeDust.mount({ foto: '...', params: { ... } });
 *
 * Struttura attesa nel documento (un Embed, niente altro):
 *   .cape-dust-pin        alto qualche schermata, position: relative
 *     .cape-dust-stick    position: sticky; top: 0; height: 100vh
 *                         (il canvas lo mette dentro questo modulo)
 *   la sezione successiva, bianca, viene dopo .cape-dust-pin nel flusso.
 *
 * COSA SERVE IN PAGINA: niente. Un tag <script> nel footer. Tutti i numeri
 * stanno qui sotto: per cambiarli si cambia questo file e si aggiorna lo SHA
 * nell'indirizzo, senza rientrare nel custom code di Webflow.
 */
(function (global) {
  "use strict";

  var I = {
    /* ——— dove ——————————————————————————————————————————————————— */
    pin:   ".cape-dust-pin",
    stick: ".cape-dust-stick",

    /* La fotografia che si scompone. Se un giorno sposti la slide o cambi
       classe all'immagine, questa e' l'unica riga da toccare. */
    foto:  ".cape-hs-track > section:last-of-type .image-14",

    /* Il rig orizzontale: mentre questa sezione e' incollata, l'ultima slide
       non deve scorrere. Glielo dice una classe, che il CSS di pagina
       traduce in position:fixed. */
    rig:      ".cape-hs-sticky",
    rigTrack: ".cape-hs-track",
    rigWrap:  ".cape-hs-wrap",
    fermo:    "is-fermo",

    /* Il velo: quanto il CONTENUTO della slide (titoli, bottone) e' ancora
       visibile. La foto non e' inclusa nel conto — quella, appena il canvas
       e' pronto, viene spenta del tutto e la ridisegniamo noi.

       LA FINESTRA E' CORTA PER FORZA, e il motivo non si deduce guardando
       questo file. Il riarmo della tendina, in pagina, tiene un
       IntersectionObserver su .cape-hs-wrap: quando il WRAP esce dal
       viewport riarma tutte le sezioni, e riarmare vuol dire scrivere
       opacity:0 con transition:none sulle righe di testo. Ma la slide in
       quel momento e' ancora sullo schermo, perche' ce la tiene is-fermo:
       quindi il testo si spegne DI SCATTO sotto le stelle.
       Il wrap esce presto — con 600vh di sezione e 100vh di accavallamento,
       al 20% del progresso — quindi il velo deve aver gia' finito prima.
       Non e' un numero da indovinare: sotto viene misurato (vedi fermata()) e
       la finestra si accorcia da sola se la geometria cambia. */
    velo:     "--cape-veil",
    veloDa:   0.02,
    veloA:    0.17,
    fotoOff:  "is-dust-off",

    /* ——— la barra in alto ————————————————————————————————————————
       Dentro la sezione si ritira verso l'alto e torna giu' appena si esce,
       da qualunque lato: chi sale dallo studio-hero se la ritrova quando
       rientra nel rig, chi scende la ritrova nello studio-hero.

       Si muove a SCROLL, con lo stesso numero che spegne le scritte della
       slide, non a tempo: vedi muoviBarra(). Per questo qui non ci sono ne'
       una durata ne' una curva — non c'e' niente che duri.
       E per la stessa ragione non serve nessuna transition nel CSS di
       pagina, che era la cosa da evitare: il foglio della head avverte che
       sulla barra le transizioni vanno lasciate stare, perche' una forma
       abbreviata scritta li' sostituirebbe quella impostata nel Designer. */
    barra:       ".header-cape",
    barraSalita: 110,     /* di quanto sale, in % della propria altezza */
    barraTornaDa:0.93,    /* dove comincia a riscendere, per la sezione dopo */
    barraTornaA: 0.99,

    /* ——— il cursore del sito ————————————————————————————————————
       Sopra questa sezione non c'e' un elemento da leggere: c'e' una
       simulazione. Il colore glielo diciamo noi, scrivendo la variabile e non
       la classe — la classe la gestisce gia' lo script del cursore, e in due
       a scrivere la stessa cosa si vede sfarfallare. */
    /* Le due immagini della lastra: la quota della goffratura e la pendenza
       del suo volume. Stanno nella repo cape-rilievo, pinnate a uno SHA — a
       @main jsDelivr le tiene in cache fino a una settimana e si finisce a
       guardare una versione vecchia senza capire perche'. */
    lastraBase: "https://cdn.jsdelivr.net/gh/cash9086/cape-rilievo@641d7e8fb84f29b4ee0c13cb39600ad1acad698c/",
    /* la versione con la grana della stampa vera: e' quella che fa leggere
       lo scavo come il manifesto, e non come un disegno pulito */
    lastraSolco: "stampa-grana.png",
    lastraGobba: "stampa-grana-gobba.png",
    /* Il formato delle due immagini. Serve prima che arrivino: il bianco
       si misura sulla lastra, e deve potersi formare anche se le immagini
       tardano o non arrivano affatto. */
    lastraFormato: 1600 / 1158,
    /* E quanta parte di loro e' disegno: il resto e' margine, che serve alla
       gobba per spegnersi prima del bordo. Le misure — della lastra e del
       bianco attorno — si prendono sul DISEGNO, non sul file. Li stampa
       stampa.py: se rigeneri le immagini, ricopiali qui. */
    lastraDisegno: [0.827, 0.761],

    cursore:    "#capecur",
    cursoreVar: "--cc",
    suScuro:    "#ffffff",
    suBianco:   "#141416",

    /* Oltre questa soglia di progresso lo schermo e' piu' bianco che nero:
       l'header viene avvisato col suo data-hdr. Il cursore la usa solo
       finche' non sa dov'e' il mouse: poi guarda cosa ha sotto (stato()). */
    soglia: 0.62,

    params: {
      /* ——— la griglia ————————————————————————————————————————————
         cella      lato di una cella in pixel css. 1.7 vuol dire che un
                    "pixel" della foto e' poco piu' di un pixel vero: resta
                    polvere, non diventa mai una tessera.
         maxCelle   tetto al numero di celle. Le particelle sono quattro
                    volte tanto (un pixel si spezza due volte), quindi
                    150.000 celle sono 600.000 punti. Su telefono si scende:
                    non e' una resa grafica, e' che sotto un certo numero di
                    fotogrammi l'effetto non e' piu' bello, e' rotto. */
      cella:        1.7,
      maxCelle:     150000,
      maxCelleMob:  42000,

      /* ——— l'erosione ————————————————————————————————————————————
         corsa      in quanta parte del progresso la foto si svuota tutta.
                    0.33 = finisce nel primo terzo, il resto e' cielo.
         caso       quanto il momento del distacco e' sorteggiato invece che
                    deciso dalla luminosita'. A 0 i pixel di uguale chiarezza
                    partono TUTTI INSIEME e si vede una stampella: zone piatte
                    che si alzano in blocco. Un po' di caso rompe le figure
                    senza far perdere l'ordine. */
      corsa:        0.33,
      caso:         0.38,

      /* ——— la spinta ————————————————————————————————————————————
         velocita   pixel di schermo per unita' di progresso. E' tanta perche'
                    l'unita' di progresso e' l'intera sezione: qui dentro un
                    pixel ha cinque schermate di scroll per attraversare lo
                    spazio.
         radiale    quanto la direzione e' "via dal centro della foto" invece
                    che a caso. Tenuto BASSO, e non e' un ripiego: alzandolo
                    la nuvola diventa un guscio, e un guscio e' vuoto dentro —
                    al centro dello schermo si apre un disco nero che sembra
                    un guasto, non spazio. Con le direzioni per lo piu'
                    sorteggiate la nuvola resta piena mentre si allarga. Con
                    0.6 il buco si vede; con 0.25 no.
         fondo      ampiezza della componente in profondita'.
         camera     distanza della camera in pixel: piu' e' piccola, piu' la
                    prospettiva e' marcata. */
      velocita:     820,
      radiale:      0.25,
      fondo:        1.25,
      camera:       1100,

      /* ——— le divisioni —————————————————————————————————————————
         A che punto del viaggio di un pixel (in unita' di progresso dal suo
         distacco) avvengono le due divisioni. La seconda e' piu' avanti,
         cosi' il cielo continua a infittirsi anche quando i primi sono gia'
         lontani. Ogni pixel le sfasa per conto suo: se avvenissero tutte
         nello stesso istante si vedrebbe un lampo collettivo. */
      divide1:      0.13,
      divide2:      0.30,
      deriva:       0.42,   /* quanto la scheggia devia dal ramo che lascia */

      /* Quanto in fretta la nuvola intera si ricentra sullo schermo: a 1.4 il
         cielo e' centrato sul viewport attorno a tre quarti del viaggio. A 0
         resta dov'era la fotografia — cioe' in una colonna sola, con meta'
         schermo nero. Piu' alto di cosi' e la nuvola supera il centro e se ne
         va dall'altra parte. */
      centra:       1.4,

      /* ——— la luce ———————————————————————————————————————————————
         sbianca    in quanto tempo di viaggio un pixel passa dal colore che
                    aveva nella foto al bianco.
         punto      lato del punto in pixel css.
         crescita   quanto al massimo puo' ingrandirsi un punto che passa
                    vicino alla camera. Tenuto basso, e PROVATO: portandolo
                    a 2.4 (con bokeh a 4.6) il campo diventa piu' morbido e
                    piu' uniforme, e si perde proprio la cosa che lo fa
                    sembrare un gioiello — lo stacco fra i pochi nitidi e i
                    molti sfocati. Piu' sfocato non e' piu' ricco: e' piu'
                    impastato. */
      sbianca:      0.30,
      punto:        1.7,
      crescita:     1.75,

      /* ——— lo scintillio ————————————————————————————————————————
         Le tre manopole sono separate apposta, perche' "troppo scintillio"
         non vuol dire mai una cosa sola: puo' voler dire troppi, o troppo
         grossi, o troppo frenetici, e si curano in tre posti diversi.

         quota        QUANTI. Frazione di pixel che scintilla; il resto sta
                      acceso e basta. Un lampo vale in proporzione a quanto
                      e' raro: se lampeggia tutto, non lampeggia niente.
         forza        QUANTO FORTE al culmine. Non alzarla per farli notare
                      di piu': un culmine troppo alto allarga l'alone e i
                      punti sembrano palle.
         secchezza    che FORMA ha il lampo nel tempo. Esponente alto = sale
                      e scende di colpo. Da solo non decide la velocita':
                      quella e' il ritmo qui sotto.
         ritmo        QUANTO SPESSO, in radianti al secondo. 0.16 + 0.45 di
                      variazione vuol dire un giro ogni 10-40 secondi: una
                      pietra che gira piano sotto una luce, non una lucina
                      di Natale. E' questo il numero che si abbassa quando
                      "luccicano troppo velocemente", non la secchezza.
         ritmoVar     quanta differenza di ritmo c'e' fra una particella e
                      l'altra. Serve: a ritmo uguale per tutti il campo
                      pulsa insieme e si vede il battito. */
      quota:        0.015,
      forza:        6.0,
      secchezza:    26.0,
      ritmo:        0.16,
      ritmoVar:     0.45,

      /* Di quanto si allarga una stella di prima grandezza. Non lampeggia:
         sta accesa e basta. E' questo, non il lampo, a dare al cielo le
         grandezze diverse — e va alzato quando il campo sembra piatto,
         invece di mettere piu' scintillio. */
      bagliore:     0.85,

      /* ——— l'ottica del gioielliere ————————————————————————————
         fuoco        dove sta il piano a fuoco, in z. 0 = il piano della
                      fotografia, cioe' il pixel e' nitido nell'istante in
                      cui si stacca e sfuoca solo viaggiando.
         profondita   quanto ci si allontana da quel piano prima di essere
                      completamente impastati. Piccola = poca profondita' di
                      campo = ottica luminosa = macro di gioielleria.
         bokeh        di quante volte si allarga una particella del tutto
                      fuori fuoco. La sua luce si spegne in proporzione:
                      stessa energia, piu' area.
         flare        quanto e' lungo il raggio della croce, in pixel css.
                      E' QUESTO che decide quanto grande appare un lampo:
                      la croce e l'alone attorno occupano quasi tutto lo
                      sprite, quindi raddoppiarlo raddoppia l'ingombro.
         iride        quanta dominante di colore prende un lampo. Poca: e'
                      un accenno, non un arcobaleno. Sopra 0.3 sembra un
                      difetto dello schermo. */
      fuoco:        0,
      profondita:   380,
      bokeh:        3.4,
      flare:        19,
      iride:        0.17,

      /* ——— il tocco del mouse ——————————————————————————————————
         Dove passa il puntatore NON si alza la luce: si alza la probabilita'
         che una stella scocchi. Un diamante non diventa piu' luminoso quando
         giri la mano — sono altre sfaccettature che prendono il riflesso. Un
         alone di luce in piu' sarebbe una torcia, e una torcia su un campo
         fitto impasta invece di illuminare.

         quota      quante stelle possono partecipare al tocco. Molte piu' di
                    quelle che scintillano da sole: il senso e' che dove passi
                    "si sveglia" una parte del cielo che era ferma.
         forza      quanto brucia un lampo del tocco. Separata da quella dei
                    lampi normali perche' questo deve passare anche attraverso
                    la sfocatura, e quindi parte piu' alto.
         ritmo      quante volte piu' spesso scoccano dentro il tocco. E' un
                    ritmo SUO, fisso per particella: non si puo' accelerare
                    quello di base, perche' cambiare la velocita' di un seno
                    gia' in corsa gli fa saltare la fase e si vedrebbe
                    sfarfallare tutto il campo.
         secco      quanto e' breve un lampo del tocco. Piu' morbido di quello
                    normale (8 contro 26) per una ragione contata, non di
                    gusto: la durata del lampo decide QUANTI ne sono accesi
                    nello stesso istante. Con 26 ne brillano una trentina per
                    fotogramma dentro la scia e non si vede niente; con 8
                    diventano un centinaio e la scia si legge. Piu' morbido
                    ancora e smettono di essere lampi: diventano un alone.
         raggio     ampiezza dell'impronta, in altezze di schermo.
         coda       secondi perche' la scia si spenga dietro di te.
         salita     secondi perche' si accenda dove arrivi. Corta, se no il
                    puntatore sembra in ritardo sulla mano.
         da / a     dentro quale tratto della sezione il tocco esiste: dopo
                    che la foto si e' sgretolata, prima che vinca il bianco.
                    Sulla fotografia ancora intera sarebbe fuori luogo, e nel
                    bianco non ci sarebbe niente da svegliare. Dentro il
                    bianco del centro si spegne da solo, pixel per pixel. */
      toccoQuota:   0.80,
      toccoRitmo:   9.0,
      toccoForza:   13.0,
      toccoSecco:   8.0,
      toccoRaggio:  0.21,
      toccoCoda:    0.70,
      toccoSalita:  0.10,
      toccoDa:      0.30,
      toccoA:       0.92,

      /* ——— la spinta del mouse ————————————————————————————————————
         Oltre ad accendere la scia, il puntatore SCOSTA i diamanti: si
         allontanano da lui come l'acqua dalla mano, e tornano al loro posto
         mentre la scia si spegne — con lo stesso tempo, toccoCoda, perche'
         sono la stessa cosa vista in due modi.
         Non e' uno stato delle particelle, che non ne hanno: e' una mappa
         di spostamenti in coordinate schermo, come quella del calore, che il
         vertex shader somma alla posizione. Il volo resta una funzione pura
         del progresso; la spinta gli passa sopra e se ne va.
         spinta        di quanto al massimo, in pixel css
         spintaRaggio  fin dove arriva, in altezze di schermo */
      spinta:       20,
      spintaRaggio: 0.16,

      /* ——— la salita della luce ————————————————————————————————
         Nell'ultimo tratto tutte le stelle insieme si accendono. Serve
         perche' il bianco della fine deve sembrare che venga DA LORO — sono
         diventate tante e forti — e non da una tendina bianca calata sopra.
         La tendina qui sotto c'e' lo stesso, ma arriva quando il campo e'
         gia' quasi bianco di suo e le resta da chiudere solo l'ultimo poco. */
      guadagno:     2.4,
      guadagnoDa:   0.42,
      guadagnoA:    0.95,

      /* ——— il bianco finale ————————————————————————————————————
         Lo schermo lo riempie la luce del centro, crescendo finche' satura
         anche gli angoli (vedi LA LUCE). Questo velo arriva DOPO, quando e' gia'
         tutto bianco, e serve solo a garantire il 255 esatto: la sezione dopo
         e' bianca e un fondo a 250 si vede come una riga.
         Prima arrivava a meta' strada, sopra il cielo ancora nero, ed e' li'
         che nasceva la fase grigia: un velo mezzo trasparente su nero e'
         grigio, qualunque cosa ci sia sotto.
         Sul binario intero, come tutto quello che viene dopo la polvere. */
      veloDa:       0.93,
      veloA:        0.96,

      /* ——— la coda: l'ultimo tratto del binario non e' di questa sezione ———
         Dopo la polvere viene la lastra incisa, e sta sullo STESSO binario,
         dentro allo stesso pannello incollato. Non e' una sezione a parte:
         e' la seconda meta' di questa. `coda` accende il rallentamento qui
         sotto; a zero lo spettacolo corre dritto dall'inizio alla fine. */
      coda:         0.36,

      /* ——— il rallentamento ————————————————————————————————————
         Mentre si incide la lastra la polvere non si ferma: RALLENTA. Prima
         qui c'era una sosta — il progresso piantato per un quarto del binario
         — e un campo che si pianta e riparte e' un secondo movimento, non lo
         stesso che continua.
         Quello che si regola e' la VELOCITA' del progresso lungo il binario,
         non il progresso: scende piano fino a `lento`, ci resta, risale
         piano. La curva e' il suo integrale, quindi non ha spigoli: non c'e'
         un fotogramma in cui si sente la frenata.
         passo    la velocita' prima del rallentamento. E' quella di sempre
                  (0.66 / 0.55): l'espansione fino al bianco non cambia.
                  Dopo, la velocita' la trova la curva da sola, perche' il
                  progresso arrivi a 1 esattamente in fondo al binario. */
      passo:        1.2,
      lentoDa:      0.46,   /* dove comincia a frenare, sul binario intero */
      lentoA:       0.82,   /* dove ha ripreso del tutto */
      lentoRampa:   0.08,   /* quanto dura la frenata, e la ripresa */
      lento:        0.15,   /* la velocita' in mezzo, rispetto a `passo` */

      /* La tendina bianca a tutto schermo resta accesa: arriva quando lo
         schermo e' gia' bianco, e garantisce il 255 (vedi veloDa). */
      biancoFinale: true,

      /* ——— LA LUCE ————————————————————————————————————————————
         Il bianco del centro non e' una forma: e' LUCE. Prima era una
         superellisse che si allargava, coi diamanti che dentro diventavano
         carta e fuori no — e per quanto sfrangiato, un confine che avanza si
         legge come una sezione che si apre, non come un bagliore.

         Adesso al centro dello schermo c'e' un campo di luce senza bordo:
         cala con la distanza come cala un bagliore (exp(-d^forma)), e nel
         tempo non si allarga — CRESCE DI INTENSITA'. Ogni diamante prende la
         luce che gli arriva: si accende, si gonfia, smette di scintillare,
         in proporzione, senza soglie. Dove la luce e' tanta i diamanti
         bruciano e sotto di loro compare la carta bianca; dove e' poca sono
         solo piu' luminosi del solito. Nessun diamante cambia strada.

         Il bianco pieno quindi non ha un fronte: e' il punto in cui la luce
         satura, e satura prima al centro e poi via via fuori, mentre tutto
         attorno i diamanti si accendono gia'.

         Alla fine la stessa luce cresce finche' satura anche gli angoli
         dello schermo: e' quello, e non un velo, a chiudere la sezione.

         luceX, luceY  quanto e' larga, in multipli di mezzo disegno della
                       lastra: il bianco pieno la contiene sempre, su
                       qualunque schermo, perche' l'intensita' massima si
                       calcola da qui. */
      luceDa:         0.42,   /* sul binario intero: si accende */
      luceA:          0.62,   /* e' al massimo */
      luceCurva:      2.2,    /* >1 = parte piano, un chiarore, poi cresce */
      luceX:          0.5,
      luceY:          0.5,
      luceForma:      1.0,    /* 1 = esponenziale, 2 = gaussiana */
      luceCarta:      0.8,    /* quanto in fretta un diamante diventa luce */
      luceGuadagno:   0.35,   /* quanto si accende, per unita' di luce */
      luceGonfia:     2.6,    /* di quanto si allarga un diamante tutto luce */
      luceColmo:      1.15,   /* quanto vale un diamante tutto luce: >1 satura */
      luceAlone:      0.3,    /* un velo di luce attorno alla carta, 0 = niente */
      pienoDa:        1.5,    /* a quanta luce la carta sotto comincia */
      pienoA:         8.0,    /* e a quanta e' piena */
      tuttoDa:        0.80,   /* la luce cresce fino a saturare lo schermo */
      tuttoA:         0.93,

      /* ——— LA LASTRA ————————————————————————————————————————————
         La scritta e i due surfisti SCAVATI nella carta, bianco su bianco. Si
         leggono dalle ombre, e sul bianco pieno la luce puo' solo fare ombra:
         sopra non c'e' niente da schiarire. E' anche quello che toglie il
         rettangolo — dipingendo anche il bianco si vedrebbe il riquadro della
         lastra stampato sulla pagina.

         SCAVATA, NON SOLO CONTORNATA. Con la sola luce sulle pareti si legge
         il bordo delle sagome e il loro interno resta bianco come la carta:
         da lontano e' un disegno a linee, uno scarabocchio. Qui la parete
         dalla parte della luce getta un'ombra sul fondo (lastraPortata), e il
         fondo, che prende meno cielo, e' un filo piu' scuro (lastraFondo): la
         sagoma si legge piena, come nel manifesto vero.

         SI INCIDE A PRESSIONE. Compare tutta insieme, prima appena accennata
         e poi sempre piu' profonda: e' lo scavo che affonda, non un disegno
         che si scopre. Alla fine torna piatta, mentre la luce satura tutto.

         SI LEGGE SEMPRE TUTTA. Una luce radente d'ambiente la prende da un
         lato e gira piano (lastraGiro): basta a leggerla anche senza mouse,
         e su un telefono e' l'unica luce che c'e'. Il puntatore ne aggiunge
         una sua, vicina: li' le ombre si scavano di piu'.

         SI INCLINA verso il puntatore, di pochi gradi e con un po' di
         ritardo: la luce dice che c'e' un rilievo, l'inclinazione dice che
         e' una cosa appoggiata li'. Il lato sotto il mouse va indietro,
         come nella vecchia lastra del surfista. */
      lastraDa:       0.52,   /* comincia a scavare */
      lastraA:        0.66,   /* pressione piena */
      lastraFino:     0.80,   /* resta piena */
      lastraVia:      0.90,   /* torna piatta */
      lastraAlta:     0.52,   /* altezza del disegno, in frazione di schermo */
      lastraLarga:    0.84,   /* e al massimo questa frazione di larghezza */
      lastraMassa:    1.8,
      lastraOmbra:    0.62,
      lastraLucida:   0.34,
      lastraForza:    6.5,
      lastraAmbiente: 0.55,   /* quanto conta la luce d'ambiente */
      lastraContorno: 0.2,    /* quanto scuriscono i fianchi, da ogni lato */
      lastraMouse:    0.55,   /* quanto conta la luce del puntatore */
      lastraSegno:    -1,     /* -1 = scavata nella carta, +1 = in rilievo */
      lastraProfondita: 0.016, /* quanto e' profonda, in larghezze di lastra */
      lastraPortata:  0.6,    /* quanto sono scure le ombre portate */
      lastraFondo:    0.12,   /* quanto e' piu' scuro il fondo dello scavo */
      lastraRadente:  0.45,   /* altezza della luce d'ambiente: bassa = ombre lunghe */
      lastraGiro:     18,     /* secondi per un giro della luce d'ambiente */
      lastraInclina:  5,      /* gradi */
      lastraMolla:    0.30    /* secondi perche' l'inclinazione raggiunga il mouse */
    }
  };

  /* ====================================================================== */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* Lo stesso dado, in GLSL e qui: il vertex shader e il frammento della
     fotografia devono decidere IDENTICAMENTE quando un pixel si stacca, o si
     vedono punti doppi e buchi. Una funzione sola, scritta una volta, usata
     da tutti e due. */
  var DADO = [
    "uint pcg(uint v){",
    "  v = v * 747796405u + 2891336453u;",
    "  uint w = ((v >> ((v >> 28) + 4u)) ^ v) * 277803737u;",
    "  return (w >> 22) ^ w;",
    "}",
    "float dado(ivec2 c, int k){",
    "  uint s = uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ uint(k) * 83492791u;",
    "  return float(pcg(s) & 0x00FFFFFFu) / 16777216.0;",
    "}",
    /* Il momento in cui il pixel della cella c si stacca. I piu' chiari per
       primi: la luminosita' viene normalizzata sull'escursione vera della
       fotografia, altrimenti su una foto notturna — dove sono tutti scuri —
       partirebbero tutti alla fine. Cosi' l'effetto si regola da se' su
       qualunque immagine. */
    "float distacco(vec3 col, ivec2 c, vec2 gamma, float corsa, float caso){",
    "  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));",
    "  l = clamp((l - gamma.x) / max(0.0001, gamma.y - gamma.x), 0.0, 1.0);",
    "  return ((1.0 - l) * (1.0 - caso) + dado(c, 0) * caso) * corsa;",
    "}"
  ].join("\n");

  /* Il campo di luce, scritto una volta e usato da due programmi: i
     diamanti che si accendono e la carta che li tappa da sotto devono
     leggere la stessa luce, o fra i due si vede un alone. Chi lo include
     deve aver dichiarato uLume (semiassi, intensita', esponente). */
  var LUME = [
    "float lume(vec2 pos, vec2 centro){",
    "  vec2 q = (pos - centro) / uLume.xy;",
    "  return uLume.z * exp(-pow(dot(q, q), uLume.w * 0.5));",
    "}"
  ].join("\n");

  /* precision highp int NON e' una formalita'. In GLSL ES 3.00 il vertex
     shader ha gli interi a 32 bit per difetto, il FRAGMENT shader no: li' il
     default e' mediump, che su una GPU di telefono sono davvero 16 bit. Il
     dado qui sotto moltiplica numeri grandi e conta sull'andare in overflow
     in modo prevedibile: a 16 bit darebbe numeri diversi da quelli del vertex
     shader, i due non sarebbero piu' d'accordo su quali pixel sono partiti, e
     si vedrebbero pixel fantasma — sul telefono, non sul computer di chi
     l'ha scritto. */
  var HEAD = "#version 300 es\nprecision highp float;\nprecision highp int;\n";

  /* ——— la fotografia ancora attaccata ——————————————————————————————
     Un rettangolo, la texture vera, e un discard per i pixel gia' partiti.
     Il colore si campiona a piena risoluzione (vUV), la DECISIONE si prende
     per cella (cuv): l'immagine resta nitida mentre si sgretola. */
  var VS_FOTO = HEAD + [
    "uniform vec4 uRect;",   /* x, y, w, h in pixel del dispositivo */
    "uniform vec2 uRes;",
    "out vec2 vUV;",
    "void main(){",
    "  vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));",
    "  vUV = q;",
    "  vec2 p = uRect.xy + q * uRect.zw;",
    "  vec2 n = (p / uRes) * 2.0 - 1.0;",
    "  gl_Position = vec4(n.x, -n.y, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FS_FOTO = HEAD + DADO + [
    "uniform sampler2D uTex;",
    "uniform vec2  uGrid;",
    "uniform vec4  uCover;",
    "uniform vec2  uGamma;",
    "uniform float uProg, uCorsa, uCaso;",
    "in  vec2 vUV;",
    "out vec4 oCol;",
    "void main(){",
    "  vec2 cell = floor(vUV * uGrid);",
    "  vec2 cuv  = (cell + 0.5) / uGrid;",
    "  vec3 cc   = texture(uTex, uCover.xy * cuv + uCover.zw).rgb;",
    "  if (uProg > distacco(cc, ivec2(cell), uGamma, uCorsa, uCaso)) discard;",
    "  oCol = vec4(texture(uTex, uCover.xy * vUV + uCover.zw).rgb, 1.0);",
    "}"
  ].join("\n");

  /* ——— i pixel in volo ————————————————————————————————————————————
     Nessun buffer: quattro punti per cella, tutti ricavati da gl_VertexID.
     Lo slot 0 e' il pixel originale; l'1 nasce dalla prima divisione, il 2 e
     il 3 dalla seconda — uno dal ramo originale, uno dal ramo gia' diviso.
     Ogni nascita ricalcola dov'era il ramo padre in quell'istante: essendo
     tutto moto rettilineo, e' una moltiplicazione, non una simulazione. */
  var VS_PUNTI = HEAD + DADO + [
    "uniform sampler2D uTex;",
    "uniform vec2  uGrid, uRes, uGamma, uDivide, uDeriva2;",
    "uniform vec4  uRect, uCover;",
    "uniform float uProg, uTime, uDpr;",
    "uniform float uCorsa, uCaso, uVel, uRadiale, uFondo, uCamera, uDeriva;",
    "uniform float uSbianca, uPunto, uCrescita;",
    "uniform float uQuota, uForza, uSecchezza, uGuadagno;",
    "uniform float uFuoco, uProfondita, uBokeh, uFlare, uIride;",
    "uniform float uRitmo, uRitmoVar, uBagliore;",
    "uniform vec4  uLume;",     /* semiassi, intensita', esponente */
    "uniform vec2  uPieno;",    /* la luce a cui la carta comincia, e e' piena */
    "uniform float uLumeCarta, uLumeGuadagno, uGonfia, uCartaLuce;",
    "uniform sampler2D uCalore, uSpinta;",
    "uniform float uTocco, uToccoQuota, uToccoRitmo, uToccoForza, uToccoSecco, uSpintaPx;",
    "out vec4 vCol;",
    "out vec3 vForma;",   /* x = raggio del disco dentro lo sprite, y = sfuoco, z = lampo */
    LUME,

    /* Direzione della spinta: un po' via dal centro della foto, un po' a caso.
       La componente in profondita' e' simmetrica, quindi meta' dei pixel
       viene avanti e meta' se ne va indietro: e' quello che apre il campo. */
    "vec3 spinta(ivec2 c, int k, vec2 fuga){",
    "  float a = dado(c, k) * 6.2831853;",
    "  vec2  r = vec2(cos(a), sin(a));",
    "  vec2  xy = normalize(mix(r, fuga, uRadiale) + 1e-5);",
    "  float z = (dado(c, k + 40) * 2.0 - 1.0) * uFondo;",
    "  return vec3(xy, z);",
    "}",
    /* La velocita' non e' distribuita in modo piatto ma schiacciata verso il
       basso: molti pixel lenti, pochi velocissimi. Con velocita' tutte simili
       il campo si allontana compatto e dietro di se' lascia un buco nero
       grande quanto la fotografia — si legge come un errore, non come spazio.
       Con questa distribuzione i lenti restano a presidiare il centro mentre
       i veloci vanno a riempire i bordi dello schermo. */
    "float passo(ivec2 c, int k){ float d = dado(c, k + 80); return uVel * (0.20 + 1.45 * pow(d, 1.6)); }",

    "void main(){",
    "  int id = gl_VertexID;",
    "  int slot = id & 3;",
    "  int cid = id >> 2;",
    "  int cols = int(uGrid.x);",
    "  ivec2 c = ivec2(cid - (cid / cols) * cols, cid / cols);",

    "  vec2 cuv = (vec2(c) + 0.5) / uGrid;",
    "  vec3 col = texture(uTex, uCover.xy * cuv + uCover.zw).rgb;",
    "  float tau = uProg - distacco(col, c, uGamma, uCorsa, uCaso);",
    "  if (tau <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vForma = vec3(0.0); return; }",

    /* origine: il posto esatto che quel pixel occupava sullo schermo */
    "  vec2 ori = uRect.xy + cuv * uRect.zw;",
    "  vec2 mezzo = uRect.xy + uRect.zw * 0.5;",
    "  vec2 fuga = normalize(ori - mezzo + 1e-4);",

    "  vec3 dR = spinta(c, 1, fuga); float sR = passo(c, 1);",
    "  float n1 = uDivide.x * (0.65 + 0.7 * dado(c, 7));",
    "  float n2 = max(n1 + 0.03, uDivide.y * (0.65 + 0.7 * dado(c, 8)));",

    "  vec3 p; float nato;",
    "  if (slot == 0) {",
    "    nato = 0.0;",
    "    p = vec3(ori, 0.0) + dR * sR * tau;",
    "  } else if (slot == 1) {",
    "    nato = n1;",
    "    vec3 dA = normalize(mix(dR, spinta(c, 2, fuga), uDeriva));",
    "    p = vec3(ori, 0.0) + dR * sR * n1 + dA * passo(c, 2) * (tau - n1);",
    "  } else if (slot == 2) {",
    "    nato = n2;",
    "    vec3 dB = normalize(mix(dR, spinta(c, 3, fuga), uDeriva));",
    "    p = vec3(ori, 0.0) + dR * sR * n2 + dB * passo(c, 3) * (tau - n2);",
    "  } else {",
    "    nato = n2;",
    "    vec3 dA = normalize(mix(dR, spinta(c, 2, fuga), uDeriva));",
    "    float sA = passo(c, 2);",
    "    vec3 uno = vec3(ori, 0.0) + dR * sR * n1 + dA * sA * (n2 - n1);",
    "    vec3 dC = normalize(mix(dA, spinta(c, 4, fuga), uDeriva));",
    "    p = uno + dC * passo(c, 4) * (tau - n2);",
    "  }",
    "  if (tau < nato) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vForma = vec3(0.0); return; }",

    /* La nuvola, oltre ad aprirsi, si sposta tutta insieme verso il centro
       dello schermo. E' una traslazione a velocita' costante — quindi sempre
       inerzia, nessuna forza, nessuna accelerazione: dal punto di vista della
       fisica e' solo un altro osservatore che si muove. Serve perche' la
       fotografia sta in una colonna sola: senza questo, meta' schermo resta
       nera e il cielo e' tutto ammucchiato da una parte. */
    "  p.xy += uDeriva2 * tau;",

    /* prospettiva attorno al centro dello schermo: la camera guarda li' */
    "  vec2 vc = uRes * 0.5;",
    "  float sc = uCamera / max(uCamera - p.z, uCamera * 0.14);",
    "  vec2 scr = vc + (p.xy - vc) * sc;",

    /* ——— la luce ———
       Nessun pixel cambia strada: prende la luce che gli arriva li' dove
       sta. `carta` dice quanto e' diventato luce — da 0 a 1, senza soglie —
       e `lumeQui` quanta ne riceve, che serve anche oltre l'1: e' quella
       che accende i diamanti lontani, dove la carta non c'e'.
       Chi sta dove la carta di sotto e' gia' piena non si disegna nemmeno:
       bianco piu' luce e' bianco, e sono i pixel piu' fitti di tutto il
       campo — il risparmio e' proprio dove costerebbero di piu'. */
    "  float carta = 0.0, lumeQui = 0.0;",
    "  if (uLume.z > 0.001) {",
    "    lumeQui = lume(scr, vc);",
    "    if (smoothstep(uPieno.x, uPieno.y, lumeQui) > 0.996) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vForma = vec3(0.0); return; }",
    "    carta = 1.0 - exp(-lumeQui * uLumeCarta);",
    "  }",

    /* LA SPINTA del puntatore, solo fuori dal bianco: nel bianco il mouse
       tocca la lastra, non la carta. */
    "  if (uTocco > 0.0 && uSpintaPx > 0.0 && carta < 1.0) {",
    "    vec2 sp = (texture(uSpinta, scr / uRes).rg * 255.0 - 127.0) / 127.0;",
    "    scr += sp * uSpintaPx * uTocco * (1.0 - carta);",
    "  }",

    "  vec2 n = (scr / uRes) * 2.0 - 1.0;",
    "  gl_Position = vec4(n.x, -n.y, 0.0, 1.0);",

    /* il colore della foto che si perde nel bianco lungo il viaggio */
    "  float bianco = smoothstep(0.0, uSbianca, tau);",
    "  vec3 cc = mix(mix(col, vec3(1.0), bianco), vec3(1.0), carta);",

    /* GAMMA DINAMICA. Quasi tutti quasi spenti, pochissimi accesi davvero:
       l'elevamento alla quinta schiaccia la distribuzione in fondo. E' la
       differenza fra un cielo e una retinatura — e fra un gioiello e un
       brillantino. Se tutti i punti valgono uguale, il nero fra loro si
       impasta di grigio e la scena diventa polverosa: il lusso sta nel nero
       che resta nero, con pochi punti che bruciano.
       Entra INSIEME al bianco, cosi' nell'istante del distacco il pixel vale
       esattamente quello che valeva nella fotografia e la cucitura col
       rettangolo resta invisibile. */
    "  float taglia = mix(mix(1.0, 0.02 + 3.20 * pow(dado(c, 60 + slot), 5.0), bianco), uCartaLuce, carta);",

    /* IL FUOCO. Un piano a fuoco, e tutto il resto che sfuoca allontanandosi
       da li'. E' la cosa che dice "macro su gioielleria" invece di "sistema
       di particelle": nelle foto dei gioielli meta' dell'inquadratura e'
       impastata di bokeh e solo una lama sottile e' nitida. Il piano di fuoco
       sta a z=0, cioe' dove stava la fotografia: al primo istante il pixel
       che si stacca e' quindi perfettamente nitido, e sfuoca solo mentre
       viaggia. Chi sfuoca si allarga e, a parita' di luce, si spegne: la
       stessa energia spalmata su piu' area. */
    "  float sfuoco = clamp(abs(p.z - uFuoco) / uProfondita, 0.0, 1.0);",
    "  sfuoco *= sfuoco * (1.0 - carta);",

    /* Le stelle di prima grandezza si allargano un po'. Non e' un effetto:
       una sorgente molto piu' forte satura un'area piu' larga, e' quello che
       fa una pellicola e quello che fa un occhio. Serve perche' il cielo
       abbia grandezze diverse SENZA doverle far lampeggiare: le poche
       brillanti fisse portano la ricchezza, il lampo resta un lusso raro.
       A distacco appena avvenuto taglia vale 1 e il bagliore e' zero,
       quindi la cucitura con la fotografia resta esatta. */
    "  float astro = smoothstep(1.1, 2.9, taglia);",
    "  float nucleo  = uPunto * uDpr * clamp(mix(sc, 1.0, carta), 1.0, uCrescita) * (1.0 + uBagliore * astro);",
    "  float largo   = nucleo * (1.0 + sfuoco * uBokeh) * mix(1.0, uGonfia, carta);",
    "  float attenua = 1.0 / (1.0 + sfuoco * uBokeh * 1.4);",

    /* lo scintillio va a orologio, non a scroll: da fermi il cielo resta
       vivo. Le posizioni restano funzione del solo progresso, quindi la
       reversibilita' non si tocca — qui pulsa solo la luce.
       semi distanti fra loro: 1..4 sono le direzioni, 41..44 la profondita',
       81..84 le velocita'. */
    "  float d20 = dado(c, 20 + slot);",
    "  float acceso = step(d20, uQuota);",
    "  float ph = dado(c, 30 + slot) * 6.2831853;",
    "  float rt = uRitmo + uRitmoVar * dado(c, 50 + slot);",
    "  float lampo = acceso * pow(max(0.0, sin(uTime * rt + ph)), uSecchezza) * (1.0 - carta);",

    /* IL TOCCO. Il calore e' una piccola mappa in coordinate schermo che si
       ritimbra dove sta il puntatore e si spegne dietro. Qui dentro le
       stelle non diventano piu' luminose: ne scoccano semplicemente di piu'.

       Il lampo del tocco e' MOLTIPLICATO per il calore, e questo non e' un
       dettaglio: vuol dire che una stella che entra nella scia parte da zero
       e sale. Se invece la si facesse partecipare di colpo — alzando la
       soglia di chi scintilla — una stella sorpresa a meta' del proprio
       lampo si accenderebbe di scatto, e con centomila stelle quel difetto
       diventa un crepitio lungo tutto il bordo della scia. */
    "  float lampoT = 0.0;",
    "  if (uTocco > 0.0) {",
    "    float h = texture(uCalore, scr / uRes).r * uTocco;",
    "    if (h > 0.004) {",
    "      float ammesso = 1.0 - smoothstep(uToccoQuota - 0.10, uToccoQuota, d20);",
    "      float veloce = pow(max(0.0, sin(uTime * rt * uToccoRitmo + ph)), uToccoSecco);",
    "      lampoT = ammesso * h * veloce * (1.0 - carta);",
    "      lampo = max(lampo, lampoT);",
    "    }",
    "  }",

    /* La croce a quattro punte esce solo al culmine del lampo E solo su chi
       e' a fuoco: un riflesso sfocato non ha punte, ha un alone. Questa
       distinzione e' quasi tutto — punte su tutto quanto sembrerebbe un
       filtro, punte solo sui nitidi sembra un obiettivo. */
    "  float croce = lampo * (1.0 - sfuoco);",
    "  float luce  = taglia * (1.0 + uForza * lampo + uToccoForza * lampoT) * uGuadagno * (1.0 + lumeQui * uLumeGuadagno);",

    /* IL FUOCO DEL DIAMANTE. Il cristallo separa la luce: il lampo non e'
       bianco, tira al freddo o all'oro secondo l'angolo. E' esattamente cio'
       per cui uno strass si riconosce a colpo d'occhio da un puntino bianco.
       Ogni particella ha la sua dominante, presa dalla stessa fase del suo
       lampo, e la tinta compare solo mentre brilla. */
    "  vec3 iride = vec3(1.0 + uIride * sin(ph * 1.7),",
    "                    1.0 - uIride * 0.30,",
    "                    1.0 + uIride * cos(ph * 2.3));",
    "  cc = mix(cc, cc * iride, croce);",

    /* Lo sprite si allarga quel tanto che basta a contenere le punte. Il
       nucleo pero' resta della stessa misura sullo schermo, perche' il suo
       raggio viene passato al frammento come FRAZIONE dello sprite: cosi' il
       punto non "cresce" quando scocca il lampo, gli escono solo i raggi. */
    "  float lato = max(largo * 1.6, croce * uFlare * uDpr);",
    "  gl_PointSize = clamp(lato, 1.0, 110.0);",
    /* un diamante che diventa luce ha il bordo morbido: dischi sfumati che
       si sovrappongono fanno un bagliore, dischi netti fanno una grana */
    "  vForma = vec3(0.5 * largo / max(lato, 1.0), mix(sfuoco, 0.8, carta), croce);",

    /* si spegne chi passa troppo vicino alla camera (diventerebbe una
       macchia) e chi e' andato cosi' lontano da non contare piu' */
    /* Chi viene avanti lo si lascia arrivare quasi fino all'obiettivo: sono
       quelli che, allargandosi per prospettiva a partire dal centro dello
       SCHERMO e non della fotografia, vanno a riempire le zone dove la foto
       non c'era mai stata. Spegnerli presto vuol dire un cielo tutto da una
       parte e mezzo schermo nero dall'altra. */
    "  float vicino = 1.0 - smoothstep(uCamera * 0.74, uCamera * 0.97, p.z);",
    "  float via    = 1.0 - smoothstep(uCamera * 2.6, uCamera * 5.2, -p.z);",
    /* La scheggia appena nata si accende in un soffio invece di apparire di
       colpo. Il pixel originale no: quello deve esserci PIENO dal primo
       istante, perche' proprio in quell'istante il rettangolo della foto lo
       ha scartato. Una dissolvenza qui sarebbe un buco nero grande un pixel,
       moltiplicato centomila volte lungo tutto il fronte dell'erosione. */
    "  float apre   = nato > 0.0 ? smoothstep(0.0, 0.02, tau - nato) : 1.0;",
    /* Il lampo del tocco passa attraverso la sfocatura. attenua esiste per
       conservare l'energia: chi e' fuori fuoco si allarga, quindi si spegne.
       Giusto per una luce ferma — ma nel cielo quasi tutte le particelle
       sono ormai lontane dal piano di fuoco, quindi senza questa deroga il
       tocco accenderebbe solo la minoranza nitida e non si vedrebbe niente.
       E non e' un imbroglio: una sorgente abbastanza forte si vede benissimo
       anche sfocata — diventa un disco luminoso invece di un punto, che e'
       poi la cosa piu' bella che possa succedere qui dentro. */
    "  vCol = vec4(cc * luce * mix(attenua, 1.0, lampoT), mix(apre * vicino * via, 1.0, carta));",
    "}"
  ].join("\n");

  var FS_PUNTI = HEAD + [
    "in  vec4 vCol;",
    "in  vec3 vForma;",     /* x = raggio del disco, y = sfuoco, z = lampo */
    "out vec4 oCol;",
    "void main(){",
    "  vec2 d = gl_PointCoord - 0.5;",
    "  float r = length(d);",

    /* Il disco. Il bordo e' netto quando la particella e' a fuoco e diventa
       una sfumatura piena quando e' fuori: e' il bokeh, e nasce qui — la
       stessa particella, la stessa luce, solo il bordo che cambia. */
    "  float bordo = vForma.x * mix(0.30, 1.0, vForma.y) + 0.002;",
    "  float disco = 1.0 - smoothstep(max(vForma.x - bordo, 0.0), vForma.x + bordo * 0.3, r);",

    /* Le quattro punte. Due esponenziali incrociati: uno larghissimo lungo
       l'asse e strettissimo di traverso, l'altro al contrario. Il prodotto
       fa un raggio sottile che si allunga e si spegne, non una riga con un
       bordo. L'alone tiene insieme il centro, se no la croce sembra appesa
       al vuoto. */
    "  float px = exp(-abs(d.x) * 7.0) * exp(-abs(d.y) * 190.0);",
    "  float py = exp(-abs(d.y) * 7.0) * exp(-abs(d.x) * 190.0);",
    "  float alone = exp(-r * 13.0);",
    "  float stella = (px + py + alone * 0.34) * vForma.z;",

    "  float a = clamp(disco + stella, 0.0, 6.0);",
    "  if (a <= 0.002) discard;",

    /* Questa e' luce che si AGGIUNGE, non una vernice che copre. Quindi
       l'opacita' non e' la copertura: e' quanta luce si porta dietro. Con
       l'opacita' presa dalla copertura, una particella quasi spenta scriveva
       il suo nero sopra il fondo e sullo schermo restava un puntino PIU'
       SCURO della notte dietro — mille buchi invece di mille stelle. Legata
       alla luce, una particella debole aggiunge poco e il fondo continua a
       vedersi attraverso. */
    "  vec3 e = vCol.rgb * vCol.a * a;",
    "  oCol = vec4(e, clamp(max(max(e.r, e.g), e.b), 0.0, 1.0));",
    "}"
  ].join("\n");

  /* ——— il velo bianco della fine ————————————————————————————————— */
  var VS_VELO = HEAD + [
    "void main(){",
    "  vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));",
    "  gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FS_VELO = HEAD + [
    "uniform float uA;",
    "out vec4 oCol;",
    "void main(){ oCol = vec4(uA); }"
  ].join("\n");

  /* ——— la carta sotto la luce ——————————————————————————————————
     Tappa i buchi fra i diamanti dove la luce e' gia' tanta. Si disegna
     PRIMA di loro, con lo stesso quadrato a tutto schermo del velo: comincia
     dove i diamanti sopra sono gia' accesi e gonfi, quindi il suo passaggio
     resta sotto di loro. `uAlone` le aggiunge, se serve, un velo di luce che
     scende piano fuori dal pieno. */
  var FS_PIENO = HEAD + [
    "uniform vec2  uRes;",
    "uniform vec4  uLume;",
    "uniform vec2  uPieno;",
    "uniform float uAlone;",
    "out vec4 oCol;",
    LUME,
    "void main(){",
    "  vec2 pos = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);",
    "  float g = lume(pos, uRes * 0.5);",
    "  float a = max(smoothstep(uPieno.x, uPieno.y, g), uAlone * (1.0 - exp(-g * 0.35)));",
    "  oCol = vec4(a);",
    "}"
  ].join("\n");

  /* ——— la lastra incisa ————————————————————————————————————————————
     Un rettangolo al centro dello schermo, e dentro una stampa serigrafica
     goffrata a secco: la carta schiacciata dove batte l'inchiostro.

     IL SEGNO E' AL CONTRARIO DI UN'INCISIONE. Un disegno a tratto si scava,
     e il rilievo giusto e' un solco. Questa e' una stampa a sagome piene, e
     il rilievo giusto e' un'IMPRESSIONE: l'inchiostro non si scava, si ALZA.
     Nel file la mappa e' gia' scritta cosi' (valore alto = piu' in fondo);
     sbagliare questo segno non da' errore, da' un risultato che sembra
     giusto e ha le ombre dalla parte sbagliata.

     LA GOBBA e' una seconda mappa che porta la PENDENZA del volume, gia'
     derivata: sommandola a quella del solco la figura smette di essere un
     contorno e diventa una cosa scolpita. Il RIFLESSO pero' lo tiene solo il
     solco — su una gobba larga un riflesso largo sembra plastica bagnata,
     sulle incisioni sottili sembra gesso. */
  /* L'INCLINAZIONE si fa qui, nella geometria, con la prospettiva vera: il
     rettangolo ruota attorno al suo centro e i quattro angoli escono con la
     loro w, cosi' la texture si stira come su un oggetto e non come su un
     trapezio disegnato. La luce invece resta nel piano della lastra: se le
     normali ruotassero con lei, anche la carta liscia cambierebbe tono e il
     riquadro della lastra comparirebbe sulla pagina. */
  var VS_LASTRA = HEAD + [
    "uniform vec2  uCentro, uMezza, uInclina, uRes;",
    "uniform float uCam;",
    "out vec2 vUv;",
    "void main(){",
    "  vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));",
    "  vUv = q;",
    "  vec2 l = (q * 2.0 - 1.0) * uMezza;",
    "  vec3 p = vec3(l.x * cos(uInclina.x), l.y * cos(uInclina.y),",
    "                -l.x * sin(uInclina.x) - l.y * sin(uInclina.y));",
    "  float w = (uCam - p.z) / uCam;",
    "  vec2 xy = ((uCentro / uRes) * 2.0 - 1.0) * w + p.xy * (2.0 / uRes);",
    "  gl_Position = vec4(xy.x, -xy.y, 0.0, w);",
    "}"
  ].join("\n");

  var FS_LASTRA = HEAD + [
    "in vec2 vUv;",
    "out vec4 oCol;",
    "uniform sampler2D uMappa, uGobba;",
    "uniform vec2  uTexel;",
    "uniform vec3  uLuceM;",   /* il puntatore: x, y sulla lastra, quanto vale */
    "uniform vec4  uAmb;",     /* la luce d'ambiente: direzione, quanto vale */
    "uniform float uContorno;",
    "uniform float uAspetto, uForza, uMassa, uDiffusa, uLucida, uDurezza;",
    "uniform float uAltezza, uRaggio, uPress;",
    "uniform float uSegno, uProf, uPortata, uFondo;",
    /* la quota della superficie, in larghezze di lastra: 0 sulla carta,
       uProf sotto (scavo, uSegno = -1) o sopra (rilievo, +1) dentro le
       sagome */
    "float quota(vec2 uv){ return uSegno * uProf * uPress * (1.0 - texture(uMappa, uv).r); }",
    /* L'OMBRA PORTATA. Senza, la luce disegna solo il contorno delle sagome
       e il loro interno resta bianco come la carta: da lontano si legge un
       disegno a linee, uno scarabocchio. Con l'ombra la parete dello scavo
       dalla parte della luce getta buio sul fondo, e la sagoma si legge
       piena, profonda. Si cammina dal punto verso la luce: se il terreno
       sale sopra il raggio, il punto e' in ombra. Sulla carta liscia intorno
       a uno scavo il raggio non incontra mai niente: niente riquadro. */
    /* i passi partono sfalsati di pixel in pixel: a passi uguali per tutti
       il bordo dell'ombra viene a gradini, e i gradini si leggono come righe
       dentro le lettere */
    "float ombra(vec2 uv, vec2 dir, float salita, float fino){",
    "  float z0 = quota(uv), o = 0.0;",
    "  float sf = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
    "  vec2 passo = vec2(dir.x, dir.y / uAspetto) * (fino / 14.0);",
    "  for (int i = 0; i < 14; i++) {",
    "    float k = float(i) + sf;",
    "    float t = fino * k / 14.0;",
    "    o = max(o, (quota(uv + passo * k) - z0 - t * salita) / (uProf * 0.3 + 1e-5));",
    "  }",
    "  return clamp(o, 0.0, 1.0);",
    "}",
    "float luce(vec3 n, vec3 np, vec2 pos, vec3 l){",
    "  if (l.z <= 0.0) return 0.0;",
    "  vec3 v = vec3(l.xy - pos, uAltezza);",
    "  float dist = length(v.xy);",
    "  vec3 L = normalize(v);",
    "  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));",
    "  float diff = dot(n, L) - L.z;",
    "  float spec = pow(max(dot(np, H), 0.0), uDurezza) - pow(max(H.z, 0.0), uDurezza);",
    "  float t = clamp(1.0 - dist / uRaggio, 0.0, 1.0);",
    "  return (diff * uDiffusa + spec * uLucida) * (t * t * (3.0 - 2.0 * t)) * l.z;",
    "}",
    "void main(){",
    "  vec2 uv = vUv;",
    "  float hs = texture(uMappa, uv - vec2(uTexel.x, 0.0)).r;",
    "  float hd = texture(uMappa, uv + vec2(uTexel.x, 0.0)).r;",
    "  float hg = texture(uMappa, uv + vec2(0.0, uTexel.y)).r;",
    "  float ha = texture(uMappa, uv - vec2(0.0, uTexel.y)).r;",
    /* la pressione scala le pendenze, non l'ombra: e' il rilievo che si
       alza, e un rilievo basso fa ombre corte e chiare, non ombre sbiadite */
    "  vec2 ps = vec2((hd - hs) * uForza, (hg - ha) * uForza) * uPress * uSegno;",
    "  vec2 g  = (texture(uGobba, uv).rg * 2.0 - 1.0) * uPress * uSegno;",
    "  vec2 pos = vec2(uv.x, uv.y * uAspetto);",
    "  vec3 n  = normalize(vec3(ps - g * uMassa, 1.0));",
    "  vec3 np = normalize(vec3(ps, 1.0));",
    /* la luce d'ambiente e' radente e arriva da lontano: uguale su tutta la
       lastra. Misurata rispetto alla carta liscia (- L.z): dove non c'e'
       rilievo vale zero, niente riquadro.
       Da sola pero' fa leggere solo i fianchi girati dall'altra parte: sul
       bianco il lato illuminato non puo' schiarire, e meta' di ogni figura
       sparisce. Il CONTORNO e' il cielo coperto che si aggiunge: scurisce
       ogni fianco in proporzione a quanto e' ripido, da qualunque parte
       guardi — e' quello che rende la lastra leggibile tutta, mentre la luce
       che gira le da' la direzione. Anche lui vale zero sul piano. */
    "  float d = (dot(n, uAmb.xyz) - uAmb.z) * uAmb.w * uDiffusa + (n.z - 1.0) * uContorno",
    "          + luce(n, np, pos, uLuceM);",
    /* le due ombre portate: quella della luce d'ambiente, e quella del
       puntatore, che cade dalla parte opposta a lui e si allunga quanto
       piu' il punto e' lontano — e' la luce radente che scava */
    "  float lxy = max(length(uAmb.xy), 1e-3);",
    "  float salA = uAmb.z / lxy;",
    "  d -= ombra(uv, uAmb.xy / lxy, salA, uProf * uPress / salA) * uAmb.w * uPortata;",
    "  if (uLuceM.z > 0.0) {",
    "    vec2 v = uLuceM.xy - pos;",
    "    float dist = max(length(v), 1e-3);",
    "    float salM = uAltezza / dist;",
    "    float t = clamp(1.0 - dist / uRaggio, 0.0, 1.0);",
    "    d -= ombra(uv, v / dist, salM, min(dist, uProf * uPress / salM)) * uPortata * uLuceM.z * t * t * (3.0 - 2.0 * t);",
    "  }",
    /* il fondo dello scavo prende meno cielo della carta: un filo piu'
       scuro, ed e' quello che fa leggere la sagoma come una massa */
    "  d -= (1.0 - texture(uMappa, uv).r) * uPress * uFondo * max(-uSegno, 0.0);",
    /* sul bianco pieno la luce puo' solo fare ombra: sopra non c'e' niente */
    "  float a = clamp(-d, 0.0, 1.0);",
    "  oCol = vec4(0.0, 0.0, 0.0, a);",
    "}"
  ].join("\n");

  /* ====================================================================== */

  function compila(gl, tipo, src) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("cape-dust: shader non compila\n" + log);
    }
    return s;
  }

  function programma(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compila(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compila(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("cape-dust: programma non si lega\n" + gl.getProgramInfoLog(p));
    }
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var nome = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, "");
      u[nome] = gl.getUniformLocation(p, nome);
    }
    return { id: p, u: u };
  }

  /* L'escursione vera di luminosita' della fotografia, presa sui percentili e
     non sul minimo e massimo assoluti: un solo pixel bruciato o un solo nero
     pieno sposterebbero la scala e l'ordine di distacco si appiattirebbe. */
  function gamma(img) {
    var L = 96;
    var c = document.createElement("canvas");
    var w = c.width = L, h = c.height = Math.max(1, Math.round(L * img.naturalHeight / img.naturalWidth));
    var x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h).data;   /* qui si scopre se la foto e' leggibile */
    var v = new Float32Array(w * h);
    for (var i = 0, j = 0; i < d.length; i += 4, j++) {
      v[j] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    }
    v.sort();
    var lo = v[Math.floor(v.length * 0.02)];
    var hi = v[Math.floor(v.length * 0.98)];
    if (hi - lo < 0.05) { lo = 0; hi = 1; }
    return [lo, hi];
  }

  /* object-fit: cover ritaglia. La texture e' l'immagine intera, quindi la
     porzione che si vede davvero va ricalcolata qui, o la scomposizione
     partirebbe da un'immagine diversa da quella sullo schermo. */
  function ritaglio(img, w, h) {
    var fit = "fill";
    try { fit = global.getComputedStyle(img).objectFit || "fill"; } catch (e) {}
    var ar = w / h, ir = img.naturalWidth / img.naturalHeight;
    if (fit !== "cover" || !isFinite(ar) || !isFinite(ir) || ar <= 0 || ir <= 0) return [1, 1, 0, 0];
    if (ir > ar) { var s = ar / ir; return [s, 1, (1 - s) / 2, 0]; }
    var t = ir / ar; return [1, t, 0, (1 - t) / 2];
  }

  /* ====================================================================== */

  function create(opts) {
    var O = opts || {};
    var P = {};
    var k;
    for (k in I.params) if (I.params.hasOwnProperty(k)) P[k] = I.params[k];
    if (O.params) for (k in O.params) if (O.params.hasOwnProperty(k)) P[k] = O.params[k];

    var pin   = document.querySelector(O.pin   || I.pin);
    var stick = document.querySelector(O.stick || I.stick);
    if (!pin || !stick) return null;

    var img      = document.querySelector(O.foto || I.foto);
    var rig      = document.querySelector(I.rig);
    var rigTrack = document.querySelector(I.rigTrack);
    var rigWrap  = document.querySelector(I.rigWrap);
    var cursore  = document.querySelector(I.cursore);
    var barra    = document.querySelector(I.barra);

    var ridotto = false;
    try { ridotto = global.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    var pilotaCursore = false;
    try { pilotaCursore = global.matchMedia("(min-width:992px) and (hover:hover)").matches; } catch (e) {}

    var canvas = document.createElement("canvas");
    canvas.className = "cape-dust-sky";
    canvas.setAttribute("aria-hidden", "true");
    stick.appendChild(canvas);

    var gl = null, prog = null, punti = null, velo = null, tex = null, vao = null;
    var celle = { x: 0, y: 0 }, nPunti = 0, gam = [0, 1], cover = [1, 1, 0, 0];
    var rect = null, dpr = 1, res = [0, 0], bloccato = false;
    var pronto = false, ripiego = false;
    var vivo = false, girando = false, spento = false;
    var t0 = (global.performance && performance.now ? performance.now() : Date.now());
    var progresso = 0, grezzo = 0, statoVelo = -1, statoScuro = null, statoFermo = false, statoFoto = false;
    var fermata = 1, veloDa = I.veloDa, veloA = I.veloA;
    var statoBarra = -1;

    /* ——— il calore del puntatore ————————————————————————————————
       Dove e' passato il mouse, di recente. Una mappa minuscola in coordinate
       schermo: 64x36 celle, che ogni fotogramma si spengono un po' e vengono
       ritimbrate sotto il puntatore. Il vertex shader la legge alla posizione
       della particella.

       Minuscola apposta, e tenuta sulla CPU: una scia si legge morbida, non
       nitida, quindi la risoluzione non serve — ci pensa il filtro lineare
       della texture a interpolarla. Duemilatrecento moltiplicazioni e due
       chilobyte caricati per fotogramma costano meno di qualunque alternativa
       fatta con framebuffer da scambiare, e non c'e' niente da gestire. */
    var CAL_X = 64, CAL_Y = 36;
    var calore = null, calByte = null, calTex = null, calMouse = null, calT = 0;

    /* La spinta sta in una mappa sorella, due canali (lo spostamento in x e
       in y) e il doppio piu' fitta: una scia puo' essere morbida, uno
       spostamento no — a 64 celle su uno schermo largo ogni cella e' trenta
       pixel, piu' della spinta intera, e il filtro lineare la spalmerebbe
       fino a farla sparire. Otto bit bastano: 1/127 di venti pixel. Lo zero
       e' 127, non 128: 127.5 non esiste in otto bit, e arrotondato lascerebbe
       tutto il cielo spostato di un'inezia anche senza mouse. */
    var SP_X = 128, SP_Y = 72;
    var spinta = null, spByte = null, spTex = null, spViva = false;

    var lastra = null, lastraTex = null, gobbaTex = null, pieno = null;
    /* la luce d'ambiente parte da in alto a sinistra: e' da li' che l'occhio
       si aspetta la luce, e un rilievo illuminato da sotto si legge al
       contrario — lo scavo sembrerebbe un rilievo */
    var lastraPronta = false, lastraW = 0, lastraH = 0, lastraAng = Math.PI * 1.25, lastraT = 0;
    var incX = 0, incY = 0, statoCursore = null;

    /* La curva del binario — il progresso in funzione della posizione — e'
       l'integrale di una velocita' che frena e riparte. Non ha una formula
       chiusa comoda, quindi si tabula una volta e si legge interpolando:
       cinquecento punti su un binario di nove schermate sono un punto ogni
       due pixel di scroll. */
    var CURVA_N = 512, tabella = null;

    /* ——— avvio ————————————————————————————————————————————————— */

    function apriGL() {
      if (ridotto || !img) return false;
      try {
        gl = canvas.getContext("webgl2", {
          alpha: true, antialias: false, depth: false, stencil: false,
          premultipliedAlpha: true, powerPreference: "high-performance"
        });
      } catch (e) { gl = null; }
      if (!gl) return false;
      try {
        prog  = programma(gl, VS_FOTO,  FS_FOTO);
        punti = programma(gl, VS_PUNTI, FS_PUNTI);
        velo  = programma(gl, VS_VELO,  FS_VELO);
        pieno = programma(gl, VS_VELO,  FS_PIENO);
        lastra = programma(gl, VS_LASTRA, FS_LASTRA);
      } catch (e) { return false; }
      vao = gl.createVertexArray();          /* vuoto: i punti nascono da gl_VertexID */
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      return true;
    }

    function carica(cb) {
      /* Si ricarica la stessa immagine con il permesso di lettura esplicito.
         Senza crossOrigin il canvas si sporca e leggerne i pixel lancia: e'
         la ragione numero uno per cui un effetto del genere non parte, e non
         si vede dalla console di chi l'ha scritto ma solo in pagina. */
      function vai() {
        var src = img.currentSrc || img.src;
        if (!src) return cb(null);
        var n = new Image();
        n.crossOrigin = "anonymous";
        n.decoding = "sync";
        n.onload = function () { cb(n); };
        n.onerror = function () { cb(null); };
        n.src = src;
      }
      /* currentSrc resta vuoto finche' il browser non ha scelto quale
         variante del srcset scaricare. Chiederglielo prima vuol dire leggere
         l'immagine sbagliata, o nessuna, e finire nel ripiego per un motivo
         che non c'entra niente con la scheda grafica. */
      if (img.complete && (img.currentSrc || img.src)) vai();
      else {
        img.addEventListener("load", vai, { once: true });
        img.addEventListener("error", function () { cb(null); }, { once: true });
      }
    }

    /* Le due mappe della lastra arrivano dalla repo cape-rilievo. Se non
       arrivano non succede niente di male: la lastra semplicemente non si
       disegna, e la sezione resta quella di prima. */
    function apriLastra() {
      function prendi(nome, unita, poi) {
        var im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = function () {
          var t = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0 + unita);
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.activeTexture(gl.TEXTURE0);
          poi(t, im.naturalWidth, im.naturalHeight);
        };
        im.src = I.lastraBase + nome;
      }
      prendi(I.lastraSolco, 2, function (t, w, h) {
        lastraTex = t; lastraW = w; lastraH = h;
        if (gobbaTex) lastraPronta = true;
      });
      prendi(I.lastraGobba, 3, function (t) {
        gobbaTex = t;
        if (lastraTex) lastraPronta = true;
      });
    }

    function apriCalore() {
      /* Solo dove un puntatore esiste davvero. Su un telefono non c'e' niente
         da seguire, e il costo — per quanto piccolo — sarebbe speso per una
         cosa che nessuno puo' vedere. */
      if (!pilotaCursore) return;
      calore  = new Float32Array(CAL_X * CAL_Y);
      calByte = new Uint8Array(CAL_X * CAL_Y);
      spinta  = new Float32Array(SP_X * SP_Y * 2);
      spByte  = new Uint8Array(SP_X * SP_Y * 2);
      global.addEventListener("mousemove", function (e) {
        calMouse = [e.clientX, e.clientY];
      }, { passive: true });
      /* uscito dalla finestra, la scia si spegne da sola invece di restare
         accesa per sempre nell'ultimo punto visto */
      document.addEventListener("mouseleave", function () { calMouse = null; }, { passive: true });
    }

    function aggiornaCalore(ora) {
      if (!calore || !gl || !calTex) return;
      var dt = calT ? Math.min(0.1, ora - calT) : 0.016;
      calT = ora;

      /* spegnimento e accensione per tempo, non per fotogramma: la scia dura
         gli stessi secondi a 30 come a 120 al secondo */
      var giu = Math.exp(-dt / P.toccoCoda);
      var su  = 1 - Math.exp(-dt / P.toccoSalita);
      var i, j, k;
      for (i = 0; i < calore.length; i++) calore[i] *= giu;

      if (calMouse) {
        var vw = global.innerWidth, vh = global.innerHeight;
        var asp = vw / vh;
        var mx = calMouse[0] / vw, my = calMouse[1] / vh;
        var R = P.toccoRaggio;
        /* solo le celle dentro l'impronta: il resto non si tocca */
        var i0 = Math.max(0, Math.floor((mx - R / asp) * CAL_X));
        var i1 = Math.min(CAL_X - 1, Math.ceil((mx + R / asp) * CAL_X));
        var j0 = Math.max(0, Math.floor((my - R) * CAL_Y));
        var j1 = Math.min(CAL_Y - 1, Math.ceil((my + R) * CAL_Y));
        for (j = j0; j <= j1; j++) {
          var ny = (j + 0.5) / CAL_Y - my;
          for (i = i0; i <= i1; i++) {
            /* la x si corregge per il formato dello schermo, se no
               l'impronta e' un'ellisse schiacciata invece di un cerchio */
            var nx = ((i + 0.5) / CAL_X - mx) * asp;
            var dd = Math.sqrt(nx * nx + ny * ny) / R;
            if (dd >= 1) continue;
            var f = (1 - dd) * (1 - dd) * su;
            k = j * CAL_X + i;
            calore[k] += (1 - calore[k]) * f;
          }
        }
      }

      for (i = 0; i < calore.length; i++) {
        var v = calore[i];
        calByte[i] = v <= 0 ? 0 : (v >= 1 ? 255 : (v * 255) | 0);
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, calTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CAL_X, CAL_Y, gl.RED, gl.UNSIGNED_BYTE, calByte);

      /* ——— la spinta ———
         Si spegne con lo stesso tempo della scia: i diamanti tornano al loro
         posto mentre la luce se ne va, non prima e non dopo. Sotto il
         puntatore ogni cella tende allo spostamento "via da lui", tanto piu'
         forte quanto piu' e' vicina. Pesato anche quello con la distanza: al
         bordo dell'impronta non si cancella la spinta lasciata da un
         passaggio di un attimo prima, ci si somma. */
      if (!spinta || !spTex) return;
      for (i = 0; i < spinta.length; i++) spinta[i] *= giu;
      if (calMouse) {
        var vw2 = global.innerWidth, vh2 = global.innerHeight;
        var asp2 = vw2 / vh2;
        var px = calMouse[0] / vw2, py = calMouse[1] / vh2;
        var Rs = P.spintaRaggio;
        var a0 = Math.max(0, Math.floor((px - Rs / asp2) * SP_X));
        var a1 = Math.min(SP_X - 1, Math.ceil((px + Rs / asp2) * SP_X));
        var b0 = Math.max(0, Math.floor((py - Rs) * SP_Y));
        var b1 = Math.min(SP_Y - 1, Math.ceil((py + Rs) * SP_Y));
        for (j = b0; j <= b1; j++) {
          var sy = (j + 0.5) / SP_Y - py;
          for (i = a0; i <= a1; i++) {
            var sx = ((i + 0.5) / SP_X - px) * asp2;
            var lung = Math.sqrt(sx * sx + sy * sy);
            var q = lung / Rs;
            if (q >= 1) continue;
            var forza = (1 - q) * (1 - q) / Math.max(lung, 1e-4);
            var peso = su * (1 - q);
            k = (j * SP_X + i) * 2;
            spinta[k]     += (sx * forza - spinta[k])     * peso;
            spinta[k + 1] += (sy * forza - spinta[k + 1]) * peso;
          }
        }
      }
      /* ferma del tutto, lo shader non la legge nemmeno: il cielo resta
         identico al pixel a quello che era prima che la spinta esistesse */
      spViva = false;
      for (i = 0; i < spinta.length; i++) {
        if (spinta[i] > 0.004 || spinta[i] < -0.004) spViva = true;
        var w = spinta[i] * 127 + 127;
        spByte[i] = w <= 0 ? 0 : (w >= 254 ? 254 : Math.round(w));
      }
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, spTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SP_X, SP_Y, gl.RG, gl.UNSIGNED_BYTE, spByte);
      gl.activeTexture(gl.TEXTURE0);
    }

    function misura() {
      if (!img) return false;
      var r = img.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      var vw = global.innerWidth, vh = global.innerHeight;
      res = [Math.round(vw * dpr), Math.round(vh * dpr)];
      if (canvas.width !== res[0] || canvas.height !== res[1]) {
        canvas.width = res[0]; canvas.height = res[1];
      }
      rect = [r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr];

      var tetto = (vw < 992 ? P.maxCelleMob : P.maxCelle);
      var cx = Math.max(8, Math.round(r.width / P.cella));
      var cy = Math.max(8, Math.round(r.height / P.cella));
      var q = Math.sqrt(tetto / (cx * cy));
      if (q < 1) { cx = Math.max(8, Math.round(cx * q)); cy = Math.max(8, Math.round(cy * q)); }
      celle = { x: cx, y: cy };
      nPunti = cx * cy * 4;
      finestraVelo();
      return true;
    }

    /* A che progresso il rig esce dal viewport — cioe' l'istante in cui, in
       pagina, il riarmo della tendina spegne di scatto il testo della slide.
       Il velo deve aver finito PRIMA, o quello scatto si vede.

       Si misura invece di scriverlo a mano perche' dipende da due numeri che
       stanno altrove e che un domani qualcuno cambiera' senza pensare a
       questo file: l'altezza di .cape-dust-pin e il suo margin-top negativo.
       Misurato, resta giusto da solo. */
    function fermataTendina() {
      if (!rigWrap) return 1;
      var y = global.scrollY || global.pageYOffset;
      var corsa = pin.offsetHeight - global.innerHeight;
      if (corsa <= 0) return 1;
      var fondoWrap = rigWrap.getBoundingClientRect().bottom + y;
      var cimaPin   = pin.getBoundingClientRect().top + y;
      return clamp((fondoWrap - cimaPin) / corsa, 0.05, 1);
    }

    function finestraVelo() {
      fermata = fermataTendina();
      var limite = fermata - 0.02;
      if (I.veloA > limite) {
        /* si accorcia in proporzione, cosi' la forma della dissolvenza —
           quanto parte tardi rispetto a quanto dura — resta la stessa */
        var k = limite / I.veloA;
        veloA  = limite;
        veloDa = I.veloDa * k;
      } else {
        veloA  = I.veloA;
        veloDa = I.veloDa;
      }
      if (veloDa < 0) veloDa = 0;
      if (veloA <= veloDa) veloA = veloDa + 0.01;
    }

    function prepara() {
      if (pronto || ripiego || spento) return;
      if (!apriGL()) { ripiego = true; return; }
      carica(function (n) {
        if (spento) return;
        if (!n) { ripiego = true; return; }
        try {
          gam = gamma(n);
          cover = ritaglio(img, img.getBoundingClientRect().width || 1, img.getBoundingClientRect().height || 1);
          tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, n);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

          /* La mappa del calore esiste sempre, anche dove il tocco non c'e':
             un sampler dichiarato e mai legato e' una fonte di avvisi e, su
             qualche driver, di guai veri. Due chilobyte per non pensarci. */
          calTex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, calTex);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, CAL_X, CAL_Y, 0, gl.RED, gl.UNSIGNED_BYTE,
                        new Uint8Array(CAL_X * CAL_Y));
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

          /* la spinta, per la stessa ragione: 127 vuol dire "fermo" */
          var neutra = new Uint8Array(SP_X * SP_Y * 2);
          neutra.fill(127);
          spTex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, spTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, SP_X, SP_Y, 0, gl.RG, gl.UNSIGNED_BYTE, neutra);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.activeTexture(gl.TEXTURE0);
          apriCalore();
          apriLastra();
        } catch (e) {
          /* foto non leggibile: quasi sempre CORS. Non e' un motivo per
             lasciare un buco nella pagina — si passa al ripiego. */
          ripiego = true;
          return;
        }
        if (!misura()) { ripiego = true; return; }
        pronto = true;
        disegna();
      });
    }

    /* ——— il disegno ————————————————————————————————————————————— */

    /* Secondi da quando il modulo e' partito. Non Date.now() % qualcosa: un
       modulo che gira azzera la fase di TUTTI gli scintillii insieme, e quel
       singolo fotogramma si vede come un battito di ciglia di tutto il cielo. */
    function orologio() {
      var n = (global.performance && performance.now ? performance.now() : Date.now());
      return (n - t0) / 1000;
    }

    /* La lastra a schermo, margine compreso: il disegno e' alto lastraAlta,
       ma mai piu' largo di lastraLarga — su un telefono in verticale e' la
       larghezza a comandare. */
    function misuraLastra() {
      var f = lastraW && lastraH ? lastraW / lastraH : I.lastraFormato;
      var fx = I.lastraDisegno[0], fy = I.lastraDisegno[1];
      var ah = Math.min(P.lastraAlta * res[1] / fy, P.lastraLarga * res[0] / (fx * f));
      return [ah * f, ah];
    }

    /* La luce in questo istante: i semiassi in pixel del dispositivo e
       l'intensita' al centro. I semiassi non cambiano: cambia l'intensita'.
       Quella massima si calcola perche' la carta sia piena fin sugli angoli
       del disegno, e alla fine fin sugli angoli dello schermo: dipende dal
       formato dello schermo, e quindi si misura. Fra le due si passa in
       scala logaritmica, perche' e' cosi' che cresce il raggio di un
       bagliore: in fretta all'inizio, poi sempre piu' piano. */
    function statoLuce() {
      var la = misuraLastra();
      var dx = la[0] * I.lastraDisegno[0] * 0.5, dy = la[1] * I.lastraDisegno[1] * 0.5;
      var rx = dx * P.luceX, ry = dy * P.luceY, f = P.luceForma;
      var dLastra = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      var dSchermo = Math.pow(res[0] * 0.5 / rx, 2) + Math.pow(res[1] * 0.5 / ry, 2);
      var aLastra  = P.pienoA * Math.exp(Math.pow(dLastra, f * 0.5)) * 1.3;
      var aSchermo = P.pienoA * Math.exp(Math.pow(dSchermo, f * 0.5)) * 1.3;
      var su = Math.pow(smoothstep(P.luceDa, P.luceA, grezzo), P.luceCurva);
      var fine = smoothstep(P.tuttoDa, P.tuttoA, grezzo);
      var a = su * Math.exp(Math.log(aLastra) + (Math.log(aSchermo) - Math.log(aLastra)) * fine);
      return { rx: rx, ry: ry, a: a };
    }

    function passaLuce(u, b) {
      gl.uniform4f(u.uLume, b.rx, b.ry, b.a, P.luceForma);
      gl.uniform2f(u.uPieno, P.pienoDa, P.pienoA);
    }

    function disegna() {
      if (!pronto || !rect) return;
      var p = progresso;

      /* Sopra la sezione non c'e' niente da disegnare: la fotografia vera e'
         ancora accesa e ci penserebbe il rettangolo a raddoppiarla. */
      if (p <= 0.0005) {
        gl.viewport(0, 0, res[0], res[1]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }

      gl.viewport(0, 0, res[0], res[1]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, calTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);

      /* 1. quello che della fotografia e' ancora attaccato */
      if (p < P.corsa + 0.001) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(prog.id);
        gl.uniform4f(prog.u.uRect, rect[0], rect[1], rect[2], rect[3]);
        gl.uniform2f(prog.u.uRes, res[0], res[1]);
        gl.uniform1i(prog.u.uTex, 0);
        gl.uniform2f(prog.u.uGrid, celle.x, celle.y);
        gl.uniform4f(prog.u.uCover, cover[0], cover[1], cover[2], cover[3]);
        gl.uniform2f(prog.u.uGamma, gam[0], gam[1]);
        gl.uniform1f(prog.u.uProg, p);
        gl.uniform1f(prog.u.uCorsa, P.corsa);
        gl.uniform1f(prog.u.uCaso, P.caso);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      /* 2. la carta sotto la luce. Prima dei diamanti: sta sotto di loro,
            e dove e' piena loro non si disegnano nemmeno. */
      var b = statoLuce();
      if (b.a > 0.05) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(pieno.id);
        gl.uniform2f(pieno.u.uRes, res[0], res[1]);
        gl.uniform1f(pieno.u.uAlone, P.luceAlone);
        passaLuce(pieno.u, b);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      /* 3. quello che e' in volo. Somma, non copre: e' cosi' che mille
            pixel deboli fanno una luce che alla fine e' bianca. */
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(punti.id);
      var u = punti.u;
      gl.uniform1i(u.uTex, 0);
      gl.uniform2f(u.uGrid, celle.x, celle.y);
      gl.uniform2f(u.uRes, res[0], res[1]);
      gl.uniform2f(u.uGamma, gam[0], gam[1]);
      gl.uniform2f(u.uDivide, P.divide1, P.divide2);
      gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform4f(u.uCover, cover[0], cover[1], cover[2], cover[3]);
      gl.uniform1f(u.uProg, p);
      gl.uniform1f(u.uTime, orologio());
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uCorsa, P.corsa);
      gl.uniform1f(u.uCaso, P.caso);
      gl.uniform1f(u.uVel, P.velocita * dpr);
      gl.uniform1f(u.uRadiale, P.radiale);
      gl.uniform1f(u.uFondo, P.fondo);
      gl.uniform1f(u.uCamera, P.camera * dpr);
      gl.uniform1f(u.uDeriva, P.deriva);
      gl.uniform1f(u.uSbianca, P.sbianca);
      gl.uniform1f(u.uPunto, P.punto);
      gl.uniform1f(u.uCrescita, P.crescita);
      gl.uniform1f(u.uQuota, P.quota);
      gl.uniform1f(u.uForza, P.forza);
      gl.uniform1f(u.uSecchezza, P.secchezza);
      gl.uniform1f(u.uFuoco, P.fuoco * dpr);
      gl.uniform1f(u.uProfondita, P.profondita * dpr);
      gl.uniform1f(u.uBokeh, P.bokeh);
      gl.uniform1f(u.uFlare, P.flare);
      gl.uniform1f(u.uIride, P.iride);
      gl.uniform1f(u.uRitmo, P.ritmo);
      gl.uniform1f(u.uRitmoVar, P.ritmoVar);
      gl.uniform1f(u.uBagliore, P.bagliore);

      /* Il tocco vive solo nel cielo: entra quando la foto si e' sgretolata,
         esce prima che il bianco copra tutto. Fuori da quella finestra il
         fattore e' zero e lo shader salta il blocco per intero. La spinta
         e' dentro la stessa finestra: sono la stessa mano. */
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, spTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(u.uCalore, 1);
      gl.uniform1i(u.uSpinta, 4);
      gl.uniform1f(u.uToccoQuota, P.toccoQuota);
      gl.uniform1f(u.uToccoRitmo, P.toccoRitmo);
      gl.uniform1f(u.uToccoForza, P.toccoForza);
      gl.uniform1f(u.uToccoSecco, P.toccoSecco);
      gl.uniform1f(u.uSpintaPx, spViva ? P.spinta * dpr : 0);
      gl.uniform1f(u.uTocco, calore
        ? smoothstep(P.toccoDa, P.toccoDa + 0.06, p) * (1 - smoothstep(P.toccoA - 0.10, P.toccoA, p))
        : 0);

      /* LA LUCE va a `grezzo`, il binario intero, e non a `p`: e' della
         seconda meta' della sezione, non dello spettacolo della polvere. */
      if (b.a > 0.001) passaLuce(u, b);
      else gl.uniform4f(u.uLume, 1, 1, 0, 2);
      gl.uniform1f(u.uLumeCarta, P.luceCarta);
      gl.uniform1f(u.uLumeGuadagno, P.luceGuadagno);
      gl.uniform1f(u.uGonfia, P.luceGonfia);
      gl.uniform1f(u.uCartaLuce, P.luceColmo);

      gl.uniform1f(u.uGuadagno, 1 + P.guadagno * smoothstep(P.guadagnoDa, P.guadagnoA, p));
      gl.uniform2f(u.uDeriva2,
        (res[0] * 0.5 - (rect[0] + rect[2] * 0.5)) * P.centra,
        (res[1] * 0.5 - (rect[1] + rect[3] * 0.5)) * P.centra);
      gl.drawArrays(gl.POINTS, 0, nPunti);

      /* 4. la lastra incisa, dentro il bianco che i punti hanno appena fatto.
            Va per forza DOPO di loro: e' un'ombra, e un'ombra ha bisogno di
            qualcosa sotto su cui posarsi. */
      var ora = orologio();
      var dt = lastraT ? Math.min(0.1, ora - lastraT) : 0.016;
      lastraT = ora;
      lastraAng += dt * 2 * Math.PI / P.lastraGiro;
      var press = smoothstep(P.lastraDa, P.lastraA, grezzo) * (1 - smoothstep(P.lastraFino, P.lastraVia, grezzo));
      var la = misuraLastra(), aw = la[0], ah = la[1];
      var ax = (res[0] - aw) * 0.5, ay = (res[1] - ah) * 0.5;

      /* dove sta il puntatore rispetto alla lastra: per la sua luce, in
         coordinate della lastra, e per l'inclinazione, da -1 a 1 attorno al
         centro. Si misura sul rettangolo DRITTO: misurato su quello
         inclinato, la luce inseguirebbe se stessa. */
      var mouse = 0, mx = 0.5, my = ah / aw * 0.5, miraX = 0, miraY = 0;
      if (calMouse && press > 0.001) {
        mx = (calMouse[0] * dpr - ax) / aw;
        my = (calMouse[1] * dpr - ay) / aw;
        var asp = ah / aw;
        if (mx > -0.35 && mx < 1.35 && my > -0.35 * asp && my < 1.35 * asp) mouse = 1;
        miraX = clamp((calMouse[0] * dpr - res[0] * 0.5) / (aw * 0.5), -1, 1);
        miraY = clamp((calMouse[1] * dpr - res[1] * 0.5) / (ah * 0.5), -1, 1);
      }
      var molla = 1 - Math.exp(-dt / P.lastraMolla);
      incX += (miraX - incX) * molla;
      incY += (miraY - incY) * molla;

      if (lastraPronta && press > 0.001) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(lastra.id);
        var v = lastra.u;
        var gradi = P.lastraInclina * Math.PI / 180;
        gl.uniform2f(v.uCentro, res[0] * 0.5, res[1] * 0.5);
        gl.uniform2f(v.uMezza, aw * 0.5, ah * 0.5);
        gl.uniform2f(v.uInclina, incX * gradi, incY * gradi);
        gl.uniform1f(v.uCam, 1500 * dpr);
        gl.uniform2f(v.uRes, res[0], res[1]);
        gl.uniform1i(v.uMappa, 2);
        gl.uniform1i(v.uGobba, 3);
        /* il passo della derivata segue la misura A SCHERMO: se la lastra e'
           piu' piccola della mappa, due texel cadono nello stesso pixel e i
           tratti fini sfarfallano */
        var kk = Math.max(1, lastraW / Math.max(1, aw));
        gl.uniform2f(v.uTexel, kk / lastraW, kk / lastraH);
        gl.uniform1f(v.uAspetto, ah / aw);
        gl.uniform1f(v.uForza, P.lastraForza);
        gl.uniform1f(v.uMassa, P.lastraMassa);
        gl.uniform1f(v.uDiffusa, P.lastraOmbra);
        gl.uniform1f(v.uLucida, P.lastraLucida);
        gl.uniform1f(v.uDurezza, 28);
        gl.uniform1f(v.uAltezza, 0.30);
        gl.uniform1f(v.uRaggio, 0.85);
        gl.uniform1f(v.uPress, press);
        gl.uniform1f(v.uSegno, P.lastraSegno);
        gl.uniform1f(v.uProf, P.lastraProfondita);
        gl.uniform1f(v.uPortata, P.lastraPortata);
        gl.uniform1f(v.uFondo, P.lastraFondo);

        /* la luce d'ambiente: radente, gira piano. Il puntatore aggiunge la
           sua, vicina, dove si trova. */
        var alta = P.lastraRadente, bassa = Math.sqrt(1 - alta * alta);
        gl.uniform4f(v.uAmb, Math.cos(lastraAng) * bassa, Math.sin(lastraAng) * bassa, alta, P.lastraAmbiente);
        gl.uniform1f(v.uContorno, P.lastraContorno);
        gl.uniform3f(v.uLuceM, mx, my, mouse * P.lastraMouse);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      /* 5. il velo che chiude sul bianco pieno, quando e' gia' tutto bianco */
      var a = P.biancoFinale === false ? 0 : smoothstep(P.veloDa, P.veloA, grezzo);
      if (a > 0.001) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(velo.id);
        gl.uniform1f(velo.u.uA, a);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(null);
    }

    /* Senza simulazione: la foto sfuma e la sezione sbianca, sempre a scroll.
       Il racconto della pagina — nero, poi bianco, poi lo studio — resta. */
    function disegnaRipiego() {
      var bordo = (progresso * 118 - 9).toFixed(2);
      canvas.style.background =
        "linear-gradient(to top, #ffffff " + bordo + "%, rgba(255,255,255,0) " +
        (parseFloat(bordo) + 9).toFixed(2) + "%)";
    }

    /* ——— la regia attorno alla sezione ————————————————————————— */

    /* La barra si ritira in su, e la comanda LO STESSO NUMERO che spegne le
       scritte della slide. Non e' un dettaglio di gusto: prima la barra
       andava a orologio — mezzo secondo, sempre quello — mentre il testo
       andava a scroll. Scorrendo piano la barra se n'era andata da un pezzo
       e il testo era ancora li'; scorrendo veloce il contrario. Due cose che
       escono di scena insieme devono dipendere dalla stessa grandezza, e qui
       quella grandezza e' il progresso.

       Cosi' e' anche una funzione pura del progresso come tutto il resto:
       torna indietro esatta, non ha uno stato suo da sbagliare, e non serve
       nessuna transition nel CSS di pagina — che era la cosa da evitare. */
    function muoviBarra(via) {
      if (!barra || Math.abs(via - statoBarra) < 0.004) return;
      statoBarra = via;
      if (via <= 0.001) {
        /* a riposo non lasciamo niente addosso: la barra torna interamente
           al suo foglio di stile, comprese eventuali trasformazioni sue */
        barra.style.removeProperty("transform");
        barra.style.removeProperty("opacity");
        barra.style.removeProperty("pointer-events");
        return;
      }
      barra.style.transform = "translateY(" + (-I.barraSalita * via).toFixed(2) + "%)";
      barra.style.opacity = (1 - via).toFixed(3);
      /* I click si spengono solo quando se n'e' andata davvero. Spegnerli al
         primo fotogramma lascerebbe una barra che si vede benissimo e non
         risponde: chi stava andando col mouse sul menu proprio mentre parte
         la sezione clicca a vuoto. */
      barra.style.pointerEvents = via > 0.85 ? "none" : "";
    }

    /* Il binario e' piu' lungo dello spettacolo, e in mezzo lo spettacolo
       RALLENTA: e' li' che si incide la lastra. Fino al rallentamento la
       velocita' e' `passo`, quella di sempre; poi scende a `lento`, ci resta,
       e risale a quella che serve per arrivare a 1 in fondo al binario. La
       curva e' l'integrale di questa velocita', quindi non ha spigoli: non si
       sente la frenata, si sente solo il cielo che si allarga piu' piano. */
    function tabula() {
      var n = CURVA_N, da = P.lentoDa, a = P.lentoA, r = Math.max(P.lentoRampa, 0.001);
      var A = new Float64Array(n + 1), B = new Float64Array(n + 1), i;
      for (i = 0; i <= n; i++) {
        var g = i / n, giu = smoothstep(da, da + r, g), su = smoothstep(a - r, a, g);
        A[i] = (1 - (1 - P.lento) * giu) * (1 - su);   /* in unita' di passo */
        B[i] = su;                                       /* in unita' della velocita' finale */
      }
      var iA = 0, iB = 0;
      for (i = 1; i <= n; i++) { iA += (A[i] + A[i - 1]) / (2 * n); iB += (B[i] + B[i - 1]) / (2 * n); }
      var fine = iB > 0 ? Math.max(0.05, (1 - P.passo * iA) / iB) : 0;
      tabella = new Float32Array(n + 1);
      var somma = 0;
      for (i = 1; i <= n; i++) {
        somma += (P.passo * (A[i] + A[i - 1]) + fine * (B[i] + B[i - 1])) / (2 * n);
        tabella[i] = somma;
      }
      for (i = 1; i <= n; i++) tabella[i] /= somma;
    }

    function curva(g) {
      if (!P.coda) return g;
      if (!tabella) tabula();
      var x = clamp(g, 0, 1) * CURVA_N, i = Math.min(CURVA_N - 1, Math.floor(x));
      return tabella[i] + (tabella[i + 1] - tabella[i]) * (x - i);
    }

    /* C'e' carta piena sotto il puntatore? La stessa luce dello shader,
       letta in un punto solo. */
    function biancoSotto() {
      var b = statoLuce();
      if (b.a <= 0.001) return false;
      var qx = (calMouse[0] * dpr - res[0] * 0.5) / b.rx;
      var qy = (calMouse[1] * dpr - res[1] * 0.5) / b.ry;
      var g = b.a * Math.exp(-Math.pow(qx * qx + qy * qy, P.luceForma * 0.5));
      return g > (P.pienoDa + P.pienoA) * 0.5;
    }

    function stato() {
      var r = pin.getBoundingClientRect();
      var corsa = pin.offsetHeight - global.innerHeight;
      grezzo = corsa > 0 ? clamp(-r.top / corsa, 0, 1) : (r.top <= 0 ? 1 : 0);
      progresso = clamp(curva(grezzo), 0, 1);

      /* La slide sotto sta ferma esattamente finche' questa sezione e'
         incollata: prima ci pensa il suo sticky, dopo non serve piu'. */
      var incollata = r.top <= 0 && r.bottom >= global.innerHeight;
      if (rig && incollata !== statoFermo) {
        statoFermo = incollata;
        rig.classList.toggle(I.fermo, statoFermo);
      }

      /* La fotografia vera si spegne appena la ridisegniamo noi, e torna
         quando si risale sopra la sezione. Una classe, mai uno stile inline:
         il reveal() del rig orizzontale cancella l'inline. */
      var copre = pronto && progresso > 0.0005;
      if (img && copre !== statoFoto) {
        statoFoto = copre;
        img.classList.toggle(I.fotoOff, copre);
      }

      /* Un numero solo per tutte e due: quanto la slide se n'e' andata. */
      var esce = smoothstep(veloDa, veloA, progresso);

      if (rigTrack) {
        var v = 1 - esce;
        if (Math.abs(v - statoVelo) >= 0.004) {
          statoVelo = v;
          rigTrack.style.setProperty(I.velo, v.toFixed(3));
        }
      }

      /* La barra esce insieme alle scritte e rientra in fondo, per la
         sezione dopo. Risalendo dal basso la stessa formula la riporta su e
         poi giu' da sola: non c'e' un "verso" scritto da nessuna parte,
         c'e' solo dove sei. */
      /* Si ritira col progresso di QUI, insieme alle scritte della slide, ma
         rientra col progresso del binario INTERO: dentro alla radura la barra
         non deve esserci: quella e' una pagina stampata, non un sito, e
         l'interfaccia torna dopo, quando arriva lo studio-hero. */
      muoviBarra(esce * (1 - smoothstep(I.barraTornaDa, I.barraTornaA, grezzo)));

      /* L'header si ridipinge leggendo il fondo sotto di se', e qui sotto non
         c'e' niente di opaco da leggere: glielo diciamo noi. */
      var s = progresso < I.soglia;
      if (s !== statoScuro) {
        statoScuro = s;
        stick.setAttribute("data-hdr", s ? "dark" : "light");
      }

      /* Il cursore invece guarda cosa ha sotto di SE': con il bianco al
         centro e il cielo attorno, sulla stessa schermata ci sono tutti e
         due, e una soglia sola lo lascerebbe bianco sul bianco o nero sul
         nero. Senza simulazione, o prima che il mouse si muova, vale la
         soglia di sempre. */
      if (cursore && pilotaCursore) {
        /* solo mentre la sezione e' incollata: prima e dopo sotto il
           cursore c'e' la pagina vera, e la legge meglio lui */
        var dentro = progresso > 0.0005 && grezzo < 1;
        var chiaro = !dentro ? null : (calMouse && pronto ? biancoSotto() : !s);
        if (chiaro === null && statoCursore !== null) {
          statoCursore = null;
          cursore.style.removeProperty(I.cursoreVar);
        } else if (chiaro !== null && chiaro !== statoCursore) {
          statoCursore = chiaro;
          /* "important" non e' un vezzo: nel foglio della pagina --cc e'
             scritto con !important su #capecur e su #capecur.su-scuro, e
             senza la stessa forza la variabile scritta qui non vinceva mai —
             il cursore restava a leggere un fondo che sulla simulazione non
             c'e'. Fuori dalla sezione si toglie (qui sopra, e in libera()),
             e torna tutto allo script del cursore. */
          cursore.style.setProperty(I.cursoreVar, chiaro ? I.suBianco : I.suScuro, "important");
        }
      }
    }

    function libera() {
      if (statoFermo) { statoFermo = false; rig && rig.classList.remove(I.fermo); }
      if (statoFoto)  { statoFoto = false;  img && img.classList.remove(I.fotoOff); }
      if (statoScuro !== null) { statoScuro = null; stick.removeAttribute("data-hdr"); }
      muoviBarra(0);
      if (rigTrack && statoVelo !== -1) { statoVelo = -1; rigTrack.style.removeProperty(I.velo); }
      if (cursore) cursore.style.removeProperty(I.cursoreVar);
      statoCursore = null;
    }

    function giro() {
      if (!vivo || spento) { girando = false; return; }
      stato();
      if (pronto) {
        /* Finche' la sezione non e' incollata, il rig sta ancora traslando e
           la fotografia NON e' dove sara' quando l'effetto parte: si rimisura
           a ogni fotogramma. Appena si blocca, si blocca anche il rettangolo —
           da li' in poi i pixel in volo partono da un'origine che non deve
           piu' muoversi sotto di loro. */
        if (!bloccato) {
          misura();
          if (statoFermo && progresso > 0) bloccato = true;
        }
        aggiornaCalore(orologio());
        disegna();
      }
      else if (ripiego) disegnaRipiego();
      global.requestAnimationFrame(giro);
    }

    /* Il calcolo si paga quando la sezione e' ancora lontana: arrivarci e
       trovare la prima texture da caricare vorrebbe dire un buco nero di
       mezzo secondo proprio sul primo fotogramma. */
    new IntersectionObserver(function (es) {
      var dentro = es[0].isIntersecting;
      if (dentro && !pronto && !ripiego) prepara();
      /* anche nel ripiego, dove misura() non gira mai: il testo si spegne
         di scatto lo stesso, e il velo deve finire prima anche li' */
      if (dentro) finestraVelo();
      vivo = dentro;
      if (vivo) { if (!girando) { girando = true; global.requestAnimationFrame(giro); } }
      else libera();
    }, { rootMargin: "150% 0px" }).observe(pin);

    var rT = null;
    function suResize() {
      clearTimeout(rT);
      rT = setTimeout(function () {
        finestraVelo();
        if (!pronto) return;
        var r = img.getBoundingClientRect();
        cover = ritaglio(img, r.width || 1, r.height || 1);
        bloccato = false;
        misura();
        if (vivo) disegna();
      }, 150);
    }
    global.addEventListener("resize", suResize, { passive: true });

    return {
      element: canvas,
      get progress() { return progresso; },
      get ready() { return pronto; },
      get fallback() { return ripiego; },
      prepare: function () { prepara(); return pronto; },
      destroy: function () {
        spento = true;
        libera();
        statoBarra = -1;
        muoviBarra(0);
        global.removeEventListener("resize", suResize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  /* ====================================================================== */

  var sezione = null;

  function monta(opts) {
    if (sezione) return sezione;
    sezione = create(opts || {});
    global.capeDust = sezione;

    /* Questa sezione tocca roba di altri: ferma il rig, spegne una foto che
       non e' sua, scrive il colore del cursore. Sono accordi veri e invisibili
       — rinomini una classe e qualcosa smette di funzionare in silenzio.
       Qui vengono dichiarati, cosi' capePatti() in console li elenca insieme
       a tutti gli altri e segnala quelli rimasti su una gamba sola. */
    if (global.capePatti) {
      global.capePatti.dichiara("cape-dust — la foto in polvere", {
        scrivo: [
          ["is-fermo", I.rig, "tiene ferma l'ultima slide mentre la sezione e' incollata"],
          [I.velo, I.rigTrack, "quanto il contenuto della slide e' ancora visibile"],
          [I.fotoOff, I.foto, "spegne la foto vera: da qui in poi la disegna il canvas"],
          ["data-hdr", I.stick, "dice alla barra se sotto c'e' il nero o la luce"],
          ["transform", I.barra, "la barra si ritira in su, a scroll, insieme alle scritte della slide"],
          [I.cursoreVar, I.cursore, "il colore del cursore sopra la simulazione"],
          ["window.capeDust", "", "progresso della sezione, per chi volesse leggerlo"]
        ],
        leggo: [["tendina-righe", I.rigWrap,
                 "non le tocca: ne aspetta il riarmo, e ci finisce il velo prima"]]
      });
    }
    return sezione;
  }

  function boot() { monta({}); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.CapeDust = { mount: monta, impostazioni: I };
})(typeof window !== "undefined" ? window : this);
