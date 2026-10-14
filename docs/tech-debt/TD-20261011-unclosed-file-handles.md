---
name: td-20261011-unclosed-file-handles
description: Idiome open(...).read() / json.dump(..., open(...)) sans with ; les tests Python affichent des ResourceWarning à chaque lancement.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-15
      status: Resolved
      reviewer: mainteneur
      note: "#11 : plus de open() sans with dans tools/, workflows/ et tests/ (pathlib read_text / write_text dans tools et tests, helpers read_json / write_json / read_bytes / write_bytes / write_text dans workflows/_lib.py pour les crons) ; faux serveurs HTTP des tests refermés (server_close) ; tools/test.sh lance unittest avec -W error::ResourceWarning. sprites/ hors périmètre."
---

# TD-20261011-unclosed-file-handles

- **Area**: Backend
- **Severity**: Low
- **Status**: Resolved (2026-10-15, #11)
- **Effort**: S (< 1h)
- **Blast radius**: module (5-10 files)

## Problem (fact)
Fichiers ouverts sans `with` dans les outils et les crons ; `sh tools/test.sh` affiche des `ResourceWarning: unclosed file` (assemble.py, test_theme.py).

## Impact
Bruit dans la sortie des tests qui masque les vrais messages ; une écriture `json.dump(x, open(p, "w"))` peut rester tronquée si le processus est tué avant le ramasse-miettes.

## Where (pointers)
- `tools/assemble.py:58` : lecture des `page/src/*.js`
- `tools/assemble.py:212` et `tools/assemble.py:304-305`
- `tests/test_theme.py:31`
- `workflows/office_snapshot.py:105` : `json.dump(purge, open(PURGE_LOG, "w"))`
- `workflows/gates_snapshot.py:97` : écriture du cache

## Suggested direction
Petit helper `read(path)` / `write_json(path, obj)` avec `with`, utilisé partout ; lancer les tests avec `-W error::ResourceWarning` pour empêcher le retour.

## Next step
`create ticket`
