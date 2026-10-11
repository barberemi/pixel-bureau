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
4. `python3 tools/publish.py workflows` (humain seul) crée un workflow absent de la config et range son id dans `bureau.config.json` [src: file: tools/publish.py:42]. Pour un bouton de page (clé `actions`), lancer `publish.py workflows` **avant** `publish.py page` : la page assemblée avant la création de l'id garde l'action désactivée (`ACTIONS.<clé>` à false) jusqu'à la publication suivante [src: user:mainteneur:2026-10-12: KT-27].
5. Tests : un script de `workflows/` se teste dans `tests/test_scripts.py` ; les modèles par `tests/test_templates.py` (voir [testing-quality](../testing-quality.md)).
