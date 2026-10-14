"""Courrier (#30) : les mails non lus de chaque compte de la config (clé mail.accounts), triés par les règles, pour le
dataset mails. Jamais le contenu d'un mail : l'expéditeur, l'objet, l'heure, lu ou non, destinataire direct ou en copie.

Fournisseurs :
- mac-mail : l'appli Mail du Mac, lue par osascript (Kronn tourne sur le même Mac) ; la boîte de réception du compte
  est trouvée par son rôle (les boîtes de « inbox »), pas par son nom (« Boîte de réception » sur Exchange) ;
- imap : n'importe quel serveur IMAP, boîte ouverte en lecture seule, en-têtes lus sans marquer lu (BODY.PEEK) ; le mot
  de passe vient du trousseau macOS (« secret »: « keychain:<service> », commande security), jamais de la config ;
  « only » : recherche Gmail X-GM-RAW (ex. « category:primary » : l'onglet Principal seulement).

Tri d'un mail non lu : une règle ignore -> ignoré ; une règle keep -> utile ; en-têtes de robot (List-Unsubscribe,
List-Id, Auto-Submitted, Precedence bulk/list) -> ignoré ; sinon utile. Une règle = une adresse (« a@b.com »), un domaine
(« b.com » ou « @b.com », sous-domaines compris), ou {"from": …, "account": "<id>"} pour un seul compte. Règles :
mail.keep / mail.ignore de la config. « sorted » faux tant qu'il n'y a aucune règle (la page montre alors « ? »).

Sortie (stdout) : {generated_at, sorted, accounts: [{id, label, color, show, provider, ok, error?, unread, useful_n,
useful: [{id, name, addr, subject, at, direct, flagged, open}], ignored: [[nom, n]…], unknown}]}
- show « count » : ni nom, ni adresse, ni objet dans la sortie (le nombre seul) ;
- unknown : expéditeurs qu'aucune règle ne couvre (pour proposer de nouvelles règles).
Un compte en échec garde sa place (ok faux, error) et l'erreur part sur stderr : jamais un dataset partiel sans trace.
"""
import email.header, email.utils, imaplib, json, subprocess, sys, urllib.parse
from datetime import datetime, timedelta
from email.parser import BytesHeaderParser
from _lib import CFG, TZ, dumps

MAIL = CFG.get("mail") or {}
DAYS = int(MAIL.get("days") or 14)  # mails non lus des N derniers jours seulement
MAX_LIST = 40  # mails utiles listés par compte (le compteur, lui, les compte tous)
MAX_SUBJECT = 140
SCAN = int(MAIL.get("scan") or 150)  # mac-mail : mails les plus récents parcourus (lus ou non)
ROBOT = ("list-unsubscribe", "list-id", "auto-submitted")
SEP, END = "\x1f", "\x1e"  # séparateurs de champs et de mails dans la sortie d'osascript

# AppleScript : argv = nom du compte, nombre de mails à parcourir (les plus récents) ; propriétés lues EN GROUPE (un
# « whose read status is false » sur une grosse boîte Exchange dépasse 2 min ; 150 mails groupés : environ 13 s).
# AppleScript ignore la casse des noms : les listes s'appellent lRead, lId… (« rs » écraserait le séparateur RS).
APPLESCRIPT = r'''
on run argv
  set accName to item 1 of argv
  set FS to ASCII character 31
  set RS to ASCII character 30
  tell application "Mail"
    set a to account accName
    set mine to email addresses of a
    set ib to missing value
    repeat with m in mailboxes of inbox
      if (name of account of m) is accName then set ib to m
    end repeat
    if ib is missing value then error "boîte de réception introuvable pour " & accName
    set out to "UNREAD" & FS & (unread count of ib) & RS
    set n to count of messages of ib
    if n > ((item 2 of argv) as integer) then set n to (item 2 of argv) as integer
    if n > 0 then
      set lRead to read status of messages 1 thru n of ib
      set lId to message id of messages 1 thru n of ib
      set lFrom to sender of messages 1 thru n of ib
      set lSubj to subject of messages 1 thru n of ib
      set lDate to date received of messages 1 thru n of ib
      set lFlag to flagged status of messages 1 thru n of ib
      set lTo to address of to recipients of messages 1 thru n of ib
      set lHead to all headers of messages 1 thru n of ib
      repeat with i from 1 to n
        if item i of lRead is false then
          set t to ""
          repeat with x in item i of lTo
            set t to t & x & ","
          end repeat
          set robot to ""
          repeat with k in {"List-Unsubscribe:", "List-Id:", "Auto-Submitted: auto", "Precedence: bulk", "Precedence: list"}
            if (item i of lHead) contains k then set robot to "1"
          end repeat
          set out to out & "MSG" & FS & (item i of lId) & FS & (item i of lFrom) & FS & (item i of lSubj) & FS & ((item i of lDate) as «class isot» as string) & FS & (item i of lFlag) & FS & t & FS & robot & RS
        end if
      end repeat
    end if
    set out to out & "MINE" & FS
    repeat with x in mine
      set out to out & x & ","
    end repeat
  end tell
  return out
end run
'''


