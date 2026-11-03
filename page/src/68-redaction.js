// ---------- 2e étage : la rédaction des tickets et la revue des PR ----------
// À gauche, la salle de rédaction (modèle « créer un ticket », models.ticket) : une bibliothèque par composant (celles que
// l'intention touche s'allument), la table où le reporter de la rédaction et celui de la critique se font face, et le fil
// rouge de l'intention : du liège à la recherche, à la rédaction, puis un brin par ticket (l'intention découpée) jusqu'au
// bureau du boss, son tampon posé dessus (chaque ticket passe un par un), puis la boîte Jira. Les agents de la rédaction
// sont des reporters (chapeau mou, carte de presse). À droite, la revue des PR (sous-workflow review_child) : à chaque
// bureau, le relecteur (visière verte de correcteur) derrière son écran et, en face, l'auteur de la PR (un agent
// remplaçant pour ta PR ou celle de quelqu'un hors de l'équipe) ; sous le bureau, les étapes de son run, lues du run.
// Au mur, le tableau noir des revues du jour. Le soir et le week-end, la veilleuse : seuls ceux au travail et le boss.
// Données : dataset redaction (workflows/redaction_snapshot.py, cron live) et les runs de la revue (DATA.runs) ; démo : redactionDemo().
const RD_POSTES=[{k:'recherche',i:'📚',n:'Recherche'},{k:'redaction',i:'✍',n:'Rédaction'},{k:'critique',i:'🧐',n:'Critique'},{k:'valider',i:'✋',n:'Toi'}];
const RD_TK={wait:['#f7e07a','attend la critique'],run:['#9fd4ff','en cours'],gate:['#ffcf4a','t\'attend'],ok:['#b6e3a8','créé'],ecarte:['#d8d2c4','écarté'],err:['#f4a3a3','en panne']};
const RD_X1=19.5, RD_VX=23, RD_SH0=['dm/site','dm/mobile','dm/api','dm/outils'];
const RD_DESK={x:15.6*AT_TS,y:23.4*AT_TS}, RD_JIRA={x:17.8*AT_TS,y:25.6*AT_TS}, RD_CORK={x:1.6*AT_TS,y:9.4*AT_TS};
let REDACTION=null, RDSEL=null, RD_HITS=[], RD_LIT=[], RD_MEM={last:0};
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
  return {generated_at:at(11),crees:2,tables:[
    {run:'demo-t1',status:'Running',since:at(10.2),intention:'Refondre le lecteur vidéo : sous-titres, pistes audio et reprise de lecture',poste:'critique',tour:2,
     composants:['dm/site','dm/mobile','dm/api'],tickets:[{i:0,summary:'Lecteur : les sous-titres',composant:'dm/api',points:3,etat:'wait'},
       {i:1,summary:'Pistes audio dans le menu du lecteur',composant:'dm/site',points:2,etat:'wait'},{i:2,summary:'Reprise de lecture',composant:'dm/mobile',points:3,etat:'wait'}]},
    {run:'demo-t2',status:'Running',since:at(10.8),intention:'Export CSV des abonnés',poste:'recherche',tour:1,composants:['dm/outils'],tickets:[]}],
    events:[{t:at(10.2),k:'arrive',run:'demo-t1'},{t:at(10.8),k:'arrive',run:'demo-t2'},{t:at(8.5),k:'arrive',run:'demo-t0'},{t:at(9.1),k:'gate',run:'demo-t0'},{t:at(9.2),k:'cree',run:'demo-t0'},{t:at(9.3),k:'cree',run:'demo-t0'},{t:at(9.4),k:'fin',run:'demo-t0'}]};
}
const rdTables=()=>((REDACTION&&REDACTION.tables)||[]).slice(0,3);
const rdTable=()=>{const l=rdTables();return l.find(t=>t.run===RDSEL)||l[0]||null;};
// ---------- la revue : les runs de relecture d'une PR (review_child), lus du run ----------
const rvWf=w=>!!w&&(CFG.revue_wf||[]).includes(String(w).slice(0,8));
function rvRuns(){
  const l=((DATA&&DATA.runs)||[]).filter(r=>rvWf(r.wf)&&r._s<=T);
  if(!l.length&&DEMO)return rvDemo();
  return l.sort((a,b)=>a._s-b._s);
}
function rvDemo(){
  const s=DAY0+10*36e5, st=(n,x)=>n.map((k,j)=>({n:k,s:j<x?'Success':j===x?'Running':'Pending'}));
  return [{run:'demo-r1',status:'Running',_s:s,vars:{'current_task.number':'2042','current_task.repo':'dm/site','current_task.author':'hollyflax'},steps:st(['fetch_reviews','reason','post'],1)},
    {run:'demo-r2',status:'Running',_s:s+6e5,vars:{'current_task.number':'2051','current_task.repo':'dm/api','current_task.author':'michaelscott'},steps:st(['fetch_reviews','reason','post'],0)},
    {run:'demo-r3',status:'Running',_s:s+9e5,vars:{'current_task.number':'2037','current_task.repo':'dm/api','current_task.author':'darrylphilbin'},steps:st(['fetch_reviews','securite','reason','post'],2)},
    ...[1,2,3,4,5].map(k=>({run:'demo-rd'+k,status:'Success',_s:DAY0+(7+k/2)*36e5,vars:{},steps:[]}))];
}
const rvActive=()=>rvRuns().filter(r=>RUN_ACTIVE.includes(r.status)).slice(0,6);
const rvStepName=n=>({fetch_reviews:'📥 fils',fetch_comments:'📥 fils',fetch_files:'📥 fichiers',reason:'🧠 lecture',post:'✍ avis',securite:'🔒 sécu'})[n]||n;
// ---------- décor ----------
const RD_T=AT_TS;
function rdBackground(){
  const c=document.createElement('canvas');c.width=AT_W;c.height=AT_H;const g=c.getContext('2d'), T=RD_T;
  for(let y=0;y<27;y++)for(let x=0;x<46;x++)drawFloor(g,x,y,x<RD_X1?'wood':x<RD_VX?'tiles':'carpet');
  R(g,0,0,AT_W,T,'#4b4a52');R(g,0,T,AT_W,8,'#efe9dc');R(g,0,T+8,AT_W,24,'#d9d2c3');R(g,0,T+28,AT_W,4,'#a99f8c');
  for(const x of [RD_X1,RD_VX]){R(g,x*T-3,2*T,6,10.5*T,'#7d776c');R(g,x*T-3,15*T,6,12*T,'#7d776c');}
  const sx=(RD_X1+RD_VX)/2*T;R(g,sx-40,24*T,80,2.6*T,'#8a8478');for(let k=0;k<5;k++)R(g,sx-40,24*T+k*16,80,3,'#a9a397');
  g.font='bold 11px ui-monospace,Menlo,monospace';g.fillStyle='#5a4636';g.fillText('2E · RÉDACTION ET REVUE',12,T+20);
  return c;
}
let RD_BG=null;
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
  atPill('📚 '+label,x+42,y+88,lit?'#2f6fd6':'#f4efe4',lit?'#fff':'#6a6050','bold 9px ui-monospace,Menlo,monospace');}
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
  rdLate(people,()=>{atPill(t?'📌 '+clip(t.intention,44):'📌 aucune intention en cours',S.x+(t?110:70),S.y+10,'#1c1f26','#fff','bold 9px system-ui,sans-serif');
    if(others.length)atPill('+ '+plural(others.length,'autre intention','autres intentions')+' : clic sur le liège',S.x+70,S.y+28,'#5d6370','#fff','bold 9px system-ui,sans-serif');},1e6);
  const shi=t?Math.max(0,shelves.findIndex(n=>lit.has(n))):1, rech={x:sh0+shi*sw+42,y:7.3*T}, tx=8.8*T, ty=12.4*T, red={x:tx,y:ty-1.2*T}, cri={x:tx,y:ty+2.4*T};
  const p=t?t.poste:null, st=k=>!t?'idle':k===p?'run':RD_POSTES.findIndex(x=>x.k===k)<RD_POSTES.findIndex(x=>x.k===p)?'ok':'wait';
  const tks=(t&&t.tickets)||[];
  rdLate(people,()=>{R(ctx,tx-4.4*T,ty-.9*T,8.8*T,1.8*T,'#7a5a3c');R(ctx,tx-4.4*T,ty-.9*T,8.8*T,6,'#94704c');R(ctx,tx-4.2*T,ty+.9*T,6,10,'#4a3424');R(ctx,tx+4.2*T-6,ty+.9*T,6,10,'#4a3424');
    tks.slice(0,4).forEach((x,k)=>{const sx=tx+(-2.6+k*1.3)*T;R(ctx,sx-12,ty-15,24,30,'#fbfbf6');R(ctx,sx-12,ty-15,24,4,RD_TK[x.etat]?RD_TK[x.etat][0]:'#2f6fd6');for(let l=0;l<4;l++)R(ctx,sx-8,ty-6+l*5,16,2,'#b8b2a4');atPill('T'+(k+1),sx+12,ty-14,'#0b2a4a','#fff','bold 8px ui-monospace,Menlo,monospace');});
    if(t&&t.tour>1)atPill('↺ critique → rédaction · tour '+t.tour+'/3',tx+5.4*T,ty+2.6*T,'#0b2a4a','#fff','bold 9px system-ui,sans-serif');},ty-.6*T);
  atHitRd('table',tx-4.4*T,ty-2.2*T,8.8*T,5*T,{});
  // le fil rouge : le liège, la recherche, la rédaction, puis un brin par ticket ; tous finissent au tampon, puis à Jira
  const desk=RD_DESK, jira=RD_JIRA, p0={x:S.x+20,y:S.y-14}, p1={x:rech.x,y:rech.y-20}, p2={x:red.x,y:red.y-20};
  const cards=tks.slice(0,4).map((x,k,l)=>({x:(2.2+k*(14.6/Math.max(1,l.length)))*T+(14.6/Math.max(1,l.length))*T/2-.6*T,y:19.6*T}));
  if(t){rdStrand(p0,p1,p!=='recherche'||true);rdStrand(p1,p2,p!=='recherche');
    cards.forEach((c,k)=>{rdStrand(p2,{x:c.x,y:c.y-24},tks[k].etat!=='wait'||p==='valider');rdStrand({x:c.x,y:c.y+14},{x:desk.x,y:desk.y-30},tks[k].etat==='ok');});
    rdStrand({x:desk.x,y:desk.y-30},{x:jira.x,y:jira.y-34},tks.some(x=>x.etat==='ok'));
    rdLate(people,()=>{rdPin(p0,'#d0392b');rdPin(p1,'#d0392b');if(p!=='recherche')rdPin(p2,'#d0392b');
      cards.forEach((c,k)=>{const x=tks[k], col=(RD_TK[x.etat]||RD_TK.wait);R(ctx,c.x-56,c.y-24,112,38,x.etat==='wait'&&p==='critique'&&k===0?'#9fd4ff':col[0]);rdPin({x:c.x,y:c.y-24},'#d0392b');
        atTxt('T'+(k+1)+' · '+(x.composant||'?'),c.x,c.y-8,'#1c1f26','bold 9px ui-monospace,Menlo,monospace');atTxt(clip(x.summary||'',20),c.x,c.y+5,'#3a3530','9px system-ui');
        atHitRd('ticket',c.x-56,c.y-24,112,38,{k});});},1e6-1);}
  rdAgent(people,60,rech.x,rech.y,st('recherche'),{dir:'up',hat:'presse',bubble:p==='recherche'?'je fouille '+(t.composants||[]).length+' dépôt(s)…':null},now);
  rdLate(people,()=>atPill('📚 Recherche',rech.x,rech.y+16,st('recherche')==='run'?'#2f6fd6':st('recherche')==='ok'?'#2f7a45':'#f4efe4',st('recherche')==='wait'||!t?'#3a3530':'#fff','bold 9px system-ui,sans-serif'),1e6);
  rdAgent(people,61,red.x,red.y,st('redaction'),{hat:'presse',bubble:p==='redaction'?(tks.length?'version '+(t.tour||1)+', je reprends…':'je rédige…'):null},now);
  rdLate(people,()=>atPill('✍ Rédaction',red.x-80,red.y-22,st('redaction')==='run'?'#2f6fd6':st('redaction')==='ok'?'#2f7a45':'#f4efe4',st('redaction')==='wait'||!t?'#3a3530':'#fff','bold 9px system-ui,sans-serif'),1e6);
  rdAgent(people,62,cri.x,cri.y,st('critique'),{dir:'up',hat:'presse',bubble:p==='critique'?'je relis T1…':null},now);
  rdLate(people,()=>atPill('🧐 Critique',cri.x,cri.y+16,st('critique')==='run'?'#2f6fd6':st('critique')==='ok'?'#2f7a45':'#f4efe4',st('critique')==='wait'||!t?'#3a3530':'#fff','bold 9px system-ui,sans-serif'),1e6);
  // le bureau du boss, le tampon posé dessus : il y est, et tamponne les tickets un par un
  rdBoss(people,tks,now);
  rdLate(people,()=>{R(ctx,jira.x-18,jira.y-30,36,30,'#2f6fd6');R(ctx,jira.x-18,jira.y-34,36,6,'#2559b8');R(ctx,jira.x-10,jira.y-20,20,3,'#0b2a4a');atPill('🎫 Jira',jira.x-44,jira.y-14,'#f4efe4','#3a3530','bold 9px system-ui,sans-serif');},jira.y);
  rdBench(people,3.4*T,24.6*T,[63,64],'presse');
}
function rdBoss(people,tks,now){
  const {x,y}=RD_DESK, boss=chars.find(c=>c.boss);R(ctx,x-22,y-52,44,32,'#5a2e2e');R(ctx,x-22,y-52,44,4,'#723a3a');
  const g=tks.findIndex(t=>t.etat==='gate');
  if(boss){const c=Object.assign(Object.create(Object.getPrototypeOf(boss)),boss,{pos:{x,y:y-14},tile:null,dir:'down',moving:false,pose:'type',present:true,_st:{st:g>=0?'gate':'idle'}});
    people.push([c,null,false,()=>{if(g>=0)atBubble(x,y-80,'✋ '+plural(tks.filter(t=>t.etat==='gate').length,'ticket','tickets')+' : je tamponne ?','#8a5a00');}]);RD_LIT.push({x,y:y-14});atHitRd('boss',x-16,y-70,32,60,{});}
  rdLate(people,()=>{R(ctx,x-56,y-22,112,26,'#6e4a2c');R(ctx,x-56,y-24,112,4,'#8a6040');R(ctx,x-30,y-12,60,10,'#2a2a30');atTxt('LE BOSS',x,y-4,'#f2d22a','bold 8px ui-monospace,Menlo,monospace');
    R(ctx,x+26,y-34,12,10,'#c8323a');R(ctx,x+29,y-40,6,6,'#1c1c1c');atPill('✋ le tampon : tu valides les tickets, puis ils partent un par un',x-40,y+18,g>=0?'#8a5a00':'#f4efe4',g>=0?'#fff':'#3a3530','bold 9px system-ui,sans-serif');},y);
}
// un banc comme au 1er : ceux qui ne travaillent pas s'y assoient (descendus dans l'assise, qui leur cache les jambes)
function rdBench(people,x,y,ks,hat){atSofa(x,y);ks.forEach((k,j)=>{const a=atWorker(k,x+(j?22:-22),y+9,'down',false,'');if(!a)return;a._st={st:'idle'};a.pose='stand';
  people.push([a,null,false,()=>{rdHat(ctx,hat,x+(j?22:-22),y+9,'down');if(j===ks.length-1)atSofaFront(x,y);}]);});}
