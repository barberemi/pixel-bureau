// ---------- 2e étage : la rédaction des tickets et la revue des PR ----------
// À gauche, la salle de rédaction (modèle « créer un ticket », models.ticket) : une bibliothèque par composant (celles que
// l'intention touche s'allument), la table où le reporter de la rédaction et celui de la critique se font face, et le fil
// rouge de l'intention : du liège à la recherche, à la rédaction, puis un brin par ticket (l'intention découpée) jusqu'au
// bureau du boss, son tampon posé dessus (chaque ticket passe un par un), puis la boîte Jira. Les agents de la rédaction
// sont des reporters (chapeau mou, carte de presse). À droite, la revue des PR (sous-workflow review_child) : à chaque
// bureau, le relecteur (visière verte de correcteur) derrière son écran et, en face, l'auteur de la PR (un agent
// remplaçant pour ta PR ou celle de quelqu'un hors de l'équipe) ; sous le bureau, les postes de son run, lus du run
// (🗺 contexte, 📚 docs, 🔍 lecture, 🔒 sécu : un sous-workflow review_<poste> chacun ; puis 🧐 avis et ✍ postée).
// Au mur, le tableau noir des revues du jour ; dans la rédaction, son jumeau des tickets du jour, sur un chevalet. Le soir et le week-end, la veilleuse : seuls ceux au travail et le boss.
// Données : dataset redaction (workflows/redaction_snapshot.py, cron live) et les runs de la revue (DATA.runs) ; démo : redactionDemo().
const RD_POSTES=[{k:'recherche',i:'📚',n:'Recherche',d:'cherche ce que l\'intention touche, projet par projet'},{k:'redaction',i:'✍',n:'Rédaction',d:'écrit les tickets, un par projet touché'},
  {k:'critique',i:'🧐',n:'Critique',d:'relit les tickets et renvoie à la rédaction (trois tours au plus)'},{k:'valider',i:'✋',n:'Toi',d:'tu tamponnes chaque ticket, ou tu demandes des changements'}];
const RD_TK={wait:['#f7e07a','attend la critique'],run:['#9fd4ff','en cours'],gate:[WAIT_BG,'t\'attend'],ok:['#b6e3a8','créé'],ecarte:['#d8d2c4','écarté'],err:['#f4a3a3','en panne']};
// « Comment lire le plan » au 2e (46-legende.js) : les postes de la rédaction, puis les étapes d'une revue (RV_STEP)
const RD_HELP={bar:()=>'<span>Tickets :</span>'+legSwatches(RD_TK)+'<span>Verdicts : '+Object.entries({approve:'approuvée',comment:'commentée',request_changes:'changements',err:'en échec'}).map(([k,t])=>RVF_V[k][0]+' '+t).join(' · ')+'</span>',
  postes:()=>[['Rédaction',RD_POSTES],['Revue d\'une PR',Object.values(RV_STEP).map(([l,,d])=>({i:l.split(' ')[0],n:l.slice(l.indexOf(' ')+1),d}))]],
  qui:'<p><b>Rédaction</b> : les agents en reporters, chapeau mou et carte de presse. Toujours là : à leur poste pendant une intention, en promenade sinon, endormis le soir.</p><p><b>Revue</b> : les relecteurs à visière verte ; l\'auteur de la PR assis en face, de dos ; un agent remplaçant pour ta propre PR.</p>'+
    '<p><b>Bernard</b> monte la fournée du cron des revues. <b>Le boss</b> épingle chaque intention au liège, tamponne les tickets et les porte à la boîte Jira.</p>',
  ou:'<p><b>Bibliothèques</b> : une par composant Jira. <b>La table</b> : une intention et ses tickets ; <b>le fil rouge</b> relie les postes qui y ont travaillé. <b>Le liège</b> : les autres intentions. <b>Le tableau noir</b> : les tickets du jour (l\'historique : page « Rédaction · bilan »).</p>'+
    '<p><b>Casier « À relire »</b> : la file du cron, dans l\'ordre. <b>Corbeille « Postées »</b> : les avis du passage. <b>Six bureaux</b> de revue, le premier pour la file. <b>Salle d\'attente</b> : une chaise par auteur.</p>',
  moments:'<p><b>✋ Le tampon</b> : ici, ta décision, c\'est le tampon. Les tickets relus l\'attendent un par un.</p><p><b>✂ Le découpage</b> : une intention qui touche plusieurs projets devient plusieurs tickets, un brin de fil chacun.</p>'+
    '<p><b>📥 La fournée</b> : à chaque passage du cron des revues, Bernard range un dossier par PR dans le casier.</p>'};
const RD_X1=19.5, RD_VX=23, RD_SH0=['dm/site','dm/mobile','dm/api','dm/outils'];
const RD_WINDOWS=[7.5,10.5,13.5,16.5,25,28.5,32,35.5,39,42.5]; // en cases : à droite du nom de l'étage, comme au RDC
const RD_DESK={x:15.6*AT_TS,y:23.4*AT_TS}, RD_JIRA={x:17.8*AT_TS,y:25.6*AT_TS}, RD_CORK={x:1.6*AT_TS,y:9.4*AT_TS};
let REDACTION=null, RDSEL=null, RD_HITS=[], RD_LIT=[], RD_MEM={last:0};
let RDTK=null; // le ticket ouvert dans le panneau : {run, k} (clic sur sa carte à la table ou sur sa ligne du panneau)
// la fiche ouverte au clic sur le plan : intention, poste, boîte Jira ; à la revue : PR lue, auteur, casier, corbeille ;
// back : la fiche d'où l'on vient (« ‹ »)
let RDF=null;
function readRedaction(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.redaction;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.tables)?d:null;
  }catch(e){return null;}
}
// le 2e : la salle de rédaction (modèle « créer un ticket ») et la salle de revue (modèles de revue de PR) ; l'étage
// s'ouvre avec l'une ou l'autre, la salle absente reste vide et le dit
const ticketOn=()=>DEMO||!!(CFG.ticket&&CFG.ticket.wf);
const redactionOn=()=>ticketOn()||(CFG.revue_wf||[]).length>0;
const RD_ABSENT='La rédaction (créer un ticket) n\'est pas installée';
// démo : une intention découpée en trois tickets (le premier relu, le deuxième en critique), une autre en recherche
function redactionDemo(){
  const at=h=>new Date(DAY0+h*36e5).toISOString();
  // la file de la revue : le cron de 9 h 30 a retenu 5 PR ; les deux de Holly sont postées, celle de Pam est lue (demo-r1)
  const revue={batches:{'demo-c1':[['dm/site',2042,'hollyflax'],['dm/site',2060,'hollyflax'],['dm/api',2051,'pambeesly'],['dm/mobile',311,'darrylphilbin'],['dm/api',2063,'pambeesly']]},
    verdicts:{'demo-k1':'comment','demo-k2':'approve'},starts:{'demo-c1':at(9.5)}};
  return {generated_at:at(11),crees:2,tok_jour:38400,revue,crees_l:[{key:'DM-2101',title:'Export : le bouton dans la liste des abonnés',run:'demo-t0'},{key:'DM-2102',title:'Export : le fichier CSV',run:'demo-t0'}],tables:[
    {run:'demo-t1',status:'Running',since:at(10.2),intention:'Refondre le lecteur vidéo : sous-titres, pistes audio et reprise de lecture',poste:'critique',tour:2,
     composants:['dm/site','dm/mobile','dm/api'],type:'Story',tickets:[{i:0,summary:'Lecteur : les sous-titres',composant:'dm/api',points:3,etat:'wait',
       detail:'▸ De quoi on parle ?\n\n│ Les vidéos n\'ont pas de sous-titres : le lecteur ne lit pas les pistes WebVTT.\n\n▸ Qu\'est-ce que l\'on va faire ?\n\n• Servir les pistes WebVTT de chaque vidéo\n• Les déclarer dans le manifeste du lecteur\n\n▸ Comment on teste ?\n\n• Une vidéo avec deux pistes : les deux s\'affichent dans le menu'},
       {i:1,summary:'Pistes audio dans le menu du lecteur',composant:'dm/site',points:2,etat:'wait'},{i:2,summary:'Reprise de lecture',composant:'dm/mobile',points:3,etat:'wait'}],
     recherche:{doublons:[{key:'DM-1984',summary:'Sous-titres du direct',status:'Terminé'},{key:'DM-2017',summary:'Lecteur : reprise après coupure réseau',status:'À faire'}],
       resume:'Le lecteur vit dans dm/site (web) et dm/mobile ; dm/api sert le manifeste des vidéos. DM-2017 couvre déjà une partie de la reprise de lecture.'},
     redaction:{version:2,reponses:['T1 : format précisé, WebVTT seulement','T3 : la reprise marche aussi hors connexion'],hors_liste:0},
     critique:{version:1,verdict:'a_retoucher',notes:[{ticket:1,gravite:'bloquant',note:'Quel format de pistes : WebVTT seul, ou SRT aussi ?'},
       {ticket:3,gravite:'bloquant',note:'La reprise doit-elle marcher hors connexion ? DM-2017 en parle.'},{ticket:2,gravite:'conseil',note:'Citer la maquette du menu.'}]}},
    {run:'demo-t2',status:'Running',since:at(10.8),intention:'Export CSV des abonnés',poste:'recherche',tour:1,composants:['dm/outils'],tickets:[]}],
    events:[{t:at(10.2),k:'arrive',run:'demo-t1'},{t:at(10.8),k:'arrive',run:'demo-t2'},{t:at(8.5),k:'arrive',run:'demo-t0'},{t:at(9.1),k:'gate',run:'demo-t0'},{t:at(9.2),k:'cree',run:'demo-t0'},{t:at(9.3),k:'cree',run:'demo-t0'},{t:at(9.4),k:'fin',run:'demo-t0'}]};
}
const rdTables=()=>((REDACTION&&REDACTION.tables)||[]).slice(0,3);
const rdTable=()=>{const l=rdTables();return l.find(t=>t.run===RDSEL)||l[0]||null;};
// ---------- la revue : les runs de relecture d'une PR (review_child), lus du run ----------
const rvWf=w=>!!w&&(CFG.revue_wf||[]).includes(String(w).slice(0,8));
// la revue à la demande (review_one, CFG.revue_one_wf) ne relit pas elle-même : elle lance un review_child par PR, qui prend
// le bureau ; son run à elle n'en prend pas (sans quoi une PR lancée à la main occupait deux bureaux, l'un en « ?#? »)
const rvOneWf=w=>!!w&&(CFG.revue_one_wf||[]).includes(String(w).slice(0,8));
// les postes de la revue (sous-workflows review_<poste>, CFG.revue_postes_wf) : leurs runs ne passent pas au RDC, ils se
// lisent comme des étapes du run de la revue
const rvPosteWf=w=>!!w&&(CFG.revue_postes_wf||[]).includes(String(w).slice(0,8));
// les postes de la rédaction et le sous-workflow par ticket (CFG.ticket.postes_wf) : lus au 2e (redaction_snapshot.py),
// jamais au RDC
const rdPosteWf=w=>!!w&&((CFG.ticket&&CFG.ticket.postes_wf)||[]).includes(String(w).slice(0,8));
function rvRuns(){
  const l=((DATA&&DATA.runs)||[]).filter(r=>rvWf(r.wf)&&!rvOneWf(r.wf)&&r._s<=T);
  if(!l.length&&DEMO||SCENE_DEMO&&SCENE_DEMO.revue)return rvDemo().filter(r=>r._s<=T); // une scène de la revue (galerie) se joue sur la journée de démo, à son heure
  return l.sort((a,b)=>a._s-b._s);
}
const RV_DEMO=['whoami','setup','fetch_files','write_ctx','contexte','docs','lecture','securite','avis','map_event','post'];
function rvDemo(){
  const s=DAY0+10*36e5, st=(n,x)=>n.map((k,j)=>({n:k,s:j<x?'Success':j===x?'Running':'Pending'}));
  const k=(run,n,repo,who,h0,h1)=>({run,status:'Success',parent:'demo-c1',_s:DAY0+h0*36e5,_e:DAY0+h1*36e5,vars:{'current_task.number':n,'current_task.repo':repo,'current_task.author':who},steps:st(RV_DEMO,99)});
  return [k('demo-k1','2042','dm/site','hollyflax',9.52,9.7),k('demo-k2','2060','dm/site','hollyflax',9.7,9.98),
    {run:'demo-r1',status:'Running',parent:'demo-c1',_s:s,vars:{'current_task.number':'2051','current_task.repo':'dm/api','current_task.author':'pambeesly'},steps:st(RV_DEMO,6)},
    {run:'demo-r2',status:'Running',_s:s+6e5,vars:{'current_task.number':'2058','current_task.repo':'dm/api','current_task.author':'michaelscott'},steps:st(RV_DEMO,4)},
    {run:'demo-r3',status:'Running',_s:s+9e5,vars:{'current_task.number':'2037','current_task.repo':'dm/api','current_task.author':'darrylphilbin'},steps:st(RV_DEMO,7)},
    ...[1,2,3,4,5].map(k=>({run:'demo-rd'+k,status:'Success',_s:DAY0+(7+k/2)*36e5,vars:{},steps:[]}))];
}
const rvActive=()=>rvRuns().filter(r=>RUN_ACTIVE.includes(r.status)).slice(0,6);
// [nom, bulle, ce que fait l'étape (« Comment lire le plan »)]
const RV_STEP={contexte:['🗺 contexte','je cadre la PR…','cadre la PR : le ticket, le dépôt, ce qui change'],docs:['📚 docs','je lis la doc…','lit la doc du dépôt'],
  lecture:['🔍 lecture','je lis le diff…','lit le diff'],securite:['🔒 sécu','je cherche la faille…','cherche les failles'],avis:['🧐 avis','je rédige l\'avis…','rédige l\'avis'],
  post:['✍ postée',null,'poste l\'avis sur la PR']};
