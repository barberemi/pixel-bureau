# La rédaction et la revue (2e étage)

Au 2e étage, deux salles de part et d'autre d'un couloir : à gauche, la rédaction des tickets ([Créer un ticket](20-creer-ticket.md)) ; à droite, la revue des PR (« Faire relire » et la revue automatique des PR ouvertes).

## Monter au 2e

L'onglet « ✍ 2e · rédaction » apparaît entre le 1er et le 3e dès que le modèle « créer un ticket » est installé. Le chiffre compte les intentions en rédaction et les PR en revue, « ✋ n » les tickets qui attendent ton tampon.

## La salle de rédaction

![La rédaction : une intention découpée en trois tickets, la critique au travail, le fil rouge](../img/redaction.png)

- **Les bibliothèques**, une par composant Jira de l'équipe (les quatre premiers de `jira.create.components`, puis « autres ») : celles que l'intention touche s'allument.
- **Les postes**, des reporters en chapeau mou et carte de presse : 📚 Recherche (à la bibliothèque), ✍ Rédaction et 🧐 Critique, face à face à la table. Les versions des tickets sont posées sur la table, et « ↺ critique → rédaction · tour 2/3 » dit quand la critique renvoie à la rédaction (trois tours au plus). Même langage qu'aux autres étages : au travail (halo, bulle), a travaillé (✓), attend son tour (gris).
- **Le fil rouge** part de ton intention, punaisée au liège, passe par la recherche et la rédaction, puis se divise en un brin par ticket quand l'intention est découpée. Une carte par ticket, à sa couleur : attend la critique, en cours, t'attend, créé, écarté.
- **Le bureau du boss** (un pack d'équipe peut donner au boss un dessin pour cet étage, `redaction_sprite` dans le roster, par exemple en libraire qui lit à son bureau), celui du RDC (« WORLD'S BEST BOSS »), le tampon et son encreur posés dessus : le boss y est toujours assis, et tamponne la liste des tickets (« ✋ 3 tickets : je tamponne ? ») ; tes « Changements » renvoient à la rédaction. Les tickets partent ensuite un par un : les brins des tickets créés vont jusqu'à la boîte Jira.
- **Le banc**, en bas à gauche, pour les reporters qui ne travaillent pas, comme au 1er.
- Jusqu'à trois intentions en même temps : la table montre la plus ancienne, un clic sur le liège passe à la suivante.

![Le tampon : le premier ticket créé, le deuxième t'attend](../img/redaction-tampon.png)

## La salle de revue

- **Un bureau par PR en revue**, six au plus : le relecteur, la visière verte des correcteurs, derrière son écran, et en face, de dos, l'auteur de la PR. Pour ta PR, ou celle de quelqu'un hors de l'équipe, l'auteur est un agent remplaçant.
- **Sous chaque bureau, les postes de sa revue**, lus du run : 🗺 contexte (le sens de la PR, ce qui est à risque), 📚 docs (les conventions du projet et la doc tenue à jour), 🔍 lecture (le code et ses tests), 🔒 sécu (sautée quand le diff ne touche rien de sensible), puis 🧐 avis (il vérifie les constats et rédige la review) et ✍ postée. La bulle du relecteur dit quel poste travaille.
- **La file du cron** : le cron des revues retient plusieurs PR à chaque passage, mais elles sont relues l'une après l'autre au premier bureau. Bernard monte la fournée sur son transpalette et range un dossier par PR dans le casier « À relire », dans l'ordre du cron (six cases, puis « +n »). Le relecteur va chercher le dossier du haut, les autres remontent d'une case ; l'avis posté, il tamponne le dossier de son verdict (✅ 💬 🔧) et le pose dans la corbeille « Postées », que Bernard vide au passage suivant du cron. Les auteurs attendent en salle d'attente, une chaise par personne et une pancarte qui compte leurs PR restantes : on reste au bureau si sa PR suivante est la prochaine, on retourne s'asseoir si quelqu'un passe avant, on ne redescend qu'après sa dernière PR, ses verdicts au-dessus de la tête. Les revues à la demande (« Faire relire ») prennent les autres bureaux.
- **Le tableau noir des revues du jour** : les PR en lecture, celles qui attendent (et l'heure du cron), les revues postées, les jetons.
- **Un banc** pour les relecteurs libres.

## Le soir et le week-end

L'étage passe en veilleuse, comme le RDC la nuit : la salle de rédaction s'allume comme une pièce tant qu'une intention y est, et chaque bureau de la revue quand une PR y est lue ; les bureaux libres restent dans l'ombre. Chaque agent au travail a sa lampe et son écran, et la lampe du bureau du boss reste allumée.

## Depuis le RDC

Le fil de la journée (une intention qui arrive, un ticket qui attend ton tampon, un ticket créé), ⌘K (les intentions par leur texte, leurs tickets, leurs composants), le mode TV (touche E et `?floor=alt`), et les scènes de l'étage dans la galerie : une intention découpée, le tampon, les tickets qui partent dans Jira, le soir au 2e.

## Données

Le dataset `redaction`, publié chaque minute par le cron live (`workflows/redaction_snapshot.py`, 0 token) : les runs du modèle et de chaque ticket, et le dossier de chaque run (`~/.cache/pixel-bureau/ticket/<run>/` : la demande, les rapports des postes, les versions, les tickets créés). La revue se lit dans les runs de relecture (le sous-workflow de la revue). Après la mise à jour : `python3 tools/install.py` (crée les sous-workflows et le dataset), puis `publish.py all`.
