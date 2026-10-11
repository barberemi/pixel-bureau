# TMPDIR dans le dépôt : test_own_layout_file échoue

- Symptôme : `sh tools/test.sh` signale `FAIL: test_own_layout_file` ; le chemin attendu est absolu, le chemin écrit est relatif.
- Cause : quand l'agent tourne sous Kronn, `TMPDIR` vaut `<dépôt>/.kronn/tmp`. `tools/install.py` rend relatif tout plan situé sous la racine du dépôt [src: file: tools/install.py:147], le test compare au chemin absolu du fichier temporaire [src: file: tests/test_install.py:231].
- Contournement : `TMPDIR=/tmp sh tools/test.sh`. Ce n'est pas une régression du code.
- Voir [testing-quality](../testing-quality.md).
