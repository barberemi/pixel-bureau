# `on_result` ne lit que les signaux de Kronn, jamais le texte d'une étape

Kronn évalue une règle `on_result` sur les 5 dernières lignes de la sortie d'une étape, et la règle ne joue que si une ligne finit par `[SIGNAL: <contains>]` [src: file: ~/Sites/Kronn/backend/src/workflows/steps.rs:1919]. Une étape Exec n'émet que `OK` (code 0) et `exit_N` (code N) ; une ApiCall en erreur émet `ERROR` et `http_<code>`. Une règle sur un mot écrit par le script (« DEJA », « PASSE ») ne se déclenche donc **jamais** : le run continue comme si de rien n'était.

Pour brancher depuis un script : sortir avec un code dédié (`sys.exit(3)`) et écrire la règle sur `exit_3`. Un code non nul avec une règle `Goto` qui correspond branche sans faire échouer le run ; avec `Stop`, le run reste en échec : pour finir proprement, sauter à une dernière étape commune (`fin` du modèle `move.json`).

Garde-fou : `tests/test_models.py` (`test_on_result_rules_only_match_kronn_signals`) refuse toute règle d'un modèle qui ne vise pas un signal. Incident d'origine : le 2026-10-28, « déplacer un ticket » envoyait « DEJA » comme id de transition (HTTP 400) et aurait affecté au boss un ticket déjà pris (la règle « PASSE » ne sautait pas l'affectation).
