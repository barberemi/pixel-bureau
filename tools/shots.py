"""Captures des pages de fonctionnalités (guide/img/*.png), sur la page de démo (data/), dans Chrome headless.

  .venv/bin/python tools/shots.py            # toutes les captures
  .venv/bin/python tools/shots.py plan tv    # seulement celles-ci
  .venv/bin/python tools/shots.py --team ~/Sites/bureau-monequipe [noms]   # la démo avec un pack, dans <pack>/guide/img

Avec --team : roster, avatars, plan et thème du pack, la démo réattribuée à son équipe (assemble.demo_team), le boss
= la première personne du roster ; seulement les captures de TEAM_SHOTS par défaut (les autres visent la démo).

Chaque capture : page rechargée, mise en scène en JS (heure, sélection, mode), puis rognée sur un élément.
Démo du jeudi 1er octobre, plan à 11h sauf mention contraire. websocket-client requis (comme smoke.py --chrome).
"""
import argparse, base64, contextlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402
from smoke import CHROME, CHROME_ARGS, TAB_WAIT, free_port, team_config, wait_tab  # noqa: E402

OUT = os.path.join(ROOT, "guide", "img")
PORT = 9335
# avant chaque capture : hors mode TV (mémorisé par le navigateur), lecture en pause à 11h, personnages posés à leur place
AT = lambda h: f"applySkin('classique');if(TV)setTv(false);setMode('pause');T=DAY0+{h}*3600e3;needTeleport=true;"  # noqa: E731
WAIT = "new Promise(r=>setTimeout(r,2500))"
# nom -> (largeur, hauteur, JS de mise en scène, sélecteur à rogner ; None = la fenêtre[, échelle de la capture[, autre plan]])
# pages Kronn du boss simulées (#61) : 5 pages aux miniatures dessinées, le workflow pages branché, deux pages à ajouter
DEMO_PAGES = ("ACTIONS.pages=true;BOSS_CHOICES=[{id:'demo-a',title:'Planning des congés'},{id:'demo-b',title:'Suivi des commandes'}];"
              "BOSS_PAGES=" + "[['Ventes du trimestre','#2f6fd6',35],['Stock de papier','#2e9e5b',180],['Satisfaction clients','#e0a020',600],['Livraisons','#7a5cc8',1500],['Notes de frais','#c8456e',2900]].map(([t,c,m],i)=>{const k=document.createElement('canvas');k.width=320;k.height=200;const g=k.getContext('2d');g.fillStyle='#1c1f26';g.fillRect(0,0,320,200);g.fillStyle='#e8e2d0';g.fillRect(14,14,150,10);for(let j=0;j<4;j++){g.fillStyle='#2a2e37';g.fillRect(14+j*76,36,68,40);g.fillStyle=c;g.fillRect(20+j*76,58,20+j*9,8);}g.fillStyle='#2a2e37';g.fillRect(14,88,292,98);g.fillStyle=c;for(let j=0;j<12;j++){const h=18+((j*37+i*11)%60);g.fillRect(24+j*23,176-h,14,h);}return {id:'demo'+i,title:t,updated:new Date(Date.now()-m*60e3).toISOString(),img:k.toDataURL('image/jpeg',.8)};});")
# vidéoprojecteur (47-projo.js) : trois pages projetées en mode TV, deux avec un chiffre clé (kpi), une sans
DEMO_PROJO = (DEMO_PAGES + "BOSS_PAGES[0].kpi={value:'82 %',label:'du CA visé',pct:82,color:'#5b8def',short:'Ventes'};"
              "BOSS_PAGES[2].kpi={value:'46 avis',label:'cette semaine',parts:[[30,'#3fbf6a'],[10,'#e0a020'],[6,'#e0614f']],short:'Satisfaction'};"
              "PAGE_TV=['demo0','demo2','demo3'];")
