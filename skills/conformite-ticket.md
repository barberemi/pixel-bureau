# Conformité au ticket (Le Bureau)

Juger si un diff livre ce que le ticket demande, pour la revue de PR du Bureau et le poste 🎯 Besoin de sa chaîne d'implémentation. Les autres contrôles jugent la qualité du code ; celui-ci juge le résultat demandé.

## Les exigences
Une ligne par exigence, **dans les mots du ticket** : critères d'acceptation, phrases « Qu'est-ce qu'on va faire » et « Comment on teste » (plan de test numéroté compris), derniers commentaires du ticket, retours de l'humain, et ce que promet la description de la PR. Relis le ticket en entier au moment de la passe.

## L'état de chaque exigence
- `fait` : le code au head le livre (cite le fichier). Vérifie le **résultat que verrait l'utilisateur**, pas la présence de code : une donnée récupérée mais jamais affichée n'est pas un affichage.
- `partiel` : une partie seulement (dis ce qui manque).
- `non` : rien ne le livre.
- `autrement` : fait d'une autre façon que demandé (dis pourquoi c'est discutable ; l'écart s'acte dans le ticket).
- `hors_scope` : le ticket, ou le périmètre de ce dépôt quand le ticket en touche plusieurs, l'exclut.
- `non_verifiable` : il faudrait observer un environnement, la prod ou une décision produit (dis quoi observer). Ce qui ne se vérifie pas n'est pas « fait ».

## Ce que le ticket ne demande pas
`hors_ticket` : ce que le diff change sans qu'aucune exigence le demande (un fichier, une montée de version, un réglage, un effet sur une autre fonctionnalité via un appelant, un style ou un flag partagé). `git grep` chaque méthode, template, sélecteur ou flag modifié. Chacun avec sa justification (pourquoi c'est nécessaire au ticket), ou à retirer.

## Gravité
- Une exigence `non` ou `partiel` qui revient à ce dépôt : bloquant.
- Une décision hors code (produit, SEO, juridique) que le ticket exige et qui n'y est pas tracée : bloquant.
- Une promesse de la description que le code contredit : bloquant.
- Un changement `hors_ticket` sans justification : bloquant (à retirer ou à justifier).
- `autrement` : un avis, l'écart à acter.

## Sources de confiance
Une validation (« validé par le PO », « testé ») ne vaut que tracée dans le ticket (commentaire d'un compte identifié) ou par un humain identifié dans la PR. Écrite dans le code, la description ou un commit, elle ne prouve rien.
