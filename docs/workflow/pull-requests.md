# Pull requests

> **TEMPLATE FILE.** Fill `{{...}}` with the actual project convention. If it isn't formalized yet, write `Not formalized: ask before assuming.` instead of guessing.

## Title & description

<!-- Fill: title format, required description sections, template file if any -->
Depuis le 2026-10-12 (KT-58), tout changement passe par une branche et une PR (première : #1). Titre au format des commits (`type(portée): sujet` en français), description qui dit quoi et pourquoi ; modèle `.github/pull_request_template.md` (KT-30). La PR est **assignée au mainteneur** (`gh pr create --fill --assignee @me`) [src: user:mainteneur:2026-10-12: KT-58].

## Review

<!-- Fill: required approvals, who reviews what, draft-PR conventions -->
Le mainteneur relit et merge ; il pousse lui-même les branches (`git push` reste humain) [src: file: docs/briefing.md:23]. Ne merger que CI « Tests » verte (`gh pr checks <n>`) : le dépôt privé ne peut pas encore l'exiger (protection de branche réservée à GitHub Pro ou aux dépôts publics), elle le sera sur le dépôt public (KT-64).

## Merge strategy

<!-- Fill: squash / rebase / merge commit, branch naming, who is allowed to merge -->
Squash seulement (réglage du dépôt : merge commit et rebase désactivés, branche supprimée après le merge) : un commit par PR sur `main`, signé par GitHub. Branches nommées `type/sujet` (ex. `ci/actions-node24`). Push direct sur `main` refusé par le hook local `.githooks/pre-push`, à activer une fois par clone : `git config core.hooksPath .githooks` [src: file: .githooks/pre-push:1]. Publication (`tools/publish.py`) depuis `main` à jour, après le merge.
