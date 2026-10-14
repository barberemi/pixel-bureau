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
import email.header, email.utils, imaplib, json, os, subprocess, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta
from email.parser import BytesHeaderParser
from _lib import CFG, TZ, dumps, get

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
        if (item 3 of argv) is "all" or item i of lRead is false then
          set t to ""
          repeat with x in item i of lTo
            set t to t & x & ","
          end repeat
          set robot to ""
          repeat with k in {"List-Unsubscribe:", "List-Id:", "Auto-Submitted: auto", "Precedence: bulk", "Precedence: list"}
            if (item i of lHead) contains k then set robot to "1"
          end repeat
          set out to out & "MSG" & FS & (item i of lId) & FS & (item i of lFrom) & FS & (item i of lSubj) & FS & ((item i of lDate) as «class isot» as string) & FS & (item i of lFlag) & FS & t & FS & robot & FS & (item i of lRead) & RS
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


def mac_mail(acc, every=False):
    r = subprocess.run(["osascript", "-", acc.get("account") or "", str(SCAN), "all" if every else "unread"], input=APPLESCRIPT,
                       capture_output=True, text=True, timeout=110)
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
                         "to": tos, "robot": f[7] == "1", "read": len(f) > 8 and f[8] == "true",
                         "open": "message://%3C" + urllib.parse.quote(mid) + "%3E"})
    since = datetime.now(TZ) - timedelta(days=30 if every else DAYS)
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


def imap(acc, every=False):
    host, user = acc.get("host") or "", acc.get("user") or ""
    port = int(acc.get("port") or (993 if acc.get("ssl", True) else 143))
    c = imaplib.IMAP4_SSL(host, port, timeout=60) if acc.get("ssl", True) else imaplib.IMAP4(host, port, timeout=60)
    try:
        c.login(user, secret(acc.get("secret"), user))
        c.select("INBOX", readonly=True)
        since = datetime.now(TZ) - timedelta(days=30 if every else DAYS)
        crit = (["SINCE", since.strftime("%d-%b-%Y")] if every else ["UNSEEN"]) + (["X-GM-RAW", '"' + acc["only"].replace('"', "") + '"'] if acc.get("only") else [])
        typ, data = c.uid("SEARCH", *crit)
        uids = (data[0] or b"").split() if typ == "OK" else []
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
                         "flagged": b"\\Flagged" in part[0], "direct": user.lower() in tos, "read": b"\\Seen" in part[0],
                         "robot": bool(low & set(ROBOT)) and not str(h.get("Auto-Submitted") or "").lower().startswith("no") or prec in ("bulk", "list", "junk"),
                         "open": ("https://mail.google.com/mail/#search/rfc822msgid%3A" + urllib.parse.quote(mid)) if "gmail" in host and mid else None})
        return len(uids), msgs
    finally:
        try:
            c.logout()
        except Exception:
            pass


PROVIDERS = {"mac-mail": mac_mail, "imap": imap}


def page_rules():
    """Règles validées (dataset mail_rules, publié par le workflow « règles du courrier »), sinon None."""
    try:
        cur = next((d.get("current") for d in get(f"/pages/{CFG['page_id']}", timeout=20).get("datasets") or [] if d.get("name") == "mail_rules"), None)
        cur = json.loads(cur) if isinstance(cur, str) else cur
        return cur if isinstance(cur, dict) and ("keep" in cur or "ignore" in cur) else None
    except Exception as e:
        print("courrier : règles de la page illisibles (" + str(e)[:80] + "), celles de la config", file=sys.stderr)
        return None


RULES = page_rules() if CFG.get("page_id") and (CFG.get("kronn") or {}).get("api") else None


def rules(kind):
    src = RULES if RULES is not None else MAIL
    return [r if isinstance(r, dict) else {"from": r} for r in (src.get(kind) or []) if r]


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


def messenger_of(m, acc_id):
    """Règle de porteur (mail.messengers) qui prend ce mail : objet qui contient un des textes, ou expéditeur (adresse,
    domaine), pour tous les comptes ou un seul ; la première qui correspond l'emporte. Elle passe avant le tri."""
    for rule in MAIL.get("messengers") or []:
        if rule.get("account") and rule["account"] != acc_id:
            continue
        mt = rule.get("match") or {}
        subj = str(m.get("subject") or "").lower()
        if any(str(x).lower() in subj for x in mt.get("subject_contains") or []) or \
                any(matches({"from": f}, m["addr"], acc_id) for f in mt.get("from") or []):
            return rule
    return None