const rvStepName=n=>(RV_STEP[n]||[n])[0];
// une étape finie ou à venir ne montre que son icône ; l'étape en cours ou en échec, son nom aussi (comme les postes des étages)
const rvStepLbl=s=>{const t=rvStepName(s.n), k=t.indexOf(' ');return k<0||s.s==='Running'||s.s==='Failed'?t:t.slice(0,k);};
const rvSteps=r=>(r.steps||[]).filter(s=>RV_STEP[s.n]); // les postes et l'avis posté ; le reste (API, worktree) ne se montre pas
const rvBubble=r=>{const s=rvSteps(r).find(x=>x.s==='Running');return s?RV_STEP[s.n][1]:null;};
// ---------- décor ----------
const RD_T=AT_TS;
function rdBackground(){
  const c=document.createElement('canvas');c.width=AT_W;c.height=AT_H;const g=c.getContext('2d'), T=RD_T;
  for(let y=0;y<27;y++)for(let x=0;x<46;x++)drawFloor(g,x,y,x<RD_X1?'wood':x<RD_VX?'tiles':'carpet');
  R(g,0,0,AT_W,T,'#4b4a52');R(g,0,T,AT_W,8,'#efe9dc');R(g,0,T+8,AT_W,24,'#d9d2c3');R(g,0,T+28,AT_W,4,'#a99f8c');
  for(const x of [RD_X1,RD_VX]){R(g,x*T-3,2*T,6,10.5*T,'#7d776c');R(g,x*T-3,15*T,6,12*T,'#7d776c');}
  for(const x of [RD_X1,RD_VX])woodDoor(g,x*T-6,12.5*T,12,2.5*T,2,true); // les portes de la rédaction et de la revue, sur le couloir
  return c;
}
let RD_BG=null;
// la porte de l'escalier : en bas du couloir, entre la rédaction et la revue (stairDoor, 68-atelier.js)
const RD_STAIR={x:(RD_X1+RD_VX)/2*RD_T-RD_T,y:27*RD_T-12,w:2*RD_T,h:12,vert:false,wall:[RD_X1*RD_T+3,27*RD_T-12,(RD_VX-RD_X1)*RD_T-6,12]};
const RD_EXIT={x:(RD_X1+RD_VX)/2*RD_T-13,y:27*RD_T-23};
// le chapeau mou et la carte de presse des reporters ; la visière verte des correcteurs
function rdHat(g,kind,x,y,dir){const hx=x+(dir==='left'?-2:dir==='right'?2:0), hy=y-44;
  if(kind==='presse'){R(g,hx-13,hy+2,26,3,'#4a3a2a');R(g,hx-8,hy-7,16,10,'#5a4636');R(g,hx-8,hy-1,16,3,'#2a2018');if(dir!=='up')R(g,hx+1,hy-6,7,5,'#fbfbf6');}
  else{R(g,hx-9,hy+3,18,2,'#2a6a3a');if(dir!=='up'){g.fillStyle='rgba(60,180,90,.75)';g.fillRect(hx-10,hy+5,20,5);}}}
function rdLate(people,f,y){people.push([{pos:{x:0,y:y==null?1e6:y}},null,false,f]);}
// un agent : s = run (au travail, halo), wait (gris), idle ; o.hat (assis, il descend avec la tête), o.dir, o.desk (bureau
// devant lui), o.bubble, o.badge (✓ ou ! à côté de lui, comme au 1er ; o.pop : il apparaît en grossissant)
function rdAgent(people,k,x,y,s,o,now){
  o=o||{};const a=atWorker(k,x,y,o.dir||'down',false,'',null);if(!a)return;a._st={st:s==='run'?'work':'idle'};a.pose=o.pose||'type';const hy=y+(a.pose==='type'?6:0);
  const after=()=>{if(o.hat)rdHat(ctx,o.hat,x,hy,o.dir||'down');if(o.desk)atDesk(x,y-6,s==='run');if(o.front)o.front();if(o.badge)atBadge(x+18,y-42,o.badge,o.badgeCol||'#2f9e55',o.pop);if(o.bubble)atBubble(x+(o.bx||0),y-66+(o.by||0),o.bubble);};
  if(s==='wait'){people.push([{pos:{x,y}},null,false,()=>{const g=atLayer();atDrawInto(g,a,now);if(o.hat)rdHat(g,o.hat,x,hy,o.dir||'down');ctx.save();ctx.globalAlpha=.38;ctx.filter='grayscale(1)';ctx.drawImage(AT_OFF,0,0);ctx.restore();if(o.desk)atDesk(x,y-6,false);}]);return;}
  if(s==='run'){const gl=ctx.createRadialGradient(x,y-24,4,x,y-24,46);gl.addColorStop(0,'rgba(255,246,190,.6)');gl.addColorStop(1,'rgba(255,246,190,0)');ctx.fillStyle=gl;ctx.fillRect(x-48,y-72,96,96);RD_LIT.push({x,y});}
  people.push([a,null,false,after]);
}
function rdShelf(x,y,label,lit){R(ctx,x,y,84,74,'#6b4a2e');[4,40].forEach(dy=>{R(ctx,x+4,y+dy,76,30,'#3a2a1e');['#d0392b','#2f6fd6','#e0a020','#3fbf6a','#9b6fe0','#e8e2d0'].forEach((c,k)=>R(ctx,x+7+k*12,y+dy+3,10,26,c));});
  if(!lit){ctx.fillStyle='rgba(30,26,22,.35)';ctx.fillRect(x,y,84,74);}
  atPill('📚 '+label,x+42,y+88,lit?'#2f6fd6':'#f4efe4',lit?'#fff':'#6a6050','bold 11px system-ui,sans-serif');}
