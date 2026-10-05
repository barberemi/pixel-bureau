# Le plan

Un open space en pixel art où chaque personnage montre ce qui se passe dans Kronn et dans l'équipe, minute par minute.

![Le plan à 11h](../img/plan.png)

## Qui est sur le plan

| Personnage | Ce que c'est | Où le voir |
| --- | --- | --- |
| Collègue (en couleur) | Une personne de l'équipe (`teams/<équipe>/roster.json`, ou ajoutée à l'installation) | À sa place, ses tickets Jira en bulle |
| Agent (hologramme bleu) | Un workflow Kronn, avec un personnage de *The Office* | Son étape dans un nuage, l'outil en cours dans une petite bulle sombre |
| Visiteur | Une discussion Kronn du jour | En salle de réunion, puis au café |
| Le boss | La personne qui a installé la page (`owner`) | Au bureau du boss, bras levés quand une validation l'attend |
| Invité de passage | Quelqu'un qui passe voir l'équipe (clé `guests` du roster) | Au plus une fois par jour ouvré, 20 à 40 min, à une heure tirée au sort ; il se promène |

Un invité de passage entre par la porte, va saluer des collègues à leur bureau, prend un café, s'assoit sur le canapé, puis repart. L'heure et la durée de sa visite sont tirées au sort pour chaque date : tout le monde le voit au même moment, et il ne passe pas forcément tous les jours (`chance`). Il n'apparaît que sur le plan ; un clic ouvre sa fiche, avec son heure d'arrivée et de départ. Un invité peut aussi venir à heure fixe (même la nuit, même le week-end), faire le tour de toutes les salles et lancer sa phrase dans sa bulle.

![Un invité de passage chez Jan](../img/invite.png)

## Où ils vont

