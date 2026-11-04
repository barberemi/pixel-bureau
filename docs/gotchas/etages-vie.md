# Étages : les agents qui marchent (2e, 3e) et les équipes du 1er

## Un moteur commun, `67-vie.js`

Au 2e et au 3e, chaque agent voulu a une place (`{id, path, dir, seat, sofa, delay}`) ; `lvUpdate` compare les places voulues à celles de la mémoire de l'étage (`lvMem`) : un nouveau monte par la porte de l'escalier, un agent qui n'est plus voulu redescend, une place qui change se rejoint par les points des deux chemins [src: file: page/src/67-vie.js:14]. Le chemin d'une place part toujours du palier (le premier point) : deux chemins qui n'ont que le palier en commun se rejoignent d'une porte à l'autre, tout droit (`lvRoute`) [src: file: page/src/67-vie.js:10].

- Un agent assis à son poste (`seat`) est dessiné par l'étage (son bureau, son halo, son ✓) : tester `lvSeated` avant de le dessiner, sinon il apparaît deux fois [src: file: page/src/67-vie.js:28].
- `M.fresh` (en arrivant à l'étage, après un saut du curseur de plus de 2 min, avec REDUCED_MOTION) pose tout le monde sans marcher ; `lvUpdate` le remet à `false`. Le ✓ d'un poste fini apparaît en grossissant (`lvPop`), sauf s'il était déjà là en arrivant : au 3e, `lvUpdate` passe avant le dessin des bureaux, d'où `RT_LV.f0` qui garde la valeur de `fresh` pour `lvPop` [src: file: page/src/68-retours.js:292].
- Le chemin d'entrée du 2e passe par `RVF` (68-revue.js), défini après 68-redaction.js dans l'ordre des fichiers : il se lit à l'appel (`rdEntry()`), jamais au chargement [src: file: page/src/68-redaction.js:134].

## Les tenues

`atWorker` (68-atelier.js) donne d'office le chantier (casque et gilet) aux agents du 1er. Son 7e argument `gear` le remplace ; `null` = aucune tenue (le 2e et le 3e posent la leur : chapeau mou, visière, chirurgien). `drawChar` distingue `gear: null` (rien) de `gear` absent (le chantier du lanceur des implémentations au RDC) [src: file: page/src/68-atelier.js:392] [src: file: page/src/41-people.js:70]. Debout, le gilet est à 26 px au-dessus des pieds, comme au RDC [src: file: page/src/68-atelier.js:381].

## Les équipes

- **1er** : `AT_MEM.crew` ; le bureau 1 garde toujours son équipe, les bureaux 2 à 4 n'en ont que de l'arrivée du ticket au départ du carton (`atCrewOcc` compte `AT_MEM.leaving`). Une place vide dessine le bureau seul, sans clic ni lampe la nuit (`atAtDesk`). Les promeneurs ne sortent que d'un bureau qui a son équipe [src: file: page/src/68-atelier.js:192].
- **3e** : `RT_LV`, une équipe par bureau occupé, plus celle du bureau 1 (`rtCrewWant`) ; les ids sont par bureau (`b<i>:<poste>`), pas par PR, pour que l'équipe du bureau 1 reste quand une PR y arrive ou en part [src: file: page/src/68-retours.js:223].
- **2e** : `RD_LV`, les trois reporters toujours là ; sans intention, une place tirée au sort toutes les 15 à 40 s (`rdWant`, `rnd` remplaçable pour les tests). Le boss fait ses trajets un à la fois (`rdJobs`) : l'intention n'est montrée qu'une fois épinglée (`RD_LV.gate`), un ticket créé reste « t'attend » tant qu'il n'est pas dans la boîte (`RD_LV.pend`) [src: file: page/src/68-redaction.js:159].