// les bibliothèques : les composants de l'équipe (jira.create.components du pack ou de la config), sinon ceux de la démo
const rdShelves=t=>{const own=[...((t&&t.composants)||[])], base=[...((CFG.redaction_shelves||[]).length?CFG.redaction_shelves:RD_SH0)].slice(0,4);for(const c of own)if(!base.includes(c))base.splice(base.length-1,0,c);return [...base.slice(0,4),'autres'];};
function rdPin(q,col){ctx.fillStyle=col;ctx.beginPath();ctx.arc(q.x,q.y,5,0,7);ctx.fill();ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillRect(q.x-2,q.y-3,2,2);}
function rdStrand(a,b,on){ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);if(on){ctx.lineTo(b.x,b.y);ctx.strokeStyle='#c0392b';ctx.lineWidth=3;}
  else{ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2+22,b.x,b.y);ctx.setLineDash([5,5]);ctx.strokeStyle='#9a958a';ctx.lineWidth=2;}ctx.stroke();ctx.restore();}
// ---------- les reporters et le boss : ils marchent (67-vie.js) ----------
// Les trois reporters sont toujours là. Une intention en cours : chacun à son poste jusqu'à la fin (gris tant que son poste
// n'a pas commencé, ✓ une fois fini). Sans intention, le jour, ils se promènent (café, canapé, un livre, leur poste) ; le
// soir et le week-end, ils somnolent à leur poste (z Z), comme au 1er. Le boss épingle chaque nouvelle intention au liège
// avant qu'elle démarre, et porte chaque ticket tamponné à la boîte Jira.
let RD_LV=null;
const rdLv0=()=>Object.assign(lvMem(),{wan:{},sleep:false,seen:new Set(),tk:{},pend:{},gate:new Set(),jobs:[],job:null,want:{},run:null});
const RDP=(x,y)=>({x:x*RD_T,y:y*RD_T}), RD_KS={recherche:60,redaction:61,critique:62}, RD_COFFEE=RDP(18.4,18);
const RD_H=RDP(21.25,13.75), RD_IN=[RD_H,RDP(RD_X1,13.75),RDP(18.6,13.75)];
const rdEntry=()=>[RVF.stairLow,RVF.stair,RD_H]; // 68-revue.js : de derrière la porte de l'escalier au palier
function rdGeo(t){const T=RD_T, shelves=rdShelves(t), sw=3.1*T, sh0=(RD_X1*T-(4*sw+84))/2, lit=new Set((t&&t.composants)||[]), shi=t?Math.max(0,shelves.findIndex(n=>lit.has(n))):1, tx=8.8*T, ty=12.4*T;
  return {T,shelves,sw,sh0,lit,shi,tx,ty,rech:{x:sh0+shi*sw+42,y:7.3*T},red:{x:tx,y:ty-1.2*T},cri:{x:tx,y:ty+2.4*T}};}
// les places : par l'allée du haut (au-dessus de la table) ou celle du bas (au-dessus des tickets épinglés)
function rdSpots(G){const T=RD_T, U=[...RD_IN,RDP(18.6,9.2)], L=[...RD_IN,RDP(18.6,16.4)], sofa=RDP(3.4,24.6);
  const seat=j=>{const x=sofa.x+(j?22:-22);return {id:'sofa'+j,path:[...L,RDP(1.2,16.4),RDP(1.2,22.6),{x,y:22.6*T},{x,y:sofa.y}],dir:'down',sofa:true,front:()=>atSofaFront(sofa.x,sofa.y)};};
  return {recherche:{id:'p:rech',path:[...U,{x:G.rech.x,y:9.2*T},G.rech],dir:'up',seat:true},redaction:{id:'p:red',path:[...U,{x:G.red.x,y:9.2*T},G.red],dir:'down',seat:true},
    critique:{id:'p:cri',path:[...L,{x:G.cri.x,y:16.4*T},G.cri],dir:'up',seat:true},
    pool:[{id:'cafe1',path:[...L,RDP(17.2,16.4),RDP(17.2,19.1),RDP(18.4,19.1)],dir:'up'},{id:'cafe2',path:[...L,RDP(17.2,16.4),RDP(17.2,19.1)],dir:'right'},seat(0),seat(1),
      {id:'livre',path:[...U,{x:G.sh0+3*G.sw+42,y:9.2*T},{x:G.sh0+3*G.sw+42,y:7.3*T}],dir:'up'}]};}
// qui doit être où ; rnd : tirage (remplaçable pour les tests)
function rdWant(t,G,now,rnd){
  const M=RD_LV, S=rdSpots(G), want={}, ks=Object.keys(RD_KS);rnd=rnd||Math.random;
  for(const k of ks)M.spec[k]={k:RD_KS[k],kit:'presse'};
  M.sleep=!t&&!atOpen();
  if(t||M.sleep){for(const k of ks)want[k]=S[k];M.wan={};return want;}
  for(const k of ks){let w=M.wan[k];
    if(!w||now>w.until){const used=new Set(ks.filter(j=>j!==k&&M.wan[j]).map(j=>M.wan[j].s.id)), opts=S.pool.filter(s=>!used.has(s.id));
      const s=rnd()<.35||!opts.length?S[k]:opts[Math.floor(rnd()*opts.length)];
      w=M.wan[k]={s,until:now+(15e3+rnd()*25e3)/walkBoost()};}
    want[k]=w.s;}
  return want;
}
// le boss : une intention arrive, il va l'épingler au liège ; un ticket tamponné, il le porte à Jira. Un trajet à la fois.
const RD_UP=RDP(15.6,22.2), RD_TRIP={intro:[RD_DESK,RD_UP,RDP(17.2,22.2),RDP(17.2,16.4),RDP(1.4,16.4),RDP(1.4,10.6)],jira:[RD_DESK,RD_UP,RDP(18.9,22.2),RDP(18.9,25.4)]};
function rdJobs(t,now,dt){
  const M=RD_LV, boost=walkBoost();
  if(t&&!M.seen.has(t.run)){M.seen.add(t.run);if(!M.fresh&&!REDUCED_MOTION){M.gate.add(t.run);M.jobs.push({kind:'intro',run:t.run});}}
  for(const x of (t&&t.tickets)||[]){const key=t.run+':'+x.i, prev=M.tk[key];M.tk[key]=x.etat;
    if(prev&&prev!=='ok'&&x.etat==='ok'&&!M.fresh&&!REDUCED_MOTION){M.pend[key]=true;M.jobs.push({kind:'jira',key});}}
  if(!M.job&&M.jobs.length){const j=M.jobs.shift();M.job={...j,w:atWalker(RD_TRIP[j.kind],LV_V),ph:'go'};}
  const J=M.job;if(!J)return;
  if(J.ph==='go'&&atStep(J.w,dt)){J.ph='act';J.t=now;J.w.dir=J.kind==='intro'?'up':'left';}
  if(J.ph==='act'&&now-J.t>1100/boost){if(J.kind==='intro')M.gate.delete(J.run);else delete M.pend[J.key];J.ph='back';J.w=atWalker([...RD_TRIP[J.kind]].reverse(),LV_V);}
  if(J.ph==='back'&&atStep(J.w,dt))M.job=null;
}
// ce qu'il porte : la fiche de l'intention (jaune), le ticket tamponné (bande verte, tampon rouge)
function rdSheet(x,y,kind){if(kind==='intro'){R(ctx,x-9,y-11,18,14,'#f7e07a');for(let l=0;l<3;l++)R(ctx,x-6,y-8+l*4,12,1,'rgba(0,0,0,.3)');}
  else{R(ctx,x-9,y-12,18,16,'#fbfbf6');R(ctx,x-9,y-12,18,3,'#b6e3a8');for(let l=0;l<3;l++)R(ctx,x-6,y-6+l*3,12,1,'#b8b2a4');ctx.strokeStyle='#c0392b';ctx.lineWidth=1.5;ctx.strokeRect(x-2,y-4,8,6);}}
