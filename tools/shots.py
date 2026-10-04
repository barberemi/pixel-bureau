"""Captures des pages de fonctionnalités (docs/img/*.png), sur la page de démo (data/), dans Chrome headless.

  .venv/bin/python tools/shots.py            # toutes les captures
  .venv/bin/python tools/shots.py plan tv    # seulement celles-ci

Chaque capture : page rechargée, mise en scène en JS (heure, sélection, mode), puis rognée sur un élément.
Démo du jeudi 1er octobre, plan à 11h sauf mention contraire. websocket-client requis (comme smoke.py --chrome).
"""
import base64, contextlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402
from smoke import CHROME, free_port  # noqa: E402

OUT = os.path.join(ROOT, "docs", "img")
PORT = 9335
# avant chaque capture : hors mode TV (mémorisé par le navigateur), visite guidée fermée, lecture en pause à 11h, personnages posés à leur place
AT = lambda h: f"if(TV)setTv(false);tourShow(-1);setMode('pause');T=DAY0+{h}*3600e3;needTeleport=true;"  # noqa: E731
WAIT = "new Promise(r=>setTimeout(r,2500))"
# nom -> (largeur, hauteur, JS de mise en scène, sélecteur à rogner ; None = la fenêtre[, échelle de la capture])
SHOTS = {
    "plan": (1400, 1000, AT(11), "#cv", 1.5),
    "legende": (1400, 1600, AT(11) + "document.querySelector('.legend-help').open=true;", ".legend-help"),
    "a-traiter": (1400, 1000, AT(11), "#todo"),
    "qui-fait-quoi": (1400, 1400, AT(11), "#who"),
    "fil": (1400, 1400, AT(11) + "document.querySelector('#feed').style.maxHeight='520px';"
            "document.querySelector('#feed').style.overflow='hidden';", ".feed"),
    "recap": (1400, 1200, AT(11) + "RECAP_OPEN=true;renderRecap();", "#recap"),
    "rejouer": (1400, 1200, AT(9.7) + "setMode('play');", ".stage", 1.5),
    "tv": (1600, 900, AT(11) + "setTv(true);", None),
    "standup": (1600, 900, AT(9.7) + "setTv(true);TVSCENE.manual=true;TVSCENE.idx=0;updateTv(true);", None),
    "fiche-agent": (1400, 1400, AT(11) + "select((chars.find(c=>!c.person&&!c.visitor&&c.runs.length)||{}).key);", "#side"),
    "fiche-collegue": (1400, 1400, AT(11) + "select((chars.find(c=>c.person&&c.team&&c.team.tickets.length)||{}).key);", "#side"),
    "kanban": (1400, 1400, AT(11) + "select('kanban');", "#side"),
    "planning": (1400, 1400, AT(11) + "select('planning');", "#side"),
    "mep": (1400, 1400, AT(11.6) + "select('tv');", "#side"),
    "avatar": (1400, 1600, AT(11) + "select('jim');openEditor(byKey.jim);", "#side"),
    "mobile": (390, 1200, AT(11), None),
    "visite": (1400, 1000, AT(11) + "tourShow(0);", None),
    # thèmes saisonniers (46-themes.js), forcés sur la journée de démo, de jour (11h) et le soir (20h15)
    **{f"theme-{name}": (1400, 1000, AT(h) + f"THEME_FORCE='{tid}';", "#cv", 1.5)
       for name, tid, h in (("halloween", "halloween", 20.25), ("halloween-jour", "halloween", 11), ("noel", "noel", 11),
                            ("noel-soir", "noel", 20.25), ("nouvel-an", "nouvel-an", 11), ("nouvel-an-soir", "nouvel-an", 20.25),
                            ("saint-valentin", "saint-valentin", 11))},
}


def build_page(cfg=None):
    """Page de démo assemblée dans dist/ (cfg : config d'installation, par exemple un autre plan)."""
    path = os.path.join(ROOT, "dist", "office.html")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(assemble.build(demo=True, cfg=cfg))
    return path


@contextlib.contextmanager
def chrome(port=PORT):
    """Chrome headless jetable ; renvoie call(méthode, **paramètres) du protocole DevTools."""
    import websocket
    if not free_port(port):
        sys.exit(f"port {port} déjà occupé")
    user_dir = tempfile.mkdtemp(prefix="bureau-shots-")
    proc = subprocess.Popen([CHROME, "--headless=new", "--mute-audio", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                             f"--remote-debugging-port={port}", f"--user-data-dir={user_dir}", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                break
            except OSError:
                time.sleep(0.2)
        tab = next(t for t in tabs if t["type"] == "page")
        ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=60, suppress_origin=True)
        n = [0]

        def call(method, **params):
            n[0] += 1
            ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == n[0]:
                    return m.get("result", m.get("error"))
        yield call
        ws.close()
    finally:
        proc.terminate()
        proc.wait(10)
        shutil.rmtree(user_dir, ignore_errors=True)


def capture(call, page, w, h, js, sel, scale=1):
    """Recharge la page, joue la mise en scène, renvoie le PNG (bytes) de l'élément sel (None = la fenêtre), ou un message d'erreur."""
    call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=w < 600)
    call("Page.navigate", url="file://" + page)
    time.sleep(3)
    r = call("Runtime.evaluate", expression=js + WAIT, awaitPromise=True)
    if "exceptionDetails" in r:
        return json.dumps(r["exceptionDetails"])[:300]
    clip = None
    if sel:
        clip = call("Runtime.evaluate", returnByValue=True, expression=(
            f"(()=>{{const e=document.querySelector({sel!r});if(!e)return null;const r=e.getBoundingClientRect();"
            f"return {{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:{scale}}};}})()"))["result"].get("value")
        if not clip or not clip["width"]:
            return f"élément {sel} absent ou vide"
    shot = call("Page.captureScreenshot", format="png", captureBeyondViewport=bool(clip), **({"clip": clip} if clip else {}))
    return base64.b64decode(shot["data"])


def main(names):
    names = names or list(SHOTS)
    os.makedirs(OUT, exist_ok=True)
    page = build_page()
    with chrome() as call:
        for name in names:
            w, h, js, sel, scale = (*SHOTS[name], 1)[:5]
            png = capture(call, page, w, h, js, sel, scale)
            if isinstance(png, str):
                print(f"✗ {name} : {png}")
                continue
            with open(os.path.join(OUT, name + ".png"), "wb") as f:
                f.write(png)
            print(f"✓ docs/img/{name}.png")


if __name__ == "__main__":
    main(sys.argv[1:])
