"""Courrier, #30 (python3 -m unittest tests/test_mail.py) : le cron « courrier » (workflows/mail_snapshot.py) lancé
comme dans Kronn, avec un faux osascript (appli Mail), un faux security (trousseau) et un faux serveur IMAP local."""
import json, os, shutil, socketserver, subprocess, sys, tempfile, threading, unittest
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")))
LIMIT = 100 * 1024
FS, RS = "\x1f", "\x1e"
NOW = datetime.now()


def isot(hours_ago):
    return (NOW - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%S")


def mac_line(mid, sender, subject, hours_ago, to="pam@dundermifflin.example,", robot="", flagged="false"):
    return FS.join(["MSG", "<" + mid + ">", sender, subject, isot(hours_ago), flagged, to, robot])


MAC_OUT = RS.join([FS.join(["UNREAD", "23"]),
                   mac_line("a1@x", "Jan Levinson <jan@dundermifflin.example>", "Budget du trimestre", 1),
                   mac_line("a2@x", "David Wallace <david@dundermifflin.example>", "Ma visite de jeudi", 3, to="tous@dundermifflin.example,"),
                   mac_line("a3@x", "Jira <jira@dm.atlassian.net>", "[DM-7089] Nouveau commentaire", 2),
                   mac_line("a4@x", "Staples <news@staples.example>", "Promo ramettes", 5, robot="1"),
                   mac_line("a5@x", "Inconnu <bob@vance.example>", "Réfrigération", 6, flagged="true"),
                   FS.join(["MINE", "pam@dundermifflin.example,"])])


class FakeImap(socketserver.StreamRequestHandler):
    """Juste ce que lit imaplib : accueil, CAPABILITY, LOGIN, SELECT (lecture seule), UID SEARCH, UID FETCH, LOGOUT."""
    MAILS = {}  # uid -> (en-têtes bruts, drapeaux)
    SEEN = []  # commandes reçues

    def send(self, s):
        self.wfile.write(s.encode() if isinstance(s, str) else s)

    def handle(self):
        self.send("* OK fake\r\n")
        while True:
            line = self.rfile.readline().decode().strip()
            if not line:
                return
            tag, cmd, *rest = line.split(" ", 2)
            arg = rest[0] if rest else ""
            FakeImap.SEEN.append(cmd.upper() + " " + arg)
            c = cmd.upper()
            if c == "CAPABILITY":
                self.send("* CAPABILITY IMAP4rev1\r\n" + tag + " OK done\r\n")
            elif c == "LOGIN":
                ok = arg.split(" ")[1].strip('"') == "mdp-application"
                self.send(tag + (" OK done\r\n" if ok else " NO mauvais mot de passe\r\n"))
            elif c in ("SELECT", "EXAMINE"):
                self.send("* 5 EXISTS\r\n" + tag + " OK [READ-ONLY] done\r\n")
            elif c == "UID" and arg.upper().startswith("SEARCH"):
                self.send("* SEARCH " + " ".join(sorted(FakeImap.MAILS)) + "\r\n" + tag + " OK done\r\n")
            elif c == "UID" and arg.upper().startswith("FETCH"):
                uid = arg.split(" ")[1]
                hdr, flags = FakeImap.MAILS[uid]
                body = hdr.encode()
                self.send(f"* 1 FETCH (UID {uid} FLAGS ({flags}) BODY[HEADER.FIELDS (FROM)] {{{len(body)}}}\r\n".encode() + body + b")\r\n" + (tag + " OK done\r\n").encode())
            elif c == "LOGOUT":
                self.send("* BYE\r\n" + tag + " OK done\r\n")
                return
            else:
                self.send(tag + " BAD\r\n")


def raw(frm, subject, hours_ago, to="pam.perso@gmail.example", extra=""):
    d = (NOW - timedelta(hours=hours_ago)).astimezone().strftime("%a, %d %b %Y %H:%M:%S %z")
    return f"From: {frm}\r\nTo: {to}\r\nSubject: {subject}\r\nDate: {d}\r\nMessage-ID: <{abs(hash(subject))}@x>\r\n{extra}\r\n"


class MailSnapshotTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        self.tool("osascript", f"import sys\nsys.stdin.read()\nsys.stdout.write(open({os.path.join(self.tmp, 'mac.txt')!r}).read())")
        self.tool("security", "import sys\na = sys.argv[1:]\nprint('mdp-application') if a[a.index('-s') + 1] == 'pixel-bureau-perso' else sys.exit(44)")
        with open(os.path.join(self.tmp, "mac.txt"), "w") as fh:
            fh.write(MAC_OUT)
        self.srv = None

    def tearDown(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
        shutil.rmtree(self.tmp)

    def tool(self, name, body):
        path = os.path.join(self.bin, name)
        with open(path, "w") as fh:
            fh.write(f"#!{sys.executable}\n{body}\n")
        os.chmod(path, 0o755)

    def imap_server(self, mails):
        FakeImap.MAILS, FakeImap.SEEN = mails, []
        self.srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), FakeImap)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        return self.srv.server_address[1]

    def run_mail(self, mail):
        cfg = dict(FIXTURE, mail=mail)
        path = os.path.join(self.tmp, "bureau.config.json")
        with open(path, "w") as fh:
            json.dump(cfg, fh)
        r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "mail_snapshot.py")], capture_output=True, text=True,
                           env={"BUREAU_CONFIG": path, "HOME": self.tmp, "PATH": self.bin}, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr[-800:])
        self.assertLess(len(r.stdout.encode()), LIMIT)
        return json.loads(r.stdout), r.stderr

    def test_mac_mail_rules_robots_and_unknown(self):
        out, _ = self.run_mail({"accounts": [{"id": "pro", "label": "Pro", "provider": "mac-mail", "account": "Dunder"}],
                                "ignore": ["atlassian.net"], "keep": ["@dundermifflin.example"]})
        self.assertTrue(out["sorted"])
        a = out["accounts"][0]
        self.assertTrue(a["ok"])
        self.assertEqual(a["unread"], 23)
        self.assertEqual([m["name"] for m in a["useful"]], ["Jan Levinson", "David Wallace", "Inconnu"])  # plus récents d'abord
        self.assertEqual(a["useful_n"], 3)
        self.assertEqual(dict(a["ignored"]), {"Jira": 1, "Staples": 1})  # règle ignore (sous-domaine) et en-tête de robot
        self.assertEqual(a["unknown"], 2)  # Staples et bob@vance : aucune règle
        jan, david, bob = a["useful"]
        self.assertTrue(jan["direct"])
        self.assertFalse(david["direct"])  # adressé à une liste : en copie
        self.assertTrue(bob["flagged"])
        self.assertEqual(jan["open"], "message://%3Ca1%40x%3E")
        self.assertNotIn("body", json.dumps(out))

    def test_without_rules_not_sorted_and_count_only_hides_names(self):
        out, _ = self.run_mail({"accounts": [{"id": "pro", "provider": "mac-mail", "account": "Dunder", "show": "count"}]})
        self.assertFalse(out["sorted"])
        a = out["accounts"][0]
        self.assertEqual(a["useful_n"], 4)  # tout sauf le robot
        dump = json.dumps(a)
        for word in ("Jan", "Budget", "dundermifflin", "Staples"):
            self.assertNotIn(word, dump)

    def test_imap_with_keychain_secret_read_only(self):
        port = self.imap_server({
            "11": (raw("Marie <marie@exemple.example>", "Ce week-end ?", 2), ""),
            "12": (raw("Banque <info@banque.example>", "=?utf-8?q?Relev=C3=A9_d=27octobre?=", 1, extra="List-Unsubscribe: <x>\r\n"), ""),
            "13": (raw("Vieux <old@exemple.example>", "Trop ancien", 24 * 40), "\\Flagged"),
        })
        out, _ = self.run_mail({"accounts": [{"id": "perso", "label": "Perso", "provider": "imap", "host": "127.0.0.1", "port": port,
                                              "ssl": False, "user": "pam.perso@gmail.example", "secret": "keychain:pixel-bureau-perso",
                                              "only": "category:primary"}]})
        a = out["accounts"][0]
        self.assertTrue(a["ok"], a.get("error"))
        self.assertEqual(a["unread"], 3)
        self.assertEqual([m["subject"] for m in a["useful"]], ["Ce week-end ?"])  # robot écarté, trop ancien écarté
        self.assertEqual(a["ignored"], [["Banque", 1]])
        self.assertTrue(any(s.startswith("SELECT") or s.startswith("EXAMINE") for s in FakeImap.SEEN))
        self.assertTrue(any("X-GM-RAW" in s and "category:primary" in s for s in FakeImap.SEEN))
        self.assertTrue(all("BODY.PEEK" in s for s in FakeImap.SEEN if s.startswith("UID FETCH")))  # jamais marqué lu

    def test_failing_account_keeps_its_place_and_says_why(self):
        port = self.imap_server({})
        out, err = self.run_mail({"accounts": [
            {"id": "pro", "provider": "mac-mail", "account": "Dunder"},
            {"id": "perso", "provider": "imap", "host": "127.0.0.1", "port": port, "ssl": False, "user": "x", "secret": "keychain:autre"}]})
        pro, perso = out["accounts"]
        self.assertTrue(pro["ok"])
        self.assertFalse(perso["ok"])
        self.assertIn("trousseau", perso["error"])
        self.assertIn("courrier : perso", err)

    def test_applescript_names_distinct_ignoring_case(self):
        """AppleScript ignore la casse : une liste « rs » écrasait le séparateur « RS » (tous les mails en un seul)."""
        import re
        src = open(os.path.join(ROOT, "workflows", "mail_snapshot.py"), encoding="utf-8").read()
        names = set(re.findall(r"\bset (\w+) to", src.split("APPLESCRIPT = r")[1].split("\n\n\n")[0]))
        low = {}
        for n in names:
            self.assertNotIn(n.lower(), low, f"{n} et {low.get(n.lower())}")
            low[n.lower()] = n

    def test_no_accounts_empty(self):
        out, _ = self.run_mail({})
        self.assertEqual(out["accounts"], [])


if __name__ == "__main__":
    unittest.main()