// ---------- la salle de rédaction ----------
const RD_LBL={recherche:'📚 Recherche',redaction:'✍ Rédaction',critique:'🧐 Critique'};
function rdRoom(now,people){
  const M=RD_LV, t0=rdTable();
  if(t0&&M.run!==t0.run){if(M.run!=null)M.fresh=true;M.run=t0.run;} // une autre intention choisie au liège : tout se pose
  const t=t0&&M.gate.has(t0.run)?null:t0, G=rdGeo(t0), T=G.T, {shelves,sw,sh0,lit,tx,ty,rech,red,cri}=G; // t : l'intention, une fois épinglée
  shelves.forEach((n,k)=>rdShelf(sh0+k*sw,2.3*T,n,!!t&&(lit.has(n)||n==='autres'&&[...lit].some(c=>!shelves.includes(c)))));
  const S=RD_CORK, pinning=t0&&!t&&M.job&&M.job.kind==='intro'&&M.job.ph==='act';
  R(ctx,S.x-24,S.y-52,48,46,'#7a5a3c');R(ctx,S.x-20,S.y-48,40,38,'#c9a26a');if(t||pinning){R(ctx,S.x-14,S.y-42,26,22,'#f7e07a');for(let l=0;l<3;l++)R(ctx,S.x-10,S.y-36+l*5,18,2,'rgba(0,0,0,.3)');}
  atHitRd('cork',S.x-24,S.y-52,48,46,{});
  const others=rdTables().filter(x=>x!==t0);
  rdLate(people,()=>{atPill(t?'📌 '+clip(t.intention,34):t0?'📌 le boss apporte une intention…':ticketOn()?'📌 aucune intention en cours':'📌 rédaction non installée',S.x+(t?96:t0?100:70),S.y+10,'#1c1f26','#fff','bold 11px system-ui,sans-serif');
    if(others.length)atPill('+ '+plural(others.length,'autre intention','autres intentions')+' : clic sur le liège',S.x+70,S.y+28,'#5d6370','#fff','bold 11px system-ui,sans-serif');},1e6);
  const p=t?t.poste:null, st=k=>!t?'idle':k===p?'run':RD_POSTES.findIndex(x=>x.k===k)<RD_POSTES.findIndex(x=>x.k===p)?'ok':'wait';
  const tks=((t&&t.tickets)||[]).map(x=>M.pend[t.run+':'+x.i]?{...x,etat:'gate'}:x); // le ticket que le boss porte n'est pas encore dans Jira
  rdLate(people,()=>{R(ctx,tx-4.4*T,ty-.9*T,8.8*T,1.8*T,'#7a5a3c');R(ctx,tx-4.4*T,ty-.9*T,8.8*T,6,'#94704c');R(ctx,tx-4.2*T,ty+.9*T,6,10,'#4a3424');R(ctx,tx+4.2*T-6,ty+.9*T,6,10,'#4a3424');
    tks.slice(0,4).forEach((x,k)=>{const sx=tx+(-2.6+k*1.3)*T;R(ctx,sx-12,ty-15,24,30,'#fbfbf6');R(ctx,sx-12,ty-15,24,4,RD_TK[x.etat]?RD_TK[x.etat][0]:'#2f6fd6');for(let l=0;l<4;l++)R(ctx,sx-8,ty-6+l*5,16,2,'#b8b2a4');atPill('T'+(k+1),sx+12,ty-14,'#0b2a4a','#fff','bold 10px ui-monospace,Menlo,monospace');});
    if(tks.length>4)atPill('+'+(tks.length-4),tx+2.6*T,ty,'#0b2a4a','#fff','bold 11px ui-monospace,Menlo,monospace');
    if(t&&t.tour>1)atPill('↺ critique → rédaction · tour '+t.tour+'/3',tx+5.4*T,ty+2.6*T,'#0b2a4a','#fff','bold 11px system-ui,sans-serif');},ty-.6*T);
  atHitRd('table',tx-4.4*T,ty-2.2*T,8.8*T,5*T,{});
  // les plaques des postes (leur nom, toujours au même endroit, même quand l'agent se promène) : le fil rouge y est épinglé
  const plq={recherche:{x:rech.x,y:rech.y+16},redaction:{x:red.x+80,y:red.y-22},critique:{x:cri.x,y:cri.y+16}}, pin={};
  ctx.font='bold 11px system-ui,sans-serif';for(const k in plq)pin[k]={x:plq[k].x-(ctx.measureText(RD_LBL[k]).width+10)/2-4,y:plq[k].y-2};
  // le fil rouge : le liège, la recherche, la rédaction, puis un brin par ticket ; tous finissent au tampon, puis à Jira
  const desk=RD_DESK, jira=RD_JIRA, p0={x:S.x+20,y:S.y-14}, p1=pin.recherche, p2=pin.redaction;
  const cards=tks.slice(0,4).map((x,k,l)=>({x:(2.2+k*(14.6/Math.max(1,l.length)))*T+(14.6/Math.max(1,l.length))*T/2-.6*T,y:19.6*T}));
  if(t){rdStrand(p0,p1,true);rdStrand(p1,p2,p!=='recherche');
    cards.forEach((c,k)=>{rdStrand(p2,{x:c.x,y:c.y-24},tks[k].etat!=='wait'||p==='valider');rdStrand({x:c.x,y:c.y+14},{x:desk.x,y:desk.y-30},tks[k].etat==='ok');});
    rdStrand({x:desk.x,y:desk.y-30},{x:jira.x,y:jira.y-34},tks.some(x=>x.etat==='ok'));
    rdLate(people,()=>{rdPin(p0,'#d0392b');rdPin(p1,'#d0392b');if(p!=='recherche')rdPin(p2,'#d0392b');
      cards.forEach((c,k)=>{const x=tks[k], col=(RD_TK[x.etat]||RD_TK.wait);R(ctx,c.x-56,c.y-24,112,38,x.etat==='wait'&&p==='critique'&&k===0?'#9fd4ff':col[0]);rdPin({x:c.x,y:c.y-24},'#d0392b');
        atTxt('T'+(k+1)+' · '+(x.composant||'?'),c.x,c.y-8,'#1c1f26','bold 11px ui-monospace,Menlo,monospace');atTxt(clip(x.summary||'',20),c.x,c.y+5,'#3a3530','11px system-ui');
        atHitRd('ticket',c.x-56,c.y-24,112,38,{k});});
      // quatre cartes au plus au liège (8 tickets par intention) : les autres sont dans la liste du panneau
      if(tks.length>4)atPill('+ '+plural(tks.length-4,'ticket','tickets')+' : dans le panneau',cards[3].x,cards[3].y+30,'#5d6370','#fff','bold 11px system-ui,sans-serif');},1e6-1);}
  // les reporters assis à leur poste ; les autres marchent, prennent un café, lisent ou sont au canapé (lvDraw)
  Object.assign(M.want,rdWant(t,G,now));
  const bub={recherche:p==='recherche'?'je fouille '+(t.composants||[]).length+' dépôt(s)…':null,redaction:p==='redaction'?(tks.length?'version '+(t.tour||1)+', je reprends…':'je rédige…'):null,critique:p==='critique'?'je relis T1…':null};
  const at={recherche:[rech,'up'],redaction:[red,'down'],critique:[cri,'up']};let zk=0;
  for(const k in at){const s=st(k), pop=lvPop(M,k,!!t&&s==='ok',now), [q,d]=at[k];
    if(lvSeated(M,k)){rdAgent(people,RD_KS[k],q.x,q.y,!t?'idle':s==='wait'?'wait':s==='run'?'run':'idle',{dir:d,hat:'presse',bubble:bub[k],...(k==='critique'?{bx:86,by:44}:{}),badge:t&&s==='ok'?'✓':null,pop},now);
      if(M.sleep){const j=zk++;rdLate(people,()=>lvZz(q.x,q.y,j,now),1e6);}}
    rdLate(people,()=>atPill(RD_LBL[k],plq[k].x,plq[k].y,s==='run'?'#2f6fd6':s==='ok'?'#2f7a45':'#f4efe4',s==='wait'||!t?'#3a3530':'#fff','bold 11px system-ui,sans-serif'),1e6);
    // la plaque et le poste : l'agent peut se promener, sa fiche reste au même endroit
    atHitRd('poste',q.x-22,q.y-58,44,64,{p:k});atHitRd('poste',plq[k].x-54,plq[k].y-11,108,22,{p:k});}
  // le bureau du boss, le tampon posé dessus : il y est, et tamponne les tickets un par un
  rdBoss(people,tks,now);
  rdLate(people,()=>{R(ctx,jira.x-18,jira.y-30,36,30,'#2f6fd6');R(ctx,jira.x-18,jira.y-34,36,6,'#2559b8');R(ctx,jira.x-10,jira.y-20,20,3,'#0b2a4a');atPill('🎫 Jira',jira.x-44,jira.y-14,'#f4efe4','#3a3530','bold 11px system-ui,sans-serif');},jira.y);
  atHitRd('jira',jira.x-70,jira.y-36,90,40,{});
  atCoffee(RD_COFFEE.x,RD_COFFEE.y); // la machine à café de la rédaction
  const sofa=RDP(3.4,24.6);atSofa(sofa.x,sofa.y);if(!Object.values(M.who).some(h=>!h.w&&h.spot.sofa))rdLate(people,()=>atSofaFront(sofa.x,sofa.y),sofa.y+10);
  rdBoard(people);
}
// le tableau noir des tickets du jour, jumeau de REVUES DU JOUR, sur un chevalet entre les tickets épinglés et le tampon
// (rien au clic : le détail est dans la page « Rédaction · bilan ») ; créés et jetons depuis minuit : dataset redaction
const RD_BOARD={x:5.9*RD_T,y:20.8*RD_T,w:7.3*RD_T,h:3*RD_T};
function rdTicketsDuJour(){
  const d=REDACTION||{};
  return {crees:d.crees||0,tampon:rdTables().reduce((a,t)=>a+(t.tickets||[]).filter(x=>x.etat==='gate').length,0),cours:rdTables().length,tok:d.tok_jour||0};
}
function rdBoard(people){
  const {x:bx,y:by,w:bw,h:bh}=RD_BOARD, j=rdTicketsDuJour();
  // sous le bandeau du tampon (dessiné à la hauteur du bureau du boss) : ses pieds passent derrière
  rdLate(people,()=>{R(ctx,bx+14,by+bh,5,18,'#5a3e28');R(ctx,bx+bw-19,by+bh,5,18,'#5a3e28');R(ctx,bx+bw/2-2,by+bh,4,12,'#4a3424');
    R(ctx,bx-6,by-6,bw+12,bh+12,'#8a6040');R(ctx,bx,by,bw,bh,'#24352c');R(ctx,bx+4,by+bh-6,bw-8,4,'#a37650');
    atTxt('TICKETS DU JOUR',bx+bw/2,by+18,'#f4efe4','bold 13px ui-monospace,Menlo,monospace');R(ctx,bx+16,by+24,bw-32,1,'rgba(244,239,228,.4)');
    [['#3fbf6a',plural(j.crees,'ticket créé','tickets créés')+' aujourd\'hui'],[WAIT_BG,plural(j.tampon,'ticket','tickets')+' au tampon'],
     ['#5b8def',plural(j.cours,'intention en cours','intentions en cours')],['#e0a020','~'+Math.round(j.tok/1e3)+' k jetons']]
      .forEach(([c,t],k)=>{R(ctx,bx+16,by+34+k*15,8,8,c);atTxt(t,bx+30,by+42+k*15,'#e8e2d0','12px ui-monospace,Menlo,monospace','left');});},RD_DESK.y-1);
}
function rdBoss(people,tks,now){
  const {x,y}=RD_DESK, boss=chars.find(c=>c.boss), g=tks.filter(t=>t.etat==='gate').length, J=RD_LV.job;
  atBossChair(x,y);
  // le bureau du RDC ; au milieu, l'encreur et le tampon (la tasse poussée au bout) ; le tampon part avec lui à Jira
  const desk=away=>{atBossDesk(x,y,now,boss,(x0,top)=>{R(ctx,x0+40,top+5,22,8,'#2a2a30');R(ctx,x0+42,top+6,18,5,'#7a1f24');
      if(!(J&&J.kind==='jira')){R(ctx,x0+66,top-2,12,9,'#c8323a');R(ctx,x0+66,top-2,12,2,'#e0525a');R(ctx,x0+70,top-9,4,7,'#1c1c1c');R(ctx,x0+68,top-12,8,4,'#2c2c2c');}},84);
    if(g&&!away)atBubble(x,y-62,'✋ '+plural(g,'ticket','tickets')+' : je tamponne ?',WAIT_TXT);};
  if(boss&&J){const p=J.w.pos, c=withFloorSprite(Object.assign(Object.create(Object.getPrototypeOf(boss)),boss,{pos:{x:p.x,y:p.y},tile:null,dir:J.w.dir,moving:J.ph!=='act',pose:'stand',present:true,_st:{st:'idle'}}),boss,'redaction_sprite');
    rdLate(people,()=>desk(true),y);
    people.push([c,null,false,()=>{if(J.ph==='go')rdSheet(p.x+(J.w.dir==='left'?-14:14),p.y-30,J.kind);if(J.ph==='act')atBubble(p.x,p.y-62,J.kind==='intro'?'📌 je l\'épingle…':'🎫 dans la boîte Jira…');}]);
    RD_LIT.push(p);atHitRd('boss',p.x-16,p.y-56,32,60,{});}
  else if(boss){people.push([withFloorSprite(atSeatedBoss(boss,x,y,g?'gate':'idle'),boss,'redaction_sprite'),null,false,()=>desk(false)]);RD_LIT.push({x,y});atHitRd('boss',x-16,y-60,32,60,{});}
  else rdLate(people,()=>desk(false),y);
  rdLate(people,()=>atPill('✋ le tampon : tu valides les tickets, puis ils partent un par un',x-40,y+30,g?WAIT_BG:'#f4efe4',g?WAIT_INK:'#3a3530','bold 11px system-ui,sans-serif'),y);
}
// un banc comme au 1er : ceux qui ne travaillent pas s'y assoient (descendus dans l'assise, qui leur cache les jambes)
function rdBench(people,x,y,ks,hat){atSofa(x,y);ks.forEach((k,j)=>{const a=atWorker(k,x+(j?22:-22),y+9,'down',false,'',null);if(!a)return;a._st={st:'idle'};a.pose='stand';
  people.push([a,null,false,()=>{rdHat(ctx,hat,x+(j?22:-22),y+9,'down');if(j===ks.length-1)atSofaFront(x,y);}]);});}
