"""Faux fichier de tests pour tests/test_unittests.py (hors du glob tests/test_*.py : jamais lancé par tools/test.sh)."""
import unittest


class Exemple(unittest.TestCase):
    def test_ok(self):
        print("bavard mais vert")

    def test_echoue(self):
        print("trace du test rouge")
        self.assertEqual(1, 2)

    def test_erreur(self):
        raise RuntimeError("boum")

    @unittest.skip("pas ici")
    def test_saute(self):
        pass

