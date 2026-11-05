# Étages : scènes de la galerie et légende par étage

## Une scène de la galerie doit se jouer au premier clic

Chaque étage compare, à chaque image, l'heure du plan et le mode (direct ou rejeu) à l'image précédente : un écart de plus de 2 min ou un passage du direct au rejeu est un « saut du curseur », et l'étage se pose sans rien jouer (`renderAtelier`, `renderRetours`, `rvfUpdate`) [src: file: page/src/68-atelier.js:800] [src: file: page/src/68-retours.js:272].

Lancer une scène (« ▶ voir », `demoStart`) passe en démonstration, souvent depuis la pause, et le soir saute à 11 h (`demoTime`) : sans précaution, l'étage le prend pour un saut et pose le bureau d'un coup. Le 1er avait ce défaut (la scène ne partait qu'au deuxième clic) ; le 3e posait l'étage *après* la mutation de la démo, si bien qu'arrivée et sortie de Bernard ne se jouaient jamais.

Règle pour la fonction de démo d'un étage (`atDemo`, `rtDemo`, `csDemo`, `rdDemo`) :

- poser l'état d'avant la scène comme référence (le diff de l'étage, avec `fresh`), **puis** appliquer la mutation ;
- remettre la mémoire de saut à zéro (`lastT=null`) pour que la première image de la démonstration ne soit pas un saut ;
- appeler `loupeNoteSeen()` (44-loupe.js) une fois l'étage d'avant posé : en pause, la loupe n'a rien noté (`LOUPE.seen` vide), et l'événement de la scène, présent dès la première image, passait pour déjà vu ; la loupe ne s'ouvrait jamais après une pause ou un glissé du curseur. L'id d'un événement doit aussi changer avec la scène (le découpage porte le tour et le nombre de tickets), sinon l'état d'avant, qui a le même id, l'avale ;
- au 2e, dessiner l'étage d'avant (`renderRedaction`) avant la mutation : `rdReset` remet `fresh`, et sans image entre les deux, l'étage pose l'état final sans trajet (tampon, boîte Jira) ;
- une scène où le boss va à une barrière lève d'abord les autres gates et le pose à son fauteuil (`AT_MEM.boss`, `RT_MEM.boss`, `CS_MEM.boss`) : il va toujours à la plus ancienne, et la démo en a déjà une. `rtReset` efface sa mémoire : `rtDemo` la garde, sinon il réapparaît d'un coup à la barrière.

La démo de la revue (`rvDemo`) suit l'heure du plan comme les vrais runs (`_s <= T`), sinon « Une revue à la demande » ne montre rien de nouveau. Un banc de rejeu en Chrome (clic, captures, état de la loupe et du boss à chaque instant) a trouvé ces défauts ; `tests/scenes-etages.test.js` les garde.

Tester par le vrai chemin de rendu (`renderAtelier(n)` deux fois après `demoStart`, depuis `setMode('pause')` et à 22 h 30), pas en appelant le diff à la main : `tests/atelier.test.js` et `tests/retours.test.js` le font.

## La légende suit l'étage

`page/src/46-legende.js` dessine la ligne de légende et « Comment lire le plan » de l'étage affiché, un onglet à la fois. Au RDC, les blocs viennent du gabarit (`data-tab`) ; aux étages, de `AT_HELP`, `RD_HELP`, `RT_HELP`, `CS_HELP`, écrits dans le fichier de l'étage. L'onglet Postes se tire de la liste des postes que le dessin utilise (`AT_POSTES`, `RD_POSTES` et `RV_STEP`, `RT_POSTES`, `CS_POSTES`) : tout nouveau poste prend une phrase `d` (`RV_STEP[k][2]` pour une étape de revue), sinon `tests/legende.test.js` échoue.
