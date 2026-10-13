---
name: td-20261011-missing-security-md
description: Pas de SECURITY.md ni de .github/SECURITY.md ; aucune procédure pour signaler une vulnérabilité.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
      note: signal du détecteur missing-community-files ; sévérité Low car dépôt privé
    - date: 2026-10-11
      status: Accepted decision
      reviewer: Kronn audit validation card
      note: "Accepted as an intentional decision and recorded in docs/decisions.md."
    - date: 2026-10-13
      status: Resolved
      reviewer: mainteneur
      note: "KT-63 : le dépôt devient public ; SECURITY.md à la racine (avis de sécurité privé GitHub, délais, périmètre), lié depuis le README et CONTRIBUTING."
---

# TD-20261011-missing-security-md

- **Area**: Security
- **Severity**: Low
- **Status**: Resolved (2026-10-13, KT-63)
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Ni `SECURITY.md` ni `.github/SECURITY.md`. La page déclenche des actions sur Kronn (validation de gates, relances, commentaires Jira) via des scripts qui valident leurs entrées.

## Impact
Faible tant que le dépôt est privé ; si une autre équipe l'installe ou s'il devient public, une faille trouvée dans ces scripts d'action n'a pas de canal de signalement privé.

## Where (pointers)
- `workflows/gate_decide.py:1-9` : action qui décide une gate Kronn
- `workflows/avatar_save.py:1-10` : entrée collée depuis la page

## Suggested direction
Un `SECURITY.md` court : contact privé, périmètre (scripts `workflows/`, page), délai de réponse.

## Next step
`create ticket`
