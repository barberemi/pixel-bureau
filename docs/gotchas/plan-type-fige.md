# Le plan type (`layouts/open-space.json`) est figé par une référence de test

`tests/layout.test.js` compare le plan type extrait à l'ancien plan codé en dur (`tests/fixtures/world_open-space.json`, figé avant l'extraction) : cases bloquées, cases praticables, rectangles `TVR`, `KANR`, `PAYR`, `EMPR` [src: file: tests/layout.test.js:2]. Déplacer une plante, l'employé du sprint ou un meuble du plan type casse ces tests, et ce n'est pas une régression à « corriger » en mettant la référence à jour.

Conséquence : un nouvel objet de plan se déclare **facultatif** (comme `objects.todo` ou `objects.departs`, le tableau des départs) ; c'est le plan d'une équipe (son pack, `layouts/<id>.json`) qui le place et décale ce qu'il faut [src: file: page/src/40-furniture.js:400]. Les captures de la doc l'ajoutent à la démo par une mise en scène (`applyLayout({...LAYOUT, objects: {...}})`, voir `DEP_DEMO` dans `tools/shots.py`) [src: file: tools/shots.py:1].

Autre contrainte du contrôle des plans : l'horloge (`clock`) doit être sur une case entière, `_plan.py` lit la case du mur avec ses coordonnées [src: file: workflows/_plan.py:166].
