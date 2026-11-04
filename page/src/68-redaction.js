// ---------- 2e étage : la rédaction des tickets et la revue des PR ----------
// À gauche, la salle de rédaction (modèle « créer un ticket », models.ticket) : une bibliothèque par composant (celles que
// l'intention touche s'allument), la table où le reporter de la rédaction et celui de la critique se font face, et le fil
// rouge de l'intention : du liège à la recherche, à la rédaction, puis un brin par ticket (l'intention découpée) jusqu'au
// bureau du boss, son tampon posé dessus (chaque ticket passe un par un), puis la boîte Jira. Les agents de la rédaction
// sont des reporters (chapeau mou, carte de presse). À droite, la revue des PR (sous-workflow review_child) : à chaque
// bureau, le relecteur (visière verte de correcteur) derrière son écran et, en face, l'auteur de la PR (un agent
// remplaçant pour ta PR ou celle de quelqu'un hors de l'équipe) ; sous le bureau, les postes de son run, lus du run
// (🗺 contexte, 📚 docs, 🔍 lecture, 🔒 sécu : un sous-workflow review_<poste> chacun ; puis 🧐 avis et ✍ postée).
// Au mur, le tableau noir des revues du jour. Le soir et le week-end, la veilleuse : seuls ceux au travail et le boss.
// Données : dataset redaction (workflows/redaction_snapshot.py, cron live) et les runs de la revue (DATA.runs) ; démo : redactionDemo().
const RD_POSTES=[{k:'recherche',i:'📚',n:'Recherche',d:'cherche ce que l\'intention touche, projet par projet'},{k:'redaction',i:'✍',n:'Rédaction',d:'écrit les tickets, un par projet touché'},
  {k:'critique',i:'🧐',n:'Critique',d:'relit les tickets et renvoie à la rédaction (trois tours au plus)'},{k:'valider',i:'✋',n:'Toi',d:'tu tamponnes chaque ticket, ou tu demandes des changements'}];
const RD_TK={wait:['#f7e07a','attend la critique'],run:['#9fd4ff','en cours'],gate:['#ffcf4a','t\'attend'],ok:['#b6e3a8','créé'],ecarte:['#d8d2c4','écarté'],err:['#f4a3a3','en panne']};
// « Comment lire le plan » au 2e (46-legende.js) : les postes de la rédaction, puis les étapes d'une revue (RV_STEP)
const RD_HELP={bar:()=>'<span>Tickets :</span>'+legSwatches(RD_TK)+'<span>Verdicts : '+Object.entries({approve:'approuvée',comment:'commentée',request_changes:'changements',err:'en échec'}).map(([k,t])=>RVF_V[k][0]+' '+t).join(' · ')+'</span>',
  postes:()=>[['Rédaction',RD_POSTES],['Revue d\'une PR',Object.values(RV_STEP).map(([l,,d])=>({i:l.split(' ')[0],n:l.slice(l.indexOf(' ')+1),d}))]],
  qui:'<p><b>Rédaction</b> : les agents en reporters, chapeau mou et carte de presse.</p><p><b>Revue</b> : les relecteurs à visière verte ; l\'auteur de la PR assis en face, de dos ; un agent remplaçant pour ta propre PR.</p>'+
    '<p><b>Bernard</b> monte la fournée du cron des revues. <b>Le boss</b> tamponne les tickets.</p>',
  ou:'<p><b>Bibliothèques</b> : une par composant Jira. <b>La table</b> : une intention et ses tickets ; <b>le fil rouge</b> relie les postes qui y ont travaillé. <b>Le liège</b> : les autres intentions.</p>'+
    '<p><b>Casier « À relire »</b> : la file du cron, dans l\'ordre. <b>Corbeille « Postées »</b> : les avis du passage. <b>Six bureaux</b> de revue, le premier pour la file. <b>Salle d\'attente</b> : une chaise par auteur.</p>',
  moments:'<p><b>✋ Le tampon</b> : les tickets relus attendent ta validation, un par un.</p><p><b>✂ Le découpage</b> : une intention qui touche plusieurs projets devient plusieurs tickets, un brin de fil chacun.</p>'+
    '<p><b>📥 La fournée</b> : à chaque passage du cron des revues, Bernard range un dossier par PR dans le casier.</p>'};
