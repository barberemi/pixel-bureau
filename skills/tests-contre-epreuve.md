# Tests et contre-épreuve (Le Bureau)

Juger la force des tests d'un diff, pour la revue de PR du Bureau (sans rien lancer) et le poste 🧪 Tests de sa chaîne d'implémentation (qui lance les mutations et écrit les tests qui manquent).

## La contre-épreuve
Pour chaque garde, borne, plancher, regex, condition, ternaire, filtre, statut HTTP ou retour ajouté ou modifié : « si je mute cette ligne, quel test échoue ? ». Aucun : le test est faible ; nomme la mutation exacte et le cas de test qui la tuerait.

Mutations : borne décalée (`>` et `>=`, `<=` et `<`, off-by-one), égalité inversée (`===` et `!==`), `&&` et `||` échangés, garde supprimée ou inversée, appel supprimé, retour remplacé par `null` ou une valeur fixe, élément retiré d'une liste ; en TypeScript, `?.` remplacé par `.`, `??` par `||`, `await` supprimé ; `Math.max` ou `Math.min` retiré.

## Un test ne tue rien quand
- son attente est importée du code testé (il compare le code à lui-même) ;
- sa fixture est égale à la valeur par défaut (l'entrée ne change rien) ;
- ses mocks n'assertent pas leurs arguments ;
- la borne n'est testée qu'au milieu de la plage, jamais à ses bords ;
- une seule branche d'un ternaire ou d'une condition est assertée ;
- il mocke la règle qu'il prétend tester (un filtre, une spécification) : remplacer le mock par le vrai.

## Ce qu'on regarde aussi
- Chaque test ajouté ou modifié lu en entier : assertion supprimée ou affaiblie, patch de prototype ou spy jamais restauré, attente recopiée du code.
- Les tests liés aux fichiers touchés (par le nom : `Foo.php` et `FooTest.php`, `foo.ts` et `foo.test.ts`, `foo.py` et `test_foo.py`) : passent-ils encore au head ? Un test qui vise un élément dont le diff change le markup (attribut, classe, texte, ordre), ou une empreinte périmée, cassera la CI.
- Un changement de cycle de vie (listener, terminate, cache, file) : un test qui passe par le vrai cycle (kernel, requête réelle), pas seulement l'unité.
- Une erreur d'environnement (la même au point de départ : assets, réseau, base) n'est pas un défaut du diff : la dire en une ligne et passer.
- Un changement de comportement sans test ajouté ou mis à jour dans la même PR : à signaler, bloquant si la logique est critique.
