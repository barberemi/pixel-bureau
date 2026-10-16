# Mise en prod d'une PR

Une mise en prod part d'une **PR**, de n'importe quel dépôt réglé pour : pour un ticket qui a une PR sur deux dépôts, tu lances deux mises en prod, dans l'ordre que tu veux. Le workflow « Mise en prod d'une PR » est un modèle du Bureau (`workflows/templates/mep.json`, script `workflows/mep.py`), créé et mis à jour par `publish.py workflows` : on le modifie dans le dépôt, jamais dans l'éditeur de Kronn.

![Lancer une mise en prod depuis la fiche de l'agent](../img/lancer-mep.png)

## Lancer

- **Fiche de l'agent** qui incarne le workflow (« ▶ Lancer… ») : le projet (liste des dépôts réglés), le n° de PR, et le ticket seulement si la détection se trompe.
- **Fiche d'une PR**, ou chaque PR de la fiche d'un ticket : « 🚀 Mise en prod » (PR ni brouillon ni avec changements demandés ; grisé les jours de gel). Kronn relit le dépôt et le numéro dans le dataset `actions` : rien à saisir.
- **Kronn**, directement, avec les mêmes variables : `project` (dépôt ou nom court), `pr_number`, `jira_ticket_key` (facultatif), `dry_run` (`oui` = simulation).

Le **ticket** est déduit de la PR : la première clé du projet Jira (`jira.project`) trouvée dans le nom de la branche, puis le titre, puis la description. Sans ticket, la mise en prod s'arrête tout de suite : relance avec « Ticket ».

## Les étapes

| Étape | Ce qu'elle fait |
| --- | --- |
| resolve | lit la PR (ouverte), déduit le ticket |
| fetch_ticket_type | type du ticket dans Jira |
| tag | prochain tag : Bug = correctif (`2.4.0` → `2.4.1`), sinon fonctionnalité (`2.4.0` → `2.5.0`) |
| **gate du début** | la PR, le ticket, le tag, les déploiements et l'aperçu de l'annonce : approuver lance la mise en prod |
| teams_post | l'annonce Teams ⏳ dans le canal des mises en prod |
| rebase | rebase sur la base de la PR, squash en un commit, push protégé (`--force-with-lease`), dans une copie du dépôt sous `~/.cache/pixel-bureau/mep` |
| citest | label de la CI reposé, attente du résultat (25 min au plus) |
| **gate** | tests verts : merger ? |
| merge | l'annonce passe au chargeur animé (mise en prod en cours), puis merge en rebase |
| **gate** | créer la release ? |
| release | release du tag (« 2.4.1 - EW-7801 »), notes générées par GitHub |
| staging | déploiement staging avec les entrées du projet, attente |
| **gate** | staging en ligne : la prod ? |
| prod | déploiement prod, attente, l'annonce passe en ✅, puis les PR du ticket dans tous les projets |
| **gate de fin** | le ticket est-il terminé ? |
| ai_feedback, transition_deployed | si terminé : retour IA sur toutes les PR mergées du ticket, puis statut de fin |
| done | fin ; « Changements » sur la gate de fin y mène directement (le ticket reste en l'état, le run finit en succès) |
| teams_failed | seulement après l'échec d'une étape : l'annonce passe en ❌, la raison et le run en réponse dans le fil, et le run finit en échec |

Un refus sur une gate arrête la mise en prod là où elle en est ; l'annonce Teams reste alors en l'état (édite-la ou supprime-la dans Teams). Chaque échec a son code (conflit de rebase, push refusé, CI rouge, déploiement en échec, délai dépassé) et son message dans le run.

**Simulation** (`dry_run` = oui) : tout est lu pour de vrai (PR, ticket, dernière release, CI), le rebase et le squash se font dans la copie locale, mais rien n'est poussé, mergé, créé ni déployé.

## L'annonce Teams

![L'annonce, éditée à chaque étape](../img/annonce-mep.png)

Un seul message par mise en prod, une carte sur trois lignes à côté du logo du projet : le projet, `MEP <tag>`, le titre de la PR. Devant le logo, l'état : ⏳ annoncée, un chargeur animé pendant la mise en prod (merge cliqué), ✅ en prod, ❌ en échec (la raison en réponse dans le fil). Le logo ne change jamais de taille ni de place. Le message part à ton nom (jeton `az login`, Microsoft Graph) ; en simulation, dans le canal de test. Une erreur Teams n'arrête jamais la mise en prod : elle est seulement signalée dans le run.

Images : `tools/teams_logo.py` (Pillow) fait le chargeur commun (`sprites/teams/loader.png`, APNG de 12 images) et, pour un projet sans logo, une pastille à initiales (`badge API "#7c3aed" logos/front_api.png`), ou réduit un vrai logo à 48 px (`logo source.png …`). Teams n'accepte que PNG et JPEG, et limite l'édition d'un message à 28 Ko : chargeur et logo compris, la carte reste en dessous.

## Réglages (`bureau.config.json`)

- Par projet, une clé `mep` sur `github` (dépôt principal) ou sur une entrée de `github.deploys` ; seuls ces projets sont proposés. `staging_workflow` et `prod_workflow` restent ceux de l'entrée.
  ```json
  "mep": {"ci_workflow": "CI_Quality-test.yaml", "ci_label": "ci-test",
          "staging_inputs": {"envchoice": "stg", "versionTag": "{tag}"},
          "prod_inputs": {"versionTag": "{tag}"}, "staging_url": "https://…"}
  ```
  `{tag}` devient le tag de la release. Sans `ci_workflow`, l'étape de CI est passée. `logo` : PNG du projet, chemin relatif au pack d'équipe (`logos/front_api.png`).
- `mep.teams` : `{"team": "<id de l'équipe>", "channel": "<id du canal>", "test_channel": "<canal des simulations>"}` (et `test_team` s'il est dans une autre équipe). Sans elle, pas d'annonce.
- `mep.feedback_qp` (Quick Prompt du retour IA, qui retrouve lui-même les PR mergées du ticket), `mep.feedback_vars` (ses autres variables, passées vides), `mep.done_transition` (id de la transition Jira de fin). Sans eux, ces étapes sont retirées ; sans Jira, aussi la gate de fin.
- L'id du workflow est rangé dans `launch.mep_pr` (jamais dans `workflows` ni `actions`) : l'agent qui l'incarne (préfixe de l'id dans `agents[].wf`) garde sa fiche, « ▶ Lancer… » et sa fiche de paie. L'ancien bouton « Mettre en prod » du ticket (`launch.mep`) reste tant que cette clé existe.
