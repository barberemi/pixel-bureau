# Étages : scènes de la galerie et légende par étage

## Une scène de la galerie doit se jouer au premier clic

Chaque étage compare, à chaque image, l'heure du plan et le mode (direct ou rejeu) à l'image précédente : un écart de plus de 2 min ou un passage du direct au rejeu est un « saut du curseur », et l'étage se pose sans rien jouer (`renderAtelier`, `renderRetours`, `rvfUpdate`) [src: file: page/src/68-atelier.js:800] [src: file: page/src/68-retours.js:272].

Lancer une scène (« ▶ voir », `demoStart`) passe en démonstration, souvent depuis la pause, et le soir saute à 11 h (`demoTime`) : sans précaution, l'étage le prend pour un saut et pose le bureau d'un coup. Le 1er avait ce défaut (la scène ne partait qu'au deuxième clic) ; le 3e posait l'étage *après* la mutation de la démo, si bien qu'arrivée et sortie de Bernard ne se jouaient jamais.

Règle pour la fonction de démo d'un étage (`atDemo`, `rtDemo`, `csDemo`, `rdDemo`) :

- poser l'état d'avant la scène comme référence (le diff de l'étage, avec `fresh`), **puis** appliquer la mutation ;
- remettre la mémoire de saut à zéro (`lastT=null`) pour que la première image de la démonstration ne soit pas un saut.

Tester par le vrai chemin de rendu (`renderAtelier(n)` deux fois après `demoStart`, depuis `setMode('pause')` et à 22 h 30), pas en appelant le diff à la main : `tests/atelier.test.js` et `tests/retours.test.js` le font.

## La légende suit l'étage

`page/src/46-legende.js` dessine la ligne de légende et « Comment lire le plan » de l'étage affiché, un onglet à la fois. Au RDC, les blocs viennent du gabarit (`data-tab`) ; aux étages, de `AT_HELP`, `RD_HELP`, `RT_HELP`, `CS_HELP`, écrits dans le fichier de l'étage. L'onglet Postes se tire de la liste des postes que le dessin utilise (`AT_POSTES`, `RD_POSTES` et `RV_STEP`, `RT_POSTES`, `CS_POSTES`) : tout nouveau poste prend une phrase `d` (`RV_STEP[k][2]` pour une étape de revue), sinon `tests/legende.test.js` échoue.
