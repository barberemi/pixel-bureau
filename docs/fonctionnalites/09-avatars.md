# Avatars

Chacun peut changer son nom et son apparence, pour lui seul ou pour toute l'équipe.

![Éditeur d'avatar](../img/avatar.png)

- Fiche d'un personnage, « ✎ Personnaliser » : silhouette, peau, visage, coiffure, barbe, vêtements, couleurs, couvre-chef, lunettes. Aperçu animé.
- « Garder pour moi » : dans ce navigateur, hors de Kronn (dans Kronn la page n'a pas de stockage). « Enregistrer pour l'équipe » : copie un code `BUREAU1:…`, ouvre la carte Kronn du workflow avatars ; on y colle le code et on lance (0 token).
- Les avatars sont assemblés dans le navigateur à partir des calques LPC (`sprites/layers.json`) et des recettes (`sprites/cast.json`).

## Sprite fourni

Pour un sprite fait sur le [générateur LPC](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator) : dossier `sprites/custom/<nom>/` avec la planche exportée (832 px de large), puis `sprite:'<nom>'` sur le personnage, `build_sprites.py`, `publish.py page`. Un personnage à sprite fourni ne peut changer que son nom.