// ---------- la salle de revue ----------
const RD_RV=[RD_H,RDP(RD_VX,13.75),RDP(24.4,13.75)]; // du palier, par la porte de la revue
function rdRevue(now,people){
  const file=rvfOn(), kids=file?rvfKids():new Set(), F=file?rvfDraw(now,people):null, wait=F&&F.st?F.st.queue.length:0;
  const T=RD_T, l=rvActive().filter(r=>!kids.has(r.run)), done=rvRuns().filter(r=>r.status==='Success'&&r._s>=DAY0).length;
  atTxt('👀 REVUE DES PR',(RD_VX+.6)*T,2.7*T,'#5a4636','bold 12px ui-monospace,Menlo,monospace','left');
  const bx=30*T, by=2.1*T, bw=11*T, bh=3.4*T;R(ctx,bx-6,by-6,bw+12,bh+12,'#8a6040');R(ctx,bx,by,bw,bh,'#24352c');R(ctx,bx+4,by+bh-6,bw-8,4,'#a37650');
  atTxt('REVUES DU JOUR',bx+bw/2,by+18,'#f4efe4','bold 13px ui-monospace,Menlo,monospace');R(ctx,bx+16,by+24,bw-32,1,'rgba(244,239,228,.4)');
  [['#5b8def',plural(rvActive().length,'PR en lecture','PR en lecture')],...(file?[[WAIT_BG,plural(wait,'PR en attente','PR en attente')+(F.st?' (cron '+hm(F.st.b.s)+')':'')]]:[]),['#3fbf6a',plural(done,'revue postée','revues postées')+' aujourd\'hui'],['#e0a020','~'+Math.round(rvRuns().filter(r=>r._s>=DAY0).reduce((a,r)=>a+(r.tok||0),0)/1e3)+' k jetons']]
    .forEach(([c,t],k)=>{R(ctx,bx+16,by+36+k*18,8,8,c);atTxt(t,bx+30,by+44+k*18,'#e8e2d0','12px ui-monospace,Menlo,monospace','left');});
  const boss=chars.find(c=>c.boss);
  if(file)rvfDesk(people,now,F);
  for(let k=file?1:0;k<6;k++){const r=l[k-(file?1:0)], cx=(28.5+(k%3)*6.3)*T, feet=(k<3?9.2:18.4)*T, rf=feet+2.3*T;
    if(!r){atDesk(cx,feet-6,false);ctx.fillStyle='rgba(30,26,22,.22)';ctx.fillRect(cx-90,feet-90,180,150);rdLate(people,()=>atPill('bureau libre',cx,feet+40,'#f4efe4','#6a6050','bold 11px system-ui,sans-serif'),feet);continue;}
    const v=r.vars||{}, who=v['current_task.author'], au=who&&typeof ghChar==='function'?ghChar(who):null, mine=au&&boss&&au.key===boss.key;
    // le relecteur et l'auteur arrivent par la porte de l'escalier, et repartent la revue finie (67-vie.js)
    const ri='rel:'+r.run, ai='au:'+r.run, side=cx+2.2*T, top=k<3, M=RD_LV;
    M.spec[ri]={k:100+k,kit:'visiere'};M.spec[ai]=au&&!mine?{src:()=>au}:{k:110+k};
    M.want[ri]={id:'rv'+k,path:[...RD_RV,{x:side,y:13.75*T},{x:side,y:(top?7.6:16.8)*T},{x:cx,y:(top?7.6:16.8)*T},{x:cx,y:feet}],dir:'down',seat:true};
    M.want[ai]={id:'au'+k,path:top?[...RD_RV,{x:cx,y:13.75*T},{x:cx,y:rf}]:[...RD_RV,{x:side,y:13.75*T},{x:side,y:rf+1.2*T},{x:cx,y:rf+1.2*T},{x:cx,y:rf}],dir:'up'};
    if(lvSeated(M,ri))rdAgent(people,100+k,cx,feet,'run',{hat:'visiere',desk:true,bubble:rvBubble(r)},now);
    else{atDesk(cx,feet-6,false);ctx.fillStyle='rgba(30,26,22,.22)';ctx.fillRect(cx-90,feet-90,180,150);}
    const pr=(String(v['current_task.repo']||'').split('/').pop()||'?')+'#'+(v['current_task.number']||'?'), name=au&&!mine?au.name:mine?'🤖 remplaçant (ta PR)':who?'@'+who:'';
    rdLate(people,()=>{atPill(pr+(name?' · '+name:''),cx,rf+24,'#0b2a4a','#fff','bold 11px ui-monospace,Menlo,monospace');
      const steps=rvSteps(r);ctx.font='bold 10px system-ui,sans-serif';const ws=steps.map(s=>ctx.measureText(rvStepLbl(s)).width+10), tot=ws.reduce((a,b)=>a+b,0)+Math.max(0,steps.length-1)*3;let x=cx-tot/2;
      steps.forEach((s,j)=>{const c=s.s==='Success'?'#2f7a45':s.s==='Running'?'#2f6fd6':s.s==='Failed'?'#a8323a':'#e8e2d0';atPill(rvStepLbl(s),x+ws[j]/2,rf+42,c,c==='#e8e2d0'?'#6a6050':'#fff','bold 10px system-ui,sans-serif');x+=ws[j]+3;});},rf+1);
    atHitRd('review',cx-60,feet-60,120,rf-feet+80,{run:r.run});}
  if(l.length<6)rdBench(people,41.6*T,25.2*T,file&&F.M.rel?[96]:[96,97],'visiere'); // le relecteur de la file quitte le banc
  const sx=(RD_X1+RD_VX)/2*T;atCoffee(sx,6.4*T);atPlant(sx-36,20*T);atPlant(sx+36,20*T);
  rdLate(people,()=>atPill('⇅ escalier · RDC',sx,27*T-30,'#5a4636','#fff','bold 11px ui-monospace,Menlo,monospace'),27*T-40); // au sol : ceux qui sortent de la porte passent devant
}
// ---------- la nuit, comme au RDC (floorNight) : la salle de rédaction s'allume tant qu'une intention y est, chaque bureau de
// la revue quand une PR y est lue ; la lampe du bureau du boss reste allumée ; hors des heures de bureau, la veilleuse ----------
const RD_NIGHT={};
function rdNight(people,now){
  const T_=AT_TS, file=rvfOn(), kids=file?rvfKids():new Set(), l=rvActive().filter(r=>!kids.has(r.run)), st=file?rvfState():null, rooms=[[0,2,Math.ceil(RD_X1)-1,26,!!rdTable()]];
  // le premier bureau est celui de la file du cron (68-revue.js) : allumé quand une PR y est lue ; les revues à la demande ensuite
  const lit=k=>file?(k===0?!!(st&&st.reading):!!l[k-1]):!!l[k];
  for(let k=0;k<6;k++){const cx=28.5+(k%3)*6.3, f=k<3?9.2:18.4;rooms.push([Math.round(cx-2.5),Math.round(f-3),Math.round(cx+2.5),Math.round(f+3),lit(k)]);}
  floorNight(RD_NIGHT,{rooms,closed:!atOpen(),track:RD_LIT,spots:[...floorPeopleSpots(people),...RD_LIT.map(q=>({x:q.x,y:q.y-26,r:42,a:.95})),
    floorBossLamp(RD_DESK.x,RD_DESK.y),{x:(RD_X1+RD_VX)/2*T_,y:26.2*T_,r:1.6*T_,a:.45},exitHalo(RD_EXIT.x,RD_EXIT.y)]},now); // la porte de l'escalier
  if(RD_NIGHT.lv)exitSign(RD_EXIT.x,RD_EXIT.y);
}
function rdReset(){RD_MEM={last:0};RDSEL=null;RDTK=null;RDF=null;RD_LV=rdLv0();if(typeof rvfReset==='function')rvfReset();}
function renderRedaction(now){
  if(!RD_LV)RD_LV=rdLv0();
  const M=RD_LV, dt=lvTick(M,now);if(M.fresh){M.jobs=[];M.job=null;M.gate.clear();M.pend={};}
  RD_MEM.last=now;if(!RD_BG)RD_BG=rdBackground();ctx.drawImage(RD_BG,0,0);atWindows(now,RD_WINDOWS);RD_HITS=[];RD_LIT=[];
  rdJobs(rdTable(),now,dt);
  const people=[];M.want={};rdRoom(now,people);rdRevue(now,people);
  lvUpdate(M,M.want,rdEntry(),dt);lvDraw(M,people,now,q=>q.y>AT_H+48);
  people.sort((a,b)=>a[0].pos.y-b[0].pos.y).forEach(([c,d,before,after])=>{if(d)d();if(c.sprite)drawChar(c,now);if(after)after();});
  stairDoor(RD_STAIR,people.map(q=>q[0].pos));
  rdNight(people,now);
  const b=chars.find(c=>c.boss);if(b&&sel===b.key)selHalo(RD_DESK.x,RD_DESK.y-26,AT_W,AT_H);
  floorTitle();
}
function atHitRd(kind,x,y,w,h,ref){RD_HITS.push({kind,x,y,w,h,...ref});}
function rdHitAt(e){const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width, my=(e.clientY-r.top)*AT_H/r.height;
  for(let k=RD_HITS.length-1;k>=0;k--){const h=RD_HITS[k];if(mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h)return h;}return null;}