SHOTS = {
    "plan": (1400, 1000, AT(11), "#cv", 1.5),
    # agents mis en avant (« Sur le plan » : agents) : icône, prénom et métier de chacun
    "etiquettes-agents": (1400, 1000, AT(11) + "FILTER='wf';NAMES='all';renderSide();", "#cv", 1.5),
    # ticket réouvert à 10h50 : face-à-face de Pam avec Karen (testeuse) et le mage, devant le bureau du boss
    "reopen-testeur": (1400, 1000, AT(10 + 51 / 60), "#cv", 1.5),
    # mise en prod d'Andy finie à 10h42 : le sage le félicite sur la scène du plateau TV, Michael au sax
    "prod-heraut": (1400, 1000, AT(10 + 43.5 / 60), "#cv", 1.5),
    # MEP d'un autre dépôt lancée par quelqu'un hors de l'équipe et du sprint : son visiteur sur la scène du plateau TV
    "mep-visiteur": (1400, 1000, AT(11) + "LIVE={deploys:{staging:{},prod:{'api 2.4.0':{status:'in_progress',conclusion:null,"
                     "start:'2026-10-01T08:55:00Z',end:null,url:'',project:'api',repo:'acme/front_api',by:'bobvance'}}}};"
                     "setTeam(mergedTeam());needTeleport=true;select('g_mep_bobvance');", "#cv", 1.5),
    # scènes d'équipe (37-scenes.js) : Gabe livre DM-6717 à Karen, Karen valide DM-6550 de Michael (le boss)
    "scene-livraison": (1400, 1000, AT(11 + 11 / 60), "#cv", 1.5),
    "scene-validation": (1400, 1000, AT(11 + 21 / 60), "#cv", 1.5),
    # dernier jour du sprint (fin du sprint ramenée au jour de la démo) et premier jour, après le daily
    "scene-pizza": (1400, 1000, AT(12 + 10 / 60) + "TEAM.sprint.end='2026-10-01T15:00:00Z';", "#cv", 1.5),
    "scene-kickoff": (1400, 1000, AT(9 + 56 / 60) + "TEAM.sprint.start='2026-10-01T07:00:00Z';", "#cv", 1.5),
    # panneau Fraîcheur (survol du badge) : données live simulées, journée en retard, équipe en échec (Jira 401), « ↻ Relancer »,
    # un avertissement de la fiche de paie (tarif non mesuré, #8)
    "fraicheur": (1400, 1000, AT(11) + "LIVE_DATA=true;ACTIONS.relaunch=true;const now=Date.now(),iso=d=>new Date(now-d).toISOString();"
                  "LIVE={...(LIVE||{}),generated_at:iso(20e3)};OFFICE={...OFFICE,empty:false,generated_at:iso(42*60e3),"
                  "bureau_failed:{team:{at:iso(7*60e3),step:'jira_board',err:'HTTP 401 Unauthorized'}}};TEAM_BASE={...TEAM_BASE,generated_at:iso(17*60e3)};"
                  "PAYROLL={...(PAYROLL||{}),generated_at:iso(25*60e3)};DUCKGAME=null;"
                  "RELAUNCH=['office','team','payroll'].map(k=>({wf:'wf-'+k,name:'Le Bureau · '+k,bureau:k}));"
                  "WARNINGS={payroll:['tarif non mesuré, coûts non estimés (HTTP Error 500: Internal Server Error)']};updateFresh();"
                  "document.getElementById('freshpop').style.display='block';document.getElementById('badge').style.marginBottom='260px';", "#freshpop", 1.5),
    "legende": (1400, 1600, AT(11) + "document.querySelector('.legend-help').open=true;", ".legend-help"),
    # thème Classique (le seul du dépôt ; un pack d'équipe apporte les autres), fiche d'un collègue ouverte
    "theme-classique": (1400, 1000, AT(11) + "select((chars.find(c=>c.person&&c.team&&c.team.tickets.length)||{}).key);scrollTo(0,0);", None),
    "qui-fait-quoi": (1400, 1400, AT(11), "#who"),
    # fil à 18h30 (Important) : « En ce moment » (une validation de Dwight en attente depuis 17h52, ajoutée pour la démo,
    # et les repères du jeudi), les rétablissements de Creed et Meredith, la validation de 9h01 décidée en 2 min, Stanley lancé à la main
    "fil": (1400, 1400, AT(18.5) + "const dw=byKey.dwight.runs.filter(r=>r._s<=T),iso=h=>new Date(DAY0+h*3600e3).toISOString();"
            "dw[dw.length-1].status='WaitingApproval';dw[dw.length-1].steps=[...(dw[dw.length-1].steps||[]),{n:'publier_la_revue',k:'Gate',s:'WaitingApproval',at:iso(17+52/60),ms:0}];"
            "dw[0].steps=[...(dw[0].steps||[]),{n:'publier_la_revue',k:'Gate',s:'Success',at:iso(9+1/60),ms:120e3}];"
            "byKey.stanley.runs[0].man=1;FEED_MODE='important';renderFeed();document.querySelector('#feed').style.maxHeight='620px';"
            "document.querySelector('#feed').style.overflow='hidden';", ".feed"),
    # fil « Tout » à 15h20 : la rétro de 15h, les visites (David, Gandalf à la réouverture, Yoda à la prod), un commentaire
    # et une question à Creed posés depuis la page (ajoutés pour la démo)
    "fil-tout": (1400, 1600, AT(15 + 20 / 60) + "const iso=h=>new Date(DAY0+h*3600e3).toISOString();DATA.actions=[{k:'comment',at:iso(11.5),ok:true,key:'DM-7089',"
                 "txt:'Je regarde avec Karen'},{k:'ask',at:iso(12.2),wf:byKey.creed.wf[0],q:'Pourquoi tes derniers runs échouent ?'}];FEED_MODE='all';renderFeed();document.querySelector('#feed').style.maxHeight='960px';"
                 "document.querySelector('#feed').style.overflow='hidden';", ".feed"),
    # absences (démo : Clark absent, Darryl absent le matin, Holly en télétravail) : fiche du calendrier de l'équipe
    "calendrier": (1600, 1000, AT(11) + "select('calendar');", ".bp-wide"),
    "recap": (1400, 1200, AT(11) + "RECAP_OPEN=true;renderRecap();", "#recap"),
    "rejouer": (1400, 1200, AT(9.7) + "setMode('play');", ".stage", 1.5),
    # galerie des scènes (46-gallery.js), dans « Comment lire le plan » ouvert : ce que le bureau de démo sait jouer
    "galerie": (1400, 1800, AT(11) + "const d=document.querySelector('.legend-help');d.open=true;renderGallery();", ".gal"),
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
    # « Mes pages Kronn » (#61) : la fenêtre de l'écran mural, avec × par page, « + Ajouter » et la liste des autres pages
    "pages-boss": (1400, 1000, AT(11) + DEMO_PAGES + "openBossPages();", None),
    "pages-projeter": (1400, 1100, AT(11) + DEMO_PROJO + "ACTIONS.pages=true;openBossPages();setTimeout(()=>{const i=document.querySelector('.pj-info');if(i)i.hidden=false;},200);", ".bp-modal"),
    "projecteur": (1600, 900, AT(11) + DEMO_PROJO + "setTv(true);setTimeout(()=>{const r=projoRoom(),c=document.querySelector('#cv'),b=c.getBoundingClientRect(),"
                   "k=b.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(b.left+scrollX+r.x*k)+'px',"
                   "top:(b.top+scrollY+(r.y-40)*k)+'px',width:r.w*k+'px',height:(r.h+48)*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 3),
    # écran de validation (#61) : clic sur × d'une page, la grille se replie ; la carte Kronn s'ouvre juste dessous (pas en démo)
    "pages-validation": (1400, 1000, AT(11) + DEMO_PAGES + "openBossPages();document.querySelectorAll('.bp-del')[2].click();", ".bp-modal"),
    # l'écran mural de la salle de réunion (#61) : 4 miniatures et la case « + » (zoom sur la pièce)
    "mur-pages": (1400, 1000, AT(11) + DEMO_PAGES + "const r=wallRect(),c=cv.getBoundingClientRect(),k=c.width/W,d=document.createElement('div');d.id='zoom';"
                  "d.style.cssText=`position:absolute;pointer-events:none;left:${c.left+scrollX+(r.x-90)*k}px;top:${c.top+scrollY+(r.y-37)*k}px;width:${(r.w+180)*k}px;height:${120*k}px`;"
                  "document.body.appendChild(d);", "#zoom", 2),
    # « Nouvel agent » (#64) : clic sur le « + » de la baie ; workflows sans agent simulés, prénom tapé
    "nouvel-agent": (1400, 1000, AT(11) + "ASKABLE=[{wf:'e5ce6732-demo',name:'Issue GitHub'},{wf:'7f9e2b79-demo',name:'Mise en prod ticket'}];"
                     "openNewAgent();NA.look={...RECIPES.p_clark};const i=document.querySelector('.na-name');i.value='Clark';i.oninput();", ".na-modal", 1.5),
    # arrivée d'un agent ajouté (#64) : la baie s'allume, les pixels tombent, l'hologramme se forme (capturé à mi-chemin)
    "arrivee-agent": (1400, 1000, AT(11) + "applyAgents({a_clark:{name:'Clark',role:'Issue GitHub',wf:['e5ce6732'],sprite:'p_clark',at:T-30e3}});"
                      "needTeleport=false;const c=byKey.a_clark;c.present=false;c.pos=null;tick(0);setMode('pause');c.popAt=performance.now()+1750;", "#cv", 1.5),
    # fiche d'un agent ajouté depuis une baie (#64) : arrivé ce matin, « ▶ Lancer » avec un champ par paramètre (#67), l'intention
    # remplie, et « Agent ajouté » déplié
    "fiche-agent-ajoute": (1400, 1400, AT(11) + "applyAgents({a_clark_e5ce:{name:'Clark',role:'Issue GitHub',wf:['e5ce6732'],sprite:'p_clark',at:T-2*3600e3}});"
                           "LAUNCHABLE=[{wf:'e5ce6732-demo',name:'Issue GitHub',vars:[{name:'intention',label:'Ce que tu veux faire',required:true,multiline:true,"
                           "placeholder:'Ex. pouvoir trier le kanban par priorité'},{name:'repo',label:'Dépôt',required:false,placeholder:'owner/dépôt'},"
                           "{name:'milestone',label:'Jalon',required:false}]}];COLLAPSED['fiche:added']=false;select('a_clark_e5ce');"
                           "const f=document.querySelector('.rl-f textarea');f.value='Pouvoir éditer une étape de workflow en arrivant directement dessus';f.oninput();", "#side"),
    # mise en prod d'une PR (#58) : « ▶ Lancer » de l'agent qui l'incarne, projet choisi dans la liste, n° de PR saisi
    "lancer-mep": (1400, 1200, AT(11) + "applyAgents({a_darryl_7f9e:{name:'Darryl',role:'Mise en prod',wf:['7f9e2b79'],sprite:'p_darryl',at:T-5*864e5}});"
                   "LAUNCHABLE=[{wf:'7f9e2b79-demo',name:'Mise en prod d\\'une PR',vars:[{name:'project',label:'Projet',required:true,options:"
                   "[{value:'dunder-mifflin/site-web',label:'site-web'},{value:'dunder-mifflin/intranet',label:'intranet'}],default:'dunder-mifflin/site-web'},"
                   "{name:'pr_number',label:'N° de PR',required:true,placeholder:'Ex. 2042',pattern:'\\\\d+'},"
                   "{name:'jira_ticket_key',label:'Ticket (si mal trouvé)',required:false,placeholder:'Ex. DM-7675'},"
                   "{name:'dry_run',label:'Simulation',required:false,options:[{value:'non',label:'Non, la vraie mise en prod'},{value:'oui',label:'Oui, simulation'}],default:'non'}]}];"
                   "COLLAPSED['fiche:added']=true;select('a_darryl_7f9e');const p=document.querySelector('.rl-f input');p.value='16';p.oninput();", "#side"),
    # historique du panneau : la fiche d'un agent ouverte depuis la Fiche de paie, « ← Fiche de paie » et son repère Échap
    "retour-panneau": (1400, 1000, AT(11) + "select('paie');select((chars.find(c=>!c.person&&!c.visitor&&c.runs.length)||{}).key);", "#side"),
    "fiche-agent": (1400, 1400, AT(11) + "select((chars.find(c=>!c.person&&!c.visitor&&c.runs.length)||{}).key);", "#side"),
    # Gabe, « Ses tickets » et « Ses autres PR ouvertes » dépliés : composant, points, âge (DM-7761 bloqué en review), PR de chaque ticket, un bug
    "fiche-collegue": (1400, 2000, AT(11) + "COLLAPSED['fiche:tickets']=false;COLLAPSED['fiche:prs']=false;select('p_gabe');", "#side"),
    # la testeuse avec 7 tickets en test et son travail Jira de la semaine (simulés) : ligne d'état courte, compteurs, tickets
    "fiche-testeuse": (1400, 1200, AT(11) + "TEAM.people.flatMap(p=>p.tickets).filter(x=>x.cat==='done').slice(0,6).forEach(x=>{x.cat='test';x.status='To Test';});"
                       "const k=chars.find(c=>c.roleKind==='qa');k.jira_id=k.jira_id||'qa';TEAM.work=Object.assign({},TEAM.work,{[k.jira_id]:"
                       "{written:[{key:'DM-7801',summary:'[Stock] Alerter sous 10 ramettes'},{key:'DM-7802',summary:'[Panier] Garder le panier 30 jours'}],"
                       "triaged:[],tested:Array.from({length:7},(_,i)=>({key:'DM-75'+(10+i),summary:'Ticket testé'})),reopened:[]}});select(k.key);", "#side"),
    "kanban": (1600, 1000, AT(11) + "select('kanban');", ".bp-wide"),
    # fiche d'un ticket : ses PR et les workflows à lancer (dataset actions simulé depuis l'équipe de démo)
    "fiche-ticket": (1400, 1400, AT(11) + "ACTIONS.estimate=true;ACTION_BINDS['bureau-estimate']={jira_ticket_key:'key'};const all=TEAM.people.flatMap(p=>p.tickets),prs=TEAM.people.flatMap(p=>p.prs);"
                     "ACTS={tickets:all.map(t=>({key:t.key})),prs:prs.map(x=>({id:prId(x),n:String(x.n),repo:prRepo(x)}))};"
                     "const pr=prs.find(x=>x.review==='changes'&&!x.draft&&(x.keys||[]).length);"
                     "select('ticket:'+(pr?pr.keys[0]:(all.find(t=>t.cat==='deploy')||all[0]).key));", "#side"),
    # fiche d'une PR (lien du fil) : la PR #2016 de Darryl, relue deux fois par Dwight (variables de run ajoutées pour la démo)
    "fiche-pr": (1400, 1200, AT(18.5) + "byKey.dwight.runs.filter(r=>r._s<=T&&r.status==='Success').slice(0,2).forEach(r=>r.vars={'current_task.number':'2016',"
                 "'current_task.repo':CFG.github_repo});const all=TEAM.people.flatMap(p=>p.tickets),prs=TEAM.people.flatMap(p=>p.prs);"
                 "ACTS={tickets:all.map(t=>({key:t.key})),prs:prs.map(x=>({id:prId(x),n:String(x.n),repo:prRepo(x)}))};select('pr:'+CFG.github_repo+'#2016');", "#side"),
    "planning": (1400, 1400, AT(11) + "select('planning');", "#side"),
    # prochains crons en post-it au fond de la salle Serveurs (#60), survolés : la liste en clair (zoom sur la pièce)
    "postit-crons": (1400, 1000, AT(11) + "const r=cronNoteRect(),c=cv.getBoundingClientRect(),k=c.width/W;"
                     "cv.dispatchEvent(new MouseEvent('mousemove',{clientX:c.left+(r.x+r.w/2)*k,clientY:c.top+(r.y+7)*k,bubbles:true}));"
                     "const t=document.getElementById('tip').getBoundingClientRect(),x0=Math.min(t.left,c.left+(r.x-40)*k)-8,"
                     "x1=Math.max(t.right,c.left+(r.x+r.w+40)*k)+8,y0=Math.min(t.top,c.top+(r.y-20)*k)-8,d=document.createElement('div');d.id='zoom';"
                     "d.style.cssText=`position:absolute;pointer-events:none;left:${x0+scrollX}px;top:${y0+scrollY}px;width:${x1-x0}px;height:${c.top+(r.y+80)*k-y0}px`;"
                     "document.body.appendChild(d);", "#zoom", 2),
    "mep": (1400, 1400, AT(11.6) + "select('tv');", "#side"),
    "avatar": (1400, 1600, AT(11) + "select('jim');openEditor(byKey.jim);", "#side"),
    # plan d'équipe proposé par « python3 tools/plan.py share » : la validation dans la fiche du boss (pas de personnage pour ce workflow)
    "validation-plan": (1400, 1200, AT(11) + "GATES=[{run:'demo',wf:'00000000-demo',wf_name:'Le Bureau · plan',gate:'boss',"
                        "since:new Date(DAY0+10.8*36e5).toISOString(),message:\"Plan du bureau de toute l'équipe : valider pour l'appliquer, rejeter pour garder le plan actuel.\\n\\n"
                        "Nouveau plan : Plateau web, 2e étage (40 x 20 cases, 36 sièges, 22 places attribuées).\\n"
                        "Places qui changent : p_gabe I2.R3 → I3.R3, dwight I4.L1 → I6.L1.\"}];select(chars.find(c=>c.boss).key);", "#side"),
    # la même validation vue sur le plan : le boss reste à son bureau avec la bulle ✋1 (zone rognée posée sur la toile, comme canard-attend)
    # questions des discussions (KT-27) dans la fiche du boss : une simple d'un visiteur revenu de la veille, un formulaire
    # (lot de fiches d'un audit Kronn), une du canard ; workflow « réponse » supposé installé
    "questions": (1400, 2200, AT(11) + ("const iso=h=>new Date(DAY0+h*3600e3).toISOString();ACTIONS.answer=true;QUESTIONS=["
      "{id:'q1',disc:'5e7a91c2-demo',title:'Commandes bloquées au paiement',agent:'ClaudeCode',bureau:false,since:iso(-14),"
      "question:'Je purge la file des commandes bloquées ou je les rejoue une par une ?',context:'312 commandes bloquées depuis 9h ; rejouer une par une prend environ 20 min.',"
      "options:[{id:'purge',label:'Purger la file',desc:'rapide, perd l\\'historique'},{id:'replay',label:'Rejouer une par une',desc:'≈ 20 min'},{id:'wait',label:'Attendre le correctif',desc:''}],rec:['replay'],multiple:false,items:[]},"
      "{id:'q2',disc:'7b21d0e4-demo',title:'Validation de l\\'audit · Le Bureau',agent:'ClaudeCode',bureau:false,since:iso(9.5),"
      "question:'Lot 1/4 (accessibilité) : choisis un statut pour chaque fiche.',context:'',"
      "options:[{id:'confirm',label:'Confirmer',desc:''},{id:'reject',label:'Rejeter',desc:''},{id:'accept_decision',label:'Décision assumée',desc:''},{id:'defer',label:'Différer',desc:''}],rec:[],multiple:false,"
      "items:[{id:'a',label:'Modale « Mes pages » : focus ni piégé ni rendu (Low)'},{id:'b',label:'Plan accessible à la souris seulement (Medium)'},{id:'c',label:'Tuiles cliquables mais pas focalisables (Medium)'}]},"
      "{id:'q3',disc:'9c33aa10-demo',title:'🦆 Le bon de commande arrondit mal les ramettes',agent:'ClaudeCode',bureau:true,since:iso(10.7),"
      "question:'Je corrige l\\'arrondi côté panier ou côté facture ?',context:'',options:[{id:'cart',label:'Côté panier',desc:''},{id:'invoice',label:'Côté facture',desc:''}],rec:['cart'],multiple:false,items:[]}];"
      "refreshAll();needTeleport=true;") + "select(chars.find(c=>c.boss).key);", "#side"),
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
    # canard d'équipe (39-duckgame.js, données de démo) : détective avec lunettes et loupe, ses 4 canetons en file derrière lui ;
    # instant où il marche depuis 10 s, zone rognée autour de lui posée sur la toile juste avant la capture
    "canard-canetons": (1400, 1000, AT(11) + "for(let t=T;t<T+3*3600e3;t+=1000){const a=duckWalk(t),b=duckWalk(t-10e3);"
                        "if(a&&b&&a.moving&&b.moving&&Math.hypot(a.x-b.x,a.y-b.y)>60){T=t;break;}}needTeleport=true;"
                        "setTimeout(()=>{const p=DUCK_POS,c=document.querySelector('#cv'),r=c.getBoundingClientRect(),k=r.width/c.width,"
                        "d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(p.x-7*TS)*k)+'px',"
                        "top:(r.top+scrollY+(p.y-4*TS)*k)+'px',width:14*TS*k+'px',height:6.5*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);",
                        "#shotclip", 2),
    # planche : ses 6 stades, puis les 6 accessoires des succès (dessins de la page, agrandis)
    "canard-stades": (1300, 700, AT(11) + "setTimeout(()=>{const W=1200,H=540,c=document.createElement('canvas');c.width=W;c.height=H;c.id='dgboard';"
                      "const g=c.getContext('2d'),cs=getComputedStyle(document.body);g.imageSmoothingEnabled=false;"
                      "g.fillStyle=cs.getPropertyValue('--panel');g.fillRect(0,0,W,H);const ink=cs.getPropertyValue('--ink'),mut=cs.getPropertyValue('--muted');"
                      "g.fillStyle=ink;g.font='600 20px sans-serif';g.fillText('Ses stades, en % de la cible du sprint',30,40);"
                      "DUCK_STAGES.forEach((s,i)=>{const x=30+i*190;g.drawImage(duckGameImg('front',s.id),x,56,144,144);"
                      "g.fillStyle=ink;g.font='600 15px sans-serif';g.fillText(s.name,x+8,222);g.fillStyle=mut;g.font='14px sans-serif';g.fillText('dès '+Math.round(s.at*100)+' %',x+8,242);});"
                      "g.fillStyle=ink;g.font='600 20px sans-serif';g.fillText('Les accessoires de ses succès',30,300);"
                      "DUCK_TROPHIES.forEach((t,i)=>{const x=30+i*190;['front','side','back'].forEach((v,j)=>g.drawImage(duckGameImg(v,'bain',[t.acc]),x+j*56,316,72,72));"
                      "g.fillStyle=ink;g.font='600 15px sans-serif';g.fillText(t.name,x+8,412);g.fillStyle=mut;g.font='13px sans-serif';"
                      "const ls=[''];t.what.split(' ').forEach(m=>{const k=ls.length-1;if((ls[k]+' '+m).trim().length>22)ls.push(m);else ls[k]=(ls[k]+' '+m).trim();});ls.forEach((l,j)=>g.fillText(l,x+8,432+j*18));});"
                      "Object.assign(c.style,{position:'absolute',left:'0',top:'0',zIndex:99999});document.body.appendChild(c);scrollTo(0,0);},500);",
                      "#dgboard"),
    # scènes de 3 s (43-fx.js), posées dans FX.cur à un instant choisi (le moteur figé) : la casquette de « Lève-tôt » vient de se poser,
    # l'œuf se fend (stade caneton atteint), et un agent rétabli applaudi par les agents au travail (premier rétablissement de la démo
    # mis en scène : Creed, rétabli à 18h05 dans la démo ; les agents présents applaudissent, comme ceux au travail)
    "canard-succes": (1400, 1000, AT(11) + "DUCKGAME=JSON.parse(JSON.stringify(DUCKGAME_DEMO));DUCKGAME.trophies.leve_tot={ok:true,period:'26-39',detail:'17.106.0 à 10:12'};for(let t=T;t<T+3*3600e3;t+=5000){const a=duckWalk(t),b=duckWalk(t+40e3);if(a&&!a.moving&&b&&!b.moving&&a.x>8*TS&&a.y>6*TS){T=t;break;}}needTeleport=true;" + "setTimeout(()=>{window.fxFrame=()=>{};setLoupe(false,false);FX.cur=new Map([['x',Object.assign({kind:'trophy',t0:performance.now()-3500},{tr:DUCK_TROPHIES[1]})]]);},1800);" + "setTimeout(()=>{const p=DUCK_POS,c=document.querySelector('#cv'),r=c.getBoundingClientRect(),k=r.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(p.x-6*TS)*k)+'px',top:(r.top+scrollY+(p.y-4.2*TS)*k)+'px',width:12*TS*k+'px',height:5.4*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 2),
    "canard-eclosion": (1400, 1000, AT(11) + "DUCKGAME=Object.assign({},DUCKGAME_DEMO,{target:400});for(let t=T;t<T+3*3600e3;t+=5000){const a=duckWalk(t),b=duckWalk(t+40e3);if(a&&!a.moving&&b&&!b.moving&&a.x>8*TS&&a.y>6*TS){T=t;break;}}needTeleport=true;" + "setTimeout(()=>{window.fxFrame=()=>{};setLoupe(false,false);FX.cur=new Map([['x',Object.assign({kind:'hatch',t0:performance.now()-1700},{from:'oeuf',to:'caneton'})]]);},1800);" + "setTimeout(()=>{const p=DUCK_POS,c=document.querySelector('#cv'),r=c.getBoundingClientRect(),k=r.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(p.x-6*TS)*k)+'px',top:(r.top+scrollY+(p.y-4.2*TS)*k)+'px',width:12*TS*k+'px',height:5.4*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 2),
    # soucoupe-mère (43-fx.js) : DM-7931 entre dans le sprint à 14h20 ; la soucoupe est allée chercher la facilitatrice à son
    # poste et l'a déposée devant le mur Kanban : « +13 pts » sur le mur et la bulle d'annonce (instant figé à 79 % de 13 s)
    "vaisseau-mere": (1400, 1000, AT(14 + 21 / 60) + "setTimeout(()=>{window.fxFrame=()=>{};setLoupe(false,false);"
                      "const e={id:'x',kind:'ufo',...ufoLandings()[0]};Object.defineProperty(e,'t0',{get:()=>performance.now()-.79*13e3});"
                      "FX.cur=new Map([['x',e]]);},1800);", "#cv", 1),
    # tournée de café (49-coffee.js) : Kevin apporte son café au boss, à gauche de son bureau ; les autres ont déjà leur tasse
    "tournee-cafe": (1400, 1000, AT(16) + "setTimeout(()=>{setLoupe(false,false);const r=coffeeTour(byKey.g_kevin,T);"
                     "T=r.at+(r.list.length-.5)*120e3;needTeleport=true;},1500);", "#cv", 1),
    "agent-retabli": (1400, 1000, AT(18 + 7 / 60) + "setTimeout(()=>{window.fxFrame=()=>{};setLoupe(false,false);FX_WORKING.push('idle');"
                      "FX.cur=new Map([['x',{kind:'recover',t0:performance.now()-800,c:chars.find(c=>c.name==='Creed')}]]);},1800);", "#cv", 1),
    # fiche du canard quand il attend ta réponse : la carte de la question en tête (démo : question ajoutée)
    "canard-question": (1440, 1100, AT(11) + "ACTIONS.duck=true;ACTIONS.answer=true;ACTION_BINDS['bureau-duck']={project_id:'id'};DUCK_PROJECTS=[{id:'none',name:'Sans projet'}];"
                        "const at=x=>new Date(DAY0+x*3600e3).toISOString();DUCKS=[{id:'k1',title:'🦆 Le bon de commande arrondit mal les ramettes',project:'Stock de papier',updated:at(10.6),awaiting:true}];"
                        "QUESTIONS=[{id:'q1',disc:'k1',title:'🦆 Le bon de commande arrondit mal les ramettes',agent:'ClaudeCode',bureau:true,since:at(10.6),"
                        "question:'J\\'arrondis au paquet supérieur ou je garde la quantité exacte demandée ?',"
                        "context:'Les ramettes sont vendues par 5 ; 3 commandes sur 40 ont une quantité qui n\\'est pas un multiple de 5.',"
                        "options:[{id:'up',label:'Arrondir au paquet supérieur',desc:''},{id:'exact',label:'Garder la quantité exacte',desc:'facturer à l\\'unité'}],rec:['up'],multiple:false,items:[]}];"
                        "select('duck');document.querySelector('#side').style.maxHeight='980px';document.querySelector('#side').style.overflow='hidden';", "#side"),
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
    # brouillon tiré de guide/img/croquis.png par « python3 tools/plan.py from-image » (premier tour, sans retouche)
    # courrier (48-mail.js, démo : un compte de l'appli Mail et un Gmail) : les deux boîtes dehors, à droite du bureau du boss
    "courrier": (1400, 1000, AT(11) + "setTimeout(()=>{const [mx,my]=mailboxTile(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),"
                 "k=r.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(mx-9)*TS*k)+'px',"
                 "top:(r.top+scrollY+(my-5)*TS*k)+'px',width:14*TS*k+'px',height:7*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 2),
    "fiche-courrier": (1400, 1400, AT(11) + "select('mail:pro');", "#side"),
    # Mes todos (47-todos.js, démo : 4 à faire, 1 avec le canard, 2 faites) : le tableau en liège au mur du boss, planning des
    # absences à sa gauche ; la fenêtre en colonnes, avec un ajout et une todo cochée pas encore enregistrés
    "todos-tableau": (1400, 1000, AT(11) + "setTimeout(()=>{const t=todoRect(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),"
                      "k=r.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(t.x-70)*k)+'px',"
                      "top:(r.top+scrollY+(t.y-30)*k)+'px',width:(t.w+150)*k+'px',height:(t.h+90)*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 3),
    "todos-fenetre": (1400, 1000, AT(11) + "ACTIONS.todo=true;tdChange({op:'move',id:'t2',to:'done'});tdAdd('Appeler Jan pour la rétro','high');"
                      "DUCKS=[{id:'dd-demo-1',awaiting:true,created:new Date(DAY0+9.5*36e5).toISOString()}];setTimeout(openTodos,300);", ".td-modal"),
    # console Support (#62, démo : un fil par état) : l'écran du boss en alerte, survolé (zoom sur son bureau) ; la fenêtre
    "support-ecran": (1400, 1000, AT(11) + "setTimeout(()=>{const s=supportRect(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),k=r.width/c.width,"
                      "d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(s.x+14-9.5*TS)*k)+'px',"
                      "top:(r.top+scrollY+(s.y-2*TS)*k)+'px',width:19*TS*k+'px',height:5*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);"
                      "tip.style.display='block';tip.style.left=(r.left+(s.x+14)*k)+'px';tip.style.top=(r.top+(s.y+6)*k)+'px';tip.textContent=supportTip();},2000);", "#shotclip", 2),
    # l'agent Support en intervention (#62, démo : Nellie, holo « alerte ») : hologramme rouge sur son socle, « 🚨 2 à traiter »
    "support-agent": (1400, 1000, AT(11) + "setTimeout(()=>{const a=spAgent(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),k=r.width/c.width,"
                      "d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(a.pos.x-4*TS)*k)+'px',"
                      "top:(r.top+scrollY+(a.pos.y-3.6*TS)*k)+'px',width:8*TS*k+'px',height:4.6*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2200);", "#shotclip", 2),
    "support-panneau": (1400, 2400, AT(11) + "ACTIONS.support=true;ACTIONS.gate=true;DUCK_PROJECTS=[{id:'none',name:'Sans projet'},{id:'p1',name:'Site de Scranton'}];"
                        "openSupport();", "#side"),
    # règles du courrier en attente de validation (workflow « règles du courrier ») : le facteur attend devant le bureau du boss
    "facteur-regles": (1400, 1000, AT(11) + "GATES=[{run:'demo',wf:'00000000-demo',wf_name:'Le Bureau · règles du courrier',gate:'boss',"
                       "since:new Date(DAY0+10.5*36e5).toISOString(),message:'Le facteur te propose de trier ton courrier'}];refreshAll();needTeleport=true;"
                       "setTimeout(()=>{const [mx,my]=mailboxTile(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),"
                       "k=r.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(mx-12)*TS*k)+'px',"
                       "top:(r.top+scrollY+(my-5)*TS*k)+'px',width:16*TS*k+'px',height:7*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 2),
    # porteur (mail.messengers, démo : la gazette, portée par David) : il attend devant le bureau du boss que le mail soit lu
    "porteur": (1400, 1000, AT(11 + 12 / 60) + "MAILS.accounts[0].carried=[{id:'y1',name:'Rédaction',addr:'gazette@dundermifflin.example',subject:'Gazette de Scranton : le programme de la semaine',at:new Date(DAY0+11.08*36e5).toISOString(),direct:true,rule:'gazette',carrier:'g_david',bubble:'📰 Gazette',when:'arrival',open:null}];refreshAll();needTeleport=true;"
                "setTimeout(()=>{const [mx,my]=mailboxTile(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),"
                "k=r.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(mx-12)*TS*k)+'px',"
                "top:(r.top+scrollY+(my-5)*TS*k)+'px',width:16*TS*k+'px',height:7*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 2),
    "fiche-porteur": (1400, 1400, AT(11 + 12 / 60) + "MAILS.accounts[0].carried=[{id:'y1',name:'Rédaction',addr:'gazette@dundermifflin.example',subject:'Gazette de Scranton : le programme de la semaine',at:new Date(DAY0+11.08*36e5).toISOString(),direct:true,rule:'gazette',carrier:'g_david',bubble:'📰 Gazette',when:'arrival',open:null}];select('mail:pro');", "#side"),
    # le facteur dépose le courrier arrivé à 10h42 (démo), à côté des boîtes, puis repart
    "facteur": (1400, 1000, AT(10 + 43 / 60) + "setTimeout(()=>{const [mx,my]=mailboxTile(),c=document.querySelector('#cv'),r=c.getBoundingClientRect(),"
                "k=r.width/c.width,d=document.createElement('div');d.id='shotclip';Object.assign(d.style,{position:'absolute',left:(r.left+scrollX+(mx-9)*TS*k)+'px',"
                "top:(r.top+scrollY+(my-5)*TS*k)+'px',width:14*TS*k+'px',height:7*TS*k+'px',pointerEvents:'none'});document.body.appendChild(d);},2000);", "#shotclip", 2),
    "croquis-brouillon": (1400, 1000, AT(11), "#cv", 1.5, "guide/exemples/plan-croquis.json"),
}
# captures qui ne visent aucun personnage de la démo : valables avec n'importe quelle équipe (--team)
TEAM_SHOTS = ["plan", "qui-fait-quoi", "fil", "recap", "kanban", "mep", "calendrier", "fiche-agent", "scene-retro",
              "tv", "tv-agents", "standup"]


def team_js(js):
    """Mise en scène d'une capture pour un pack : le thème de l'équipe (ui.skin de ses réglages) au lieu du Classique."""
    return js.replace("applySkin('classique');", "applySkin((CFG.ui||{}).skin);")


def build_page(cfg=None, variant=None):
    """Page de démo assemblée dans dist/ (cfg : config d'installation, défaut : l'installation de démonstration ;
    variant : nom de fichier distinct, pour garder plusieurs pages à la fois)."""
    path = os.path.join(ROOT, "dist", "office.html" if not variant else "office-" + os.path.splitext(os.path.basename(variant))[0] + ".html")
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
    args = [CHROME, *CHROME_ARGS, "--headless=new", "--mute-audio", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
            f"--remote-debugging-port={port}", f"--user-data-dir={user_dir}", "about:blank"]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        tab = wait_tab(port)
        if not tab:  # démarrage raté (vu une fois sur la CI) : une seconde tentative avant d'abandonner
            proc.kill()
            proc.wait(10)
            proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            tab = wait_tab(port)
        if not tab:
            sys.exit(f"Chrome n'a pas ouvert d'onglet en {TAB_WAIT} s, deux fois ({CHROME})")
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


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*", help="captures à refaire (défaut : toutes, ou TEAM_SHOTS avec --team)")
    ap.add_argument("--team", help="la démo avec ce pack d'équipe (chemin) ou ce profil de teams/")
    ap.add_argument("--out", help="dossier des PNG (défaut : guide/img, ou <pack>/guide/img avec --team)")
    a = ap.parse_args(argv)
    cfg = team_config(a.team) if a.team else None
    names = a.names or (TEAM_SHOTS if a.team else list(SHOTS))
    out = a.out or (os.path.join(assemble.team_dir(cfg), "guide", "img") if a.team else OUT)
    os.makedirs(out, exist_ok=True)
    pages = {None: build_page(cfg, "team") if a.team else build_page()}
    with chrome() as call:
        for name in names:
            w, h, js, sel, *rest = SHOTS[name]
            scale, layout = (rest + [1, None][len(rest):])[:2]
            if layout not in pages:  # même page de démo, sur un autre plan
                pages[layout] = build_page({**(cfg or assemble.demo_config()), "layout": layout}, layout)
            png = capture(call, pages[layout], w, h, team_js(js) if a.team else js, sel, scale)
            if isinstance(png, str):
                print(f"✗ {name} : {png}")
                continue
            with open(os.path.join(out, name + ".png"), "wb") as f:
                f.write(png)
            print(f"✓ {os.path.relpath(os.path.join(out, name + '.png'))}")


if __name__ == "__main__":
    main(sys.argv[1:])