def sort_account(acc, unread, msgs, keep, ignore):
    """Utiles (les plus récents d'abord), ignorés regroupés par expéditeur, expéditeurs inconnus, mails remis en
    personne par un porteur (hors du compteur de la boîte)."""
    useful, ignored, unknown, carried = [], {}, set(), []
    for m in msgs:
        rule = messenger_of(m, acc["id"])
        if rule:
            carried.append((rule, m))
            continue
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
    carry = [{**row(m), "rule": rule.get("id") or "porteur", "carrier": rule.get("carrier"), "bubble": rule.get("bubble") or "📨",
              "when": rule.get("when") or "arrival"} for rule, m in carried[:MAX_LIST]]
    return {"unread": unread, "useful_n": len(useful), "useful": [row(m) for m in useful[:MAX_LIST]], "carried": carry,
            "ignored": [] if hide else sorted(([k[:60], n] for k, n in ignored.items()), key=lambda x: -x[1])[:12],
            "ignored_n": sum(ignored.values()), "unknown": len(unknown)}


ASK_EVERY = timedelta(days=7)  # le facteur revient proposer des règles au plus une fois par semaine
ASK_UNKNOWN = 10  # … quand au moins 10 expéditeurs ne sont couverts par aucune règle
STATE = os.path.join(os.path.expanduser("~"), ".cache", "pixel-bureau", "mail_rules.json")


def ask_rules(out):
    """Lance le workflow « règles du courrier » (actions.mail_rules) : la première fois, puis s'il y a du nouveau."""
    wf = (CFG.get("actions") or {}).get("mail_rules")
    if not wf or not any(a["ok"] for a in out["accounts"]):
        return
    unknown = sum(a["unknown"] for a in out["accounts"])
    try:
        with open(STATE) as fh:
            asked = datetime.fromisoformat(json.load(fh)["asked_at"])
    except (OSError, ValueError, KeyError):
        asked = None
    now = datetime.now(TZ)
    due = (not out["sorted"] and (not asked or now - asked > ASK_EVERY)) or (out["sorted"] and unknown >= ASK_UNKNOWN and (not asked or now - asked > ASK_EVERY))
    if not due:
        return
    try:
        req = urllib.request.Request((CFG.get("kronn") or {}).get("api", "") + "/mcp/workflow-trigger", method="POST",
                                     headers={"content-type": "application/json"}, data=json.dumps({"workflow_id": wf}).encode())
        urllib.request.urlopen(req, timeout=30).read()
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        with open(STATE, "w") as fh:
            json.dump({"asked_at": now.isoformat(), "unknown": unknown}, fh)
        print("courrier : le facteur vient proposer des règles (" + str(unknown) + " expéditeurs inconnus)", file=sys.stderr)
    except Exception as e:
        print("courrier : règles non demandées (" + str(e)[:120] + ")", file=sys.stderr)


def senders():
    """Résumé des expéditeurs des 30 derniers jours (lus compris), par compte, pour proposer des règles : adresse, nom,
    nombre de mails, non lus, part d'envois automatiques. Jamais un objet ni un contenu."""
    out = {"accounts": [], "rules": {"keep": (RULES or MAIL).get("keep") or [], "ignore": (RULES or MAIL).get("ignore") or []}}
    for acc in MAIL.get("accounts") or []:
        acc = {"id": "mail", "provider": "mac-mail", **acc}
        try:
            _, msgs = PROVIDERS[acc["provider"]](acc, every=True)
        except Exception as e:
            print("courrier : " + acc["id"] + " : " + str(e), file=sys.stderr)
            continue
        by = {}
        for m in msgs:
            s = by.setdefault(m["addr"], {"addr": m["addr"], "name": (m["name"] or "")[:60], "n": 0, "unread": 0, "robot": 0})
            s["n"] += 1
            s["unread"] += 0 if m.get("read") else 1
            s["robot"] += 1 if m["robot"] else 0
        top = sorted(by.values(), key=lambda s: -s["n"])[:80]
        out["accounts"].append({"id": acc["id"], "label": acc.get("label") or acc["id"], "senders": top})
    print(dumps(out))


