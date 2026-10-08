"""Contrôle de fumée de la page assemblée (ne publie rien).

    python3 tools/smoke.py                       # installation de démonstration -> dist/office.html + contrôles statiques
    python3 tools/smoke.py --chrome              # + chargement dans Chrome headless : aucune exception JS
    python3 tools/smoke.py --chrome --shot dist/map.png --js "setMode('pause');T=DAY0+11*3600e3;needTeleport=true;"
    python3 tools/smoke.py --html dist/autre.html --chrome   # contrôler un fichier déjà assemblé

Contrôles : taille < 1 000 000 octets, chaque <script> (hors kronn-action) se parse (node, new Function),
les 9 blocs kronn-action du squelette sont présents à l'identique (ids de workflows remplacés), leur JSON est valide,
plus aucun marqueur __X__ ni /*__STYLES__*/ /*__SCRIPTS__*/ ne traîne.
--chrome demande websocket-client (`.venv/bin/pip install websocket-client`) ; Chrome est lancé muet
(--mute-audio), sur un profil jetable, puis arrêté.
"""
import argparse, base64, json, os, re, shutil, socket, subprocess, sys, tempfile, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402

LIMIT = 1_000_000
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ACTION_RE = re.compile(r'<script type="application/kronn-action" data-action-id="[^"]+">.*?</script>', re.S)
SCRIPT_RE = re.compile(r"<script([^>]*)>(.*?)</script>", re.S)
fails = []


def check(ok, msg):
    print(("ok   " if ok else "FAIL ") + msg)
    if not ok:
        fails.append(msg)


def static_checks(html, cfg=None):
    size = len(html.encode())
    check(size < LIMIT, f"taille {size} octets < {LIMIT}")
    # blocs kronn-action attendus : ceux du squelette, ids de workflows remplacés comme à l'assemblage
    tpl = open(os.path.join(ROOT, "page", "office_template.html")).read()
    c = assemble.config() if cfg is None else cfg
    acts = assemble.action_ids(c)  # comme build() dans assemble.py
    expected, total = [], 0
    for b in ACTION_RE.findall(tpl):
        total += 1
        key, mark = assemble.ACTIONS[re.search(r'data-action-id="([^"]+)"', b).group(1)]
        if acts.get(key):  # bouton sans workflow configuré : bloc retiré à l'assemblage
            expected.append(assemble.action_block(b, c))
    found = ACTION_RE.findall(html)
    check(total == 9, f"{total} blocs kronn-action dans le squelette (attendu 9)")
    check(found == expected, f"blocs kronn-action attendus présents à l'identique ({len(expected)}/9 configurés)")
    for b in found:
        body = b.split(">", 1)[1].rsplit("</script>", 1)[0]
        try:
            json.loads(body)
            check(True, "JSON kronn-action " + re.search(r'data-action-id="([^"]+)"', b).group(1))
        except ValueError as e:
            check(False, f"JSON kronn-action invalide : {e}")
    left = sorted(set(re.findall(r"__(?:SPRITES|LAYERS|CAST|MUSIC|SNAP|TEAM|ROSTER|CONFIG|OWNER|DEMO|ACTIONS|AVATAR_WF|GATE_WF|RELAUNCH_WF|ASK_QP)__|/\*__(?:STYLES|SCRIPTS)__\*/", html)))
    check(not left, "aucun marqueur restant" + (f" : {left}" if left else ""))
    scripts = [(a, s) for a, s in SCRIPT_RE.findall(html) if "kronn-action" not in a]
    check(len(scripts) == 1, f"{len(scripts)} <script> exécutable(s) (attendu 1)")
    for i, (_, js) in enumerate(scripts):
        r = subprocess.run(["node", "-e", "new Function(require('fs').readFileSync(0,'utf8'))"],
                           input=js, capture_output=True, text=True)
        check(r.returncode == 0, f"<script> #{i + 1} se parse ({len(js)} caractères)" + (f" : {r.stderr.strip()[-400:]}" if r.returncode else ""))


