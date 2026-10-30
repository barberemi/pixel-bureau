# Chaîne d'implémentation d'un ticket (#76, #125)

> Modèles `workflows/templates/impl*.json`, script `workflows/chaine.py`, réglage `impl` (pack ou config). Relevé le 2026-10-30.

## Forme

Un ticket avance sur une chaîne de postes. Un poste = un sous-workflow Kronn à but unique, avec son agent, son modèle et ses skills [src: file: tools/templates.py:IMPL_AGENTS].

```
impl (lanceur, 0 token)          composant Jira -> dépôt -> projet Kronn ; un seul passage par ticket ; POST /workflows/{chaîne}/trigger avec project_id
└─ impl_chain (parent, 20 étapes, project_scope All, require_isolation, concurrency_limit 4)
   ticket · prepare · [cadrage] · questions · ✋gate_questions · [schema] · [patterns] · dossier · orchestrateur_plan · ✋gate_plan
   · mode · commente_plan (Plan seulement, puis Stop) · [code] · [controles] · orchestrateur · aiguillage · ✋gate_escalade
   · [livraison] · ✋gate_pr · [publication]
   controles = quoi · [regles] · [securite] · [tests] · [perf] · [revue] · bilan
```

`[x]` = sous-workflow `impl_x`. Chaque poste a de la place pour grandir : 20 étapes par workflow, comptées séparément pour chaque sous-workflow [src: url: https://github.com/DocRoms/Kronn/blob/main/backend/src/api/workflows.rs].

## Règles du moteur qui dictent la forme

- Kronn refuse un sous-workflow qui contient une gate : les quatre gates sont dans le parent.
- Un sous-workflow sans projet tourne dans le projet et la copie de travail de son parent : les postes n'ont pas de `project_id` (`SHARED_WORKSPACE`), le parent a `project_scope: All` et pas de projet ; c'est le lanceur qui choisit le projet au lancement (`project_id` du trigger). Une étape `TriggerWorkflow` ne sait pas passer de projet, d'où l'Exec du lanceur qui appelle l'API.
- Le commentaire d'une gate « Changements » n'est injecté que dans le prompt d'une étape Agent. Une gate qui renvoie à un sous-workflow perdrait le commentaire : la chaîne le passe aux postes par leur variable `retours` (`{{state.last_human_feedback ?? ""}}`), le poste l'ajoute au dossier (`retours.md`, une seule fois par texte).
- `on_result` ne lit que les signaux : `exit_3`/`exit_4` d'un Exec pour brancher, `SUBWF_FAILED` pour un poste en panne.
- Un Goto compte ses passages par arête (source, cible) sur tout le run, et une étape en code non nul dont le Goto a épuisé `max_iterations` **échoue** au lieu de continuer : tous les tours (propositions, essais par lot, tests, tours de contrôle) sont comptés par le script, qui rend 0 au dernier ; `max_iterations` n'est qu'un filet.
- Une référence `{{steps.x.data_json}}` à une sortie d'agent sans enveloppe (`on_invalid: Continue`) est inconnue et Kronn refuse de rendre l'étape : toute référence à une sortie d'étape a un repli `?? …` (posé par le générateur).
- Le shadow de Kronn ne rejoue pas un workflow à variables : l'instantané chiffré des variables est rangé sous l'id du run normal, le run shadow s'arrête sur « snapshot unavailable ». D'où le mode **essai** : toute la chaîne sans push, sans PR, sans Jira (le script saute ces étapes, `reviewers` sort en 5 pour sauter le commentaire Jira).

## Robustesse (essais du 2026-10-30)

- Sorties d'agent : champs exigés au premier niveau seulement, `on_invalid: Continue` partout sauf le plan de l'orchestrateur (une clé mal écrite dans un élément de liste faisait tomber la chaîne).
- Schéma ou Patterns en panne : la chaîne continue, l'orchestrateur fait leur travail et le signale. Un contrôle en panne : le bilan le signale.
- L'orchestrateur reçoit le dossier dans son prompt (étape `dossier`, bilan des contrôles) : une lecture de fichiers par l'agent a été coupée par un faux positif des garde-fous de l'API.
- Une nouvelle tentative par étape Agent (`retry`).
- Le lanceur passe par `/mcp/workflow-trigger` (JSON, détaché) : `/workflows/{id}/trigger` est un flux SSE qui ne répond qu'à la première pause du run. Les variables d'un run étant chiffrées, il reconnaît un ticket déjà sur la chaîne à la sortie de l'étape `prepare` des runs actifs.

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
