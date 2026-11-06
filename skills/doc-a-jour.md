# Doc à jour (Le Bureau)

Juger si la documentation d'un dépôt dit encore vrai après un diff, pour le poste 📚 docs de la revue de PR du Bureau et le poste 📚 Doc de sa chaîne d'implémentation.

## Où regarder
Le relevé à 0 token du diff dit où regarder : `modifiees` (docs déjà changées par le diff), `citent_le_diff` (docs qui citent un fichier modifié ou un symbole touché), `sans_doc` (fichiers modifiés qu'aucune doc ne cite). Lis le diff, puis chaque doc citée ou modifiée, à la version du head. Si `docs/AGENTS.md` existe, suis son routage (le tableau des tâches, puis la recherche) pour les fichiers du diff et charge seulement les fichiers qu'il indique.

## L'état de chaque doc lue
- `a_jour` : dit vrai après le diff, ou a été mise à jour.
- `a_mettre_a_jour` : décrit ce que le diff change et le dit faux ou incomplet (la phrase devenue fausse, le texte à écrire).
- `non_concernee` : la citation ne porte pas sur ce qui change.
- `manquante` : un comportement, une commande, un réglage ou une option ajouté que nulle doc ne décrit (dis où il devrait l'être).

## Conventions et citations
- Les écarts du diff aux conventions documentées (nommage, emplacement, commentaires, tests exigés, interdits) se citent avec la règle (`fichier:ligne`).
- Dans chaque doc que le diff modifie, une citation `[src: file: <chemin>:<ligne>]` doit viser un fichier qui existe et une ligne qui dit ce qu'on lui fait dire.
- Respecte la langue et le format de chaque doc (paramètres du dépôt, `docs/AGENTS.md`). Pas de doc à créer pour un détail interne.

## Gravité
- Une doc `a_mettre_a_jour` (devenue fausse) : bloquant.
- Une citation que le diff ajoute ou casse et qui ne tient plus : bloquant.
- `manquante` : bloquant si l'utilisateur ou le développeur en a besoin pour se servir du changement, avis sinon.
- Une doc utile à ajouter sans qu'aucune devienne fausse : conseil.
