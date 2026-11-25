# La mémoire du soir

Les agents du Bureau refont parfois une erreur que tu as déjà corrigée la veille. La mémoire du soir sert à ça : chaque soir à 22 h, un cron relit tes retours du jour et un agent les réécrit en leçons courtes. Tu valides, et les agents les lisent dès leur run suivant.

Elle alimente quatre workflows : l'écriture de ticket (2e étage), la chaîne d'implémentation (1er), la revue de PR (2e) et la correction des commentaires d'une PR (3e).

## Ce qui est relevé

Rien de plus à faire de ton côté : le cron lit ce que les workflows gardent déjà, sans jetons.

- **Écriture de ticket** : ce que tu écris quand tu demandes des « Changements » au tampon.
- **Chaîne d'implémentation** : tes « Changements » aux gates du plan, de l'escalade et de la PR. Les essais de la chaîne sont écartés.
- **Revue de PR** : un bloquant que la passe suivante a dû réfuter, avec sa preuve. C'est une revue qui s'est trompée.
- **Correction des commentaires** : ton message « Changements » à la validation du diff.

S'il n'y a rien de nouveau, le run s'arrête là, sans agent ni jetons.

## Le marchand de sable

Tant que la gate attend, le marchand de sable vient la porter : un monsieur brun à la cape verte et à l'écharpe rayée, debout sur son nuage, son ours à côté. Il fait le tour des îlots de l'open space, s'arrête en haut de chacun, son nuage par-dessus les bureaux (une minute et demie), y sème un peu de sable, puis passe au suivant. Sa bulle dit combien de leçons t'attendent, le nombre en rouge.

![Le marchand de sable sur son nuage au-dessus d'un îlot, son ours à côté, la bulle « 3 leçons à valider »](../img/marchand.png)

Un clic sur lui ouvre sa fiche avec la validation. Elle est aussi chez le boss, comptée une fois, comme les règles du facteur. À son arrivée, la loupe l'agrandit et le fil le note (onglet Tout) ; « Comment lire le plan » › 🎬 Scènes le rejoue (« ▶ voir »). La gate décidée, il repart par la porte.

## Ce que tu valides

Une gate « 🧠 Mémoire du soir » s'ouvre sur la page, comme les autres validations. Elle montre :

- en première ligne, le nombre de leçons à valider (et celles retirées), puis le résumé de ce que la journée a appris ;
- un diff par fiche changée, avec la raison ;
- parfois, des leçons « à graver dans le dépôt » : une règle qui revient souvent et mérite d'aller dans la doc du dépôt, une skill ou les consignes de l'équipe. Ça, c'est à toi de le faire, en PR.

Elle t'attend jusqu'à trois jours : celle de 22 h se valide le lendemain matin, celle du vendredi soir le lundi. Tant qu'elle est ouverte, le soir suivant ne relance rien ; les retours de ces jours-là passent au relevé d'après.

**Approuver** écrit les fiches. **Changements** renvoie la proposition à l'agent avec ton message. **Rejeter** laisse tout tel quel.

## Les fiches

Une fiche commune (`equipe.md`) et une par workflow (`ticket.md`, `impl.md`, `revue.md`, `correction.md`), dans `~/.local/share/pixel-bureau/memoire/`. Une leçon par ligne. Une ligne qui commence par `[code]`, `[redaction]` ou `[avis]` ne va qu'à ce poste.

Elles restent courtes : 25 leçons pour la commune, 40 pour les autres. L'agent fusionne, reformule et oublie plutôt que d'ajouter. Tu peux aussi les modifier à la main, ce sont de simples fichiers texte. Chaque validation garde les versions précédentes dans `versions/`.

Tant qu'une fiche est vide, le workflow travaille comme avant. Pour l'écriture de ticket, les retours bruts des autres intentions restent utilisés jusqu'à ce que la fiche `ticket` ait ses premières leçons.

## Réglages

Dans `bureau.config.json`, sous `memoire` (tout est facultatif) :

| Réglage | Défaut | Effet |
|---|---|---|
| `actif` | `true` | `false` : rien n'est relevé ni lu, le cron n'est pas créé |
| `workflows` | les quatre | ceux qui lisent leur fiche et dont les retours sont relevés : `ticket`, `impl`, `revue`, `correction` |
| `heure` | `22` | l'heure du cron, à l'heure du bureau, du lundi au vendredi |
| `dossier` | `~/.local/share/pixel-bureau/memoire` | où vivent les fiches et le journal |

Après la mise à jour : `git pull && python3 tools/upgrade.py` crée le cron « mémoire du soir », puis publie.

## Voir si ça marche

Les bilans classent déjà les retours par cause : « Chaîne · bilan », « Rédaction · bilan » et « Retours · bilan ». Si une cause ne baisse pas dans les jours qui suivent une leçon, c'est que la leçon ne sert pas : rejette-la ou reformule-la.
