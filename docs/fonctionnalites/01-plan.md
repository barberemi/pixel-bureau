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
- **Café, canapés** : run réussi récemment, ou rien à faire. La cafétéria a deux canapés de trois places, l'un en bas, l'autre en haut à droite près du comptoir : chacun prend une place libre, personne ne s'assoit sur un autre.

Quand un ticket passe en Reopen dans Jira, Gandalf entre par la porte. Lui, celui qui a réouvert le ticket (souvent le testeur) et le développeur se retrouvent en salle de réunion : le développeur d'un côté de la table (« 😨 7089 »), le testeur et Gandalf en face, et Gandalf crie en grand « Vous ne passerez pas ! ». Trois minutes plus tard, il repart par la porte et chacun retourne à sa place. Sans héraut des reopens, le testeur va simplement le dire au développeur à sa place. La scène se rejoue à l'heure exacte du changement de statut.

![Le face-à-face devant le bureau du boss](../img/reopen-testeur.png)

Quand une mise en prod réussit, Yoda entre aussi par la porte. Il monte sur la scène du plateau TV à côté de celui qui a fait la mise en prod (le boss y est déjà, au saxophone) et le félicite en grand : « Fier de toi, je suis. ». Trois minutes plus tard, il repart. Si la prod finit pendant le daily, il les rejoint à la table du daily ; le vendredi et le week-end, plateau fermé, il attend devant le ruban. Sa réplique ne cache jamais les bulles de ses voisins : elle se décale à droite, à gauche ou au-dessus.

![Le héraut félicite Andy sur le plateau TV](../img/prod-heraut.png)

Gandalf et Yoda viennent dans tous les bureaux, quelle que soit l'équipe (`team/guests.json`). Pour les retirer : `"common_guests": false` dans `bureau.config.json` ; pour en changer le nom, la réplique ou l'allure : un invité de même clé (`g_gandalf`, `g_yoda`) dans le roster de l'équipe ou dans la config.

D'autres changements de colonne se jouent aussi, à l'heure exacte du changement de statut :
- **Ticket à tester** : le développeur porte le dossier au bureau du testeur (« 📁 6717 »), et le dossier rejoint la pile du testeur, sur le caisson à côté de son bureau.
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
- En bas du panneau, « Et aussi » liste les invités du moment (Yoda, Gandalf, un invité de passage…), tant qu'ils sont dans le bureau, et le canard, avec ce qu'il fait (« se promène · cafétéria », « attend ta réponse »). Survol : il ressort sur le plan. Clic : sa fiche. Ce groupe n'apparaît que dans la vue « Tous ».

![« Et aussi » : un invité de passage et le canard](../img/panneau-et-aussi.png)
- « Replier ⟩ » en haut du panneau le réduit à une bande : le plan prend presque toute la largeur (×1 sur un écran de 1440 px au lieu de ×0,77). Un clic sur un personnage le rouvre.
- Au clavier : Tab jusqu'à la liste de l'équipe, flèches pour passer d'une personne à l'autre (elle ressort sur le plan), Entrée pour ouvrir sa fiche.

![Panneau replié : le plan prend la place](../img/panneau-replie.png)
- Les bulles des tickets affichent depuis combien de jours le ticket est dans sa colonne (« 📗 7685 · en review · 6 j »).
- Sur les bureaux, des piles montrent le travail de chacun :
  - devant chaque collègue, sous son écran, une barre par ticket ouvert (5 au plus), de la couleur de son statut : bleu en cours, orange en review, violet en test, bleu-vert à déployer, gris à faire ;
  - sur un caisson dans l'allée, à côté de la facilitatrice, une feuille blanche par ticket créé par l'équipe depuis le dernier daily (la pile repart de zéro à chaque daily) ;
  - sur un caisson à côté du testeur, un dossier jaune par ticket du sprint en test.

  Les caissons affichent le nombre exact (6 éléments dessinés au plus). Survole une pile pour le détail : « Karen : 3 tickets à tester · DM-6717, … ».

![Les piles des bureaux à 11h](../img/piles-bureaux.png)
- Selon la date, le bureau se déguise : voir [Thèmes saisonniers](12-themes.md). « Comment lire le plan » permet d'en essayer un tout de suite.

## Les passions de l'équipe

Chacun peut avoir une passion (clé `passion` du roster), qui se joue sur le plan une fois par jour ouvré, à une heure tirée au sort entre 10h30 et 17h, la même pour tous :