// ---------- la salle de revue ----------
function rdRevue(now,people){
  const T=RD_T, l=rvActive(), done=rvRuns().filter(r=>r.status==='Success'&&r._s>=DAY0).length;
  atTxt('👀 REVUE DES PR',(RD_VX+.6)*T,2.7*T,'#5a4636','bold 10px ui-monospace,Menlo,monospace','left');
  const bx=30*T, by=2.1*T, bw=11*T, bh=3.4*T;R(ctx,bx-6,by-6,bw+12,bh+12,'#8a6040');R(ctx,bx,by,bw,bh,'#24352c');R(ctx,bx+4,by+bh-6,bw-8,4,'#a37650');
  atTxt('REVUES DU JOUR',bx+bw/2,by+18,'#f4efe4','bold 11px ui-monospace,Menlo,monospace');R(ctx,bx+16,by+24,bw-32,1,'rgba(244,239,228,.4)');
  [['#5b8def',plural(l.length,'PR en lecture','PR en lecture')],['#3fbf6a',plural(done,'revue postée','revues postées')+' aujourd\'hui'],['#e0a020','~'+Math.round(rvRuns().filter(r=>r._s>=DAY0).reduce((a,r)=>a+(r.tok||0),0)/1e3)+' k tokens']]
    .forEach(([c,t],k)=>{R(ctx,bx+16,by+36+k*18,8,8,c);atTxt(t,bx+30,by+44+k*18,'#e8e2d0','10px ui-monospace,Menlo,monospace','left');});
  const boss=chars.find(c=>c.boss);
  for(let k=0;k<6;k++){const r=l[k], cx=(28.5+(k%3)*6.3)*T, feet=(k<3?9.2:18.4)*T, rf=feet+2.3*T;
    if(!r){atDesk(cx,feet-6,false);ctx.fillStyle='rgba(30,26,22,.22)';ctx.fillRect(cx-90,feet-90,180,150);rdLate(people,()=>atPill('bureau libre',cx,feet+40,'#f4efe4','#6a6050','bold 9px system-ui,sans-serif'),feet);continue;}
    const v=r.vars||{}, who=v['current_task.author'], au=who&&typeof ghChar==='function'?ghChar(who):null, mine=au&&boss&&au.key===boss.key;
    rdAgent(people,100+k,cx,feet,'run',{hat:'visiere',desk:true,bubble:(r.steps||[]).some(s=>s.n==='reason'&&s.s==='Running')?'je lis le diff…':null},now);
    if(au&&!mine){const c=Object.assign(Object.create(Object.getPrototypeOf(au)),au,{pos:{x:cx,y:rf},tile:null,dir:'up',moving:false,pose:'stand',present:true,_st:{st:'idle'}});people.push([c,null,false,null]);}
    else rdAgent(people,110+k,cx,rf,'idle',{dir:'up'},now);
    const pr=(String(v['current_task.repo']||'').split('/').pop()||'?')+'#'+(v['current_task.number']||'?'), name=au&&!mine?au.name:mine?'🤖 remplaçant (ta PR)':who?'@'+who:'';
    rdLate(people,()=>{atPill(pr+(name?' · '+name:''),cx,rf+24,'#0b2a4a','#fff','bold 9px ui-monospace,Menlo,monospace');
      const steps=(r.steps||[]).filter(s=>s.n);ctx.font='bold 8px system-ui,sans-serif';const ws=steps.map(s=>ctx.measureText(rvStepName(s.n)).width+10), tot=ws.reduce((a,b)=>a+b,0)+Math.max(0,steps.length-1)*3;let x=cx-tot/2;
      steps.forEach((s,j)=>{const c=s.s==='Success'?'#2f7a45':s.s==='Running'?'#2f6fd6':s.s==='Failed'?'#a8323a':'#e8e2d0';atPill(rvStepName(s.n),x+ws[j]/2,rf+42,c,c==='#e8e2d0'?'#6a6050':'#fff','bold 8px system-ui,sans-serif');x+=ws[j]+3;});},rf+1);
    atHitRd('review',cx-60,feet-60,120,rf-feet+80,{run:r.run});}
  if(l.length<6)rdBench(people,41.6*T,25.2*T,[96,97],'visiere');
  const sx=(RD_X1+RD_VX)/2*T;atCoffee(sx,6.4*T);atPlant(sx-36,20*T);atPlant(sx+36,20*T);
  rdLate(people,()=>atPill('⇅ escalier · RDC',sx,23.6*T,'#5a4636','#fff','bold 9px ui-monospace,Menlo,monospace'),1e6);
}
// ---------- nuit : la veilleuse ; ceux au travail et le boss gardent leur lumière ----------
let RD_NIGHT_CV=null, RD_NIGHT_AT=0;
function rdNight(now){
  if(atOpen())return;
  const W_=AT_W/LQ, H_=AT_H/LQ;if(!RD_NIGHT_CV)RD_NIGHT_CV=[lightCanvas(W_,H_),lightCanvas(W_,H_)];
  if(now-RD_NIGHT_AT>200||!RD_NIGHT_AT){RD_NIGHT_AT=now;const m=RD_NIGHT_CV[0].getContext('2d');m.setTransform(1,0,0,1,0,0);m.globalCompositeOperation='source-over';m.clearRect(0,0,W_,H_);
    m.fillStyle='rgba(10,14,40,.55)';m.fillRect(0,0,W_,H_);m.setTransform(1/LQ,0,0,1/LQ,0,0);m.globalCompositeOperation='destination-out';
    for(const q of RD_LIT)softSpot(m,q.x,q.y-26,40,.85);
    const l=RD_NIGHT_CV[1].getContext('2d');l.clearRect(0,0,W_,H_);l.filter='blur(3px)';l.drawImage(RD_NIGHT_CV[0],0,0);l.filter='none';}
  const sm=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=true;ctx.drawImage(RD_NIGHT_CV[1],0,0,AT_W,AT_H);ctx.imageSmoothingEnabled=sm;
}
function rdReset(){RD_MEM={last:0};RDSEL=null;}
function renderRedaction(now){
  RD_MEM.last=now;if(!RD_BG)RD_BG=rdBackground();ctx.drawImage(RD_BG,0,0);RD_HITS=[];RD_LIT=[];
  const people=[];rdRoom(now,people);rdRevue(now,people);
  people.sort((a,b)=>a[0].pos.y-b[0].pos.y).forEach(([c,d,before,after])=>{if(d)d();if(c.sprite)drawChar(c,now);if(after)after();});
  rdNight(now);
  const b=chars.find(c=>c.boss);if(b&&sel===b.key)selHalo(RD_DESK.x,RD_DESK.y-40,AT_W,AT_H);
}
function atHitRd(kind,x,y,w,h,ref){RD_HITS.push({kind,x,y,w,h,...ref});}
function rdHitAt(e){const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width, my=(e.clientY-r.top)*AT_H/r.height;
  for(let k=RD_HITS.length-1;k>=0;k--){const h=RD_HITS[k];if(mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h)return h;}return null;}
