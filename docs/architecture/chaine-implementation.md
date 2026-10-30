# Chaîne d'implémentation d'un ticket (#76, #125)

> Modèles `workflows/templates/impl*.json`, script `workflows/chaine.py`, réglage `impl` (pack ou config). Relevé le 2026-10-30.

## Forme

Un ticket avance sur une chaîne de postes. Un poste = un sous-workflow Kronn à but unique, avec son agent, son modèle et ses skills [src: file: tools/templates.py:IMPL_AGENTS].

```
impl (lanceur, 0 token)          composant Jira -> dépôt -> projet Kronn ; un seul passage par ticket ; POST /workflows/{chaîne}/trigger avec project_id
└─ impl_chain (parent, 19 étapes, project_scope All, require_isolation, concurrency_limit 4)
   ticket · prepare · [cadrage] · questions · ✋gate_questions · [schema] · [patterns] · orchestrateur_plan · ✋gate_plan
   · commente_plan · mode · [code] · [controles] · orchestrateur · aiguillage · ✋gate_escalade · [livraison] · ✋gate_pr · [publication]
   controles = quoi · [regles] · [securite] · [tests] · [perf] · [revue] · bilan
```

`[x]` = sous-workflow `impl_x`. Chaque poste a de la place pour grandir : 20 étapes par workflow, comptées séparément pour chaque sous-workflow [src: url: https://github.com/DocRoms/Kronn/blob/main/backend/src/api/workflows.rs].

## Règles du moteur qui dictent la forme

- Kronn refuse un sous-workflow qui contient une gate : les quatre gates sont dans le parent.
- Un sous-workflow sans projet tourne dans le projet et la copie de travail de son parent : les postes n'ont pas de `project_id` (`SHARED_WORKSPACE`), le parent a `project_scope: All` et pas de projet ; c'est le lanceur qui choisit le projet au lancement (`project_id` du trigger). Une étape `TriggerWorkflow` ne sait pas passer de projet, d'où l'Exec du lanceur qui appelle l'API.
- Le commentaire d'une gate « Changements » n'est injecté que dans le prompt d'une étape Agent. Une gate qui renvoie à un sous-workflow perdrait le commentaire : la chaîne le passe aux postes par leur variable `retours` (`{{state.last_human_feedback ?? ""}}`), le poste l'ajoute au dossier (`retours.md`, une seule fois par texte).
- `on_result` ne lit que les signaux : `exit_3`/`exit_4` d'un Exec pour brancher, `SUBWF_FAILED` pour un poste en panne.
- Un Goto compte ses passages par arête (source, cible) sur tout le run : les essais par lot sont comptés par le script (`lots.json`), pas par `max_iterations`.

## Le dossier du ticket

`.kronn/chaine/` dans la copie de travail (ignoré par git) : `ticket.md`, `etat.json` (dépôt, base, branche `kronn/<ticket>`, tours, PR, CI, env), un rapport par poste (`<poste>.json`), `plan.json` et `lots.json`, `controles.json`, `retours.md`. Les postes lisent ce qu'ont écrit les précédents ; l'orchestrateur lit tout.

## Allers-retours

- Dans un poste d'analyse ou de contrôle : `propose` (agent) puis `critique` (un second agent, sans écriture), `tri` renvoie à `propose` tant que le critique dit `revoir`, 3 propositions au plus.
- Dans le code : par lot, `code_lot` puis `verif` (commandes du dépôt) puis `relecture` ; `tri_lot` refait le lot tant que c'est rouge, 3 essais.
- Entre les contrôles et le code : l'orchestrateur décide `livrer`, `retour_code` (consignes) ou `humain` ; `aiguillage` compte les tours (`impl.max_tours`, 3) puis passe la main à la gate d'escalade.
- Un poste bloquant (règles, sécurité, tests par défaut ; `impl.postes.<poste>.bloquant`) ne s'écarte que par les réglages ; l'orchestrateur peut écarter perf et revue d'un ticket.

## Réglage `impl`

`repos.<owner/dépôt>` : `base`, `checks.regles` et `checks.tests` (commandes `sh`, chaîne ou `{cmd, subdir}`, emplacements `{worktree}`, `{main}`, `{php}`, `{ts}`, `{tests_php}`, `{tests_ts}`, `{files}` ; une commande dont les fichiers visés manquent est sautée), `ci_label`, `env_label`, `env_url`, `reviewers`. `components.<composant>` quand un composant ne porte pas le nom de son dépôt. `postes.<rôle>` (`cadrage`, `cadrage.critique`, `code`, `revue`…) : `agent`, `tier`, `model`, `skills` en plus, `actif`, `bloquant`. `skills` et `guidelines` de l'équipe pour le code et les contrôles. `max_tours`, `max_lots`.

Vérifier en conteneur jetable depuis la copie de travail : le projet Compose d'une copie de travail n'a pas de conteneur (nom de dossier), un `docker compose exec` y échouerait sans bruit ; `docker run --rm -v {worktree}/…:/app -v {main}/…/vendor:/app/vendor:ro …` marche (dépendances partagées tant que le verrou n'a pas changé).

## Tests

`tests/test_chaine.py` : rendu des modèles (gates, sous-workflows, agents par poste) et `workflows/chaine.py` étape par étape dans un dépôt git jetable.