- **Badminton** : la personne se lève et frappe un volant qui traverse la pièce (2 min).
- **Basket** : une minute de tirs au panier, avec le score et des « SWISH! ».
- **Boxe** : gants aux mains, quelques séries au sac de frappe (« POW! », 2 min).
- **Le soir en hologramme** (`soir_holo`) : en semaine, de la fin des heures de bureau à 3h du matin (le vendredi soir compris, jusqu'au samedi 3h), la personne vient travailler en semi-hologramme (reflet bleu, lignes de balayage), avec son petit robot IA.

![Une séance de tirs au panier](../img/passions.png)

Les cartes de passion des fiches sont décrites dans [Fiches](07-fiches.md).

## Le canard

Un canard de bain jaune se promène tout le temps dans tout le bureau : jour et nuit, en semaine comme le week-end, et en mode TV. Il marche lentement vers une case libre tirée au sort, en se dandinant, s'y arrête de 20 secondes à une minute, puis repart ailleurs : cafétéria, salle serveurs, toilettes, open space… Il est un peu plus grand que nature et une petite flèche jaune flotte au-dessus de lui, pour le repérer d'un coup d'œil sur la moquette. Son parcours ne dépend que de la date et de l'heure : tout le monde le voit au même endroit au même instant, et le rejeu le refait à l'identique.

Un clic sur lui ouvre sa fiche (voir [Fiches](07-fiches.md)) : c'est la [méthode du canard en plastique](https://fr.wikipedia.org/wiki/M%C3%A9thode_du_canard_en_plastique), on lui explique son problème dans une discussion Kronn.

Quand une de ses discussions attend ta réponse, en direct (pas en rejeu), il quitte sa promenade, marche jusqu'au bureau du boss et attend devant, de face, avec une bulle « ? » à la place de sa flèche. Le groupe « Et aussi » du panneau dit aussi « attend ta réponse », et sa fiche ouvre la discussion dans un nouvel onglet. Une fois ta réponse donnée, il reprend sa promenade.

![Le canard attend ta réponse devant le bureau du boss](../img/canard-attend.png)

![Le canard sur le plan, sa fiche ouverte](../img/canard.png)

## Changer de plan pour toute l'équipe

Le plan se décrit dans un fichier JSON (voir [Développer, plan du bureau](../developpement.md#plan-du-bureau-layoutsjson)). Chacun est placé par le plan (`seating`, par numéro de siège : `I2.R2` = îlot 2, côté droit, rang 2), les autres reçoivent un siège libre, toujours le même.

```sh
python3 tools/plan.py check mon-plan.json    # erreurs et avertissements
python3 tools/plan.py seats mon-plan.json    # qui s'assoit où, et qui change de place
python3 tools/plan.py share mon-plan.json    # le proposer à toute l'équipe
python3 tools/plan.py share defaut           # revenir au plan de l'installation
```

`share` lance le workflow « Le Bureau · plan » : il revérifie le plan, puis attend la validation du boss. La demande apparaît dans la fiche du boss (clic sur son personnage, qui porte alors la bulle ✋), avec son résumé (taille, sièges, places qui changent) et le bouton « Décider ». Une fois validé, la page se redessine sans rechargement et chacun rejoint sa nouvelle place. Un plan refusé n'est jamais publié.

| Sur le plan : la bulle ✋ du boss | Dans sa fiche : la carte de décision |
| --- | --- |
| ![Le boss attend à son bureau, bulle ✋1](../img/bulle-validation.png) | ![Validation d'un nouveau plan dans la fiche du boss](../img/validation-plan.png) |

## Partir d'un croquis ou d'une photo

Pas besoin d'écrire le JSON : Claude dessine un brouillon à partir d'un croquis ou d'une photo du plan (PNG, JPEG ou WebP ; une photo HEIC s'exporte d'abord en JPEG). Le vérificateur le relit et Claude corrige ses erreurs, 4 tours au plus. Ce qui manque au dessin mais dont le Bureau a besoin (salle serveurs, toilettes, bureau du boss) est ajouté là où c'est plausible, et chaque supposition est listée.

- **En local** : `python3 tools/plan.py from-image croquis.jpg` (CLI `claude` connecté, Opus par défaut, `--model sonnet` pour aller plus vite). Le brouillon arrive dans `dist/plan-brouillon.json` avec son aperçu `dist/plan-brouillon.png`, puis la commande demande s'il faut le proposer à l'équipe (`plan.py share`, toujours validé par le boss).
- **Dans Kronn** : dans une discussion, joins l'image à ton message puis enchaîne le Quick Prompt « Le Bureau · plan vers brouillon ». L'agent écrit le même brouillon, le vérifie, regarde l'aperçu et te demande avant de le proposer.

| Croquis | Brouillon obtenu (premier tour, sans retouche) |
| --- | --- |
| ![Croquis d'un étage](../img/croquis.png) | ![Brouillon tiré du croquis](../img/croquis-brouillon.png) |

Le brouillon garde l'esprit des lieux, pas les cotes : une case vaut environ 50 cm, les postes deviennent des îlots (une table, un siège de chaque côté). Relis les suppositions, retouche le JSON si besoin (`plan.py check`), puis propose-le.

## Collègues de passage

Une personne qui a des tickets dans le sprint sans être dans le roster de l'équipe est « de passage » : elle n'est pas ajoutée à l'équipe. Son rôle affiché est « De passage » ; elle a la place libre la plus au fond du plan, jamais celle d'un collègue, d'un agent ou d'un intérimaire, et la garde d'un rafraîchissement à l'autre. Elle reste à sa place tant qu'elle a un ticket ouvert dans le sprint, au travail s'il est en cours (aux heures de bureau, comme tout le monde ; sans ticket ouvert, elle n'est pas là) et ne vient ni au daily ni aux cérémonies. Pour la faire entrer dans l'équipe : l'ajouter au roster.

## Loupe sur les événements forts

Quand un événement fort commence, un médaillon agrandit la scène dans un coin du plan, qui reste entier : un cadre de couleur entoure l'endroit, la légende dit qui et quoi (clic : sa fiche), une barre montre le temps restant.

![La loupe sur une réouverture : Gandalf convoque Pam](../img/loupe.png)

- **Les événements** : un ticket réouvert (le héraut convoque l'assigné), une mise en prod réussie (le sage félicite l'auteur), un invité qui arrive, la fête d'une MEP, le pouce du testeur qui valide, le lancement du sprint.
- **Une loupe à la fois**, ouverte une fois les personnages arrivés (40 s au plus d'attente), pendant 20 s ; deux événements au même endroit (la fête et le sage) n'en font qu'une.
- **En rejeu accéléré**, la lecture se met en pause le temps de la loupe, puis reprend. Rien quand on fait glisser l'heure, ni quand la souris est sur le plan.
- **Fermer** : clic sur le plan ou Échap. **Couper** : bouton « 🔍 Loupe » sous le plan (retenu dans le navigateur) ; sur l'écran mural, `?loupe=0` dans l'adresse.
- Aussi en mode TV, où personne ne clique : elle se referme seule.

