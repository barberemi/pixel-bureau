# Politique de sécurité

## Versions suivies

Le Bureau est en v0 (`0.MINOR.PATCH`). Les correctifs de sécurité vont :

- dans la **dernière version mineure** publiée (le plus récent tag `0.x.*`) ;
- dans la branche `main`.

Les versions mineures plus anciennes ne reçoivent pas de correctif : passe au dernier tag.

| Version | Suivie |
| --- | --- |
| Dernière version mineure (tag `0.x.*` le plus récent) | ✅ |
| Versions mineures plus anciennes | ❌ |

## Signaler une faille

**N'ouvre pas d'issue publique pour une faille de sécurité.** Une issue est publique dès sa création : tout le monde la voit avant qu'un correctif existe.

Passe par un **avis de sécurité privé GitHub** :

➡️ [Signaler une faille](../../security/advisories/new)

Seuls les mainteneurs le lisent ; on y prépare le correctif et sa publication avec toi.

### Ce qui aide

- La version touchée (tag) ou le commit.
- Comment reproduire, au plus court.
- L'effet constaté (fuite d'information, action déclenchée sans autorisation, injection dans la page, exécution de code…).
- Ta gravité estimée (faible, moyenne, haute, critique), si tu en as une.
- Si la faille est déjà publique quelque part.

### À quoi t'attendre

- **Accusé de réception** sous 5 jours ouvrés.
- **Première analyse** sous 10 jours ouvrés, avec un délai visé pour le correctif.
- **Correctif et avis** publiés ensemble ; l'avis te cite, sauf si tu préfères rester anonyme.

## Périmètre

Concernés :

- La page (`page/`) : ce qu'elle affiche des données de Kronn, ses boutons d'action (`kronn-action`) et ce qu'ils transmettent.
- Les scripts des crons et des actions (`workflows/*.py`), exécutés par Kronn avec l'accès à son API locale.
- Les outils d'installation et de publication (`tools/install.py`, `tools/publish.py`, `tools/assemble.py`), et le chargement d'un pack d'équipe.

Hors périmètre :

- Kronn lui-même : signale-le au [projet Kronn](https://github.com/DocRoms/Kronn/security/advisories/new).
- Les services tiers lus par les crons (Jira, GitHub, Microsoft Graph) : signale-le à l'éditeur.
- Un pack d'équipe tiers, ou un Kronn exposé volontairement hors de `localhost` sans authentification.
- Les résultats d'outils automatiques sans démonstration qui fonctionne.

## Bonnes pratiques

- `bureau.config.json` est propre à chaque installation et n'est jamais commité ; les identifiants des services restent dans les connexions de Kronn, chiffrées, jamais dans le dépôt ni dans un pack.
- Un pack d'équipe contient des noms et des logins réels : garde-le dans un dépôt privé.
