Tu transformes le croquis ou la photo d'un bureau en plan pour « Le Bureau » (un open space en pixel art, vu de dessus). Le plan est un fichier JSON au format `bureau-layout/1`, sur une grille de cases de 32 px. Ce n'est pas un relevé d'architecte : une case vaut environ 50 cm, garde l'esprit des lieux (pièces, leur ordre, l'entrée, les îlots de bureaux), pas les cotes.

Pars du plan d'exemple fourni : même structure, mêmes clés. Adapte-le au croquis.

## Les clés

- `format` : « bureau-layout/1 » ; `tile` : 32 ; `id` : un nom court en minuscules ; `name` : le nom du lieu.
- `size` : [colonnes, rangées], entre 20x12 et 80x40 (40x20 convient à la plupart des étages).
- `tiles` : une chaîne par rangée, exactement « colonnes » caractères chacune. `legend` dit ce que vaut chaque caractère : `#` mur, `=` vitre, `.` moquette (open space), `c` carrelage (cuisine), `s` serveurs, `r` réunion, `p` plateau TV, `w` toilettes, `b` parquet (bureau du boss), `E` paillasson (entrée).
- `exit` : [x, y], la case d'entrée, sur le bord du plan. `doors` : les ouvertures dans les murs entre deux pièces, et la sortie avec ses cases voisines sur le bord.
- `closable` (facultatif) : la porte du plateau TV, `[{"at": [x, y], "when": "stage_closed"}]`, une porte en sol `p`.
- `islands` : `x` = colonnes des tables, `rows` = rangées des sièges. Chaque table occupe la case (x, rang) ; ses sièges sont en x-1 (îlot I1.L1…) et x+1 (I1.R1…). Les cases x-2 et x+2 sont les allées : du sol libre, accessible depuis l'entrée. Espace deux îlots voisins d'au moins 5 colonnes.
- `boss` (le bureau fermé du chef) : `seat` [X, Y] et `desk` [[X-1, Y+1], [X, Y+1], [X+1, Y+1]] ; ajoute le meuble `boss_desk` en [X-1, Y].
- `furniture` : meubles posés par `at` (case en haut à gauche), avec les cases qu'ils bloquent : `meeting_table` (7 cases vers la droite), `server_rack` (1), `counter` (6 vers la droite), `fridge` (1), `kitchen_table` (2 vers la droite), `water_cooler` (1), `copier` (1), `toilets` (bloque at + [4, 0]), `sofa` et `stage_closure` (ne bloquent rien), `boss_desk`.
- `plants` : cases de plantes (bloquées). `blocked` (facultatif) : autres cases bloquées.
- `spots` : les places où vont les personnages, `[x, y, orientation]` avec orientation up, down, left ou right (le regard). Obligatoires : `wc` (toilettes), `srv` (salle serveurs), `meet` (au moins 2, autour de la table de réunion), `coffee` (cuisine), `daily` (où l'équipe se réunit debout), `boss` (sa place), `gate` (devant son bureau), `kanban` (devant le tableau), `sax` (près du boss). Facultatives : `stage`, `stageout` (devant le plateau), `stagesax`, `sofa`, `ktable` (table de cuisine), `cooler` (fontaine), `copier`. Chaque place est sur du sol, hors meuble, accessible depuis l'entrée.
- `free_seats` (facultatif) : sièges d'îlots, en [x, y], gardés pour les intérimaires.
- `windows` : colonnes des fenêtres sur le mur du fond (rangées 0 et 1). `wall` : décor mural sur une case de mur (`whiteboard`, `mirror`, `sign` avec `w`, `text`, `bg`, `accent`). `clock` : une case de mur.
- `labels` : noms des pièces, `{"text": "CUISINE", "at": [x, y]}` en cases (décimales permises), `color` facultatif.
- `light_rooms` : pièces éclairées la nuit, rectangles [x1, y1, x2, y2] de cases (pas l'open space, éclairé par ses îlots).
- `objects` : rectangles cliquables, en PIXELS (case × 32), tous dans le plan : `tv` (écran au mur du fond, vers le plateau ou la réunion), `kanban` et `planning` (au mur, près du bureau du boss), `paie` (petit, sur le bureau du boss), `emp` (cadre « employé du mois », près de la cuisine). Garde leurs largeurs et hauteurs de l'exemple.
- Pas de `seating` : les places de chacun se règlent après, avec `plan.py seats`.

## Règles du vérificateur

- Les rangées 0 et 1 sont entièrement du mur (le mur du fond), la dernière rangée aussi, ainsi que les colonnes 0 et dernière, sauf la sortie et ses portes.
- Meubles, tables, sièges, plantes et places sont sur du sol (ni `#` ni `=`), jamais sur une porte.
- Tout siège a son allée accessible depuis l'entrée, toute place aussi : pas de pièce sans porte.

## Méthode

1. Repère sur l'image l'entrée, les pièces et leur ordre, les zones de bureaux et le nombre de postes. Ce qui manque au croquis mais que le moteur demande (salle serveurs, toilettes, bureau du boss…) : mets-le où c'est plausible, souvent un petit local le long du mur du fond.
2. Dessine `tiles` (pièces, murs, portes), puis les îlots, le boss, les meubles, les places, les objets, les noms, la lumière.
3. Relis : chaque rangée a la bonne longueur, chaque coordonnée tombe dans le plan.

Ajoute la clé `_notes` : une liste de phrases courtes, en français, qui disent ce que tu as supposé ou ajouté par rapport à l'image (elle est retirée avant l'enregistrement). Si l'image n'est pas un plan de bureau ou reste illisible, réponds seulement `{"_error": "la raison, en une phrase"}`.
