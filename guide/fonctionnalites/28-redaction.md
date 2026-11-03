# La rédaction et la revue (2e étage)

Au 2e étage, deux salles de part et d'autre d'un couloir : à gauche, la rédaction des tickets ([Créer un ticket](20-creer-ticket.md)) ; à droite, la revue des PR (« Faire relire » et la revue automatique des PR ouvertes).

## Monter au 2e

L'onglet « ✍ 2e · rédaction » apparaît entre le 1er et le 3e dès que le modèle « créer un ticket » est installé. Le chiffre compte les intentions en rédaction et les PR en revue, « ✋ n » les tickets qui attendent ton tampon.

## La salle de rédaction

![La rédaction : une intention découpée en trois tickets, la critique au travail, le fil rouge](../img/redaction.png)

- **Les bibliothèques**, une par composant Jira de l'équipe (les quatre premiers de `jira.create.components`, puis « autres ») : celles que l'intention touche s'allument.
- **Les postes**, des reporters en chapeau mou et carte de presse : 📚 Recherche (à la bibliothèque), ✍ Rédaction et 🧐 Critique, face à face à la table. Les versions des tickets sont posées sur la table, et « ↺ critique → rédaction · tour 2/3 » dit quand la critique renvoie à la rédaction (trois tours au plus). Même langage qu'aux autres étages : au travail (halo, bulle), a travaillé (✓), attend son tour (gris).
- **Le fil rouge** part de ton intention, punaisée au liège, passe par la recherche et la rédaction, puis se divise en un brin par ticket quand l'intention est découpée. Une carte par ticket, à sa couleur : attend la critique, en cours, t'attend, créé, écarté.
- **Le bureau du boss**, celui du RDC (« WORLD'S BEST BOSS »), le tampon et son encreur posés dessus : le boss y est toujours assis, et tamponne la liste des tickets (« ✋ 3 tickets : je tamponne ? ») ; tes « Changements » renvoient à la rédaction. Les tickets partent ensuite un par un : les brins des tickets créés vont jusqu'à la boîte Jira.
- **Le banc**, en bas à gauche, pour les reporters qui ne travaillent pas, comme au 1er.
- Jusqu'à trois intentions en même temps : la table montre la plus ancienne, un clic sur le liège passe à la suivante.

![Le tampon : le premier ticket créé, le deuxième t'attend](../img/redaction-tampon.png)

## La salle de revue

- **Un bureau par PR en revue**, six au plus : le relecteur, la visière verte des correcteurs, derrière son écran, et en face, de dos, l'auteur de la PR. Pour ta PR, ou celle de quelqu'un hors de l'équipe, l'auteur est un agent remplaçant.
- **Sous chaque bureau, les étapes de son run**, telles que le workflow les déclare (📥 fils, 🔒 sécu, 🧠 lecture, ✍ avis…) : une étape ajoutée à la revue y apparaît d'elle-même.
- **Le tableau noir des revues du jour** : les PR en lecture, les revues postées, les jetons.
- **Un banc** pour les relecteurs libres.

## Le soir et le week-end

L'étage passe en veilleuse : seuls ceux qui travaillent et le boss gardent leur lumière.

## Depuis le RDC

Le fil de la journée (une intention qui arrive, un ticket qui attend ton tampon, un ticket créé), ⌘K (les intentions par leur texte, leurs tickets, leurs composants), le mode TV (touche E et `?floor=alt`), et les scènes de l'étage dans la galerie : une intention découpée, le tampon, les tickets qui partent dans Jira.

## Données

Le dataset `redaction`, publié chaque minute par le cron live (`workflows/redaction_snapshot.py`, 0 token) : les runs du modèle et de chaque ticket, et le dossier de chaque run (`~/.cache/pixel-bureau/ticket/<run>/` : la demande, les rapports des postes, les versions, les tickets créés). La revue se lit dans les runs de relecture (le sous-workflow de la revue). Après la mise à jour : `python3 tools/install.py` (crée les sous-workflows et le dataset), puis `publish.py all`.