function redactionClick(e){
  const h=rdHitAt(e);sel=null;SEL_BACK=[];
  if(h&&h.kind==='boss'){const b=chars.find(c=>c.boss);if(b){select(b.key);return;}}
  RDF=null;
  if(h&&h.kind==='cork'){const l=rdTables();if(l.length>1){const i=l.indexOf(rdTable());RDSEL=l[(i+1)%l.length].run;}RDTK=null;}
  if(h&&h.kind==='ticket'){const t=rdTable();if(t)RDTK={run:t.run,k:h.k};}
  const f=h&&{table:rdTable()&&{k:'intention'},poste:rdTable()&&{k:'poste',p:h.p,back:{k:'intention'}},jira:{k:'jira'},review:{k:'review',run:h.run},
    author:{k:'author',a:h.author},casier:{k:'casier'},postees:{k:'postees'}}[h.kind];
  if(f){RDF=f;RDTK=null;}
  renderSide(true);
}
function redactionHover(e){
  const h=rdHitAt(e), t=rdTable();let s='';
  if(h&&h.kind==='ticket'&&t){const x=t.tickets[h.k];s='T'+(h.k+1)+' · '+(x.composant||'?')+' · '+(x.points||'?')+' pts · '+(RD_TK[x.etat]||RD_TK.wait)[1]+' · '+x.summary+' · clic : son détail';}
  else if(h&&h.kind==='table')s=t?'La table de rédaction : '+t.intention+' · clic : sa fiche':'La table de rédaction : aucune intention en cours';
  else if(h&&h.kind==='poste'){const p=RD_POSTES.find(x=>x.k===h.p)||{};s=p.i+' '+p.n+' : '+p.d+(t?' · clic : ce qu\'elle a fait':'');}
  else if(h&&h.kind==='jira'){const n=((REDACTION&&REDACTION.crees_l)||[]).length;s='La boîte Jira : '+plural(n,'ticket créé','tickets créés')+' aujourd\'hui · clic : la liste';}
  else if(h&&h.kind==='postees')s=rvfHover(h);
  else if(h&&h.kind==='cork')s=rdTables().length>1?'Les intentions en cours : clic pour passer à la suivante':'L\'intention en cours';
  else if(h&&h.kind==='boss')s=(chars.find(c=>c.boss)||{}).name+' : tamponne chaque ticket avant sa création ; clic : sa fiche';
  else if(h&&(h.kind==='casier'||h.kind==='author'))s=rvfHover(h);
  else if(h&&h.kind==='review'){const r=rvRuns().find(x=>x.run===h.run), v=(r&&r.vars)||{};s='Revue de '+(v['current_task.repo']||'?')+'#'+(v['current_task.number']||'?')+' : les étapes de son run, sous le bureau · clic : la PR, son ticket, le Kanban';}
  cv.style.cursor=h&&(h.kind!=='poste'||t)?'pointer':'default';
  if(s){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';tip.textContent=s;}else tip.style.display='none';
}
// ---------- panneau ----------
function redactionListHtml(){
  const l=rdTables(), rv=rvActive();
  return `<h2 class="at-h">✍ Rédaction <span class="cnt">${l.length}</span></h2>`+(l.length?l.map(t=>`<button class="at-room" data-run="${esc(t.run)}"><span class="at-top"><span class="at-title">${esc(clip(t.intention,80))}</span>${(t.tickets||[]).some(x=>x.etat==='gate')?'<span class="at-tag wait">✋ t\'attend</span>':`<span class="at-tag run">${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).i||'')} ${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).n||'')}</span>`}</span>
    ${(t.tickets||[]).length?'':'<span class="mut">les tickets arrivent avec la rédaction</span>'}</button>${(t.tickets||[]).map((x,k)=>`<button class="rd-tk" data-run="${esc(t.run)}" data-k="${k}" title="Son détail"><b>T${k+1}</b> ${esc(x.summary)} <span class="mut">· ${esc(x.composant||'?')} · ${esc(String(x.points||'?'))} pts · ${esc((RD_TK[x.etat]||RD_TK.wait)[1])}</span></button>`).join('')}`).join(''):(ticketOn()?'':`<div class="note">${RD_ABSENT} : <code>python3 tools/install.py</code> la propose.</div>`)+'<div class="note">Aucune intention en cours. « ▶ Lancer » sur la fiche de l\'agent des tickets en démarre une.</div>')+
    `<div class="at-gate"></div><h2 class="at-h">👀 Revue des PR <span class="cnt">${rv.length}</span></h2>`+(rv.length?rv.map(r=>{const v=r.vars||{};return `<div class="at-q"><b class="mono">${esc((String(v['current_task.repo']||'').split('/').pop()||'?')+'#'+(v['current_task.number']||'?'))}</b> <span class="mut">${esc(rvSteps(r).map(s=>rvStepName(s.n)+(s.s==='Success'?' ✓':s.s==='Running'?' …':'')).join(' · '))}</span></div>`;}).join(''):'<div class="mut">Aucune revue en cours.</div>');
}
// la fiche d'un ticket : ce qui sera créé pour lui seul (le tampon ne montre que le récap de la liste)
function rdTicketOpen(){
  if(!RDTK)return null;const t=rdTables().find(x=>x.run===RDTK.run), x=t&&(t.tickets||[])[RDTK.k];
  if(!x){RDTK=null;return null;}return {t,k:RDTK.k};
}
function rdTicketHtml(t,k){
  const x=t.tickets[k], st=RD_TK[x.etat]||RD_TK.wait, meta=[t.type,(x.points||'?')+' pts',x.composant||'sans composant',t.parent?'parent '+t.parent:''].filter(Boolean).join(' · ');
  return `<button class="rd-back">← Les tickets</button><h2 class="at-h">T${k+1} <span class="at-tag" style="background:${st[0]};color:#1c1c1c">${esc(st[1])}</span></h2>`+
    `<div class="rd-tt">${esc(x.summary)}</div><div class="mut">${esc(meta)}</div>`+
    (x.key?fkLinks([jiraA(x.key,'🎫 '+x.key+' ↗'),`<button type="button" class="lk" data-kbtk="${esc(x.key)}">🔍 Dans le Kanban</button>`]):'')+
    (x.detail?`<div class="rd-det">${esc(x.detail)}</div>`:'<div class="note">Le détail arrive au prochain relevé de la rédaction (une minute au plus).</div>')+
    '<div class="at-gate"></div>';
}
function drawRedactionSide(side){
  const boss=chars.find(c=>c.boss);
  if(sel!=null&&!(boss&&sel===boss.key)){setFloor(0);return;}
  if(sel!=null){drawSide(side);return;}
  const box=document.createElement('div');box.className='atelier';side.appendChild(box);
  const tk=rdTicketOpen(), f=!tk&&rdFicheHtml(RDF);
  if(RDF&&!tk&&!f)RDF=null; // la PR, l'intention ou l'auteur sont partis depuis : retour à la liste
  if(f){box.innerHTML=f;const b=box.querySelector('.at-back');if(RDF.back)b.textContent='‹ '+(FK_BACK[RDF.back.k]||'Retour');
    b.addEventListener('click',()=>{RDF=RDF.back||null;renderSide(true);});fkWire(box);}
  else if(tk){box.innerHTML=rdTicketHtml(tk.t,tk.k);box.querySelector('.rd-back').addEventListener('click',()=>{RDTK=null;renderSide(true);});fkWire(box);}
  else{box.innerHTML=redactionListHtml();
    box.querySelectorAll('.at-room').forEach(b=>b.addEventListener('click',()=>{RDSEL=b.dataset.run;renderSide(true);}));
    box.querySelectorAll('.rd-tk').forEach(b=>b.addEventListener('click',()=>{RDSEL=b.dataset.run;RDTK={run:b.dataset.run,k:+b.dataset.k};renderSide(true);}));}
  for(const g of GATES)if(/un ticket/.test(String(g.wf_name||'')))gateCard(box.querySelector('.at-gate')||box,{run:g.run,wf_name:g.wf_name,_s:ms(g.since)},null); // le tampon : chaque ticket qui t'attend
}
// ---------- les fiches au clic (2e et 3e) : liens vers la PR, le ticket, le run et le Kanban ----------
const ghPrUrl=(repo,n)=>/^[\w.-]+\/[\w.-]+$/.test(String(repo||''))&&/^\d+$/.test(String(n||''))?`https://github.com/${repo}/pull/${n}`:null;
const fkA=(u,t)=>safeUrl(u)?`<a class="lk" ${hrefOf(u)} target="_blank" rel="noopener">${esc(t)}</a>`:'';
const jiraA=(k,t)=>CFG.jira_site?fkA(JIRA_BROWSE+encodeURIComponent(k),t||k+' ↗'):`<span class="lk mono">${esc(t||k)}</span>`;
const fkRun=u=>typeof u==='string'&&/^https?:\/\//i.test(u)?`<a class="lk" href="${esc(u)}" target="_blank" rel="noopener">⚙ Le run ↗</a>`:'';
const fkRunOf=r=>r&&r.wf&&KRONN_BASE?fkRun(kronnTab()+'#workflows/'+encodeURIComponent(r.wf)):'';
const fkLinks=l=>(l=l.filter(Boolean)).length?`<div class="fk-links">${l.join('')}</div>`:'';
const fkShort=(repo,n)=>(String(repo||'').split('/').pop()||'?')+'#'+n;
// la rangée d'une PR : sur GitHub, son diff, son ticket, le run, puis le Mur Kanban ouvert sur elle (filtré sur son auteur)
function prLinksHtml(repo,n,author,run){
  const x=prInfo(repo+'#'+n), url=safeUrl(x.pr&&x.pr.url)||ghPrUrl(repo,n), keys=(x.pr&&x.pr.keys)||[];
  return fkLinks([url&&fkA(url,'🐙 La PR ↗'),url&&fkA(url+'/files','± Le diff ↗'),...keys.slice(0,2).map(k=>jiraA(k,'🎫 '+k+' ↗')),run,
    `<button type="button" class="lk main" data-kbpr="${esc(repo+'#'+n)}" data-au="${esc(author||'')}">🔍 Ouvrir dans le Kanban</button>`]);
}
const fkTitle=(repo,n)=>{const x=prInfo(repo+'#'+n);return x.pr&&x.pr.title?`<div class="at-title big">${esc(x.pr.title)}</div>`:'';};
// un clic dans une fiche : le Kanban (PR, ticket ou personne), une autre fiche (poste, ticket, auteur, revue, poste du 3e)
function fkAct(d){
  if(d.kbpr){const c=d.au&&typeof ghChar==='function'?ghChar(d.au):null;openKanban({who:c&&c.person?c.key:'',pr:d.kbpr});return;}
  if(d.kbtk){openKanban({ticket:d.kbtk});return;}
  if(d.kbwho){openKanban({who:d.kbwho});return;}
  if(d.rtp)RTPOSTE=d.rtp;
  else if(d.rdp)RDF={k:'poste',p:d.rdp,back:RDF};
  else if(d.rdtk!=null){const t=rdTable();if(t)RDTK={run:t.run,k:+d.rdtk};RDF=null;}
  else if(d.rva)RDF={k:'author',a:d.rva,back:RDF};
  else if(d.rvr)RDF={k:'review',run:d.rvr,back:RDF};
  else return;
  renderSide(true);
}
function fkWire(box){
  box.addEventListener('click',e=>{const b=e.target.closest('[data-kbpr],[data-kbtk],[data-kbwho],[data-rdp],[data-rdtk],[data-rva],[data-rvr],[data-rtp]');if(b)fkAct(b.dataset);});
}
function rdFicheHtml(f){
  if(!f)return null;
  if(f.k==='review')return rvFicheHtml(f.run);
  if(f.k==='author')return rvAuthorHtml(f.a);
  if(f.k==='casier'||f.k==='postees')return rvFileHtml(f.k);
  if(f.k==='jira')return rdJiraHtml();
  const t=rdTable();if(!t)return null;
  return f.k==='poste'?rdPosteHtml(t,f.p):rdIntentionHtml(t);
}
const rdPosteSt=(t,k)=>{const i=k=>RD_POSTES.findIndex(x=>x.k===k);return k===t.poste?'run':i(k)<i(t.poste)?'ok':'';};
function rdIntentionHtml(t){
  const tks=t.tickets||[], tour=t.tour>1?`<span class="cnt">tour ${t.tour}/3</span>`:'';
  return `<button class="at-back">‹ La rédaction</button><h2 class="at-h">✍ L'intention ${tour}</h2><div class="at-title big">${esc(t.intention)}</div>`+
    `<div class="mut">${[t.type,t.parent?'parent '+t.parent:'',t.since?'depuis '+hm(ms(t.since)):''].filter(Boolean).map(esc).join(' · ')}</div>`+
    `<div class="fk-steps">${RD_POSTES.map(p=>{const s=rdPosteSt(t,p.k), lbl=s==='run'?p.i+' '+p.n:p.i;
      return p.k==='valider'?`<i class="${s}" title="${esc(p.n)}">${esc(lbl)}</i>`:`<button type="button" class="${s}" data-rdp="${p.k}" title="${esc(p.n+' : sa fiche')}">${esc(lbl)}</button>`;}).join('')}</div>`+
    ((t.composants||[]).length?`<div class="fk-chips">${t.composants.map(c=>`<i>${esc(c)}</i>`).join('')}</div>`:'')+
    `<div class="fk-fold"><h4>Ses tickets</h4>${tks.length?tks.map((x,k)=>`<button type="button" class="fk-r" data-rdtk="${k}"><span class="k mono">T${k+1}</span><span>${esc(x.summary)} <span class="mut">· ${esc(x.composant||'?')}</span></span><span class="k">${esc(x.key||(x.points||'?')+' pts')}</span></button>`).join(''):'<div class="mut">Les tickets arrivent avec la rédaction.</div>'}</div>`+
    fkLinks([t.parent&&jiraA(t.parent,'🎫 Le parent ↗'),fkRun(t.url)]);
}
const FK_BACK={intention:'L\'intention',poste:'Le poste',review:'La PR',author:'L\'auteur',casier:'Le casier',postees:'Les avis postés',jira:'La boîte Jira'};
const RD_GRAV={bloquant:'🔧',conseil:'💡'};
function rdPosteHtml(t,k){
  const p=RD_POSTES.find(x=>x.k===k);if(!p)return null;
  const s=rdPosteSt(t,k), etat=s==='run'?'au travail':s==='ok'?'a fini':'à venir', head=`<button class="at-back">‹ L'intention</button><h2 class="at-h">${p.i} ${esc(p.n)} <span class="cnt">${esc(etat)}</span></h2><div class="mut">${esc(p.d)}</div>`;
  if(k==='recherche'){const r=t.recherche||{}, d=r.doublons||[];
    return head+((t.composants||[]).length?`<div class="fk-fold"><h4>Les projets touchés</h4><div class="fk-chips">${t.composants.map(c=>`<i>${esc(c)}</i>`).join('')}</div></div>`:'')+
      `<div class="fk-fold"><h4>Les tickets Jira voisins</h4>${d.length?d.map(x=>`<div class="fk-row"><span>${jiraA(x.key)}</span><span>${esc(x.summary)}</span><span class="k">${esc(x.status||'')}</span></div>`).join(''):'<div class="mut">Aucun ticket voisin trouvé.</div>'}</div>`+
      (r.resume?`<div class="fk-fold"><h4>Son rapport (début)</h4><div class="at-box">${esc(r.resume)}</div></div>`:'');}
  if(k==='redaction'){const r=t.redaction||{};
    return head+`<div class="fk-fold"><h4>${r.version?'Version '+r.version:'Pas encore de version'}</h4><div class="mut">${plural((t.tickets||[]).length,'ticket écrit','tickets écrits')}${r.hors_liste?' · '+plural(r.hors_liste,'idée mise','idées mises')+' de côté pour une autre intention':''}</div></div>`+
      ((r.reponses||[]).length?`<div class="fk-fold"><h4>Ses réponses à la critique</h4>${r.reponses.map(x=>`<div class="fk-row"><span>↺</span><span>${esc(x)}</span><span></span></div>`).join('')}</div>`:'');}
  const c=t.critique||{}, n=c.notes||[];
  return head+`<div class="fk-fold"><h4>Tour ${t.tour||1}/3${c.verdict?' · '+(c.verdict==='ok'?'✅ rien de bloquant':'🔧 à retoucher'):''}</h4>`+
    (n.length?n.map(x=>`<div class="fk-row"><span>${RD_GRAV[x.gravite]||'🔧'}</span><span>${x.ticket?'<b>T'+esc(String(x.ticket))+'</b> ':''}${esc(x.note)}</span><span class="k">${esc(x.gravite||'')}</span></div>`).join(''):'<div class="mut">Pas encore de remarque.</div>')+'</div>';
}
function rdJiraHtml(){
  const l=((REDACTION&&REDACTION.crees_l)||[]).slice().reverse();
  return `<button class="at-back">‹ La rédaction</button><h2 class="at-h">🎫 La boîte Jira <span class="cnt">${l.length}</span></h2><div class="mut">Les tickets créés aujourd'hui depuis le 2e.</div>`+
    `<div class="fk-fold">${l.length?l.map(x=>`<div class="fk-row"><span>${jiraA(x.key)}</span><span>${esc(x.title)}</span><button type="button" class="k fk-kb" data-kbtk="${esc(x.key)}" title="Ouvrir dans le Kanban">🔍</button></div>`).join(''):'<div class="mut">Aucun ticket créé aujourd\'hui.</div>'}</div>`;
}
function tvRedactionHtml(){
  return '<h2>Rédaction</h2>'+(rdTables().map(t=>`<div class="tw ag"><span class="wt"><span class="wn">${esc(clip(t.intention,40))}<span class="ws">${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).n||'')}</span></span><span class="ww">${esc((t.tickets||[]).length?plural(t.tickets.length,'ticket','tickets'):'')}</span></span></div>`).join('')||'<div class="mut">Aucune intention en cours.</div>')+
    `<h2>Revue des PR · ${rvActive().length}</h2>`;
}
// ---------- la loupe, le fil du RDC, ⌘K, la galerie ----------
function rdLoupeEvents(){
  const out=[], t=rdTable(), boss=chars.find(c=>c.boss);
  const add=(kind,id,name,label,pts)=>{const cs=pts.map(([x,y],k)=>atPt(x,y,k?'':name,'',kind));cs.forEach(c=>{c._st={st:kind,label};});out.push({id:kind+':'+id,kind,cs});};
  if(t&&(t.tickets||[]).some(x=>x.etat==='gate'))add('rd_gate',t.run,boss?boss.name:'Le boss','✋ Un ticket attend ta décision (le tampon)',[[RD_DESK.x,RD_DESK.y],[RD_JIRA.x,RD_JIRA.y]]);
  // la rédaction : l'intention découpée (ses brins et ses fiches apparaissent), le boss qui porte un ticket à la boîte Jira
  const tks=(t&&t.tickets)||[];
  if(tks.length){const G=rdGeo(t);add('rd_cut',t.run+':'+(t.tour||1)+':'+tks.length,'La rédaction','✂ L\'intention découpée en '+plural(tks.length,'ticket','tickets'),[[G.red.x,G.red.y],[G.tx,G.ty],[G.tx,19.6*RD_T]]);}
  const J=RD_LV&&RD_LV.job;
  if(J&&J.kind==='jira')add('rd_jira',String(J.key).split(':')[0],boss?boss.name:'Le boss','🎫 Tamponné : le ticket part dans Jira',[[RD_DESK.x,RD_DESK.y],[RD_JIRA.x,RD_JIRA.y]]);
  // la revue (68-revue.js) : la fournée du cron, le dossier pris, l'avis posté, l'auteur qui repart, une revue à la demande
  const M=typeof RVF_M!=='undefined'&&RVF_M;
  if(M&&rvfOn()){
    if(M.bern)add('rv_batch',M.batch,'Bernard','📥 La fournée du cron : '+plural(M.bern.fresh.length,'PR','PR')+' à relire',[[RVF.door.x,RVF.door.y],[RVF.stand.x,RVF.stand.y],[RVF.bk.x,RVF.bk.y]]);
    if(M.reading&&M.rel&&M.rel.w&&!M.stamp)add('rv_pick',M.reading,'Le relecteur','🗂 Il prend '+M.reading+' en haut du casier',[[RVF.pick.x,RVF.pick.y],[RVF.desk.x,RVF.desk.y]]);
    if(M.stamp)add('rv_stamp',String(M.stamp.t0),'Le relecteur',(RVF_V[M.stamp.v]||RVF_V.comment)[0]+' L\'avis est posté sur la PR',[[RVF.desk.x,RVF.desk.y],[RVF.bk.x,RVF.bk.y]]);
    for(const a in M.who){const h=M.who[a];if(!h.leaving)continue;const c=typeof ghChar==='function'?ghChar(a):null;
      add('rv_leave',a,c?c.name:a,'🚶 Sa dernière PR relue, il redescend',[[h.pos.x,h.pos.y],[RVF.hall.x,RVF.hall.y]]);}
  }
  const kids=M&&rvfOn()?rvfKids():new Set(), off=M&&rvfOn()?1:0;
  rvActive().filter(r=>!kids.has(r.run)).slice(0,6-off).forEach((r,j)=>{const k=j+off, cx=(28.5+(k%3)*6.3)*RD_T, feet=(k<3?9.2:18.4)*RD_T, v=r.vars||{};
    add('rv_ask',r.run,'Le relecteur','🔍 Une revue à la demande'+(v['current_task.repo']?' : '+v['current_task.repo']+'#'+v['current_task.number']:''),[[cx,feet],[cx,feet+2.3*RD_T]]);});
  return out;
}
function rdGoto(run){if(!redactionOn())return;if(FLOOR!==2)setFloor(2);RDSEL=run;SIDE_FOLDED=false;renderSide(true);}
function rdFeedEvents(t){
  if(!redactionOn())return [];
  return ((REDACTION&&REDACTION.events)||[]).map(e=>{const a=ms(e.t);if(!a||a<DAY0||a>t)return null;
    const txt={arrive:'✍ Une intention arrive à la rédaction (2e)',gate:'✋ Un ticket attend ta décision au 2e (le tampon)',cree:'🎫 Un ticket créé dans Jira depuis le 2e'}[e.k];
    return txt?{t:a,rd:e.run,fl:2,ty:e.k==='gate'?'toi':'tickets',team:false,txt}:null;}).filter(Boolean);
}
function rdSearchRows(q){
  if(!redactionOn())return [];
  return rdTables().filter(t=>srHit(q,t.intention+' '+(t.tickets||[]).map(x=>x.summary+' '+x.composant).join(' '))).map(t=>({g:'2e étage',k:'✍',txt:clip(t.intention,80),go:()=>rdGoto(t.run)}));
}
function rdDemo(mut,prep){return ()=>{const d=JSON.parse(JSON.stringify((REDACTION&&rdTables().length)?REDACTION:redactionDemo()));if(prep)prep(d);
  REDACTION=JSON.parse(JSON.stringify(d));rdReset();if(FLOOR===2)renderRedaction(performance.now());loupeNoteSeen(); // l'étage d'avant, posé : la scène est ce qui change ensuite
  mut(d);REDACTION=d;};}
