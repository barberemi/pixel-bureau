# Les retours de PR (3e étage)

Au 3e étage, on voit les PR dont un agent corrige les commentaires de review : un bureau par PR, six au plus. C'est le même workflow que le bouton « 🛠 Corriger » des fiches (modèle du Bureau « corriger les commentaires d'une PR », [fiches](07-fiches.md)) : l'étage le montre en grand, poste par poste et fil par fil.

## Monter au 3e

L'onglet « 🛠 3e · retours de PR » apparaît après « 🏭 1er » dès que le modèle est installé (`actions.fix_pr`). Les onglets suivent l'ordre des étages : -1, RDC, 1er, 3e. Le chiffre compte les PR en correction, « ✋ n » celles qui attendent ta validation. La page s'ouvre au RDC ; l'étage choisi ensuite est retenu par le navigateur.

## Ce qu'on y voit

![Le 3e étage : cinq PR en correction, le boss à la validation du bureau 2, le bureau 5 en file](../img/retours.png)

- **Un bureau par PR**, en deux rangées de trois autour du couloir. Le nom de la PR (dépôt et numéro) et son auteur sont en haut du bureau. Un bureau libre est éteint.
- **Le rail des postes**, comme au 1er : 🗂 Préparation, 🛠 Correction, 🧪 Contrôles, 🔍 Diff, ✋ Toi, 📤 Push, les étapes du workflow. Un agent par poste, assis derrière son bureau à écran, en bleu de mécanicien (la casquette). Même langage qu'aux autres étages : **au travail** (un halo, une bulle), **a travaillé** (✓), **attend son tour** (silhouette grise), **en panne** (! rouge et fumée : un correctif dont les contrôles restent rouges est annulé). La PR, un carton avec ses post-its, est posée devant le poste en cours.
- **Le Kanban des fils**, au mur de chaque bureau : une colonne par section de la réponse de l'agent (À traiter, ✅ Corrigé, 🧪 Test, ⏭ Laissé, 💬 Réponse), un post-it par fil de review non résolu. Un **fil rouge** relie le fil que la correction traite en ce moment à l'agent qui s'en occupe. Les post-its changent de colonne en direct : l'agent note son avancement fil par fil (voir Données).
- **Le boss est toujours là**, assis à son bureau du couloir, le même qu'au RDC. Quand une PR attend ta validation, il se lève, longe le couloir, entre par la porte du bureau et va à la barrière ✋. Il n'y a qu'un boss : il va d'abord au bureau qui attend depuis le plus longtemps, les autres clignotent à leur barrière (« en file : le boss est au bureau 2 ») et il y passe ensuite. Il ressort par où il est entré.
- **Bernard** monte une PR par l'escalier jusqu'à son bureau, y pose le carton, et la redescend une fois les corrections poussées ; le bureau s'éteint.
- **Le couloir** : les PR qui attendent un bureau, le café, un banc où s'assoient les agents des bureaux libres, le bureau du boss, l'escalier vers les autres étages.
- **Le soir et le week-end**, l'étage passe en veilleuse : seuls les agents au travail et le boss gardent leur lumière, qui le suit quand il marche.

![Le 3e le soir : une PR en correction, le boss à son bureau](../img/retours-calme.png)

## Le Kanban en grand

Un clic sur le Kanban d'un bureau (ou « 🔍 Ouvrir le Kanban des fils » dans sa fiche) ouvre la fenêtre : la barre des postes, puis les fils en colonnes, avec le fichier et la ligne, qui a commenté et son commentaire. Le fil traité en ce moment est encadré de rouge. Un clic sur un fil le montre à droite, avec le lien vers la PR sur GitHub. Échap ou ✕ ferme la fenêtre.

![La fenêtre Kanban du bureau de la PR site#2042](../img/retours-kanban.png)

## Le panneau

Au 3e, le panneau liste les bureaux (la PR, son auteur, le poste en cours, la barre des postes, les fils par colonne), puis les PR en attente d'un bureau et celles en panne (relance « 🛠 Corriger » sur la PR). Un clic sur un bureau, dans le panneau ou sur le plan, ouvre sa fiche : l'état de chaque poste, les fils par colonne et, quand elle t'attend, la carte de validation (le diff, les réponses prévues, « Approuver » pour pousser). Un clic sur le boss ouvre sa fiche, la même qu'au RDC.

## Depuis le RDC

- **Le fil de la journée** : une PR qui monte au 3e, ses corrections qui t'attendent, les corrections poussées et les réponses postées, un poste en panne. Un clic monte au 3e et ouvre le bureau de la PR ; « ⏵ revoir » rejoue le moment sur le plan du 3e.
- **⌘K** trouve les PR du 3e par leur nom, leur dépôt, leur titre, leur auteur ou le poste en cours.
- **Le mode TV** : le bouton d'étage (ou la touche E) passe par le 3e ; `?tv=1&floor=alt` y passe quand il a une PR.
- **Les scènes** (« Comment lire le plan ») au 3e : une PR monte au 3e, le Kanban avance, à toi de valider, la PR est poussée, contrôles rouges, le soir au 3e. Elles se jouent à toute heure, depuis les PR de la démo quand aucune n'est en cours.
- **Le rejeu** : le curseur du temps reconstruit l'étage à l'heure choisie, d'après les moments du relevé.

## Données

Le dataset `retours`, publié chaque minute par le cron live (`workflows/retours_snapshot.py`, 0 token), lit les runs du modèle dans Kronn et, pour chacun, l'état que garde le workflow (`~/.cache/pixel-bureau/pr/runs/<run>.json` : la PR, son auteur, ses fils en bref). La colonne d'un fil vient de l'avancement que l'agent écrit au fil de son travail (`.bureau-fix-progress.json` du dossier de travail : le fil en cours et ceux qu'il a finis), puis, une fois l'agent fini, de l'icône de sa réponse prévue ; un fil sans réponse est laissé. Après la mise à jour : `python3 tools/install.py` (crée le dataset), puis `publish.py all`.
