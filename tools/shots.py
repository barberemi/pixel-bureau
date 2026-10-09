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
# avant chaque capture : hors mode TV (mémorisé par le navigateur), lecture en pause à 11h, personnages posés à leur place
AT = lambda h: f"applySkin('classique');if(TV)setTv(false);setMode('pause');T=DAY0+{h}*3600e3;needTeleport=true;"  # noqa: E731
WAIT = "new Promise(r=>setTimeout(r,2500))"
# nom -> (largeur, hauteur, JS de mise en scène, sélecteur à rogner ; None = la fenêtre[, échelle de la capture[, autre plan]])
SHOTS = {
    "plan": (1400, 1000, AT(11), "#cv", 1.5),
    # agents mis en avant (« Sur le plan » : agents) : icône, prénom et métier de chacun
    "etiquettes-agents": (1400, 1000, AT(11) + "FILTER='wf';NAMES='all';renderSide();", "#cv", 1.5),
    # ticket réouvert à 10h50 : face-à-face de Pam avec Karen (testeuse) et le mage, devant le bureau du boss
    "reopen-testeur": (1400, 1000, AT(10 + 51 / 60), "#cv", 1.5),
    # mise en prod d'Andy finie à 10h42 : le sage le félicite sur la scène du plateau TV, Michael au sax
    "prod-heraut": (1400, 1000, AT(10 + 43.5 / 60), "#cv", 1.5),
    # scènes d'équipe (37-scenes.js) : Gabe livre DM-6717 à Karen, Karen valide DM-6550 de Michael (le boss)
    "scene-livraison": (1400, 1000, AT(11 + 11 / 60), "#cv", 1.5),
    "scene-validation": (1400, 1000, AT(11 + 21 / 60), "#cv", 1.5),
    # dernier jour du sprint (fin du sprint ramenée au jour de la démo) et premier jour, après le daily
    "scene-pizza": (1400, 1000, AT(12 + 10 / 60) + "TEAM.sprint.end='2026-10-01T15:00:00Z';", "#cv", 1.5),
    "scene-kickoff": (1400, 1000, AT(9 + 56 / 60) + "TEAM.sprint.start='2026-10-01T07:00:00Z';", "#cv", 1.5),
    "legende": (1400, 1600, AT(11) + "document.querySelector('.legend-help').open=true;", ".legend-help"),
    # thème Classique (le défaut) : même cadrage que theme-equipe
    "theme-classique": (1400, 1000, AT(11) + "select((chars.find(c=>c.person&&c.team&&c.team.tickets.length)||{}).key);scrollTo(0,0);", None),
    # mode TV du thème Equipe (« Equipe nuit ») : le plan, le stand-up, le tour de table de la rétro
    "theme-equipe-tv": (1600, 900, AT(11) + "setTv(true);applySkin('equipe');", None),
    "theme-equipe-tv-standup": (1600, 900, AT(9.7) + "setTv(true);applySkin('equipe');TVSCENE.manual='daily';TVSCENE.idx=0;updateTv(true);", None),
    "theme-equipe-tv-retro": (1600, 900, AT(15 + 10 / 60) + "setTv(true);applySkin('equipe');TVSCENE.manual=null;TVSCENE.idx=4;updateTv(true);", None),
    # thème Equipe (bouton 🎨) : habillage pixel aux couleurs d'Equipe, fiche d'un collègue ouverte
    "theme-equipe": (1400, 1000, AT(11) + "applySkin('equipe');select((chars.find(c=>c.person&&c.team&&c.team.tickets.length)||{}).key);scrollTo(0,0);", None),
    "qui-fait-quoi": (1400, 1400, AT(11), "#who"),
    "fil": (1400, 1400, AT(11) + "document.querySelector('#feed').style.maxHeight='520px';"
            "document.querySelector('#feed').style.overflow='hidden';", ".feed"),
    "recap": (1400, 1200, AT(11) + "RECAP_OPEN=true;renderRecap();", "#recap"),
    "rejouer": (1400, 1200, AT(9.7) + "setMode('play');", ".stage", 1.5),
    "tv": (1600, 900, AT(11) + "setTv(true);", None),
    # « Qui fait quoi » de l'écran mural, défilé jusqu'aux agents (actifs ou en panne, nommés par leur métier)
    "tv-agents": (1600, 900, AT(11) + "setTv(true);setTimeout(()=>{TVSCROLL.hold=performance.now()+1e6;const b=document.querySelector('#tvwho'),"
                  "h=[...b.querySelectorAll('h2')][1];b.scrollTop=h?h.offsetTop-300:0;},1500);", "#tvwho"),
    "standup": (1600, 900, AT(9.7) + "setTv(true);TVSCENE.manual='daily';TVSCENE.idx=0;updateTv(true);", None),
    # tour de table : la testeuse, ses réouverts puis ses testés (travail Jira de la semaine simulé)
    "standup-testeur": (1600, 900, AT(9.7) + "const k=chars.find(c=>c.roleKind==='qa');k.jira_id=k.jira_id||'qa';TEAM.work=Object.assign({},TEAM.work,{[k.jira_id]:"
                        "{written:[],triaged:[],tested:TEAM.people.flatMap(p=>p.tickets).filter(x=>x.cat==='done').slice(0,7).map(x=>({...x,cat:'test',status:'To Test'})),"
                        "reopened:[{key:'DM-7089',summary:'[Panier] Alléger le bundle',cat:'doing',status:'Reopen'}]}});"
                        "setTv(true);TVSCENE.manual='daily';TVSCENE.idx=standupScenes().findIndex(s=>s.c&&s.c.roleKind==='qa');updateTv(true);", None),
    # loupe (44-loupe.js) sur la réouverture de 10h50 : cadre sur la salle de réunion, fenêtre flottante agrandie et sa légende
    "loupe": (1400, 900, AT(10 + 51 / 60) + "setTimeout(()=>{LOUPE.seen=new Set();const ev=loupeScan().find(e=>e.kind==='reopen');LOUPE.resume=true;LOUPE.hoverUntil=0;loupeShow(ev,performance.now());},1200);", None),
    "loupe-daily": (1400, 900, AT(9.7) + "setTimeout(()=>{LOUPE.seen=new Set();const ev=loupeScan().find(e=>e.kind==='daily');LOUPE.resume=true;LOUPE.hoverUntil=0;loupeShow(ev,performance.now());},1200);", None),
    "loupe-tv": (1600, 900, AT(10 + 51 / 60) + "setTv(true);setTimeout(()=>{LOUPE.seen=new Set();const ev=loupeScan().find(e=>e.kind==='reopen');LOUPE.resume=true;LOUPE.hoverUntil=0;loupeShow(ev,performance.now());},1200);", None),
    # tour de table : la facilitatrice présente les tickets créés par l'équipe depuis le dernier daily
    "standup-facilitatrice": (1600, 900, AT(9.7) + "setTv(true);TVSCENE.manual='daily';"
                              "TVSCENE.idx=standupScenes().findIndex(s=>s.c&&s.c.roleKind==='sm');updateTv(true);", None),
    # cérémonies en salle de réunion : rétro un jeudi sur deux à 15h (le jour de la démo en est un), planning le vendredi
    # à 10h (avancé au jeudi pour la démo) ; animateur en bout de table, scènes TV de chacune
    "scene-planning": (1400, 1000, AT(10 + 10 / 60) + "RHYTHM.planning.day='Thu';", "#cv", 1.5),
    "scene-retro": (1400, 1000, AT(15 + 10 / 60), "#cv", 1.5),
    "planning-tv": (1600, 900, AT(10 + 10 / 60) + "RHYTHM.planning.day='Thu';setTv(true);TVSCENE.manual=null;TVSCENE.idx=0;updateTv(true);", None),
    "retro-tv": (1600, 900, AT(15 + 10 / 60) + "setTv(true);TVSCENE.manual=null;TVSCENE.idx=2;updateTv(true);", None),
    "retro-tour": (1600, 900, AT(15 + 10 / 60) + "setTv(true);TVSCENE.manual=null;TVSCENE.idx=4;updateTv(true);", None),
    # piles des bureaux à 11h : barres de tickets, feuilles de Kelly (tickets créés depuis le daily de 9h40), dossiers de Karen
    "piles-bureaux": (1400, 1000, AT(11), "#cv", 1.5),
    # écran du boss : ses autres pages Kronn (dataset bosspages) ; miniatures dessinées pour la démo, fenêtre ouverte
    # passions (roster passion) : Gabe en séance de tirs au panier, à son créneau du jour
    "passions": (1400, 1000, AT(11) + "byKey.p_gabe.passion={moment:'basket'};T=passionSlot(byKey.p_gabe,T).s+40e3;needTeleport=true;", "#cv", 1.5),
    "pages-boss": (1400, 1000, AT(11) + "BOSS_PAGES=[['Ventes du trimestre','#2f6fd6',35],['Stock de papier','#2e9e5b',180],['Satisfaction clients','#e0a020',600],['Livraisons','#7a5cc8',1500]].map(([t,c,m],i)=>{const k=document.createElement('canvas');k.width=320;k.height=200;const g=k.getContext('2d');g.fillStyle='#1c1f26';g.fillRect(0,0,320,200);g.fillStyle='#e8e2d0';g.fillRect(14,14,150,10);for(let j=0;j<4;j++){g.fillStyle='#2a2e37';g.fillRect(14+j*76,36,68,40);g.fillStyle=c;g.fillRect(20+j*76,58,20+j*9,8);}g.fillStyle='#2a2e37';g.fillRect(14,88,292,98);g.fillStyle=c;for(let j=0;j<12;j++){const h=18+((j*37+i*11)%60);g.fillRect(24+j*23,176-h,14,h);}return {id:'demo'+i,title:t,updated:new Date(Date.now()-m*60e3).toISOString(),img:k.toDataURL('image/jpeg',.8)};});openBossPages();", None),
    "fiche-agent": (1400, 1400, AT(11) + "select((chars.find(c=>!c.person&&!c.visitor&&c.runs.length)||{}).key);", "#side"),
    # Gabe, « Ses tickets » et « Ses autres PR ouvertes » dépliés : composant, points, âge (DM-7761 bloqué en review), PR de chaque ticket, un bug
    "fiche-collegue": (1400, 2000, AT(11) + "COLLAPSED['fiche:tickets']=false;COLLAPSED['fiche:prs']=false;select('p_gabe');", "#side"),
    # la testeuse avec 7 tickets en test et son travail Jira de la semaine (simulés) : ligne d'état courte, compteurs, tickets
    "fiche-testeuse": (1400, 1200, AT(11) + "TEAM.people.flatMap(p=>p.tickets).filter(x=>x.cat==='done').slice(0,6).forEach(x=>{x.cat='test';x.status='To Test';});"
                       "const k=chars.find(c=>c.roleKind==='qa');k.jira_id=k.jira_id||'qa';TEAM.work=Object.assign({},TEAM.work,{[k.jira_id]:"
                       "{written:[{key:'DM-7801',summary:'[Stock] Alerter sous 10 ramettes'},{key:'DM-7802',summary:'[Panier] Garder le panier 30 jours'}],"
                       "triaged:[],tested:Array.from({length:7},(_,i)=>({key:'DM-75'+(10+i),summary:'Ticket testé'})),reopened:[]}});select(k.key);", "#side"),
    "kanban": (1400, 1400, AT(11) + "select('kanban');", "#side"),
    # fiche d'un ticket : ses PR et les workflows à lancer (dataset actions simulé depuis l'équipe de démo)
    "fiche-ticket": (1400, 1400, AT(11) + "const all=TEAM.people.flatMap(p=>p.tickets),prs=TEAM.people.flatMap(p=>p.prs);"
                     "ACTS={tickets:all.map(t=>({key:t.key})),prs:prs.map(x=>({n:String(x.n)}))};"
                     "const pr=prs.find(x=>x.review==='changes'&&!x.draft&&(x.keys||[]).length);"
                     "select('ticket:'+(pr?pr.keys[0]:(all.find(t=>t.cat==='deploy')||all[0]).key));", "#side"),
    "planning": (1400, 1400, AT(11) + "select('planning');", "#side"),
    "mep": (1400, 1400, AT(11.6) + "select('tv');", "#side"),
    "avatar": (1400, 1600, AT(11) + "select('jim');openEditor(byKey.jim);", "#side"),
    # plan d'équipe proposé par « python3 tools/plan.py share » : la validation dans la fiche du boss (pas de personnage pour ce workflow)
    "validation-plan": (1400, 1200, AT(11) + "GATES=[{run:'demo',wf:'00000000-demo',wf_name:'Le Bureau · plan',gate:'boss',"
                        "since:new Date(Date.now()-12*60e3).toISOString(),message:\"Plan du bureau de toute l'équipe : valider pour l'appliquer, rejeter pour garder le plan actuel.\\n\\n"
                        "Nouveau plan : Plateau web, 2e étage (40 x 20 cases, 36 sièges, 22 places attribuées).\\n"
                        "Places qui changent : p_gabe I2.R3 → I3.R3, dwight I4.L1 → I6.L1.\"}];select(chars.find(c=>c.boss).key);", "#side"),
    # la même validation vue sur le plan : le boss reste à son bureau avec la bulle ✋1 (zone rognée posée sur la toile, comme canard-attend)
    "bulle-validation": (1400, 1000, AT(11) + "GATES=[{run:'demo',wf:'00000000-demo',wf_name:'Le Bureau · plan',gate:'boss',since:new Date(Date.now()-12*60e3).toISOString()}];"
                         "setTimeout(()=>{const [bx,by]=LAYOUT.boss.seat,c=document.querySelector('#cv'),r=c.getBoundingClientRect(),k=r.width/c.width,"
                         "d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(bx-4.5)*TS*k)+'px',"
                         "top:(r.top+scrollY+(by-3)*TS*k)+'px',width:10*TS*k+'px',height:6*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);",
                         "#shotclip", 1.5),
    "panneau-replie": (1440, 820, AT(11) + "SIDE_FOLDED=true;renderSide(true);scrollTo(0,document.querySelector('.main').offsetTop-8);", None),
    "mobile": (390, 1200, AT(11), None),
    # thèmes saisonniers (46-themes.js), forcés sur la journée de démo, de jour (11h) et le soir (20h15)
    **{f"theme-{name}": (1400, 1000, AT(h) + f"THEME_FORCE='{tid}';", "#cv", 1.5)
       for name, tid, h in (("halloween", "halloween", 20.25), ("halloween-jour", "halloween", 11), ("noel", "noel", 11),
                            ("noel-soir", "noel", 20.25), ("nouvel-an", "nouvel-an", 11), ("nouvel-an-soir", "nouvel-an", 20.25),
                            ("saint-valentin", "saint-valentin", 11))},
    # le décor suit les meubles et les îlots d'un autre plan
    "theme-noel-autre-plan": (1400, 1000, AT(20.25) + "THEME_FORCE='noel';", "#cv", 1.5, "layouts/exemple-startup.json"),
    # le canard en plastique (39-duck.js) sur le plan, sa fiche ouverte : projets et discussions simulés (dataset gates)
    # le canard attend ta réponse (discussion « 🦆 » awaiting, en direct) : arrivé devant le bureau du boss, bulle « ? » ;
    # horloge ramenée à T pour le « direct », trajet supposé fini, zone rognée posée sur la toile juste avant la capture (#shotclip : la toile bouge pendant le rendu)
    "canard-attend": (1400, 1000, AT(11) + "DUCKS=[{id:'k1',title:'🦆 Le bon de commande arrondit mal les ramettes',awaiting:true}];"
                      "Date.now=()=>T;setTimeout(()=>{if(DUCK_CALL)DUCK_CALL.since-=1e9;},300);"
                      "setTimeout(()=>{const [bx,by]=duckBossTile(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),k=r.width/c.width,"
                      "d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(bx-4.6)*TS*k)+'px',"
                      "top:(r.top+scrollY+(by-4)*TS*k)+'px',width:10.25*TS*k+'px',height:6.8*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);",
                      "#shotclip", 1.5),
    "canard": (1440, 960, AT(11) + "ACTIONS.duck=true;ACTION_BINDS['bureau-duck']={project_id:'id'};DUCK_PROJECTS=[{id:'none',name:'Sans projet'},{id:'p1',name:'Site Dunder Mifflin'},"
               "{id:'p2',name:'Stock de papier'}];const at=x=>new Date(DAY0+x*3600e3).toISOString();DUCKS=["
               "{id:'k1',title:'🦆 Le bon de commande arrondit mal les ramettes',project:'Stock de papier',updated:at(10.6),awaiting:true},"
               "{id:'k2',title:'🦆 DM-6717',project:'Site Dunder Mifflin',updated:at(9.2),awaiting:false},"
               "{id:'k3',title:'🦆 Pourquoi le cache vide le panier ?',project:null,updated:at(-20),awaiting:false}];select('duck');"
               "scrollTo(0,document.querySelector('.main').offsetTop-8);", None),
    # invité de passage (clé guests du roster) : David Wallace, de 11h16 à 11h40 dans la démo, ici chez Jan
    # bas du panneau, vue « Tous », équipe et agents repliés : « Et aussi » = invités présents (David Wallace, ici chez Jan) + le canard
    "panneau-et-aussi": (1400, 1600, AT(11.5) + "FILTER=null;COLLAPSED[\"L'équipe\"]=true;COLLAPSED['Les agents']=true;renderSide();", "#side"),
    "invite": (1400, 1000, AT(11.5) + "select('g_david');", "#cv", 1.5),
    # brouillon tiré de docs/img/croquis.png par « python3 tools/plan.py from-image » (premier tour, sans retouche)
    "croquis-brouillon": (1400, 1000, AT(11), "#cv", 1.5, "docs/exemples/plan-croquis.json"),
}


def build_page(cfg=None, variant=None):
    """Page de démo assemblée dans dist/ (cfg : config d'installation, défaut : l'installation de démonstration ;
    variant : nom de fichier distinct, pour garder plusieurs pages à la fois)."""
    path = os.path.join(ROOT, "dist", "office.html" if not variant else "office-" + os.path.basename(variant).replace(".json", ".html"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(assemble.build(demo=True, cfg=assemble.demo_config() if cfg is None else cfg))
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
    pages = {None: build_page()}
    with chrome() as call:
        for name in names:
            w, h, js, sel, *rest = SHOTS[name]
            scale, layout = (rest + [1, None][len(rest):])[:2]
            if layout not in pages:  # même page de démo, sur un autre plan
                pages[layout] = build_page({**assemble.demo_config(), "layout": layout}, layout)
            png = capture(call, pages[layout], w, h, js, sel, scale)
            if isinstance(png, str):
                print(f"✗ {name} : {png}")
                continue
            with open(os.path.join(OUT, name + ".png"), "wb") as f:
                f.write(png)
            print(f"✓ docs/img/{name}.png")


if __name__ == "__main__":
    main(sys.argv[1:])
