"""Courrier (#30), en terminal.

    python3 tools/mail.py rules    # le facteur relit tes expéditeurs et te propose des règles ; tu valides dans la page

Lance le workflow « Le Bureau · règles du courrier » (clé actions.mail_rules de bureau.config.json, créé par l'installation
avec un compte de courrier) : résumé des expéditeurs des 30 derniers jours, proposition de l'agent, puis la validation
du boss (le facteur attend devant son bureau), et les règles validées vont dans le dataset mail_rules.
"""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rules(cfg):
    wf = (cfg.get("actions") or {}).get("mail_rules")
    if not wf:
        print("Pas de workflow « règles du courrier » : relance python3 tools/install.py et branche un compte de courrier.", file=sys.stderr)
        return 1
    req = urllib.request.Request(cfg["kronn"]["api"].rstrip("/") + "/mcp/workflow-trigger", method="POST",
                                 headers={"content-type": "application/json"}, data=json.dumps({"workflow_id": wf}).encode())
    with urllib.request.urlopen(req, timeout=60) as r:
        run = json.load(r)
    run = run.get("data", run)
    print(f"✓ le facteur arrive (run {str(run.get('run_id'))[:8]}) : sa proposition t'attend dans la page, chez le boss")
    return 0


def main(argv):
    if argv[:1] != ["rules"]:
        print(__doc__)
        return 2
    with open(os.environ.get("BUREAU_CONFIG") or os.path.join(ROOT, "bureau.config.json")) as fh:
        return rules(json.load(fh))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