function rdGalleryScenes(){
  const fam='2e étage · rédaction', ok=ticketOn(), why=RD_ABSENT;
  return [{fam,ico:'✂',n:'Une intention découpée',d:'La rédaction découpe l\'intention en trois tickets : le fil rouge se divise en trois brins',w:'Une intention qui touche plusieurs projets',ok,why,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='critique';t.tickets=t._tk||t.tickets;delete t._tk;t.tickets.forEach(x=>{x.etat='wait';});}},d=>{const t=d.tables[0];if(t){t._tk=t.tickets;t.tickets=[];t.poste='redaction';t.tour=1;}})}},
    {fam,ico:'✋',n:'Le tampon',d:'Les tickets sont relus : le boss les tamponne, tes changements renvoient à la rédaction',w:'Avant leur création',ok,why,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='valider';t.tickets.forEach(x=>{x.etat='gate';});}})}},
    {fam,ico:'🎫',n:'Les tickets partent dans Jira',d:'Tamponnés, ils sont créés un par un : les brins du fil rouge vont jusqu\'à la boîte Jira',w:'Tu approuves chaque ticket',ok,why,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='valider';t.tickets.forEach(x=>{x.etat='ok';});}})}},
    {fam,ico:'🌙',n:'Le soir au 2e',d:'Le soir et le week-end, comme au RDC : la salle de rédaction et les bureaux de revue occupés s\'allument comme des pièces, les bureaux libres restent dans l\'ombre, le boss lit sous sa lampe',w:'Hors des heures de bureau',ok:true,
      play:{len:20e3,speed:60,setup:s=>{rdDemo(()=>{})();const n=parisMidnight(s)+22.5*36e5;T=n;SCENE_DEMO.e=n+20e3*60;}}},...rvGalleryScenes()];
}
// ---------- les scènes de la revue (68-revue.js) : rejouées sur la journée de démo, à l'heure où elle les joue ----------
// h : l'heure du moment dans redactionDemo / rvDemo ; la scène commence 1,5 s avant, en ×1
function rvScene(h,len){return {len,speed:1,setup:()=>{REDACTION=redactionDemo();rdReset();SCENE_DEMO.revue=true;T=DAY0+h*36e5-1500;SCENE_DEMO.s=T;SCENE_DEMO.e=T+len;loupeNoteSeen();}};}
function rvGalleryScenes(){
  const fam='2e étage · revue des PR', file=rvfOn(), ask=!!(CFG.revue_wf||[]).length||DEMO, why='La revue des PR n\'est pas installée';
  return [{fam,ico:'📥',n:'La fournée du cron',d:'Bernard monte les PR sur son transpalette, vide la corbeille et range un dossier par PR dans le casier ; les auteurs s\'assoient en salle d\'attente',w:'Chaque passage du cron des revues',ok:file,why,play:rvScene(9.5,45e3)},
    {fam,ico:'🗂',n:'Le relecteur prend un dossier',d:'Il va chercher le dossier du haut du casier, les autres remontent d\'une case ; l\'auteur quitte sa chaise et s\'assoit en face',w:'Une revue commence',ok:file,why,play:rvScene(9.52,15e3)},
    {fam,ico:'🔖',n:'L\'avis est posté',d:'Le relecteur tamponne le verdict (✅ 💬 🔧) et pose le dossier dans la corbeille « Postées »',w:'L\'avis est posté sur la PR',ok:file,why,play:rvScene(9.7,15e3)},
    {fam,ico:'🚶',n:'L\'auteur repart',d:'Sa dernière PR relue, il redescend avec ses verdicts au-dessus de la tête ; s\'il en a une autre juste après, il reste au bureau',w:'Fin des PR d\'un auteur',ok:file,why,play:rvScene(9.98,20e3)},
    {fam,ico:'🔍',n:'Une revue à la demande',d:'Hors de la file : un autre bureau de revue s\'allume, le relecteur à son bureau, l\'auteur en face ; pour ta propre PR, un agent remplaçant',w:'« 🔍 Review » sur une PR',ok:ask,why,play:rvScene(10+10/60,10e3)}];
}
