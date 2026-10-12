# Commits

> **TEMPLATE FILE.** Fill `{{...}}` with the actual project convention. If it isn't formalized yet, write `Not formalized: ask before assuming.` instead of guessing.

## Message convention

<!-- Fill: message format only (Conventional Commits, free-form, ticket-prefixed, etc.). -->
`type(portée): sujet` (`feat`, `fix`, `style`, `docs`…), portée = la fonctionnalité touchée (ex. `feat(absences): …`, `fix(bureau du boss): …`), corps qui explique le pourquoi (format relevé dans l'historique git) ; un commit par changement [src: file: docs/briefing.md:21]. Un changement visible embarque dans le même commit la page `guide/fonctionnalites/NN-*.md`, la ligne du README et les captures qui changent vraiment [src: file: docs/briefing.md:20]. Le corps peut citer le ticket `KT-<n>` (ex. « KT-1, étape 4. », historique git).

Commit-message language comes from [AGENTS.md § Project parameters](../AGENTS.md#project-parameters); do not restate it here.

## Attribution

<!-- Fill: does this project want an AI co-authorship trailer (Co-Authored-By, Generated-with, etc.) on agent-authored commits? -->
Trailer `Co-Authored-By` obligatoire sur les commits écrits par un agent [src: file: docs/briefing.md:21].

## Sign-off

<!-- Fill: is a DCO / `Signed-off-by` trailer required? -->
DCO non requis : pas de `Signed-off-by` [src: file: docs/briefing.md:21].

Commits signés par clé SSH (KT-59, depuis le 2026-10-12) : `commit.gpgsign true` et `gpg.format ssh` dans la config git du dépôt, adresse d'auteur `…@users.noreply.github.com` ; un agent qui commite ici signe avec la même config (agent SSH). Recette : `guide/developpement.md` [src: file: guide/developpement.md:51].