- **Bureau** : étape IA ou script en cours.
- **Salle serveurs** : appel d'API. **Salle de réunion** : sous-workflows.
- **Bureau du boss** : validations et questions qui t'attendent.
- **Toilettes** : en panne (🚨 après 3 échecs d'affilée).
- **Plateau TV** : mises en prod du jour (fermé le vendredi et le week-end).
- **Café, canapé** : run réussi récemment, ou rien à faire.

Quand un ticket passe en Reopen dans Jira, un mage entre par la porte. Lui, celui qui a réouvert le ticket (souvent le testeur) et le développeur se retrouvent devant le bureau du boss : le développeur d'un côté (« 😨 7089 »), face au testeur et au mage, côte à côte, qui crie « Vous ne passerez pas ! ». Trois minutes plus tard, le mage repart par la porte et chacun retourne à sa place. Sans mage dans le roster, le testeur va simplement le dire au développeur à sa place. La scène se rejoue à l'heure exacte du changement de statut.

![Le face-à-face devant le bureau du boss](../img/reopen-testeur.png)

D'autres changements de colonne se jouent aussi, à l'heure exacte du changement de statut :
- **Ticket à tester** : le développeur porte le dossier au bureau du testeur (« 📁 6717 »), et le testeur a sur son bureau une pile de dossiers, un par ticket en test.
- **Ticket validé** : le testeur lève le pouce depuis son bureau (« 👍 6550 validé ») et le développeur lève les bras (🙌), boss compris.

| Ticket livré au testeur | Ticket validé |
| --- | --- |
| ![Gabe apporte DM-6717 à Karen](../img/scene-livraison.png) | ![Karen valide, Michael lève les bras](../img/scene-validation.png) |

Le sprint a ses rendez-vous : le premier jour, juste après le daily, l'équipe passe 5 min devant le Kanban (🏁) ; le dernier jour, des boîtes de pizza arrivent sur la table de la cuisine vers midi et tout le monde y mange de 12h à 12h40 (🍕).

| Lancement du sprint | Pizzas du dernier jour |
| --- | --- |
| ![Toute l'équipe devant le Kanban](../img/scene-kickoff.png) | ![Toute l'équipe à la cafétéria](../img/scene-pizza.png) |

L'anneau sous les pieds double la couleur par une forme (lisible par les daltoniens) : plein = au travail, pointillés = attend une validation, tirets = en panne.

![Légende « Comment lire le plan »](../img/legende.png)

## Détails

- Chaque agent porte une icône et son métier à côté de son prénom (« 🔎 Dwight · Reviewer de PR », « 🚨 Creed · Erreurs prod ») : sur le plan, dans Qui fait quoi, dans le panneau et sur sa fiche. L'icône est devinée depuis le nom du workflow (🔎 revue, 📰 veille, ⚡ performance, 🚨 erreurs, 🧪 tests, 🚀 MEP, 🧳 migration…). En mode TV, seul le métier s'affiche.

![Les agents et leur métier](../img/etiquettes-agents.png)
- Clic sur un personnage : sa fiche (voir [Fiches](07-fiches.md)). Survol : son nom et ce qu'il fait.
- La lumière suit le soleil au bureau : fenêtres, crépuscule, voile de nuit qui s'ouvre autour de chaque personnage, lampes des bureaux occupés.
- Quand un run en lance un autre, une enveloppe passe d'un agent à l'autre (sous-run, déclenchement, validation, discussion).
- « Sur le plan » dans le panneau met une famille en avant (équipe, agents ou visiteurs), avec ses noms.
- « Replier ⟩ » en haut du panneau le réduit à une bande : le plan prend presque toute la largeur (×1 sur un écran de 1440 px au lieu de ×0,77). Un clic sur un personnage le rouvre.
- Au clavier : Tab jusqu'à la liste de l'équipe, flèches pour passer d'une personne à l'autre (elle ressort sur le plan), Entrée pour ouvrir sa fiche.

![Panneau replié : le plan prend la place](../img/panneau-replie.png)
- Les bulles des tickets affichent depuis combien de jours le ticket est dans sa colonne (« 📗 7685 · en review · 6 j »).
- Sur le bureau de la facilitatrice, une pile de documents monte d'une feuille par ticket créé par l'équipe depuis le dernier daily, et repart de zéro à chaque daily. À 20, elle déborde (trombone rouge au sommet).

![La pile de la facilitatrice : 7 tickets créés depuis le daily](../img/pile-facilitatrice.png)
- Selon la date, le bureau se déguise : voir [Thèmes saisonniers](12-themes.md). « Comment lire le plan » permet d'en essayer un tout de suite.

## Changer de plan pour toute l'équipe

Le plan se décrit dans un fichier JSON (voir [Développer, plan du bureau](../developpement.md#plan-du-bureau-layoutsjson)). Chacun est placé par le plan (`seating`, par numéro de siège : `I2.R2` = îlot 2, côté droit, rang 2), les autres reçoivent un siège libre, toujours le même.

```sh
python3 tools/plan.py check mon-plan.json    # erreurs et avertissements
python3 tools/plan.py seats mon-plan.json    # qui s'assoit où, et qui change de place
python3 tools/plan.py share mon-plan.json    # le proposer à toute l'équipe
python3 tools/plan.py share defaut           # revenir au plan de l'installation
```

`share` lance le workflow « Le Bureau · plan » : il revérifie le plan, puis attend la validation du boss. La demande apparaît dans [À traiter](02-a-traiter.md) avec son résumé (taille, sièges, places qui changent). Une fois validé, la page se redessine sans rechargement et chacun rejoint sa nouvelle place. Un plan refusé n'est jamais publié.

![Validation d'un nouveau plan par le boss](../img/validation-plan.png)

## Partir d'un croquis ou d'une photo

Pas besoin d'écrire le JSON : Claude dessine un brouillon à partir d'un croquis ou d'une photo du plan (PNG, JPEG ou WebP ; une photo HEIC s'exporte d'abord en JPEG). Le vérificateur le relit et Claude corrige ses erreurs, 4 tours au plus. Ce qui manque au dessin mais dont le Bureau a besoin (salle serveurs, toilettes, bureau du boss) est ajouté là où c'est plausible, et chaque supposition est listée.

- **En local** : `python3 tools/plan.py from-image croquis.jpg` (CLI `claude` connecté, Opus par défaut, `--model sonnet` pour aller plus vite). Le brouillon arrive dans `dist/plan-brouillon.json` avec son aperçu `dist/plan-brouillon.png`, puis la commande demande s'il faut le proposer à l'équipe (`plan.py share`, toujours validé par le boss).
- **Dans Kronn** : dans une discussion, joins l'image à ton message puis enchaîne le Quick Prompt « Le Bureau · plan vers brouillon ». L'agent écrit le même brouillon, le vérifie, regarde l'aperçu et te demande avant de le proposer.

| Croquis | Brouillon obtenu (premier tour, sans retouche) |
| --- | --- |
| ![Croquis d'un étage](../img/croquis.png) | ![Brouillon tiré du croquis](../img/croquis-brouillon.png) |

Le brouillon garde l'esprit des lieux, pas les cotes : une case vaut environ 50 cm, les postes deviennent des îlots (une table, un siège de chaque côté). Relis les suppositions, retouche le JSON si besoin (`plan.py check`), puis propose-le.
