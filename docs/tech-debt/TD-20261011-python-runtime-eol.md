---
name: td-20261011-python-runtime-eol
description: Python 3.9 (fin de vie 2025-10) est le minimum documenté et le python3 du poste ; aucun runtime ni paquet du venv n'est épinglé.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
      note: `python3 --version` = 3.9.6, `node --version` = v25.9.0 sur le poste de dev
    - date: 2026-10-11
      status: Deferred
      reviewer: Kronn audit validation card
      note: "Deferred through an audit validation card."
---

# TD-20261011-python-runtime-eol

- **Area**: Infra
- **Severity**: Medium
- **Status**: Deferred
- **Effort**: M (1-4h)
- **Blast radius**: cross-cutting (50+ files or new pattern)

## Problem (fact)
Le README annonce Python 3.9 minimum ; le `python3` du poste (celui du `PATH` de Kronn) est 3.9.6, hors support depuis octobre 2025. Pas de `.python-version`, `.nvmrc` ni fichier de dépendances pour le venv (`pillow`, `websocket-client` installés sans version). Node v25 (version impaire, hors support) sert aux tests.

## Impact
Plus de correctifs de sécurité pour l'interpréteur qui exécute les crons ; une montée de version de macOS ou de Kronn peut changer le Python utilisé sans prévenir, et le venv n'est pas reproductible.

## Where (pointers)
- `README.md:34` : prérequis Python 3.9
- `docs/AGENTS.md:100` : « 3.9 ou plus (`python3` du `PATH` de Kronn) »
- `guide/developpement.md:42` : `pip install pillow websocket-client` sans version

## Suggested direction
Passer le minimum à une version supportée (3.12+), installer cet interpréteur pour Kronn, ajouter `.python-version`, `.nvmrc` (Node LTS) et un `requirements-dev.txt` épinglé pour le venv.

## Next step
`create ticket`
