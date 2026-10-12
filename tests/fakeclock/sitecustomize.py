"""Horloge figée des tests (KT-56) : chargé seulement par les scripts que lancent les tests (PYTHONPATH=tests/fakeclock).

BUREAU_TEST_NOW (ISO avec fuseau) remplace datetime.now(), utcnow() et today() : les crons filtrent « depuis minuit »
à l'heure de Paris, et des données datées « il y a 3 minutes » tombaient la veille juste après minuit.
"""
import datetime as _dt
import os

_NOW = os.environ.get("BUREAU_TEST_NOW")
if _NOW:
    _FIXED = _dt.datetime.fromisoformat(_NOW)

    class _FixedDateTime(_dt.datetime):
        @classmethod
        def now(cls, tz=None):
            n = _FIXED.astimezone(tz) if tz else _FIXED.astimezone().replace(tzinfo=None)
            return cls.combine(n.date(), n.timetz() if tz else n.time())

        @classmethod
        def utcnow(cls):
            return cls.now(_dt.timezone.utc).replace(tzinfo=None)

        @classmethod
        def today(cls):
            return cls.now()

    _dt.datetime = _FixedDateTime
