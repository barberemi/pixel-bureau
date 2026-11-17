# Kronn ne rend plus les variables de lancement d'un run

Depuis octobre 2026 (relevé le 2026-11-17 sur l'API locale, `GET /workflows/<id>/runs`), `trigger_context` d'un run lancé à la main ne porte plus que `type`, `triggered_at`, `variables_resolved_at` et `execution_snapshot_id` : les variables sont rangées dans un instantané que l'API n'expose pas, ni dans la liste ni dans le détail du run. Seuls les items d'un BatchWorkflow gardent `current_task.*` (la revue d'une PR, `review_child` ; le modèle ticket, `ticket_un`) ; les sous-workflows ne gardent que `__subwf_depth__`. `run_row` de `workflows/_lib.py` ne les trouvait donc plus : `vars: {}` pour tout run manuel [src: file: workflows/_lib.py:265].

## Ce que la page perdait (relevé du 2026-11-17)

| Workflow (modèle) | Variables lues par la page | Perte |
|---|---|---|
| Mettre en prod une PR (`mep_workflow`) | `jira_ticket_key`, `project` (`mepProject`), `pr`, `repo` (`runRef`) | « Pilote la MEP » sans clé, run absent de la fiche du ticket (`agentBusy`), du fil et du collègue (`runPartner`) [src: file: page/src/35-state.js:386] [src: file: page/src/62-ticket.js:66] |
| Implémenter un ticket (`impl`) | `jira_ticket_key` | run rattaché à aucun ticket |
| Réestimer (`estimate`), Me l'affecter / désaffecter (`assign`, `unassign`) | `jira_ticket_key` | idem |
| Relire une PR à la demande (`review_one`) | `pr`, `repo` | run rattaché à aucune PR |
| Investiguer un message de Support (`support`) | `message_id` | rien de visible : la page relie aussi par `t.run.run`, et `support.py` lisait déjà son cache [src: file: page/src/48-support.js:19] [src: file: workflows/support.py:317] |
| Corriger les commentaires (`actions.fix_pr`) | hors des runs de la page ; `retours_snapshot.py` lisait `repo` et `pr` | au 3e, toutes les pannes avaient la même clé vide : une seule montrée |
| Commenter un ticket (`actions.comment`) | `jira_ticket_key`, `comment` (fil « tes actions » d'`office_snapshot.py`) | clé et texte vides ; aucune source fiable (la réponse Jira ne donne pas la clé), toujours perdu |
| Chaîne (`impl_chain` et postes), temps gagné IA (`ai_time`), déployer (`deploy`), env de branche (`env`) | variables `ticket` ou `pr_number`, jamais gardées par `VARS_KEPT` | rien : la page ne les lisait déjà pas |

## Où elles sont reconstituées

`workflows/_vars.py` (`run_vars`), appelé après `run_row` par `office_snapshot.py` et `live_snapshot.py`, recopié au rendu dans ces deux seuls relevés (`LIB_IMPORT` de `tools/templates.py`) pour ne pas grossir `_lib.py` (copié dans `chaine.py`, à 97,5 % de `MAX_SCRIPT`). Ordre, jamais inventé (valeur mal formée ou absente : `{}`) :

1. `trigger_context`, s'il les porte encore (Kronn d'avant) ;
2. le cache que le workflow écrit lui-même : `~/.cache/pixel-bureau/mep/runs/<run>.json` (étape `resolve` de `mep.py` : `ticket`, `pr`, `repo`, et `project` = le dépôt), `support.json` › `runs` › `msg` ;
3. la sortie d'une étape connue, dans le détail du run (la liste n'a pas les sorties) : `resolve` (la clé seule), l'ApiCall Jira `ticket` / `get_ticket` (`key`), l'ApiCall GitHub `fetch_meta` (`number`, `base.repo.full_name`). Lue seulement une fois l'étape réussie, puis gardée dans `~/.cache/pixel-bureau/vars/<run>.json` : un passage suivant ne relit pas le détail.

Au 3e, `vars_of` de `retours_snapshot.py` prend la PR dans l'état du run que garde `pr_update.py`. Tests : `tests/test_vars.py`, `test_snapshots_rebuild_the_launch_variables_kronn_no_longer_returns` (`tests/test_scripts.py`), `test_failures_without_launch_variables_keep_their_pr_from_the_run_state` (`tests/test_retours.py`), et côté page `tests/ticket.test.js`, `tests/state.test.js`.

Un nouveau workflow dont la page doit lire les variables : écrire ses variables dans un cache à lui (comme `mep.py`) ou ajouter son étape de résolution à `_STEPS` de `_vars.py`, avec un test.
