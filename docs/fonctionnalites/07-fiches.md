# Fiches

Clic sur un personnage (plan, panneau ou « Qui fait quoi ») : sa fiche s'ouvre dans le panneau.

| Agent | Collègue |
| --- | --- |
| ![Fiche d'un agent](../img/fiche-agent.png) | ![Fiche d'un collègue](../img/fiche-collegue.png) |

**Agent** : runs, réussites, échecs et tokens du jour, workflows, sa journée run par run avec les étapes et les erreurs. Boutons (cartes Kronn, sans token sauf « interroger ») :
- **Relancer** : relance le workflow (refusé s'il tourne déjà ou demande des variables).
- **Lui poser une question** : un agent IA lit ses runs et répond en 5 phrases.
- **Décider** une validation : approuver, rejeter ou demander des changements.

**Collègue** : tickets ouverts, en cours, PR ouvertes et mergées du jour, ce qu'il a écrit, trié ou testé (PO, facilitateur, testeur).

**Visiteur** : la discussion Kronn, ses messages importants, le run qui l'a lancée.

La **fiche de paie** (enveloppe sur le bureau du boss) donne tokens, runs et échecs par agent sur 7 jours, avec un coût estimé.

## Cartes de passion

Selon la clé `passion` du roster, la fiche d'un collègue affiche aussi :

- **Carte GitFut** : sa carte de joueur façon FIFA Ultimate Team, notée sur 99 d'après son activité GitHub ([gitfut.com](https://gitfut.com)), sans le fond, cliquable. Les logins se donnent dans `bureau.config.json` (clé `gitfut`, `{clé du roster: login GitHub}`) ; le cron horaire la récupère une fois par jour (script `gitfut_snapshot.py`, `sips` sur macOS).
- **Smash Bros Ultimate** (`smash` : `pseudo`, `main`, `rank`, `tournament`, `url`) : pseudo, personnage principal, classement, dernier tournoi, lien vers son profil.
- **Top 3 dramas** (`dramas` : `top` (3 titres), `now`) : façon Netflix, avec l'épisode en cours.
- **Top 3 libre** (`top3` : `title`, `top` (3 titres), `now`) : même carte, sur le sujet de son choix (ex. « Films de François Civil »).

Sans les infos, la carte s'affiche avec « à venir ».