def merge():
    """Proposition de l'agent + règles actuelles -> nouveau dataset mail_rules (stdout) et le texte du gate (stderr)."""
    data = json.loads(sys.stdin.read() or "{}")
    prop, summary = data.get("proposal") or {}, data.get("summary") or {}
    cur = summary.get("rules") or {}
    key = lambda r: json.dumps(r, sort_keys=True) if isinstance(r, dict) else str(r).strip().lower()  # noqa: E731
    keep = {key(r): r for r in cur.get("keep") or []}
    ignore = {key(r): r for r in cur.get("ignore") or []}
    added = {"keep": [], "ignore": []}
    for kind, mine, other in (("keep", keep, ignore), ("ignore", ignore, keep)):
        for r in prop.get(kind) or []:
            if not r or key(r) in mine:
                continue
            mine[key(r)] = r
            other.pop(key(r), None)
            added[kind].append(r)
    count = {}
    for a in summary.get("accounts") or []:
        for snd in a.get("senders") or []:
            count[snd["addr"]] = count.get(snd["addr"], 0) + snd["n"]
    n_of = lambda r: sum(n for addr, n in count.items() if matches(r if isinstance(r, dict) else {"from": r}, addr, ""))  # noqa: E731
    label = lambda r: (r.get("from") + " (" + r.get("account") + ")") if isinstance(r, dict) else str(r)  # noqa: E731
    lines = ["Garder : " + (", ".join(f"{label(r)} ({n_of(r)})" for r in added["keep"]) or "rien de nouveau"),
             "Ignorer : " + (", ".join(f"{label(r)} ({n_of(r)})" for r in added["ignore"]) or "rien de nouveau")]
    if prop.get("why"):
        lines += ["", "Pourquoi : " + str(prop["why"])[:600]]
    print("\n".join(lines), file=sys.stderr)
    print(dumps({"updated_at": datetime.now(TZ).isoformat(), "keep": list(keep.values()), "ignore": list(ignore.values()), "by": "facteur"}))


READ_SCRIPT = r'''
on run argv
  tell application "Mail"
    set ib to missing value
    repeat with m in mailboxes of inbox
      if (name of account of m) is (item 1 of argv) then set ib to m
    end repeat
    set n to count of messages of ib
    if n > ((item 3 of argv) as integer) then set n to (item 3 of argv) as integer
    set lId to message id of messages 1 thru n of ib
    repeat with i from 1 to n
      if (item i of lId) is (item 2 of argv) then
        set read status of message i of ib to true
        return "ok"
      end if
    end repeat
  end tell
  return "absent"
end run
'''


def mark_read():
    """Bouton « Lu ✓ » (workflow « Le Bureau · lu ») : argv = id du compte, Message-ID ; marque le mail lu (appli Mail ou
    IMAP), puis relance le cron courrier pour que la page le voie tout de suite."""
    acc_id, _, mid = sys.argv[2].partition("|")  # « compte|Message-ID » (ligne read_rows du dataset)
    mid = mid.strip("<>")
    acc = next(({"provider": "mac-mail", **a} for a in MAIL.get("accounts") or [] if a.get("id") == acc_id), None)
    if not acc:
        raise SystemExit("compte inconnu : " + acc_id)
    if acc["provider"] == "mac-mail":
        r = subprocess.run(["osascript", "-", acc.get("account") or "", mid, str(SCAN)], input=READ_SCRIPT, capture_output=True, text=True, timeout=110)
        done = r.returncode == 0 and r.stdout.strip() == "ok"
    else:
        port = int(acc.get("port") or (993 if acc.get("ssl", True) else 143))
        c = imaplib.IMAP4_SSL(acc["host"], port, timeout=60) if acc.get("ssl", True) else imaplib.IMAP4(acc["host"], port, timeout=60)
        c.login(acc["user"], secret(acc.get("secret"), acc["user"]))
        c.select("INBOX")
        typ, data = c.uid("SEARCH", "HEADER", "Message-ID", "<" + mid + ">")
        uids = (data[0] or b"").split() if typ == "OK" else []
        for uid in uids:
            c.uid("STORE", uid, "+FLAGS", "(\\Seen)")
        c.logout()
        done = bool(uids)
    wf = (CFG.get("workflows") or {}).get("courrier")
    if done and wf:
        try:
            urllib.request.urlopen(urllib.request.Request((CFG.get("kronn") or {}).get("api", "") + "/mcp/workflow-trigger", method="POST",
                                   headers={"content-type": "application/json"}, data=json.dumps({"workflow_id": wf}).encode()), timeout=30).read()
        except Exception as e:
            print("courrier : relevé non relancé (" + str(e)[:120] + ")", file=sys.stderr)
    print(dumps({"read": done, "account": acc_id, "id": mid}))
    if not done:
        raise SystemExit("mail introuvable (déjà lu, ou plus dans les " + str(SCAN) + " derniers)")


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
            out["accounts"].append({**base, "ok": False, "error": str(e)[:200], "unread": 0, "useful_n": 0, "useful": [], "carried": [], "ignored": [],
                                    "ignored_n": 0, "unknown": 0})
    # lignes du bouton « Lu ✓ » de la page (action bureau-mailread) : un mail remis en personne = « compte|Message-ID »
    out["read_rows"] = [{"id": a["id"] + "|" + m["id"]} for a in out["accounts"] for m in a.get("carried") or [] if m.get("id")]
    print(dumps(out))
    ask_rules(out)


{"senders": senders, "merge": merge, "read": mark_read}.get(sys.argv[1] if len(sys.argv) > 1 else "", main)()
