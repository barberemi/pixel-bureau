# Ajouter un dataset ou un workflow du Bureau

Recette relevée dans le code (2026-10-12). Pour le cadre général, voir [architecture/overview](../architecture/overview.md).

## Nouveau dataset de page

1. Le déclarer dans `DATASETS` de l'installateur [src: file: tools/install.py:27]. Une page neuve est créée avec toute la liste [src: file: tools/install.py:540] ; sur une installation existante, relancer `python3 tools/install.py` ajoute les datasets manquants sans doublon [src: file: tools/install.py:529]. `tools/publish.py` ne crée pas de dataset.
2. Le remplir depuis un workflow : étape `PublishPageData` avec `page_publish.writes` (`dataset`, `operation: "replace"`, `value_from: "steps.<étape>.data.stdout"`) [src: file: workflows/templates/canard.json:158] [src: file: workflows/templates/canard.json:162].
3. Le lire dans la page par une fonction `readXxx(src)` sur `src.datasets.<nom>` (voir [coding-rules](../coding-rules.md)) [src: file: page/src/36-absences.js:9].
4. Mettre à jour le nombre de datasets cité dans [architecture/overview](../architecture/overview.md) (diagramme) si besoin.

## Nouveau workflow ou cron

1. Ajouter le modèle `workflows/templates/<clé>.json` et son entrée dans `TEMPLATES` : type, emplacement de l'id dans la config (`workflows` pour un cron, `actions` pour un bouton), scripts par étape [src: file: tools/templates.py:24].
2. Un cron utilise `@@cron_hours@@` dans `trigger.schedule` [src: file: workflows/templates/canard.json:9] et sa clé doit être ajoutée à la liste de `cron_schedules` pour apparaître dans le planning de la page [src: file: tools/assemble.py:99].
3. S'il dépend d'une connexion optionnelle, l'ajouter à `skipped()` [src: file: tools/templates.py:126].
4. `python3 tools/publish.py workflows` (humain seul) crée d'abord les workflows absents de la config (id rangé dans `bureau.config.json`), puis rend tous les modèles : chaque script embarque la config, et un cron rendu avant la création d'un workflow du Bureau le prendrait pour un agent (`BUREAU_IDS`, `workflows/_lib.py`) [src: file: tools/publish.py:35]. Pour un bouton de page (clé `actions`), lancer `publish.py workflows` **avant** `publish.py page` : la page assemblée avant la création de l'id garde l'action désactivée (`ACTIONS.<clé>` à false) jusqu'à la publication suivante [src: user:mainteneur:2026-10-12: KT-27].
5. Branchement (`on_result`) : Kronn ne retient une règle que si une des 5 dernières lignes de la sortie **finit par** `[SIGNAL: <contains>]` ; une étape Exec émet `[SIGNAL: OK]` ou `[SIGNAL: ERROR]`, puis `[SIGNAL: exit_<code>]`. Écrire `ERROR` (tout code non nul) ou `exit_7` (un code), jamais un préfixe comme `exit_`, qui ne correspond à rien [src: file: workflows/templates/mep.json:198] [src: url: https://github.com/DocRoms/Kronn/blob/main/backend/src/workflows/steps.rs].
6. Tests : un script de `workflows/` se teste dans `tests/test_scripts.py` ; les modèles par `tests/test_templates.py` (voir [testing-quality](../testing-quality.md)).
7. Lancer un autre modèle depuis un workflow : `SubWorkflow` attend l'enfant mais Kronn refuse tout enfant qui contient une étape `Gate`, même jamais atteinte (`validate_sub_workflow_parents`) ; un modèle avec validation se lance par `TriggerWorkflow` (n'attend pas l'enfant, signal `TRIGGER_REFUSED` si le lancement est refusé, par exemple clé de concurrence occupée). Variables de l'enfant : `sub_workflow_variables` (nom déclaré par l'enfant -> gabarit rendu dans le parent) [src: url: https://github.com/DocRoms/Kronn/blob/main/backend/src/workflows/trigger_workflow_step.rs]. Exemple : l'étape `ai_time` de `workflows/templates/mep.json` (#79).
8. Une étape et sa variante : `_fallback` (une étape complète) la remplace au rendu quand son `_requires` n'est pas satisfait, ce qui garde le modèle sous la limite de 20 étapes de Kronn (`tests/test_models.py`) [src: file: tools/templates.py:323].