def free_port(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def chrome_checks(path, port, user_dir, js, shot, wait, width, height):
    try:
        import websocket
    except ImportError:
        check(False, "websocket-client manquant (pip install websocket-client) : contrôle Chrome impossible")
        return
    if not free_port(port):
        check(False, f"port {port} déjà occupé : choisir --port")
        return
    own_dir = user_dir is None
    user_dir = user_dir or tempfile.mkdtemp(prefix="bureau-smoke-")
    os.makedirs(user_dir, exist_ok=True)
    proc = subprocess.Popen([CHROME, "--headless=new", "--mute-audio", "--disable-gpu", "--no-first-run",
                             "--no-default-browser-check", f"--remote-debugging-port={port}",
                             f"--user-data-dir={user_dir}", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        tabs = None
        for _ in range(50):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                break
            except OSError:
                time.sleep(0.2)
        tab = [t for t in tabs or [] if t["type"] == "page"][0]
        ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=60, suppress_origin=True)
        n, events = [0], []

        def call(method, **params):
            n[0] += 1
            ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
            while True:
                m = json.loads(ws.recv())
                if "method" in m:
                    events.append(m)
                if m.get("id") == n[0]:
                    return m.get("result", m.get("error"))

        call("Runtime.enable")
        call("Log.enable")
        call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=False)
        call("Page.navigate", url="file://" + os.path.abspath(path))
        time.sleep(wait)
        r = call("Runtime.evaluate", returnByValue=True,
                 expression="JSON.stringify({chars:chars.length,data:!!DATA,mode,T})")
        info = (r.get("result") or {}).get("value")
        check(bool(info) and json.loads(info)["chars"] > 0, f"page démarrée : {info}")
        if js:
            r = call("Runtime.evaluate", expression=js, returnByValue=True, awaitPromise=True)
            check("exceptionDetails" not in r, "JS de test exécuté" + (f" : {json.dumps(r)[:300]}" if "exceptionDetails" in r else ""))
            time.sleep(1.5)
        if shot:
            data = call("Page.captureScreenshot", format="png", captureBeyondViewport=True)["data"]
            os.makedirs(os.path.dirname(os.path.abspath(shot)), exist_ok=True)
            open(shot, "wb").write(base64.b64decode(data))
            print("     capture :", shot)
        call("Runtime.evaluate", expression="0")  # vide la file d'événements
        exc = [e["params"]["exceptionDetails"] for e in events if e.get("method") == "Runtime.exceptionThrown"]
        errs = [e["params"] for e in events if e.get("method") == "Runtime.consoleAPICalled" and e["params"]["type"] == "error"]
        for x in exc:
            print("     EXC", json.dumps(x)[:500])
        for x in errs:
            print("     console.error", [a.get("value", a.get("description")) for a in x["args"]][:3])
        check(not exc, f"aucune exception JS ({len(exc)})")
        check(not errs, f"aucun console.error ({len(errs)})")
        ws.close()
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        if own_dir:
            shutil.rmtree(user_dir, ignore_errors=True)


# installation neuve : pas de profil d'équipe, la personne qui installe est gardée dans sa config locale
NEW_TEAM = {"owner": "p_pam", "people": [{"key": "p_pam", "name": "Pam", "role": "Développeur", "person": "Pam Beesly"}]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", help="fichier déjà assemblé à contrôler (sinon : assemble dist/office.html)")
    ap.add_argument("--chrome", action="store_true", help="charger la page dans Chrome headless")
    ap.add_argument("--port", type=int, default=9334, help="port de débogage Chrome (défaut 9334)")
    ap.add_argument("--user-data-dir", help="profil Chrome (défaut : dossier temporaire supprimé à la fin)")
    ap.add_argument("--js", default="", help="JS exécuté dans la page avant la capture")
    ap.add_argument("--shot", help="capture PNG")
    ap.add_argument("--wait", type=float, default=3.0, help="secondes d'attente après le chargement")
    ap.add_argument("--size", default="1400x1400", help="fenêtre LxH")
    ap.add_argument("--empty", action="store_true", help="page d'une installation neuve : équipe neuve (la seule personne qui "
                    "installe), plan type, sans démo ni boutons")
    a = ap.parse_args()
    if a.html:
        path = a.html
        html = open(path).read()
    else:
        cfg = NEW_TEAM if a.empty else assemble.demo_config()
        html = assemble.build(demo=not a.empty, cfg=cfg)
        path = os.path.join(ROOT, "dist", "office_empty.html" if a.empty else "office.html")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "w").write(html)
        print("     assemblé :", path)
    static_checks(html, NEW_TEAM if a.empty else assemble.demo_config())
    if a.chrome or a.shot:
        w, h = (int(x) for x in a.size.split("x"))
        chrome_checks(path, a.port, a.user_data_dir, a.js, a.shot, a.wait, w, h)
    print("SMOKE", "KO : " + "; ".join(fails) if fails else "OK")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
