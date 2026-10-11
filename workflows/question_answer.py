"""Répond à une question de discussion depuis la page Le Bureau (page action « bureau-answer »).

Arguments : choice [text]
  choice : id d'une ligne du dataset gates.qrows (ligne cliquée, relue par Kronn, jamais saisie), « <question>|<réponse> » :
           <option> = cette option (question simple) ; all:<option> = cette option pour chaque item (formulaire) ;
           _text = réponse libre ; _decline = refus
  text : réponse libre (obligatoire pour _text), commentaire joint à l'option, ou raison du refus
La question est relue dans Kronn : déjà décidée ou disparue, rien n'est envoyé. Kronn valide encore la réponse
(POST /api/discussions/{d}/questions/{q}/answer ou /decline) ; la clé d'idempotence évite une double réponse.
"""
import hashlib, json, re, sys, urllib.request, urllib.error
from _lib import API, CFG

PAGE = CFG["page_id"]
ROW = re.compile(r"^([\w-]{1,80})\|(all:[\w-]{1,80}|_text|_decline|[\w-]{1,80})$")


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def call(path, body=None):
    req = urllib.request.Request(f"{API}{path}", method="POST" if body is not None else "GET",
                                 headers={"content-type": "application/json"}, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        fail(f"Kronn a refusé la réponse ({e.code}) : {e.read()[:300].decode(errors='replace')}")
    if not res.get("success"):
        fail("Kronn a refusé la réponse : " + str(res.get("error")))
    return res["data"]


args = sys.argv[1:] + [""] * 2
choice, text = args[0].strip(), args[1].strip()
m = ROW.match(choice)
if not m:
    fail("Réponse invalide : recharge la page.")
qid, pick = m.groups()
cur = next((d.get("current") for d in call(f"/pages/{PAGE}").get("datasets") or [] if d.get("name") == "gates"), None) or {}
if isinstance(cur, str):
    cur = json.loads(cur)
row = next((r for r in cur.get("qrows") or [] if r.get("id") == choice), None)
if not row:
    fail("Cette question n'est plus en attente (déjà décidée ?) : recharge la page.")
disc = row["disc"]
q = next((x for x in call(f"/discussions/{disc}/questions").get("questions") or [] if x.get("id") == qid), None)
if not q or q.get("state") != "pending":
    fail("Cette question n'est plus en attente (déjà décidée dans Kronn ?).")
key = "bureau-" + hashlib.sha1(f"{qid}|{pick}|{text}".encode()).hexdigest()[:32]
labels = {o["id"]: o.get("label") or o["id"] for o in q.get("options") or []}
if pick == "_decline":
    call(f"/discussions/{disc}/questions/{qid}/decline", {"idempotency_key": key, "reason": text or None})
    print("Question refusée" + (f" : {text}" if text else "") + ". L'agent est prévenu.")
    sys.exit(0)
if pick == "_text":
    if not text:
        fail("Écris ta réponse dans le champ Texte.")
    body = {"selected_option_ids": [], "item_answers": [], "text": text}
elif pick.startswith("all:"):
    opt = pick[4:]
    if opt not in labels or not q.get("items"):
        fail("Option inconnue pour ce formulaire : recharge la page.")
    body = {"selected_option_ids": [], "item_answers": [{"item_id": i["id"], "selected_option_id": opt} for i in q["items"]], "text": text or None}
else:
    if pick not in labels or q.get("items"):
        fail("Option inconnue pour cette question : recharge la page.")
    body = {"selected_option_ids": [pick], "item_answers": [], "text": text or None}
call(f"/discussions/{disc}/questions/{qid}/answer", dict(body, idempotency_key=key))
what = f"« {labels[pick[4:]]} » pour les {len(q['items'])} items" if pick.startswith("all:") else f"« {labels[pick]} »" if pick in labels else "ta réponse libre"
print(f"Réponse envoyée : {what}. L'agent reprend la discussion.")