def dec(v):
    """En-tête MIME (=?utf-8?…?=) -> texte."""
    try:
        return str(email.header.make_header(email.header.decode_header(v or "")))
    except Exception:
        return str(v or "")


def mac_mail(acc):
    r = subprocess.run(["osascript", "-", acc.get("account") or "", str(SCAN)], input=APPLESCRIPT, capture_output=True, text=True, timeout=110)
    if r.returncode:
        raise RuntimeError((r.stderr or "osascript a échoué").strip().splitlines()[-1][:200])
    unread, mine, msgs = 0, set(), []
    for rec in r.stdout.rstrip("\n").split(END):
        f = rec.split(SEP)
        if f[0] == "UNREAD":
            unread = int(f[1] or 0)
        elif f[0] == "MINE":
            mine = {x.strip().lower() for x in f[1].split(",") if x.strip()}
        elif f[0] == "MSG" and len(f) >= 8:
            name, addr = email.utils.parseaddr(f[2])
            at = datetime.fromisoformat(f[4]).replace(tzinfo=TZ) if f[4] else None
            tos = {x.strip().lower() for x in f[6].split(",") if x.strip()}
            mid = f[1].strip("<>")
            msgs.append({"id": mid, "name": name or addr, "addr": addr.lower(), "subject": f[3], "at": at, "flagged": f[5] == "true",
                         "to": tos, "robot": f[7] == "1", "open": "message://%3C" + urllib.parse.quote(mid) + "%3E"})
    since = datetime.now(TZ) - timedelta(days=DAYS)
    msgs = [m for m in msgs if not m["at"] or m["at"] >= since]
    for m in msgs:
        m["direct"] = bool(m.pop("to") & mine) if mine else True
    return unread, msgs


def secret(ref, user):
    """Mot de passe d'un compte : « keychain:<service> » = trousseau macOS (security), jamais écrit dans la config."""
    if not str(ref or "").startswith("keychain:"):
        raise RuntimeError("secret attendu au format keychain:<service>")
    r = subprocess.run(["security", "find-generic-password", "-s", ref.split(":", 1)[1], "-a", user, "-w"], capture_output=True, text=True, timeout=20)
    if r.returncode:
        raise RuntimeError("mot de passe introuvable dans le trousseau (" + ref + ")")
    return r.stdout.strip()


FIELDS = "FROM TO CC SUBJECT DATE MESSAGE-ID LIST-UNSUBSCRIBE LIST-ID AUTO-SUBMITTED PRECEDENCE"


def imap(acc):
    host, user = acc.get("host") or "", acc.get("user") or ""
    port = int(acc.get("port") or (993 if acc.get("ssl", True) else 143))
    c = imaplib.IMAP4_SSL(host, port, timeout=60) if acc.get("ssl", True) else imaplib.IMAP4(host, port, timeout=60)
    try:
        c.login(user, secret(acc.get("secret"), user))
        c.select("INBOX", readonly=True)
        crit = ["UNSEEN"] + (["X-GM-RAW", '"' + acc["only"].replace('"', "") + '"'] if acc.get("only") else [])
        typ, data = c.uid("SEARCH", *crit)
        uids = (data[0] or b"").split() if typ == "OK" else []
        since = datetime.now(TZ) - timedelta(days=DAYS)
        msgs = []
        for uid in uids[-200:]:
            typ, data = c.uid("FETCH", uid, "(FLAGS BODY.PEEK[HEADER.FIELDS (" + FIELDS + ")])")
            part = next((d for d in data or [] if isinstance(d, tuple)), None)
            if typ != "OK" or not part:
                continue
            h = BytesHeaderParser().parsebytes(part[1])
            name, addr = email.utils.parseaddr(dec(h.get("From")))
            try:
                at = email.utils.parsedate_to_datetime(h.get("Date")).astimezone(TZ)
            except Exception:
                at = None
            if at and at < since:
                continue
            tos = {a.lower() for _, a in email.utils.getaddresses([dec(h.get("To") or "")])}
            mid = (h.get("Message-ID") or "").strip().strip("<>")
            low = {k.lower() for k in h.keys()}
            prec = str(h.get("Precedence") or "").lower()
            msgs.append({"id": mid, "name": name or addr, "addr": addr.lower(), "subject": dec(h.get("Subject")), "at": at,
                         "flagged": b"\\Flagged" in part[0], "direct": user.lower() in tos,
                         "robot": bool(low & set(ROBOT)) and not str(h.get("Auto-Submitted") or "").lower().startswith("no") or prec in ("bulk", "list", "junk"),
                         "open": ("https://mail.google.com/mail/#search/rfc822msgid%3A" + urllib.parse.quote(mid)) if "gmail" in host and mid else None})
        return len(uids), msgs
    finally:
        try:
            c.logout()
        except Exception:
            pass