const RD_X1=19.5, RD_VX=23, RD_SH0=['dm/site','dm/mobile','dm/api','dm/outils'];
const RD_WINDOWS=[7.5,10.5,13.5,16.5,25,28.5,32,35.5,39,42.5]; // en cases : à droite du nom de l'étage, comme au RDC
const RD_DESK={x:15.6*AT_TS,y:23.4*AT_TS}, RD_JIRA={x:17.8*AT_TS,y:25.6*AT_TS}, RD_CORK={x:1.6*AT_TS,y:9.4*AT_TS};
let REDACTION=null, RDSEL=null, RD_HITS=[], RD_LIT=[], RD_MEM={last:0};
let RDTK=null; // le ticket ouvert dans le panneau : {run, k} (clic sur sa carte à la table ou sur sa ligne du panneau)
function readRedaction(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.redaction;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.tables)?d:null;
  }catch(e){return null;}
}
const redactionOn=()=>!!((CFG.ticket&&CFG.ticket.wf)||DEMO);
// démo : une intention découpée en trois tickets (le premier relu, le deuxième en critique), une autre en recherche
function redactionDemo(){
  const at=h=>new Date(DAY0+h*36e5).toISOString();
  // la file de la revue : le cron de 9 h 30 a retenu 5 PR ; les deux de Holly sont postées, celle de Pam est lue (demo-r1)
  const revue={batches:{'demo-c1':[['dm/site',2042,'hollyflax'],['dm/site',2060,'hollyflax'],['dm/api',2051,'pambeesly'],['dm/mobile',311,'darrylphilbin'],['dm/api',2063,'pambeesly']]},
    verdicts:{'demo-k1':'comment','demo-k2':'approve'},starts:{'demo-c1':at(9.5)}};
  return {generated_at:at(11),crees:2,revue,tables:[
    {run:'demo-t1',status:'Running',since:at(10.2),intention:'Refondre le lecteur vidéo : sous-titres, pistes audio et reprise de lecture',poste:'critique',tour:2,
     composants:['dm/site','dm/mobile','dm/api'],type:'Story',tickets:[{i:0,summary:'Lecteur : les sous-titres',composant:'dm/api',points:3,etat:'wait',
       detail:'▸ De quoi on parle ?\n\n│ Les vidéos n\'ont pas de sous-titres : le lecteur ne lit pas les pistes WebVTT.\n\n▸ Qu\'est-ce que l\'on va faire ?\n\n• Servir les pistes WebVTT de chaque vidéo\n• Les déclarer dans le manifeste du lecteur\n\n▸ Comment on teste ?\n\n• Une vidéo avec deux pistes : les deux s\'affichent dans le menu'},
       {i:1,summary:'Pistes audio dans le menu du lecteur',composant:'dm/site',points:2,etat:'wait'},{i:2,summary:'Reprise de lecture',composant:'dm/mobile',points:3,etat:'wait'}]},
    {run:'demo-t2',status:'Running',since:at(10.8),intention:'Export CSV des abonnés',poste:'recherche',tour:1,composants:['dm/outils'],tickets:[]}],
    events:[{t:at(10.2),k:'arrive',run:'demo-t1'},{t:at(10.8),k:'arrive',run:'demo-t2'},{t:at(8.5),k:'arrive',run:'demo-t0'},{t:at(9.1),k:'gate',run:'demo-t0'},{t:at(9.2),k:'cree',run:'demo-t0'},{t:at(9.3),k:'cree',run:'demo-t0'},{t:at(9.4),k:'fin',run:'demo-t0'}]};
}
const rdTables=()=>((REDACTION&&REDACTION.tables)||[]).slice(0,3);
const rdTable=()=>{const l=rdTables();return l.find(t=>t.run===RDSEL)||l[0]||null;};
// ---------- la revue : les runs de relecture d'une PR (review_child), lus du run ----------
const rvWf=w=>!!w&&(CFG.revue_wf||[]).includes(String(w).slice(0,8));
// les postes de la revue (sous-workflows review_<poste>, CFG.revue_postes_wf) : leurs runs ne passent pas au RDC, ils se
// lisent comme des étapes du run de la revue
const rvPosteWf=w=>!!w&&(CFG.revue_postes_wf||[]).includes(String(w).slice(0,8));
// les postes de la rédaction et le sous-workflow par ticket (CFG.ticket.postes_wf) : lus au 2e (redaction_snapshot.py),
// jamais au RDC
const rdPosteWf=w=>!!w&&((CFG.ticket&&CFG.ticket.postes_wf)||[]).includes(String(w).slice(0,8));
function rvRuns(){
  const l=((DATA&&DATA.runs)||[]).filter(r=>rvWf(r.wf)&&r._s<=T);
  if(!l.length&&DEMO||SCENE_DEMO&&SCENE_DEMO.revue)return rvDemo(); // une scène de la revue (galerie) se joue sur la journée de démo
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
  g.font='bold 13px ui-monospace,Menlo,monospace';g.fillStyle='#5a4636';g.fillText('2E · RÉDACTION ET REVUE',12,T+20);
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
// un agent : s = run (au travail, halo), ok (✓), wait (gris), idle ; o.hat, o.dir, o.desk (bureau devant lui), o.bubble
function rdAgent(people,k,x,y,s,o,now){
  o=o||{};const a=atWorker(k,x,y,o.dir||'down',false,'');if(!a)return;a._st={st:s==='run'?'work':'idle'};a.pose=o.pose||'type';
  const after=()=>{if(o.hat)rdHat(ctx,o.hat,x,y,o.dir||'down');if(o.desk)atDesk(x,y-6,s==='run');if(o.front)o.front();if(s==='ok')atBadge(x+16,y-50,'✓','#2f9e55');if(o.bubble)atBubble(x,y-66,o.bubble);};
  if(s==='wait'){people.push([{pos:{x,y}},null,false,()=>{const g=atLayer();atDrawInto(g,a,now);if(o.hat)rdHat(g,o.hat,x,y,o.dir||'down');ctx.save();ctx.globalAlpha=.38;ctx.filter='grayscale(1)';ctx.drawImage(AT_OFF,0,0);ctx.restore();if(o.desk)atDesk(x,y-6,false);}]);return;}
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
// ---------- la salle de rédaction ----------
function rdRoom(now,people){
  const T=RD_T, t=rdTable(), shelves=rdShelves(t), sw=3.1*T, sh0=(RD_X1*T-(4*sw+84))/2;
  const lit=new Set((t&&t.composants)||[]);
  shelves.forEach((n,k)=>rdShelf(sh0+k*sw,2.3*T,n,lit.has(n)||n==='autres'&&[...lit].some(c=>!shelves.includes(c))));
  const S=RD_CORK;R(ctx,S.x-24,S.y-52,48,46,'#7a5a3c');R(ctx,S.x-20,S.y-48,40,38,'#c9a26a');if(t){R(ctx,S.x-14,S.y-42,26,22,'#f7e07a');for(let l=0;l<3;l++)R(ctx,S.x-10,S.y-36+l*5,18,2,'rgba(0,0,0,.3)');}
  atHitRd('cork',S.x-24,S.y-52,48,46,{});
  const others=rdTables().filter(x=>x!==t);
  rdLate(people,()=>{atPill(t?'📌 '+clip(t.intention,34):'📌 aucune intention en cours',S.x+(t?96:70),S.y+10,'#1c1f26','#fff','bold 11px system-ui,sans-serif');
    if(others.length)atPill('+ '+plural(others.length,'autre intention','autres intentions')+' : clic sur le liège',S.x+70,S.y+28,'#5d6370','#fff','bold 11px system-ui,sans-serif');},1e6);
  const shi=t?Math.max(0,shelves.findIndex(n=>lit.has(n))):1, rech={x:sh0+shi*sw+42,y:7.3*T}, tx=8.8*T, ty=12.4*T, red={x:tx,y:ty-1.2*T}, cri={x:tx,y:ty+2.4*T};
  const p=t?t.poste:null, st=k=>!t?'idle':k===p?'run':RD_POSTES.findIndex(x=>x.k===k)<RD_POSTES.findIndex(x=>x.k===p)?'ok':'wait';
  const tks=(t&&t.tickets)||[];
  rdLate(people,()=>{R(ctx,tx-4.4*T,ty-.9*T,8.8*T,1.8*T,'#7a5a3c');R(ctx,tx-4.4*T,ty-.9*T,8.8*T,6,'#94704c');R(ctx,tx-4.2*T,ty+.9*T,6,10,'#4a3424');R(ctx,tx+4.2*T-6,ty+.9*T,6,10,'#4a3424');
    tks.slice(0,4).forEach((x,k)=>{const sx=tx+(-2.6+k*1.3)*T;R(ctx,sx-12,ty-15,24,30,'#fbfbf6');R(ctx,sx-12,ty-15,24,4,RD_TK[x.etat]?RD_TK[x.etat][0]:'#2f6fd6');for(let l=0;l<4;l++)R(ctx,sx-8,ty-6+l*5,16,2,'#b8b2a4');atPill('T'+(k+1),sx+12,ty-14,'#0b2a4a','#fff','bold 10px ui-monospace,Menlo,monospace');});
    if(t&&t.tour>1)atPill('↺ critique → rédaction · tour '+t.tour+'/3',tx+5.4*T,ty+2.6*T,'#0b2a4a','#fff','bold 11px system-ui,sans-serif');},ty-.6*T);
  atHitRd('table',tx-4.4*T,ty-2.2*T,8.8*T,5*T,{});
  // le fil rouge : le liège, la recherche, la rédaction, puis un brin par ticket ; tous finissent au tampon, puis à Jira
  const desk=RD_DESK, jira=RD_JIRA, p0={x:S.x+20,y:S.y-14}, p1={x:rech.x,y:rech.y-20}, p2={x:red.x,y:red.y-20};
  const cards=tks.slice(0,4).map((x,k,l)=>({x:(2.2+k*(14.6/Math.max(1,l.length)))*T+(14.6/Math.max(1,l.length))*T/2-.6*T,y:19.6*T}));
  if(t){rdStrand(p0,p1,p!=='recherche'||true);rdStrand(p1,p2,p!=='recherche');
    cards.forEach((c,k)=>{rdStrand(p2,{x:c.x,y:c.y-24},tks[k].etat!=='wait'||p==='valider');rdStrand({x:c.x,y:c.y+14},{x:desk.x,y:desk.y-30},tks[k].etat==='ok');});
    rdStrand({x:desk.x,y:desk.y-30},{x:jira.x,y:jira.y-34},tks.some(x=>x.etat==='ok'));
    rdLate(people,()=>{rdPin(p0,'#d0392b');rdPin(p1,'#d0392b');if(p!=='recherche')rdPin(p2,'#d0392b');
      cards.forEach((c,k)=>{const x=tks[k], col=(RD_TK[x.etat]||RD_TK.wait);R(ctx,c.x-56,c.y-24,112,38,x.etat==='wait'&&p==='critique'&&k===0?'#9fd4ff':col[0]);rdPin({x:c.x,y:c.y-24},'#d0392b');
        atTxt('T'+(k+1)+' · '+(x.composant||'?'),c.x,c.y-8,'#1c1f26','bold 11px ui-monospace,Menlo,monospace');atTxt(clip(x.summary||'',20),c.x,c.y+5,'#3a3530','11px system-ui');
        atHitRd('ticket',c.x-56,c.y-24,112,38,{k});});},1e6-1);}
  rdAgent(people,60,rech.x,rech.y,st('recherche'),{dir:'up',hat:'presse',bubble:p==='recherche'?'je fouille '+(t.composants||[]).length+' dépôt(s)…':null},now);
  rdLate(people,()=>atPill('📚 Recherche',rech.x,rech.y+16,st('recherche')==='run'?'#2f6fd6':st('recherche')==='ok'?'#2f7a45':'#f4efe4',st('recherche')==='wait'||!t?'#3a3530':'#fff','bold 11px system-ui,sans-serif'),1e6);
  rdAgent(people,61,red.x,red.y,st('redaction'),{hat:'presse',bubble:p==='redaction'?(tks.length?'version '+(t.tour||1)+', je reprends…':'je rédige…'):null},now);
  rdLate(people,()=>atPill('✍ Rédaction',red.x+80,red.y-22,st('redaction')==='run'?'#2f6fd6':st('redaction')==='ok'?'#2f7a45':'#f4efe4',st('redaction')==='wait'||!t?'#3a3530':'#fff','bold 11px system-ui,sans-serif'),1e6);
  rdAgent(people,62,cri.x,cri.y,st('critique'),{dir:'up',hat:'presse',bubble:p==='critique'?'je relis T1…':null},now);
  rdLate(people,()=>atPill('🧐 Critique',cri.x,cri.y+16,st('critique')==='run'?'#2f6fd6':st('critique')==='ok'?'#2f7a45':'#f4efe4',st('critique')==='wait'||!t?'#3a3530':'#fff','bold 11px system-ui,sans-serif'),1e6);
  // le bureau du boss, le tampon posé dessus : il y est, et tamponne les tickets un par un
  rdBoss(people,tks,now);
  rdLate(people,()=>{R(ctx,jira.x-18,jira.y-30,36,30,'#2f6fd6');R(ctx,jira.x-18,jira.y-34,36,6,'#2559b8');R(ctx,jira.x-10,jira.y-20,20,3,'#0b2a4a');atPill('🎫 Jira',jira.x-44,jira.y-14,'#f4efe4','#3a3530','bold 11px system-ui,sans-serif');},jira.y);
  rdBench(people,3.4*T,24.6*T,[63,64],'presse');
}
function rdBoss(people,tks,now){
  const {x,y}=RD_DESK, boss=chars.find(c=>c.boss), g=tks.filter(t=>t.etat==='gate').length;
  atBossChair(x,y);
  // le bureau du RDC ; au milieu, l'encreur et le tampon (la tasse poussée au bout)
  const desk=()=>{atBossDesk(x,y,now,boss,(x0,top)=>{R(ctx,x0+40,top+5,22,8,'#2a2a30');R(ctx,x0+42,top+6,18,5,'#7a1f24');
      R(ctx,x0+66,top-2,12,9,'#c8323a');R(ctx,x0+66,top-2,12,2,'#e0525a');R(ctx,x0+70,top-9,4,7,'#1c1c1c');R(ctx,x0+68,top-12,8,4,'#2c2c2c');},84);
    if(g)atBubble(x,y-62,'✋ '+plural(g,'ticket','tickets')+' : je tamponne ?','#8a5a00');};
  if(boss){people.push([withFloorSprite(atSeatedBoss(boss,x,y,g?'gate':'idle'),boss,'redaction_sprite'),null,false,desk]);RD_LIT.push({x,y});atHitRd('boss',x-16,y-60,32,60,{});}
  else rdLate(people,desk,y);
  rdLate(people,()=>atPill('✋ le tampon : tu valides les tickets, puis ils partent un par un',x-40,y+30,g?'#8a5a00':'#f4efe4',g?'#fff':'#3a3530','bold 11px system-ui,sans-serif'),y);
}
// un banc comme au 1er : ceux qui ne travaillent pas s'y assoient (descendus dans l'assise, qui leur cache les jambes)
function rdBench(people,x,y,ks,hat){atSofa(x,y);ks.forEach((k,j)=>{const a=atWorker(k,x+(j?22:-22),y+9,'down',false,'');if(!a)return;a._st={st:'idle'};a.pose='stand';
  people.push([a,null,false,()=>{rdHat(ctx,hat,x+(j?22:-22),y+9,'down');if(j===ks.length-1)atSofaFront(x,y);}]);});}
// ---------- la salle de revue ----------
function rdRevue(now,people){
  const file=rvfOn(), kids=file?rvfKids():new Set(), F=file?rvfDraw(now,people):null, wait=F&&F.st?F.st.queue.length:0;
  const T=RD_T, l=rvActive().filter(r=>!kids.has(r.run)), done=rvRuns().filter(r=>r.status==='Success'&&r._s>=DAY0).length;
  atTxt('👀 REVUE DES PR',(RD_VX+.6)*T,2.7*T,'#5a4636','bold 12px ui-monospace,Menlo,monospace','left');
  const bx=30*T, by=2.1*T, bw=11*T, bh=3.4*T;R(ctx,bx-6,by-6,bw+12,bh+12,'#8a6040');R(ctx,bx,by,bw,bh,'#24352c');R(ctx,bx+4,by+bh-6,bw-8,4,'#a37650');
  atTxt('REVUES DU JOUR',bx+bw/2,by+18,'#f4efe4','bold 13px ui-monospace,Menlo,monospace');R(ctx,bx+16,by+24,bw-32,1,'rgba(244,239,228,.4)');
  [['#5b8def',plural(rvActive().length,'PR en lecture','PR en lecture')],...(file?[['#e0a020',plural(wait,'PR en attente','PR en attente')+(F.st?' (cron '+hm(F.st.b.s)+')':'')]]:[]),['#3fbf6a',plural(done,'revue postée','revues postées')+' aujourd\'hui'],['#e0a020','~'+Math.round(rvRuns().filter(r=>r._s>=DAY0).reduce((a,r)=>a+(r.tok||0),0)/1e3)+' k tokens']]
    .forEach(([c,t],k)=>{R(ctx,bx+16,by+36+k*18,8,8,c);atTxt(t,bx+30,by+44+k*18,'#e8e2d0','12px ui-monospace,Menlo,monospace','left');});
  const boss=chars.find(c=>c.boss);
  if(file)rvfDesk(people,now,F);
  for(let k=file?1:0;k<6;k++){const r=l[k-(file?1:0)], cx=(28.5+(k%3)*6.3)*T, feet=(k<3?9.2:18.4)*T, rf=feet+2.3*T;
    if(!r){atDesk(cx,feet-6,false);ctx.fillStyle='rgba(30,26,22,.22)';ctx.fillRect(cx-90,feet-90,180,150);rdLate(people,()=>atPill('bureau libre',cx,feet+40,'#f4efe4','#6a6050','bold 11px system-ui,sans-serif'),feet);continue;}
    const v=r.vars||{}, who=v['current_task.author'], au=who&&typeof ghChar==='function'?ghChar(who):null, mine=au&&boss&&au.key===boss.key;
    rdAgent(people,100+k,cx,feet,'run',{hat:'visiere',desk:true,bubble:rvBubble(r)},now);
    if(au&&!mine){const c=Object.assign(Object.create(Object.getPrototypeOf(au)),au,{pos:{x:cx,y:rf},tile:null,dir:'up',moving:false,pose:'stand',present:true,_st:{st:'idle'}});people.push([c,null,false,null]);}
    else rdAgent(people,110+k,cx,rf,'idle',{dir:'up'},now);
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
function rdReset(){RD_MEM={last:0};RDSEL=null;RDTK=null;if(typeof rvfReset==='function')rvfReset();}
function renderRedaction(now){
  RD_MEM.last=now;if(!RD_BG)RD_BG=rdBackground();ctx.drawImage(RD_BG,0,0);atWindows(now,RD_WINDOWS);RD_HITS=[];RD_LIT=[];
  const people=[];rdRoom(now,people);rdRevue(now,people);
  people.sort((a,b)=>a[0].pos.y-b[0].pos.y).forEach(([c,d,before,after])=>{if(d)d();if(c.sprite)drawChar(c,now);if(after)after();});
  stairDoor(RD_STAIR,people.map(q=>q[0].pos));
  rdNight(people,now);
  const b=chars.find(c=>c.boss);if(b&&sel===b.key)selHalo(RD_DESK.x,RD_DESK.y-26,AT_W,AT_H);
  atReplayPill();
}
function atHitRd(kind,x,y,w,h,ref){RD_HITS.push({kind,x,y,w,h,...ref});}
function rdHitAt(e){const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width, my=(e.clientY-r.top)*AT_H/r.height;
  for(let k=RD_HITS.length-1;k>=0;k--){const h=RD_HITS[k];if(mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h)return h;}return null;}
function redactionClick(e){
  const h=rdHitAt(e);sel=null;SEL_BACK=[];
  if(h&&h.kind==='boss'){const b=chars.find(c=>c.boss);if(b){select(b.key);return;}}
  if(h&&h.kind==='cork'){const l=rdTables();if(l.length>1){const i=l.indexOf(rdTable());RDSEL=l[(i+1)%l.length].run;}RDTK=null;}
  if(h&&h.kind==='ticket'){const t=rdTable();if(t)RDTK={run:t.run,k:h.k};}
  renderSide(true);
}
function redactionHover(e){
  const h=rdHitAt(e), t=rdTable();let s='';
  if(h&&h.kind==='ticket'&&t){const x=t.tickets[h.k];s='T'+(h.k+1)+' · '+(x.composant||'?')+' · '+(x.points||'?')+' pts · '+(RD_TK[x.etat]||RD_TK.wait)[1]+' · '+x.summary+' · clic : son détail';}
  else if(h&&h.kind==='table')s=t?'La table de rédaction : '+t.intention:'La table de rédaction : aucune intention en cours';
  else if(h&&h.kind==='cork')s=rdTables().length>1?'Les intentions en cours : clic pour passer à la suivante':'L\'intention en cours';
  else if(h&&h.kind==='boss')s=(chars.find(c=>c.boss)||{}).name+' : tamponne chaque ticket avant sa création ; clic : sa fiche';
  else if(h&&(h.kind==='casier'||h.kind==='author'))s=rvfHover(h);
  else if(h&&h.kind==='review'){const r=rvRuns().find(x=>x.run===h.run), v=(r&&r.vars)||{};s='Revue de '+(v['current_task.repo']||'?')+'#'+(v['current_task.number']||'?')+' : les étapes de son run, sous le bureau';}
  cv.style.cursor=h?'pointer':'default';
  if(s){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';tip.textContent=s;}else tip.style.display='none';
}
// ---------- panneau ----------
function redactionListHtml(){
  const l=rdTables(), rv=rvActive();
  return `<h2 class="at-h">✍ Rédaction <span class="cnt">${l.length}</span></h2>`+(l.length?l.map(t=>`<button class="at-room" data-run="${esc(t.run)}"><span class="at-top"><span class="at-title">${esc(clip(t.intention,80))}</span>${(t.tickets||[]).some(x=>x.etat==='gate')?'<span class="at-tag wait">✋ t\'attend</span>':`<span class="at-tag run">${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).i||'')} ${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).n||'')}</span>`}</span>
    ${(t.tickets||[]).length?'':'<span class="mut">les tickets arrivent avec la rédaction</span>'}</button>${(t.tickets||[]).map((x,k)=>`<button class="rd-tk" data-run="${esc(t.run)}" data-k="${k}" title="Son détail"><b>T${k+1}</b> ${esc(x.summary)} <span class="mut">· ${esc(x.composant||'?')} · ${esc(String(x.points||'?'))} pts · ${esc((RD_TK[x.etat]||RD_TK.wait)[1])}</span></button>`).join('')}`).join(''):'<div class="note">Aucune intention en cours. « ▶ Lancer » sur la fiche de l\'agent des tickets en démarre une.</div>')+
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
    (x.detail?`<div class="rd-det">${esc(x.detail)}</div>`:'<div class="note">Le détail arrive au prochain relevé de la rédaction (une minute au plus).</div>')+
    '<div class="at-gate"></div>';
}
function drawRedactionSide(side){
  const boss=chars.find(c=>c.boss);
  if(sel!=null&&!(boss&&sel===boss.key)){setFloor(0);return;}
  if(sel!=null){drawSide(side);return;}
  const box=document.createElement('div');box.className='atelier';side.appendChild(box);
  const tk=rdTicketOpen();
  if(tk){box.innerHTML=rdTicketHtml(tk.t,tk.k);box.querySelector('.rd-back').addEventListener('click',()=>{RDTK=null;renderSide(true);});}
  else{box.innerHTML=redactionListHtml();
    box.querySelectorAll('.at-room').forEach(b=>b.addEventListener('click',()=>{RDSEL=b.dataset.run;renderSide(true);}));
    box.querySelectorAll('.rd-tk').forEach(b=>b.addEventListener('click',()=>{RDSEL=b.dataset.run;RDTK={run:b.dataset.run,k:+b.dataset.k};renderSide(true);}));}
  for(const g of GATES)if(/un ticket/.test(String(g.wf_name||'')))gateCard(box.querySelector('.at-gate')||box,{run:g.run,wf_name:g.wf_name,_s:ms(g.since)},null); // le tampon : chaque ticket qui t'attend
}
function tvRedactionHtml(){
  return '<h2>Rédaction</h2>'+(rdTables().map(t=>`<div class="tw ag"><span class="wt"><span class="wn">${esc(clip(t.intention,40))}<span class="ws">${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).n||'')}</span></span><span class="ww">${esc((t.tickets||[]).length?plural(t.tickets.length,'ticket','tickets'):'')}</span></span></div>`).join('')||'<div class="mut">Aucune intention en cours.</div>')+
    `<h2>Revue des PR · ${rvActive().length}</h2>`;
}
// ---------- la loupe, le fil du RDC, ⌘K, la galerie ----------
function rdLoupeEvents(){
  const out=[], t=rdTable(), boss=chars.find(c=>c.boss);
  if(t&&(t.tickets||[]).some(x=>x.etat==='gate')){const p=atPt(RD_DESK.x,RD_DESK.y,boss?boss.name:'Le boss','','rd_gate');p._st={st:'rd_gate',label:'✋ Un ticket attend ton tampon'};out.push({id:'rd_gate:'+t.run,kind:'rd_gate',cs:[p,atPt(RD_JIRA.x,RD_JIRA.y,'','','rd_gate')]});}
  return out;
}
function rdGoto(run){if(!redactionOn())return;if(FLOOR!==2)setFloor(2);RDSEL=run;SIDE_FOLDED=false;renderSide(true);}
function rdFeedEvents(t){
  if(!redactionOn())return [];
  return ((REDACTION&&REDACTION.events)||[]).map(e=>{const a=ms(e.t);if(!a||a<DAY0||a>t)return null;
    const txt={arrive:'✍ Une intention arrive à la rédaction (2e)',gate:'✋ Un ticket attend ton tampon au 2e',cree:'🎫 Un ticket créé dans Jira depuis le 2e'}[e.k];
    return txt?{t:a,rd:e.run,fl:2,ty:e.k==='gate'?'toi':'tickets',team:false,txt}:null;}).filter(Boolean);
}
function rdSearchRows(q){
  if(!redactionOn())return [];
  return rdTables().filter(t=>srHit(q,t.intention+' '+(t.tickets||[]).map(x=>x.summary+' '+x.composant).join(' '))).map(t=>({g:'2e étage',k:'✍',txt:clip(t.intention,80),go:()=>rdGoto(t.run)}));
}
function rdDemo(mut){return ()=>{const d=JSON.parse(JSON.stringify((REDACTION&&rdTables().length)?REDACTION:redactionDemo()));mut(d);REDACTION=d;rdReset();};}
function rdGalleryScenes(){
  const fam='2e étage · rédaction', ok=true;
  return [{fam,ico:'✂',n:'Une intention découpée',d:'La rédaction découpe l\'intention en trois tickets : le fil rouge se divise en trois brins',w:'Une intention qui touche plusieurs projets',ok,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='critique';t.tickets.forEach(x=>{x.etat='wait';});}})}},
    {fam,ico:'✋',n:'Le tampon',d:'Les tickets sont relus : le boss les tamponne, tes changements renvoient à la rédaction',w:'Avant leur création',ok,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='valider';t.tickets.forEach(x=>{x.etat='gate';});}})}},
    {fam,ico:'🎫',n:'Les tickets partent dans Jira',d:'Tamponnés, ils sont créés un par un : les brins du fil rouge vont jusqu\'à la boîte Jira',w:'Tu approuves chaque ticket',ok,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='valider';t.tickets.forEach(x=>{x.etat='ok';});}})}},
    {fam,ico:'🌙',n:'Le soir au 2e',d:'Le soir et le week-end, comme au RDC : la salle de rédaction et les bureaux de revue occupés s\'allument comme des pièces, les bureaux libres restent dans l\'ombre, le boss lit sous sa lampe',w:'Hors des heures de bureau',ok,
      play:{len:20e3,speed:60,setup:s=>{rdDemo(()=>{})();const n=parisMidnight(s)+22.5*36e5;T=n;SCENE_DEMO.e=n+20e3*60;}}},...rvGalleryScenes()];
}
// ---------- les scènes de la revue (68-revue.js) : rejouées sur la journée de démo, à l'heure où elle les joue ----------
// h : l'heure du moment dans redactionDemo / rvDemo ; la scène commence 1,5 s avant, en ×1
function rvScene(h,len){return {len,speed:1,setup:()=>{REDACTION=redactionDemo();rdReset();SCENE_DEMO.revue=true;T=DAY0+h*36e5-1500;SCENE_DEMO.s=T;SCENE_DEMO.e=T+len;}};}
function rvGalleryScenes(){
  const fam='2e étage · revue des PR', file=rvfOn(), ask=!!(CFG.revue_wf||[]).length||DEMO, why='La revue des PR n\'est pas installée';
  return [{fam,ico:'📥',n:'La fournée du cron',d:'Bernard monte les PR sur son transpalette, vide la corbeille et range un dossier par PR dans le casier ; les auteurs s\'assoient en salle d\'attente',w:'Chaque passage du cron des revues',ok:file,why,play:rvScene(9.5,45e3)},
    {fam,ico:'🗂',n:'Le relecteur prend un dossier',d:'Il va chercher le dossier du haut du casier, les autres remontent d\'une case ; l\'auteur quitte sa chaise et s\'assoit en face',w:'Une revue commence',ok:file,why,play:rvScene(9.52,15e3)},
    {fam,ico:'🔖',n:'L\'avis est posté',d:'Le relecteur tamponne le verdict (✅ 💬 🔧) et pose le dossier dans la corbeille « Postées »',w:'L\'avis est posté sur la PR',ok:file,why,play:rvScene(9.7,15e3)},
    {fam,ico:'🚶',n:'L\'auteur repart',d:'Sa dernière PR relue, il redescend avec ses verdicts au-dessus de la tête ; s\'il en a une autre juste après, il reste au bureau',w:'Fin des PR d\'un auteur',ok:file,why,play:rvScene(9.98,20e3)},
    {fam,ico:'🔍',n:'Une revue à la demande',d:'Hors de la file : un autre bureau de revue s\'allume, le relecteur à son bureau, l\'auteur en face ; pour ta propre PR, un agent remplaçant',w:'« 🔍 Review » sur une PR',ok:ask,why,play:rvScene(10+10/60,10e3)}];
}