function redactionClick(e){
  const h=rdHitAt(e);sel=null;SEL_BACK=[];
  if(h&&h.kind==='boss'){const b=chars.find(c=>c.boss);if(b){select(b.key);return;}}
  if(h&&h.kind==='cork'){const l=rdTables();if(l.length>1){const i=l.indexOf(rdTable());RDSEL=l[(i+1)%l.length].run;}}
  renderSide(true);
}
function redactionHover(e){
  const h=rdHitAt(e), t=rdTable();let s='';
  if(h&&h.kind==='ticket'&&t){const x=t.tickets[h.k];s='T'+(h.k+1)+' · '+(x.composant||'?')+' · '+(x.points||'?')+' pts · '+(RD_TK[x.etat]||RD_TK.wait)[1]+' · '+x.summary;}
  else if(h&&h.kind==='table')s=t?'La table de rédaction : '+t.intention:'La table de rédaction : aucune intention en cours';
  else if(h&&h.kind==='cork')s=rdTables().length>1?'Les intentions en cours : clic pour passer à la suivante':'L\'intention en cours';
  else if(h&&h.kind==='boss')s=(chars.find(c=>c.boss)||{}).name+' : tamponne chaque ticket avant sa création ; clic : sa fiche';
  else if(h&&h.kind==='review'){const r=rvRuns().find(x=>x.run===h.run), v=(r&&r.vars)||{};s='Revue de '+(v['current_task.repo']||'?')+'#'+(v['current_task.number']||'?')+' : les étapes de son run, sous le bureau';}
  cv.style.cursor=h?'pointer':'default';
  if(s){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';tip.textContent=s;}else tip.style.display='none';
}
// ---------- panneau ----------
function redactionListHtml(){
  const l=rdTables(), rv=rvActive();
  return `<h2 class="at-h">✍ Rédaction <span class="cnt">${l.length}</span></h2>`+(l.length?l.map(t=>`<button class="at-room" data-run="${esc(t.run)}"><span class="at-top"><span class="at-title">${esc(clip(t.intention,80))}</span>${(t.tickets||[]).some(x=>x.etat==='gate')?'<span class="at-tag wait">✋ t\'attend</span>':`<span class="at-tag run">${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).i||'')} ${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).n||'')}</span>`}</span>
    ${(t.tickets||[]).map((x,k)=>`<span class="mut">T${k+1} · ${esc(x.summary)} · ${esc(x.composant||'?')} · ${esc(String(x.points||'?'))} pts · ${esc((RD_TK[x.etat]||RD_TK.wait)[1])}</span>`).join('<br>')||'<span class="mut">les tickets arrivent avec la rédaction</span>'}</button>`).join(''):'<div class="note">Aucune intention en cours. « ▶ Lancer » sur la fiche de l\'agent des tickets en démarre une.</div>')+
    `<div class="at-gate"></div><h2 class="at-h">👀 Revue des PR <span class="cnt">${rv.length}</span></h2>`+(rv.length?rv.map(r=>{const v=r.vars||{};return `<div class="at-q"><b class="mono">${esc((String(v['current_task.repo']||'').split('/').pop()||'?')+'#'+(v['current_task.number']||'?'))}</b> <span class="mut">${esc((r.steps||[]).map(s=>rvStepName(s.n)+(s.s==='Success'?' ✓':s.s==='Running'?' …':'')).join(' · '))}</span></div>`;}).join(''):'<div class="mut">Aucune revue en cours.</div>');
}
function drawRedactionSide(side){
  const boss=chars.find(c=>c.boss);
  if(sel!=null&&!(boss&&sel===boss.key)){setFloor(0);return;}
  if(sel!=null){drawSide(side);return;}
  const box=document.createElement('div');box.className='atelier';side.appendChild(box);box.innerHTML=redactionListHtml();
  box.querySelectorAll('.at-room').forEach(b=>b.addEventListener('click',()=>{RDSEL=b.dataset.run;renderSide(true);}));
  for(const g of GATES)if(/un ticket/.test(String(g.wf_name||'')))gateCard(box.querySelector('.at-gate')||box,{run:g.run,wf_name:g.wf_name,_s:ms(g.since)},null); // le tampon : chaque ticket qui t'attend
}
function tvRedactionHtml(){
  return '<h2>Rédaction</h2>'+(rdTables().map(t=>`<div class="tw ag"><span class="wt"><span class="wn">${esc(clip(t.intention,40))}<span class="ws">${esc((RD_POSTES.find(p=>p.k===t.poste)||{}).n||'')}</span></span><span class="ww">${esc((t.tickets||[]).length?plural(t.tickets.length,'ticket','tickets'):'')}</span></span></div>`).join('')||'<div class="mut">Aucune intention en cours.</div>')+
    `<h2>Revue des PR · ${rvActive().length}</h2>`;
}
// ---------- la loupe, le fil du RDC, ⌘K, la galerie ----------
function rdLoupeEvents(){
  const out=[], t=rdTable(), boss=chars.find(c=>c.boss);
  if(t&&(t.tickets||[]).some(x=>x.etat==='gate')){const p=atPt(RD_DESK.x,RD_DESK.y-14,boss?boss.name:'Le boss','','rd_gate');p._st={st:'rd_gate',label:'✋ Un ticket attend ton tampon'};out.push({id:'rd_gate:'+t.run,kind:'rd_gate',cs:[p,atPt(RD_JIRA.x,RD_JIRA.y,'','','rd_gate')]});}
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
  const fam='2e étage', ok=true;
  return [{fam,ico:'✂',n:'Une intention découpée',d:'La rédaction découpe l\'intention en trois tickets : le fil rouge se divise en trois brins',w:'Une intention qui touche plusieurs projets',ok,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='critique';t.tickets.forEach(x=>{x.etat='wait';});}})}},
    {fam,ico:'✋',n:'Le tampon',d:'Les tickets sont relus : le boss les tamponne, tes changements renvoient à la rédaction',w:'Avant leur création',ok,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='valider';t.tickets.forEach(x=>{x.etat='gate';});}})}},
    {fam,ico:'🎫',n:'Les tickets partent dans Jira',d:'Tamponnés, ils sont créés un par un : les brins du fil rouge vont jusqu\'à la boîte Jira',w:'Tu approuves chaque ticket',ok,
      play:{len:15e3,speed:1,setup:rdDemo(d=>{const t=d.tables[0];if(t){t.poste='valider';t.tickets.forEach(x=>{x.etat='ok';});}})}}];
}