PROVIDERS = {"mac-mail": mac_mail, "imap": imap}


def rules(kind):
    return [r if isinstance(r, dict) else {"from": r} for r in (MAIL.get(kind) or []) if r]


def matches(rule, addr, acc_id):
    if rule.get("account") and rule["account"] != acc_id:
        return False
    f = str(rule.get("from") or "").strip().lower()
    if not f or not addr:
        return False
    if "@" in f and not f.startswith("@"):
        return addr == f
    dom = f.lstrip("@")
    host = addr.rsplit("@", 1)[-1]
    return host == dom or host.endswith("." + dom)


def sort_account(acc, unread, msgs, keep, ignore):
    """Utiles (les plus récents d'abord), ignorés regroupés par expéditeur, expéditeurs inconnus."""
    useful, ignored, unknown = [], {}, set()
    for m in msgs:
        ign, kp = any(matches(r, m["addr"], acc["id"]) for r in ignore), any(matches(r, m["addr"], acc["id"]) for r in keep)
        if not ign and not kp:
            unknown.add(m["addr"])
        if ign or (not kp and m["robot"]):
            k = m["name"] or m["addr"]
            ignored[k] = ignored.get(k, 0) + 1
        else:
            useful.append(m)
    useful.sort(key=lambda m: m["at"] or datetime.min.replace(tzinfo=TZ), reverse=True)
    hide = acc.get("show") == "count"
    row = lambda m: {"id": m["id"], "at": m["at"].isoformat() if m["at"] else None, "direct": m["direct"], "flagged": m["flagged"],
                     **({} if hide else {"name": m["name"][:80], "addr": m["addr"], "subject": (m["subject"] or "")[:MAX_SUBJECT], "open": m["open"]})}
    return {"unread": unread, "useful_n": len(useful), "useful": [row(m) for m in useful[:MAX_LIST]],
            "ignored": [] if hide else sorted(([k[:60], n] for k, n in ignored.items()), key=lambda x: -x[1])[:12],
            "ignored_n": sum(ignored.values()), "unknown": len(unknown)}


def main():
    keep, ignore = rules("keep"), rules("ignore")
    out = {"generated_at": datetime.now(TZ).isoformat(), "sorted": bool(keep or ignore), "accounts": []}
    for acc in MAIL.get("accounts") or []:
        acc = {"id": "mail", "provider": "mac-mail", **acc}
        base = {"id": acc["id"], "label": acc.get("label") or acc["id"], "color": acc.get("color"), "show": acc.get("show") or "list",
                "provider": acc["provider"]}
        try:
            fn = PROVIDERS.get(acc["provider"])
            if not fn:
                raise RuntimeError("fournisseur inconnu : " + acc["provider"])
            unread, msgs = fn(acc)
            out["accounts"].append({**base, "ok": True, **sort_account(acc, unread, msgs, keep, ignore)})
        except Exception as e:  # le compte reste affiché, en erreur, et le run le dit (KT-39)
            print("courrier : " + acc["id"] + " : " + str(e), file=sys.stderr)
            out["accounts"].append({**base, "ok": False, "error": str(e)[:200], "unread": 0, "useful_n": 0, "useful": [], "ignored": [],
                                    "ignored_n": 0, "unknown": 0})
    print(dumps(out))


main()
