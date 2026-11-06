# Recherches hors du diff (Le Bureau)

Ce que les relecteurs humains trouvent et que les revues automatiques ratent vient presque toujours d'un **lecteur hors du diff** : un autre fichier, une doc, un test de contrat, une image Docker, un environnement. Une passe qui ne lit que le diff les rate une fois sur deux. Ce skill sert à la revue de PR du Bureau et aux contrôles de sa chaîne d'implémentation.

## Règles
- Chaque recherche se fait **dans la copie de travail au head** (`git grep -n`, puis lecture des fichiers trouvés), jamais de mémoire.
- Une recherche ne se fait que si son **déclencheur** est dans le diff ; R7, R9 et R11 se font toujours.
- **La description n'est pas une preuve.** Une recherche qui conclut « ok » parce que la description de la PR, un commit ou un commentaire l'affirme ne vaut rien : la preuve est dans le code au head ou dans le fichier qui épingle l'outil.
- Chaque recherche faite laisse **une trace** : `{r, cible, recherche, resultat, conclusion}`, avec la commande exacte, ce qu'elle a trouvé (fichiers et lignes, ou « aucun ») et `ok` ou le constat qu'elle fonde. Sans trace, « rien à signaler » ne vaut rien.
- Les **relevés à 0 token** du diff (retraits encore référencés, garde-fous des lignes ajoutées, tests liés, docs qui citent le diff) sont des endroits à vérifier, pas des constats : chaque ligne est tranchée.

## Les recherches
**R1. Consommateurs d'une valeur changée** : une liste blanche ou noire, un filtre, une regex, une plage (date, pagination), une interface ou un type exporté, un nom de champ ou de paramètre, une chaîne de version. `git grep` de l'ancienne et de la nouvelle valeur dans tout le dépôt, docs, fixtures et tests de contrat compris, dans tous les langages et des deux côtés (serveur, client, app, webview). Un lecteur qui perd la valeur ou la voit fausse : bloquant (le parcours, la valeur perdue). Un test ou une doc qui fige l'ancienne valeur : à corriger, bloquant si la CI cassera.

**R2. Nouvelle forme d'une erreur** : un type d'erreur, un statut HTTP, un `catch` ou un code de retour changé. Les tests et les branches qui lisaient l'ancienne forme ; une branche morte qui devient vivante ; la reprise déroulée jusqu'à un état final, y compris quand ce sur quoi elle s'appuie manque (liste vide, curseur supprimé). Une branche réveillée qui supprime, masque ou boucle : bloquant.

**R3. Retraits** : un appel, une route, un template, un composant, un secret, un défaut de config retiré ou renommé. Chaque référence restante (relevé « Retraits encore référencés », ou `git grep` hors diff : README, docs, CI, traductions) est un orphelin à retirer, un usage cassé, ou un reste légitime à justifier. Un chemin que la PR voulait fermer et qui reste ouvert : bloquant.

**R4. Cible réelle d'exécution** : une option d'outil, une variable d'environnement, un secret, un port, un chemin, un job CI. La version déployée (Dockerfile, lockfile, action épinglée) et la config de la cible (compose, workflow, environnements) fournissent-elles ce que le code exige ? Un repli (sans cache, sans service tiers) actif en production qui appelle l'amont à chaque requête : bloquant.

**R5. Réponses servies par un cache** : un statut, un en-tête ou une réponse nouvelle sur une route servie par un CDN ou un cache. Le statut est-il mis en cache, la clé contient-elle ce qui varie (hôte, langue, cookie), un TTL intermédiaire contredit-il le `max-age` ? Cache faux en production : bloquant.

**R6. Jumeaux** : un fichier qui a un frère (PROD et NONPROD, vidéo et article, app et webview). Diff ligne à ligne avec le frère : une garde, une validation ou un correctif présent d'un seul côté.

**R7. Ticket relu au moment de la passe** (toujours) : en entier, derniers commentaires et plan de test compris ; chaque cas numéroté confronté au comportement livré (skill « Bureau · conformité au ticket »).

**R8. Convention changée** : une forme remplacée par une autre dans tout un ensemble de fichiers (`@import` vers `@use`, ancien helper vers nouveau). L'ancienne forme encore dans les docs, exemples, gabarits : à corriger (un développeur qui recopie l'exemple écrit du code refusé).

**R9. Tests du diff et tests liés** (toujours) : chaque test ajouté ou modifié lu en entier, et les tests liés aux fichiers touchés (skill « Bureau · tests et contre-épreuve »). Un test qui va casser au head, ou une empreinte (snapshot) périmée : bloquant si la CI échouera ; si la CI n'a pas tourné au head, c'est la seule défense.

**R10. États et échecs** : un appel réseau, un `import()`, un cache, une promesse, un flag ajouté ou rendu visible. Ce que voit l'utilisateur en succès, échec, réponse vide, objet présent mais terminé ou expiré, flag éteint. Un échec mis en cache pour toujours, ou une absence jamais mise en cache (un appel par page) : bloquant si l'utilisateur le voit.

**R11. Changements visibles et langues** (toujours) : ce qu'un utilisateur ou un partenaire voit changer (rendu, texte, ordre, couleur, emplacement publicitaire). Annoncé dans la description, validé au ticket, et juste dans chaque langue touchée (traductions, RTL, pluriels). Non annoncé ou faux dans une langue : à corriger, bloquant si légal, publicité ou marque.
