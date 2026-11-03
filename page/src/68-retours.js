// ---------- 3e étage : les retours de PR ----------
// Un bureau par PR dont on corrige les commentaires de review (modèle du Bureau « corriger les commentaires d'une PR »,
// actions.fix_pr, fix.json), six au plus. Dans chaque bureau, un rail de postes comme au 1er (un agent par étape du
// workflow, derrière son bureau à écran, la PR en carton devant le poste en cours) et, au mur, le Kanban des fils de la
// PR (une colonne par section de la réponse de l'agent) ; un fil rouge relie le fil traité à l'agent qui s'en occupe. Un
// clic sur le Kanban l'ouvre en grand. Le boss est toujours là, à son bureau du couloir : il se lève pour aller à la
// barrière ✋ du bureau qui attend depuis le plus longtemps, les autres attendent leur tour. Bernard monte les PR par
// l'escalier (sa porte, au bout du couloir) et les redescend une fois poussées. Les agents portent le bleu de mécanicien (la casquette). Le soir et le
// week-end, l'étage passe en veilleuse : seuls les agents au travail et le boss gardent leur lumière.
// Données : dataset retours (workflows/retours_snapshot.py, cron live) ; démo : retoursDemo(). Toile de l'atelier (AT_W × AT_H).
const RT_POSTES=[{k:'prepare',i:'🗂',n:'Préparation'},{k:'fix',i:'🛠',n:'Correction'},{k:'check',i:'🧪',n:'Contrôles'},{k:'diff',i:'🔍',n:'Diff'},
  {k:'gate',i:'✋',n:'Toi',gate:true},{k:'push',i:'📤',n:'Push'}];
const RT_COLS=[{k:'a_traiter',n:'À traiter',c:'#e8e2d0'},{k:'corrige',n:'✅ Corrigé',c:'#b6e3a8'},{k:'test',n:'🧪 Test',c:'#c9b6f2'},
  {k:'laisse',n:'⏭ Laissé',c:'#d8d2c4'},{k:'reponse',n:'💬 Réponse',c:'#9fd4ff'}];
const RT_ST={ok:['ok','a travaillé'],run:['run','au travail'],err:['err','en panne'],gate:['wait','t\'attend'],wait:['','attend son tour']};
const RT_N=6, RT_W=46/3, RT_H=11.2, RT_Y=[2,15.8], RT_HALL=[13.2,15.8], RT_LANE=14.5*AT_TS;
const RT_WINDOWS=[7,10,13,17,20,23,27,30,33,37,40,43]; // en cases : à droite du nom de l'étage, comme au RDC
// RT_STAIRS : derrière la porte de l'escalier, au bout du couloir dans le mur de droite comme l'entrée du RDC (stairDoor,
// 68-atelier.js) ; Bernard en sort et y rentre
const RT_DESK={x:31*AT_TS,y:15.2*AT_TS}, RT_STAIRS={x:46*AT_TS+50,y:14.5*AT_TS};
const RT_STAIR={x:46*AT_TS-12,y:13.5*AT_TS,w:12,h:2*AT_TS,vert:true,wall:[46*AT_TS-12,13.2*AT_TS,12,2.6*AT_TS]}, RT_EXIT={x:46*AT_TS-30,y:13.5*AT_TS-12};
let RETOURS=null, RTSEL=null, RT_KB=null, RT_HITS=[], RT_LIT=[];
function readRetours(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.retours;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.rooms)?d:null;
  }catch(e){return null;}
}
const retoursOn=()=>!!(CFG.retours||DEMO);
// démo : cinq PR de l'équipe fictive (dépôts dm/*) à des postes différents, deux qui attendent ta validation, une file
function retoursDemo(){
  const at=h=>new Date(DAY0+h*36e5).toISOString(), ok=n=>Object.fromEntries(RT_POSTES.slice(0,n).map(p=>[p.k,'ok']));
  const F=(id,col,path,line,who,text,cur)=>({id,col,path,line,who,text,cur:!!cur});
  const rooms=[
    {run:'demo-f1',repo:'dm/site',pr:'2042',title:'Le lecteur vidéo lit les sous-titres',author:'hollyflax',poste:'fix',states:{...ok(1),fix:'run'},since:at(10.1),
     fils:[F('t1','corrige','src/Player.tsx',7,'gabelewis','Import inutilisé'),F('t2','corrige','src/hooks/useFeed.ts',19,'pambeesly','Éviter le double appel au montage'),
       F('t3','a_traiter','src/Player.tsx',42,'darrylphilbin','Renommer la prop autoplay en autoPlay',1),F('t4','a_traiter','src/api/video.ts',88,'pambeesly','Pourquoi ce cast as any ?'),
       F('t5','test','src/api/video.test.ts',1,'darrylphilbin','Ajouter un test pour la 404'),F('t6','reponse','src/Player.tsx',120,'gabelewis','C\'est voulu, le délai ?'),F('t7','a_traiter','README.md',12,'hollyflax','Mettre à jour l\'exemple')]},
    {run:'demo-f2',repo:'dm/site',pr:'2039',title:'Bandeau cookies : le bouton Refuser',author:'pambeesly',poste:'gate',gate:true,states:{...ok(4),gate:'gate'},since:at(9.4),
     fils:[F('u1','corrige','src/Banner.tsx',14,'hollyflax','Le bouton n\'a pas de label'),F('u2','corrige','src/Banner.tsx',30,'gabelewis','Couleur hors charte'),F('u3','corrige','src/i18n/fr.json',3,'hollyflax','Faute de frappe'),
       F('u4','test','src/Banner.test.tsx',1,'darrylphilbin','Un test pour Refuser ?'),F('u5','laisse','src/Banner.tsx',2,'gabelewis','Passer en CSS modules'),F('u6','reponse','src/Banner.tsx',44,'darrylphilbin','Pourquoi un timeout ?')]},
    {run:'demo-f3',repo:'dm/api',pr:'16',title:'Cache des listes de rubriques',author:'darrylphilbin',poste:'check',states:{...ok(2),check:'err'},since:at(9.9),
     fils:[F('v1','a_traiter','app/Cache.php',51,'pambeesly','Clé de cache trop large'),F('v2','corrige','app/Cache.php',12,'hollyflax','Constante à extraire'),F('v3','corrige','app/Cache.php',80,'gabelewis','TTL en dur',1),F('v4','reponse','app/Cache.php',90,'pambeesly','Et l\'invalidation ?')]},
    {run:'demo-f4',repo:'dm/site',pr:'2045',title:'Menu : la recherche au clavier',author:'gabelewis',poste:'push',states:{...ok(5),push:'run'},since:at(8.8),
     fils:[F('w1','corrige','src/Menu.tsx',8,'pambeesly','Tab saute la recherche'),F('w2','corrige','src/Menu.tsx',22,'hollyflax','aria-expanded manquant'),F('w3','corrige','src/Menu.tsx',40,'darrylphilbin','Échap ne ferme pas'),
       F('w4','corrige','src/Menu.css',5,'pambeesly','Focus invisible'),F('w5','test','src/Menu.test.tsx',1,'hollyflax','Test clavier'),F('w6','reponse','src/Menu.tsx',60,'gabelewis','Pourquoi un portal ?'),F('w7','reponse','src/Menu.tsx',72,'pambeesly','Ça marche sur mobile ?')]},
    {run:'demo-f5',repo:'dm/api',pr:'21',title:'Export CSV des abonnés',author:'pambeesly',poste:'gate',gate:true,states:{...ok(4),gate:'gate'},since:at(10.4),
     fils:[F('x1','corrige','app/Export.php',10,'darrylphilbin','Encodage UTF-8 BOM'),F('x2','corrige','app/Export.php',33,'gabelewis','Nom du fichier daté'),F('x3','test','tests/ExportTest.php',1,'hollyflax','Couvrir la liste vide'),
       F('x4','reponse','app/Export.php',50,'darrylphilbin','Limiter à 10 000 lignes ?'),F('x5','reponse','app/Export.php',61,'hollyflax','Et les désabonnés ?')]}];
  return {generated_at:at(11),postes:RT_POSTES.map(p=>p.k),rooms,queue:[{run:'demo-fq1',repo:'dm/site',pr:'2048',since:at(10.7)},{run:'demo-fq2',repo:'dm/api',pr:'24',since:at(10.9)}],
    pannes:[{run:'demo-fp1',repo:'dm/site',pr:'2031',title:'Pied de page : liens sociaux',poste:'fix',since:at(8.2)}],pousses:2,
    events:[...rooms.map(r=>({t:r.since,k:'arrive',run:r.run,repo:r.repo,pr:r.pr})),...rooms.filter(r=>r.gate).map(r=>({t:new Date(ms(r.since)+30*60e3).toISOString(),k:'gate',run:r.run,repo:r.repo,pr:r.pr})),
      {t:at(8.2),k:'arrive',run:'demo-fp1',repo:'dm/site',pr:'2031'},{t:at(8.5),k:'panne',run:'demo-fp1',repo:'dm/site',pr:'2031',poste:'fix'},
      {t:at(7.6),k:'arrive',run:'demo-fd1',repo:'dm/site',pr:'2030'},{t:at(8.4),k:'push',run:'demo-fd1',repo:'dm/site',pr:'2030'},
      {t:at(9),k:'arrive',run:'demo-fd2',repo:'dm/api',pr:'14'},{t:at(9.7),k:'push',run:'demo-fd2',repo:'dm/api',pr:'14'}]};
}
// ---------- les bureaux : en direct, ceux du relevé ; en rejeu, l'étage à l'heure du curseur ----------
const rtLive=()=>typeof mode==='undefined'||mode==='live'||(typeof SCENE_DEMO!=='undefined'&&!!SCENE_DEMO);
const rtEvents=()=>((RETOURS&&RETOURS.events)||[]);
const rtRooms=()=>(rtLive()?((RETOURS&&RETOURS.rooms)||[]):rtRoomsAt(T)).slice(0,RT_N);
// une PR occupe un bureau de son arrivée à son push (ou sa panne) ; à sa gate depuis l'ouverture de la gate ; une PR encore
// là et sans rien de plus tard garde ce que le relevé en sait (postes, Kanban)
function rtRoomsAt(t){
  const by={}, now={}, later=new Set();
  for(const r of (RETOURS&&RETOURS.rooms)||[])now[r.run]=r;
  for(const e of rtEvents()){const a=ms(e.t);if(!a)continue;if(a>t){later.add(e.run);continue;}(by[e.run]||(by[e.run]={e:[],b:e})).e.push(e);}
  const out=[];
  for(const [run,{e,b}] of Object.entries(by)){
    e.sort((x,y)=>ms(x.t)-ms(y.t));
    if(!e.some(x=>x.k==='arrive')||e.some(x=>x.k==='push'||x.k==='panne'||x.k==='fin'))continue;
    if(now[run]&&!later.has(run)){out.push(now[run]);continue;}
    const base=now[run]||{run,repo:b.repo,pr:b.pr,fils:[]}, gate=e[e.length-1].k==='gate', states={prepare:'ok'};
    if(gate){['fix','check','diff'].forEach(k=>{states[k]='ok';});states.gate='gate';}else states.fix='run';
    out.push({...base,run,poste:gate?'gate':'fix',gate,states,since:e.find(x=>x.k==='arrive').t});
  }
  return out.sort((a,b)=>ms(a.since)-ms(b.since));
}
// mémoire de l'étage : une PR garde son bureau ; les scènes (Bernard qui monte et redescend une PR) ne se jouent que
// quand on regarde l'étage, et en y montant (fresh) tout est posé sans rejouer
const rtMem0=()=>({fresh:true,slot:{},seen:{},scenes:[],leaving:Array(RT_N).fill(null),boss:null,last:0,lastT:null,live:null,sig:''});
let RT_MEM=rtMem0();
function rtReset(){const slot=RT_MEM.slot;RT_MEM=rtMem0();RT_MEM.slot=slot;RTSEL=null;rtKbClose();} // une PR garde son numéro de bureau, vue du RDC comme à l'étage
function rtSlots(){
  const rooms=rtRooms(), out=Array(RT_N).fill(null), live=new Set(rooms.map(r=>r.run));
  for(const run of Object.keys(RT_MEM.slot))if(!live.has(run))delete RT_MEM.slot[run];
  for(const r of rooms){const i=RT_MEM.slot[r.run];if(i!=null&&!out[i])out[i]=r;}
  for(const r of rooms){if(out.includes(r))continue;const i=out.findIndex((x,k)=>!x&&!RT_MEM.leaving[k]);const j=i>=0?i:out.findIndex(x=>!x);if(j>=0){out[j]=r;RT_MEM.slot[r.run]=j;}}
  return out;
}
const rtState=(r,p)=>{const s=(r.states||{})[p.k];return s||(r.poste===p.k?'run':'');};
const rtCur=r=>RT_POSTES.find(p=>['run','gate','err'].includes(rtState(r,p)))||null;
const rtName=r=>(String(r.repo||'').split('/').pop()||'?')+'#'+(r.pr||'?');
const rtWho=r=>{const c=r&&r.author&&typeof ghChar==='function'?ghChar(r.author):null;return c?c.name:(r&&r.author)||'';};
const rtCount=(r,k)=>(r.fils||[]).filter(f=>f.col===k).length;
// la barrière où le boss va : la gate ouverte depuis le plus longtemps ; les autres attendent leur tour
function rtGateTarget(slots){let best=-1;slots.forEach((r,i)=>{if(r&&r.gate&&(best<0||ms(r.since)<ms(slots[best].since)))best=i;});return best<0?null:best;}
// ---------- géométrie ----------
function rtGeo(i){
  const T=AT_TS, col=i%3, top=i<3, x0=col*RT_W*T, y0=RT_Y[top?0:1]*T, w=RT_W*T, h=RT_H*T, ry=y0+h-2.4*T, sw=(w-1.4*T)/RT_POSTES.length;
  const pts=RT_POSTES.map((p,j)=>({x:x0+.7*T+(j+.5)*sw,y:ry-.95*T}));
  return {i,top,x0,y0,w,h,ry,sw,pts,kb:{x:x0+.5*T,y:y0+1.1*T,w:w-T,h:3*T},door:{x:x0+w/2,y:top?y0+h:y0},
    gate:top?{x:pts[4].x,y:y0+h-.9*T}:{x:pts[4].x,y:pts[4].y}};
}
const RT_G=[...Array(RT_N).keys()].map(rtGeo);
// le chemin du boss : de son bureau par le couloir jusqu'à la porte, puis à la barrière (en haut : sous le rail, devant la
// barrière ; en bas : par la porte du haut, sous le Kanban, jusqu'à la place de la barrière)
const rtInside=i=>{const g=RT_G[i], T=AT_TS;return g.top?[{x:g.door.x,y:RT_LANE},{x:g.door.x,y:g.gate.y},g.gate]:[{x:g.door.x,y:RT_LANE},{x:g.door.x,y:g.y0+4.9*T},{x:g.gate.x,y:g.y0+4.9*T},g.gate];};
// prev : le bureau d'où il repart (il en ressort par le même chemin), sinon son bureau du couloir
function rtBossPath(from,i,prev){
  const pts=[{...from}];
  if(prev!=null)pts.push(...rtInside(prev).reverse().slice(1));else pts.push({x:from.x,y:RT_LANE});
  if(i==null)pts.push({x:RT_DESK.x,y:RT_LANE},rtHome());else pts.push(...rtInside(i));
  return pts;
}
const rtHome=()=>({x:RT_DESK.x,y:RT_DESK.y}); // assis à son bureau du couloir
// ---------- décor ----------
function rtBackground(){
  const c=document.createElement('canvas');c.width=AT_W;c.height=AT_H;const g=c.getContext('2d'), T=AT_TS;
  for(let y=0;y<27;y++)for(let x=0;x<46;x++)drawFloor(g,x,y,y>=RT_HALL[0]&&y<RT_HALL[1]?'tiles':'carpet');
  R(g,0,0,AT_W,T,'#4b4a52');R(g,0,T,AT_W,8,'#efe9dc');R(g,0,T+8,AT_W,24,'#d9d2c3');R(g,0,T+28,AT_W,4,'#a99f8c');
  for(const z of RT_G){R(g,z.x0,z.y0,z.w,4,'#7d776c');R(g,z.x0,z.y0+z.h-4,z.w,4,'#7d776c');R(g,z.x0,z.y0,4,z.h,'#7d776c');R(g,z.x0+z.w-4,z.y0,4,z.h,'#7d776c');
    woodDoor(g,z.door.x-T,z.top?z.y0+z.h-8:z.y0-4,2*T,12,2,false);} // la porte en bois, sur le couloir
  g.font='bold 13px ui-monospace,Menlo,monospace';g.fillStyle='#5a4636';g.fillText('3E · RETOURS DE PR',12,T+20);
  return c;
}
let RT_BG=null;
// la casquette du bleu de mécanicien, par-dessus l'agent
function rtCap(g,x,y,dir){const hx=x+(dir==='left'?-2:dir==='right'?2:0), hy=y-44;R(g,hx-9,hy-4,18,7,'#24407a');R(g,hx-9,hy-4,18,2,'#3a5ca0');
  if(dir!=='up')R(g,hx-(dir==='left'?13:dir==='right'?5:9),hy+2,dir==='down'?18:14,3,'#1a2e5a');}
function rtPostit(x,y,c,hl){R(ctx,x,y,20,14,c);R(ctx,x+3,y+4,13,2,'rgba(0,0,0,.25)');R(ctx,x+3,y+8,9,2,'rgba(0,0,0,.25)');if(hl){ctx.strokeStyle='#c0392b';ctx.lineWidth=2;ctx.strokeRect(x-2,y-2,24,18);}}
// le Kanban au mur : une colonne par section de la réponse, un post-it par fil ; renvoie où est le fil en cours
function rtBoard(z,r){
  const {x,y,w,h}=z.kb;R(ctx,x-4,y-4,w+8,h+8,'#7a5a3c');R(ctx,x,y,w,h,'#f4efe4');
  const cw=w/RT_COLS.length;let hl=null;
  RT_COLS.forEach((c,j)=>{const cx=x+j*cw, l=r?(r.fils||[]).filter(f=>f.col===c.k):[];if(j)R(ctx,cx,y+4,1,h-8,'#d9d2c3');
    atTxt(c.n+(r?' '+l.length:''),cx+cw/2,y+11,'#5a4636','bold 10px system-ui,sans-serif');
    l.slice(0,6).forEach((f,q)=>{const px=cx+cw/2-10+(q%2?6:-6), py=y+16+q*12;rtPostit(px,py,c.c,f.cur);if(f.cur)hl={x:px+10,y:py+7};});});
  atHitRt('board',x,y,w,h,{i:z.i});
  return hl;
}
function rtLate(people,f,y){people.push([{pos:{x:0,y:y==null?1e6:y}},null,false,f]);}
const rtPill=(p,s,x,y)=>atPill(atPosteLbl(p,['run','err','gate'].includes(s)),x,y,{run:'#2f6fd6',ok:'#2f7a45',err:'#a8323a',gate:'#8a5a00'}[s]||'#f4efe4',s?'#fff':'#3a3530','bold 11px system-ui,sans-serif');
// ---------- un bureau ----------
function rtRoom(r,i,now,people){
  const z=RT_G[i], T=AT_TS, lv=RT_MEM.leaving[i];
  rtLate(people,()=>atPill('BUREAU '+(i+1),z.x0+38,z.y0+16,'#5a4636','#fff','bold 11px ui-monospace,Menlo,monospace'),1);
  const hl=rtBoard(z,r);
  atBelt(z.x0+.5*T,z.ry,z.w-T,.6*T,!!r,now,1);
  if(!r){ // libre : les bureaux éteints, personne
    RT_POSTES.forEach((p,j)=>{if(!p.gate)atDesk(z.pts[j].x,z.pts[j].y-6,false);});
    ctx.fillStyle='rgba(20,22,30,.35)';ctx.fillRect(z.x0+4,z.y0+4,z.w-8,z.h-8);
    if(!lv)rtLate(people,()=>atPill('libre',z.x0+z.w/2,z.y0+z.h/2+18,'#1c2440','#bfe6ff','bold 12px ui-monospace,Menlo,monospace'),1);
    if(lv&&lv.carton)rtLate(people,()=>{ctx.save();ctx.globalAlpha=lv.carton;atCarton(z.pts[RT_POSTES.length-1].x,z.ry+.2*T,null);ctx.restore();},z.ry+1);
    atHitRt('room',z.x0,z.y0,z.w,z.h,{i});return;
  }
  const cur=rtCur(r), boss=RT_MEM.boss, here=boss&&boss.target===i&&boss.arrived;
  rtLate(people,()=>{atPill('🛠 '+rtName(r),z.x0+z.w/2,z.y0+16,'#0b2a4a','#fff','bold 12px ui-monospace,Menlo,monospace');const w=rtWho(r);if(w)atTxt('de '+w,z.x0+z.w-12,z.y0+19,'#5a4636','bold 11px system-ui','right');},1);
  RT_POSTES.forEach((p,j)=>{const {x,y}=z.pts[j], s=rtState(r,p);
    if(p.gate){R(ctx,x-14,z.ry-20,3,20,'#8a8478');R(ctx,x+12,z.ry-20,3,20,'#8a8478');for(let q=0;q<4;q++)R(ctx,x-14+q*7,z.ry-20,7,5,q%2?'#1c1c1c':'#f2c230');
      if(s==='gate'&&!here)rtLate(people,()=>{if(REDUCED_MOTION||Math.floor(now/500)%2)atBadge(x,z.ry-34,'✋','#d08a10');
        if(boss&&boss.target!=null&&boss.target!==i)atPill('✋ en file : le boss est au bureau '+(boss.target+1),x,z.ry-56,'#8a5a00','#fff','bold 11px system-ui,sans-serif');},1e6);
      rtLate(people,()=>rtPill(p,s,x,z.ry+.6*T+12),1e6-2);atHitRt('agent',x-16,z.ry-40,32,48,{i,k:p.k});return;}
    const a=atWorker(i*7+j,x,y,'down',s==='err',p.n);if(!a)return;
    a._st={st:s==='run'?'work':s==='err'?'error':'idle'};a.pose='type';
    const desk=()=>atDesk(x,y-6,s==='run'||s==='err',s==='err'?'#ff9a8a':null);
    if(!s){people.push([{pos:{x,y}},null,false,()=>{const g=atLayer();atDrawInto(g,a,now);rtCap(g,x,y,'down');ctx.save();ctx.globalAlpha=.38;ctx.filter='grayscale(1)';ctx.drawImage(AT_OFF,0,0);ctx.restore();desk();}]);}
    else{if(s==='run'){const gl=ctx.createRadialGradient(x,y-24,4,x,y-24,46);gl.addColorStop(0,'rgba(255,246,190,.6)');gl.addColorStop(1,'rgba(255,246,190,0)');ctx.fillStyle=gl;ctx.fillRect(x-48,y-72,96,96);RT_LIT.push({x,y});}
      people.push([a,null,false,()=>{rtCap(ctx,x,y,'down');desk();
        if(s==='ok')atBadge(x+16,y-50,'✓','#2f9e55');
        if(s==='err'){atBadge(x+16,y-50,'!','#d0392b');atSmoke(x,y-30,now);}
        if(cur===p&&s!=='gate')atBubble(x,y-66,rtBubble(r,p));}]);}
    rtLate(people,()=>rtPill(p,s,x,z.ry+.6*T+12),1e6-2);
    atHitRt('agent',x-16,y-56,32,60,{i,k:p.k});
  });
  // la PR : son carton devant le poste en cours (il apparaît quand Bernard la pose)
  const ar=RT_MEM.seen[r.run], fade=ar&&ar.fade!=null?ar.fade:1, ci=cur?RT_POSTES.indexOf(cur):RT_POSTES.length-1;
  if(fade>0)rtLate(people,()=>{ctx.save();ctx.globalAlpha=fade;const cx=z.pts[ci].x;atCarton(cx,z.ry+.2*T,null);RT_COLS.slice(1,4).forEach((c,q)=>R(ctx,cx-11+q*8,z.ry+.2*T-16,6,5,c.c));ctx.restore();},z.ry+1);
  // le fil rouge : du post-it en cours à l'agent de la correction qui le traite
  const fx=RT_POSTES.findIndex(p=>p.k==='fix');
  if(hl&&rtState(r,RT_POSTES[fx])==='run'){const a={x:z.pts[fx].x,y:z.pts[fx].y-40};rtLate(people,()=>{ctx.save();ctx.strokeStyle='#c0392b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hl.x,hl.y);
    ctx.quadraticCurveTo((hl.x+a.x)/2+30,(hl.y+a.y)/2,a.x,a.y);ctx.stroke();ctx.restore();for(const q of [hl,a]){ctx.fillStyle='#d0392b';ctx.beginPath();ctx.arc(q.x,q.y,4,0,7);ctx.fill();}},1e6-1);}
  atHitRt('room',z.x0,z.y0,z.w,z.h,{i});
}
function rtBubble(r,p){
  const f=(r.fils||[]).find(x=>x.cur), n=(r.fils||[]).length, k=(r.fils||[]).findIndex(x=>x.cur)+1;
  if(p.k==='fix')return f?'fil '+k+'/'+n+' : '+clip(f.text||f.path||'',26):'je corrige les fils…';
  return {prepare:'je récupère les fils…',check:'je lance les contrôles…',diff:'je prépare le diff…',push:'je pousse et je réponds'}[p.k]||'au travail…';
}
// ---------- le couloir : le bureau du boss, la file des PR, le café, le banc, la porte de l'escalier ----------
function rtHall(slots,now,people){
  const T=AT_TS, y=(RT_HALL[0]+RT_HALL[1])/2*T, q=(RETOURS&&RETOURS.queue)||[], free=slots.filter(x=>!x).length;
  for(let k=0;k<Math.min(3,q.length);k++)atCarton(1.4*T+k*34,y+10,null);
  if(q.length)rtLate(people,()=>atPill('📥 '+plural(q.length,'PR attend','PR attendent')+' un bureau',1.4*T+150,y+8,'#1c2440','#bfe6ff','bold 11px system-ui,sans-serif'),1e6);
  atHitRt('queue',.6*T,y-20,4*T,40,{});
  atCoffee(20*T,y+18);atPlant(17.6*T,y+20);atPlant(26*T,y+20);
  // le banc, comme au 1er : ceux des bureaux libres s'y assoient (descendus dans l'assise, qui leur cache les jambes)
  const bx=9*T, by=RT_HALL[1]*T-6;atSofa(bx,by);
  const sit=Math.min(2,free);for(let k=0;k<sit;k++){const x=bx+(k?22:-22), a=atWorker(60+k,x,by+9,'down',false,'');if(!a)continue;a._st={st:'idle'};a.pose='stand';
    people.push([a,null,false,()=>{rtCap(ctx,x,by+9,'down');if(k===sit-1)atSofaFront(bx,by);}]);}
  if(!sit)rtLate(people,()=>atSofaFront(bx,by),by+10);
  rtLate(people,()=>atPill('⇅ escalier · RDC',46*T-74,RT_STAIR.y+RT_STAIR.h+22,'#5a4636','#fff','bold 11px ui-monospace,Menlo,monospace'),1e6);
}
// ---------- le boss : à son bureau, ou à la barrière ✋ du bureau qui attend depuis le plus longtemps ----------
function rtBoss(slots,now,dt,people){
  const boss=chars.find(c=>c.boss), {x:ox,y:F}=RT_DESK;
  atBossChair(ox,F); // le bureau du RDC, dans le couloir
  if(!boss){rtLate(people,()=>atBossDesk(ox,F,now,null),F);return;}
  const target=rtGateTarget(slots);let m=RT_MEM.boss;
  if(!m||REDUCED_MOTION&&m.target!==target){const p=target==null?rtHome():RT_G[target].gate;m=RT_MEM.boss={target,walk:atWalker([p]),arrived:true};}
  if(m.target!==target){const prev=m.arrived||m.target!=null?m.target:null;m.target=target;m.walk=atWalker(rtBossPath(m.walk.pos,target,prev),95);}
  m.arrived=atStep(m.walk,dt);
  const p=m.walk.pos;
  // rien ne l'attend : assis à son bureau, comme au RDC ; sinon debout, en route ou à la barrière
  if(m.arrived&&target==null)people.push([atSeatedBoss(boss,ox,F,'idle'),null,false,()=>atBossDesk(ox,F,now,boss)]);
  else{rtLate(people,()=>atBossDesk(ox,F,now,boss),F);
    const dir=m.arrived?(RT_G[target].top?'up':'down'):m.walk.dir;
    const c=Object.assign(Object.create(Object.getPrototypeOf(boss)),boss,{pos:{x:p.x,y:p.y},tile:null,dir,moving:!m.arrived,pose:'stand',present:true,_st:{st:'gate'}});
    people.push([c,null,false,()=>{if(m.arrived&&target!=null)atBubble(p.x,p.y-66,'✋ '+rtName(slots[target])+' : je valide ?','#8a5a00');}]);}
  RT_LIT.push(p);atHitRt('boss',p.x-16,p.y-56,32,60,{});
}
// ---------- Bernard : il monte une PR par l'escalier jusqu'à son bureau, et la redescend une fois poussée ----------
const RT_BERNARD_V=110;
function rtScenes(now,dt,people){
  for(const s of RT_MEM.scenes){
    if(!s.w){const g=RT_G[s.i];s.w=atWalker(s.kind==='arrive'?[RT_STAIRS,{x:RT_STAIRS.x,y:RT_LANE},{x:g.door.x,y:RT_LANE},{x:g.door.x,y:g.top?g.y0+g.h-12:g.y0+12}]
      :[RT_STAIRS,{x:RT_STAIRS.x,y:RT_LANE},{x:g.door.x,y:RT_LANE},{x:g.door.x,y:g.top?g.y0+g.h-12:g.y0+12}],RT_BERNARD_V);s.phase='go';}
    const done=atStep(s.w,dt);
    if(done&&s.phase==='go'){s.phase='hand';s.t1=now;}
    if(s.phase==='hand'){const u=Math.min(1,(now-s.t1)/900), seen=s.kind==='arrive'?RT_MEM.seen[s.run]:null;
      if(seen)seen.fade=u;if(s.kind==='exit'&&RT_MEM.leaving[s.i])RT_MEM.leaving[s.i].carton=1-u;
      if(u>=1){s.phase='back';s.w=atWalker([{...s.w.pos},{x:s.w.pos.x,y:RT_LANE},{x:RT_STAIRS.x,y:RT_LANE},RT_STAIRS],RT_BERNARD_V);if(s.kind==='exit')RT_MEM.leaving[s.i]=null;}}
    if(s.phase==='back'&&atStep(s.w,dt))s.gone=true;
    const load=s.kind==='arrive'?s.phase==='go':s.phase==='back', b=atBernard(s.w.pos,s.w.dir,s.phase!=='hand');
    if(!s.gone)people.push([b,()=>atJack(s.w.pos.x,s.w.pos.y,s.w.dir,load),false,null]);
  }
  RT_MEM.scenes=RT_MEM.scenes.filter(s=>!s.gone);
}
// compare l'étage à ce qu'on a vu : une PR arrive (Bernard la monte), une PR part (il la redescend)
function rtDiff(now){
  const live=new Set(rtRooms().map(r=>r.run)), fresh=RT_MEM.fresh||REDUCED_MOTION, seen=RT_MEM.seen, slots=rtSlots();
  for(const [run,prev] of Object.entries(seen)){if(live.has(run))continue;delete seen[run];
    if(!fresh&&!RT_MEM.leaving[prev.i]){RT_MEM.leaving[prev.i]={carton:1};RT_MEM.scenes.push({kind:'exit',i:prev.i,t0:now});}}
  slots.forEach((r,i)=>{if(!r||seen[r.run])return;seen[r.run]={i,fade:fresh?1:0};if(!fresh)RT_MEM.scenes.push({kind:'arrive',i,run:r.run,t0:now});});
  RT_MEM.fresh=false;
}
// ---------- la nuit, comme au RDC (floorNight) : chaque bureau occupé s'allume ; la lampe du bureau du boss reste allumée ;
// hors des heures de bureau, la veilleuse ----------
const RT_NIGHT={};
function rtNight(slots,people,now){
  const T_=AT_TS, rooms=RT_G.map((z,i)=>[Math.round(z.x0/T_),Math.round(z.y0/T_),Math.round((z.x0+z.w)/T_)-1,Math.round((z.y0+z.h)/T_)-1,!!slots[i]]);
  floorNight(RT_NIGHT,{rooms,closed:!atOpen(),track:RT_LIT,spots:[...floorPeopleSpots(people),...RT_LIT.map(q=>({x:q.x,y:q.y-26,r:42,a:.95})),
    floorBossLamp(RT_DESK.x,RT_DESK.y),{x:46*T_-20,y:RT_LANE,r:1.6*T_,a:.45},exitHalo(RT_EXIT.x,RT_EXIT.y)]},now); // la porte de l'escalier
  if(RT_NIGHT.lv)exitSign(RT_EXIT.x,RT_EXIT.y);
}
// ---------- l'image ----------
const rtSig=()=>rtRooms().map(r=>r.run).join('|');
function renderRetours(now){
  const dt=(RT_MEM.last?Math.min(.1,(now-RT_MEM.last)/1000):0)*(typeof walkBoost==='function'?walkBoost():1);RT_MEM.last=now;
  if(!RT_BG)RT_BG=rtBackground();
  ctx.drawImage(RT_BG,0,0);atWindows(now,RT_WINDOWS);RT_HITS=[];RT_LIT=[];
  const live=rtLive(), jump=RT_MEM.lastT!=null&&(Math.abs(T-RT_MEM.lastT)>120e3||live!==RT_MEM.live);
  if(jump){RT_MEM.fresh=true;RT_MEM.scenes=[];RT_MEM.leaving=Array(RT_N).fill(null);RT_MEM.seen={};}
  RT_MEM.lastT=T;RT_MEM.live=live;
  const sig=rtSig();if(RT_MEM.sig!==sig||RT_MEM.fresh){RT_MEM.sig=sig;rtDiff(now);}
  const slots=rtSlots(), people=[];
  slots.forEach((r,i)=>rtRoom(r,i,now,people));
  rtHall(slots,now,people);rtBoss(slots,now,dt,people);rtScenes(now,dt,people);
  people.sort((a,b)=>a[0].pos.y-b[0].pos.y).forEach(([c,d,before,after])=>{if(d)d();if(c.sprite)drawChar(c,now);if(after)after();});
  stairDoor(RT_STAIR,people.map(q=>q[0].pos));
  rtNight(slots,people,now);
  if(RTSEL!=null){const i=slots.findIndex(r=>r&&r.run===RTSEL);if(i>=0){const z=RT_G[i];ctx.save();ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.lineDashOffset=-now/60;ctx.strokeRect(z.x0+3,z.y0+3,z.w-6,z.h-6);ctx.restore();}}
  const b=chars.find(c=>c.boss);if(b&&sel===b.key&&RT_MEM.boss)selHalo(RT_MEM.boss.walk.pos.x,RT_MEM.boss.walk.pos.y-26,AT_W,AT_H);
  atReplayPill();
}
function atHitRt(kind,x,y,w,h,ref){RT_HITS.push({kind,x,y,w,h,...ref});}
function rtHitAt(e){
  const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width, my=(e.clientY-r.top)*AT_H/r.height, inn=h=>mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h;
  for(let k=RT_HITS.length-1;k>=0;k--)if(RT_HITS[k].kind!=='room'&&inn(RT_HITS[k]))return RT_HITS[k];
  for(let k=RT_HITS.length-1;k>=0;k--)if(inn(RT_HITS[k]))return RT_HITS[k];
  return null;
}
// ---------- clic et survol ----------
function retoursClick(e){
  const h=rtHitAt(e);sel=null;SEL_BACK=[];
  if(h&&h.kind==='boss'){const b=chars.find(c=>c.boss);if(b){RTSEL=null;select(b.key);return;}}
  const slots=rtSlots(), r=h&&h.i!=null?slots[h.i]:null;
  RTSEL=r?r.run:null;
  if(h&&h.kind==='board'&&r)rtKbOpen(r.run);
  renderSide(true);
}
function retoursHover(e){
  const h=rtHitAt(e), slots=rtSlots(), r=h&&h.i!=null?slots[h.i]:null;let s='';
  if(h&&h.kind==='agent'){const p=RT_POSTES.find(x=>x.k===h.k), st=r?rtState(r,p)||'wait':'wait';s=p.i+' '+p.n+' · bureau '+(h.i+1)+' · '+(p.gate?(st==='gate'?'les corrections t\'attendent : le boss vient valider':st==='ok'?'validé':'ta validation, avant le push'):r?RT_ST[st][1]:'bureau libre');}
  else if(h&&h.kind==='board')s=r?'Le Kanban des fils de '+rtName(r)+' : clic pour l\'ouvrir en grand':'Bureau '+(h.i+1)+' · libre';
  else if(h&&h.kind==='room')s=r?'Bureau '+(h.i+1)+' · '+rtName(r)+(r.title?' · '+r.title:'')+(rtWho(r)?' · de '+rtWho(r):''):'Bureau '+(h.i+1)+' · libre';
  else if(h&&h.kind==='boss')s=(chars.find(c=>c.boss)||{}).name+' : valide les corrections (✋), une PR à la fois ; clic : sa fiche, comme au RDC';
  else if(h&&h.kind==='queue'){const n=((RETOURS&&RETOURS.queue)||[]).length;s=n?plural(n,'PR attend','PR attendent')+' un bureau libre':'Aucune PR en attente';}
  cv.style.cursor=h&&h.kind!=='queue'?'pointer':'default';
  if(s){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';tip.textContent=s;}else tip.style.display='none';
}
// ---------- la fenêtre Kanban d'un bureau : les fils en colonnes, le fil choisi à droite ----------
function rtKbClose(){const d=document.getElementById('rtkb');if(d)d.remove();RT_KB=null;}
function rtKbOpen(run,fid){
  const r=rtSlots().find(x=>x&&x.run===run)||((RETOURS&&RETOURS.rooms)||[]).find(x=>x.run===run);if(!r)return;
  const cur=(r.fils||[]).find(f=>f.cur)||(r.fils||[])[0];RT_KB={run,fid:fid||(cur&&cur.id)};
  let d=document.getElementById('rtkb');
  if(!d){d=document.createElement('div');d.id='rtkb';d.className='rt-kb';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d||e.target.closest('.rt-x'))rtKbClose();const c=e.target.closest('[data-fil]');if(c&&RT_KB)rtKbOpen(RT_KB.run,c.dataset.fil);});}
  const f=(r.fils||[]).find(x=>x.id===RT_KB.fid), url=/^[\w.-]+\/[\w.-]+$/.test(String(r.repo||''))&&/^\d+$/.test(String(r.pr||''))?`https://github.com/${r.repo}/pull/${r.pr}/files`:null;
  d.innerHTML=`<div class="rt-kbw"><div class="rt-kbh"><b>🛠 ${esc(rtName(r))}</b>${r.title?' · '+esc(r.title):''}${rtWho(r)?' · de '+esc(rtWho(r)):''} · ${plural((r.fils||[]).length,'fil','fils')}<button class="rt-x" aria-label="Fermer">✕</button></div>
    <div class="at-bar">${RT_POSTES.map(p=>{const s=rtState(r,p);return `<i class="${s?RT_ST[s][0]:''}" title="${esc(p.n+' : '+RT_ST[s||'wait'][1])}"></i>`;}).join('')}</div>
    <div class="rt-kbb"><div class="rt-cols">${RT_COLS.map(c=>{const l=(r.fils||[]).filter(x=>x.col===c.k);return `<div class="rt-col"><h4>${esc(c.n)} · ${l.length}</h4>${l.map(x=>`<button class="rt-card${x.cur?' cur':''}${f&&x.id===f.id?' on':''}" data-fil="${esc(x.id)}" style="--c:${c.c}"><span class="mono">${esc(x.path||'')}${x.line?':'+x.line:''}</span><small>@${esc(x.who||'?')}</small>${esc(x.text||'')}</button>`).join('')}</div>`;}).join('')}</div>
    <div class="rt-det">${f?`<div class="mono">${esc(f.path||'')}${f.line?':'+f.line:''} · @${esc(f.who||'?')}</div><p>« ${esc(f.text||'')} »</p><p class="mut">${f.cur?'🛠 La correction traite ce fil en ce moment (le fil rouge sur le plan).':'Colonne : '+esc((RT_COLS.find(c=>c.k===f.col)||{}).n||'')}</p>`:'<p class="mut">Aucun fil.</p>'}
      ${url?`<a href="${url}" target="_blank" rel="noopener">↗ Ouvrir la PR sur GitHub</a>`:''}</div></div></div>`;
  const x=d.querySelector('.rt-x');if(x)x.focus({preventScroll:true});
}
addEventListener('keydown',e=>{if(e.key==='Escape'&&RT_KB)rtKbClose();});
// ---------- panneau : les bureaux, la file, les pannes, la fiche d'un bureau ----------
const rtBar=r=>'<div class="at-bar">'+RT_POSTES.map(p=>{const s=rtState(r,p);return `<i class="${s?RT_ST[s][0]:''}" title="${esc(p.n+' : '+RT_ST[s||'wait'][1])}"></i>`;}).join('')+'</div>';
function rtTag(r){const c=rtCur(r);return r.gate?'<span class="at-tag wait">✋ t\'attend</span>':c&&rtState(r,c)==='err'?`<span class="at-tag bloq">🧯 ${esc(c.n)}</span>`:c?`<span class="at-tag run">${c.i} ${esc(c.n)}</span>`:'';}
const rtCounts=r=>RT_COLS.map(c=>rtCount(r,c.k)?`${esc(c.n)} ${rtCount(r,c.k)}`:'').filter(Boolean).join(' · ');
function retoursListHtml(slots){
  const rooms=slots.map((r,i)=>r&&{...r,_b:i+1}).filter(Boolean), q=(RETOURS&&RETOURS.queue)||[], pn=(RETOURS&&RETOURS.pannes)||[];
  return `<h2 class="at-h">🛠 Retours de PR <span class="cnt">${rooms.length}/${RT_N}</span></h2>`+
    (rooms.length?rooms.map(r=>`<button class="at-room" data-run="${esc(r.run)}"><span class="at-top"><span><span class="mut">Bureau ${r._b}</span> · <b class="mono">${esc(rtName(r))}</b>${rtWho(r)?' · '+esc(rtWho(r)):''}</span>${rtTag(r)}</span>
      <span class="at-title">${esc(r.title||'')}</span>${rtBar(r)}<span class="mut">${esc(rtCounts(r)||'fils à venir')} · depuis ${esc(hm(ms(r.since)))}</span></button>`).join('')
      :'<div class="note">Aucune PR en correction : les bureaux sont éteints. « 🛠 Corriger » sur une PR qui a des retours la fait monter ici.</div>')+
    (q.length?`<h2 class="at-h">📥 En attente <span class="cnt">${q.length}</span></h2>`+q.map(x=>`<div class="at-q"><b class="mono">${esc(rtName(x))}</b> <span class="mut">depuis ${esc(hm(ms(x.since)))}</span></div>`).join(''):'')+
    (pn.length?`<h2 class="at-h">🧯 En panne <span class="cnt">${pn.length}</span></h2>`+pn.map(x=>`<div class="at-q"><b class="mono">${esc(rtName(x))}</b> <span class="mut">arrêtée à ${esc((RT_POSTES.find(p=>p.k===x.poste)||{n:x.poste||'?'}).n)} : relance « 🛠 Corriger »</span></div>`).join(''):'');
}
function retoursFicheHtml(r,i){
  return `<button class="at-back">‹ Les retours</button><h2 class="at-h">🛠 Bureau ${i+1} <span class="cnt mono">${esc(rtName(r))}</span></h2>
    <div class="at-title big">${esc(r.title||'')}</div>${rtWho(r)?`<div class="mut">PR de ${esc(rtWho(r))}</div>`:''}${rtBar(r)}<div class="at-gate"></div>
    <table class="at-t">${RT_POSTES.map(p=>{const s=rtState(r,p);return `<tr${rtCur(r)===p?' class="cur"':''}><td>${p.i} ${esc(p.n)}</td><td>${s?`<span class="dot" style="background:${{ok:'var(--ok)',run:'var(--info)',err:'var(--err)',gate:'var(--warn)'}[s]}"></span>${RT_ST[s][1]}`:'<span class="mut">à venir</span>'}</td></tr>`;}).join('')}</table>
    <div class="mut">${esc(rtCounts(r)||'Les fils arrivent avec la préparation.')}</div><button class="at-kb">🔍 Ouvrir le Kanban des fils</button>`;
}
const rtGateRun=r=>{if(!r.gate)return null;const g=GATES.find(x=>x.run===r.run);return {run:r.run,wf_name:g?g.wf_name:'Corriger les commentaires d\'une PR',_s:ms(r.since)};};
function drawRetoursSide(side){
  const boss=chars.find(c=>c.boss);
  if(sel!=null&&!(boss&&sel===boss.key)){setFloor(0);return;}
  if(sel!=null){drawSide(side);return;}
  const box=document.createElement('div');box.className='atelier';side.appendChild(box);
  const slots=rtSlots(), i=slots.findIndex(x=>x&&x.run===RTSEL), r=i>=0?slots[i]:null;
  if(r){box.innerHTML=retoursFicheHtml(r,i);box.querySelector('.at-back').addEventListener('click',()=>{RTSEL=null;renderSide(true);});
    box.querySelector('.at-kb').addEventListener('click',()=>rtKbOpen(r.run));
    const g=rtGateRun(r);if(g)gateCard(box.querySelector('.at-gate')||box,g,null);return;}
  box.innerHTML=retoursListHtml(slots);
  box.querySelectorAll('.at-room').forEach(b=>b.addEventListener('click',()=>{RTSEL=b.dataset.run;renderSide(true);}));
}
// ---------- mode TV : les bureaux à la place de « Qui fait quoi » ----------
function tvRetoursHtml(){
  const slots=rtSlots();
  return '<h2>Retours de PR</h2>'+slots.map((r,i)=>{
    if(!r)return `<div class="tw ag"><span class="wt"><span class="wn">Bureau ${i+1}<span class="ws">libre</span></span></span></div>`;
    const c=rtCur(r), st=r.gate?'gate':c&&rtState(r,c)==='err'?'error':'work';
    return `<div class="tw ag" style="--st:${ST_CSS[st]||'var(--idle)'}"><span class="wt"><span class="wn">Bureau ${i+1} · ${esc(rtName(r))}<span class="ws">${esc(r.gate?'t\'attend':c?c.i+' '+c.n:'')}</span></span>`+
      `<span class="ww">${esc(r.title||'')}${rtWho(r)?' · '+esc(rtWho(r)):''}</span>${rtBar(r)}</span></div>`;}).join('');
}
// ---------- la loupe (44-loupe.js) : une PR qui arrive, qui t'attend, qui part, un poste en panne ----------
function rtLoupeEvents(){
  const out=[], boss=chars.find(c=>c.boss), slots=rtSlots();
  const pt=(x,y)=>atPt(x,y,'','','x');
  const add=(k,id,label,pts)=>{pts[0].name=k==='rt_gate'?(boss?boss.name:'Le boss'):'Bernard';pts.forEach(p=>{p._st={st:k,label};});out.push({id:k+':'+id,kind:k,cs:pts});};
  for(const s of RT_MEM.scenes){const g=RT_G[s.i], r=slots[s.i];add(s.kind==='arrive'?'rt_arrive':'rt_exit',s.i+':'+s.t0,(s.kind==='arrive'?'🛠 Une PR monte au 3e : ':'📤 Poussée : Bernard redescend la PR · ')+(r&&s.kind==='arrive'?rtName(r):'bureau '+(s.i+1)),[pt(g.door.x,RT_LANE),pt(g.pts[0].x,g.ry)]);}
  slots.forEach((r,i)=>{if(!r)return;const g=RT_G[i];
    if(r.gate)add('rt_gate',r.run,'✋ Les corrections de '+rtName(r)+' t\'attendent',[pt(g.gate.x,g.gate.y),pt(g.pts[3].x,g.pts[3].y)]);
    if(Object.values(r.states||{}).includes('err'))add('rt_err',r.run,'🧯 Un poste en panne · '+rtName(r),[pt(g.pts[1].x,g.pts[1].y),pt(g.pts[3].x,g.pts[3].y)]);});
  return out;
}
// ---------- le RDC : les moments de l'étage dans le fil (70-kpis-feed.js) et ses PR dans ⌘K (64-search.js) ----------
function rtGoto(run){
  if(!retoursOn())return;
  if(FLOOR!==3)setFloor(3);
  RTSEL=rtSlots().some(r=>r&&r.run===run)?run:null;SIDE_FOLDED=false;renderSide(true);
  const st=document.querySelector('.stage');if(st)st.scrollIntoView({behavior:SCROLL_BEHAVIOR,block:'start'});
}
function rtFeedEvents(t){
  if(!retoursOn())return [];
  const out=[];
  for(const e of rtEvents()){const a=ms(e.t);if(!a||a<DAY0||a>t)continue;
    const pr=`<b class="mono">${esc(rtName(e))}</b>`, txt={arrive:`🛠 ${pr} monte au 3e : correction des retours`,gate:`✋ Les corrections de ${pr} t'attendent au 3e`,
      push:`📤 ${pr} : corrections poussées, réponses postées`,panne:`🧯 ${pr} : ${esc((RT_POSTES.find(p=>p.k===e.poste)||{n:e.poste||'?'}).n)} en panne au 3e`}[e.k];
    if(txt)out.push({t:a,rt:e.run,fl:3,ty:{arrive:'pr',push:'pr',gate:'toi'}[e.k]||'agents',team:false,txt});
  }
  return out;
}
function rtSearchRows(q){
  if(!retoursOn()||!RETOURS)return [];
  const out=[];
  rtSlots().forEach((r,i)=>{if(!r)return;const c=rtCur(r), txt=`bureau ${i+1} · ${r.gate?'✋ t\'attend':c?c.i+' '+c.n:''}${r.title?' · '+r.title:''}`;
    if(srHit(q,[rtName(r),r.repo,r.title,rtWho(r),c?c.n:''].join(' ')))out.push({g:'3e étage',k:rtName(r),txt,go:()=>rtGoto(r.run)});});
  return out;
}
// ---------- scènes de l'étage pour la galerie (46-gallery.js) ----------
// Chacune joue sur une copie du relevé (rendue à la fin de la démonstration) ; à toute heure, sans PR en cours : la démo
function rtDemo(mut){return s=>{const src=(RETOURS&&(RETOURS.rooms||[]).length)?RETOURS:retoursDemo(), d=JSON.parse(JSON.stringify(src));
  RETOURS=JSON.parse(JSON.stringify(d));rtReset();RT_MEM.sig=rtSig();rtDiff(performance.now()); // l'étage d'avant la scène, posé : la scène est ce qui change ensuite
  mut(d,new Date(s).toISOString(),s);RETOURS=d;};}
function rtGalleryScenes(){
  const fam='3e étage', ok=true, out=[];
  out.push({fam,ico:'🛠',n:'Une PR monte au 3e',d:'Bernard sort de la porte de l\'escalier avec la PR et la monte au premier bureau libre ; la préparation récupère les fils',w:'« 🛠 Corriger » sur une PR qui a des retours',ok,
    play:{len:25e3,speed:1,setup:rtDemo((d,at)=>{if(d.rooms.length>=RT_N)d.rooms.pop();d.rooms.push({run:'demo-fn',repo:'dm/site',pr:'2050',title:'Démonstration',author:'hollyflax',poste:'prepare',states:{prepare:'run'},since:at,fils:[]});})}});
  out.push({fam,ico:'📌',n:'Le Kanban avance',d:'La correction finit un fil : son post-it passe dans sa colonne, le fil rouge suit le suivant',w:'Chaque fil traité par l\'agent',ok,
    play:{len:12e3,speed:1,setup:rtDemo(d=>{const r=d.rooms.find(x=>x.poste==='fix');if(!r)return;const i=r.fils.findIndex(f=>f.cur);if(i<0)return;r.fils[i].cur=false;r.fils[i].col='corrige';const n=r.fils.find(f=>f.col==='a_traiter');if(n)n.cur=true;})}});
  out.push({fam,ico:'✋',n:'À toi de valider',d:'Le boss quitte son bureau du couloir et va à la barrière du bureau qui attend depuis le plus longtemps ; les autres attendent leur tour',w:'Les corrections attendent ta validation',ok,
    play:{len:20e3,speed:1,setup:rtDemo(d=>{for(const r of d.rooms)if(r.gate){r.gate=false;r.poste='diff';r.states={...r.states,gate:undefined,diff:'run'};}
      const r=d.rooms.find(x=>x.poste==='push')||d.rooms[0];if(r){r.gate=true;r.poste='gate';r.states={prepare:'ok',fix:'ok',check:'ok',diff:'ok',gate:'gate'};}})}});
  out.push({fam,ico:'📤',n:'La PR est poussée',d:'Corrections poussées, réponses postées : Bernard vient chercher la PR et la redescend, le bureau s\'éteint',w:'Tu valides les corrections',ok,
    play:{len:25e3,speed:1,setup:rtDemo(d=>{const k=d.rooms.findIndex(x=>x.poste==='push');if(k>=0)d.rooms.splice(k,1);else d.rooms.shift();})}});
  out.push({fam,ico:'🧯',n:'Contrôles rouges',d:'Les contrôles du dépôt échouent : le correctif est annulé (fumée), la PR attend une relance',w:'La commande de contrôle du dépôt échoue',ok,
    play:{len:12e3,speed:1,setup:rtDemo(d=>{const r=d.rooms.find(x=>x.poste==='fix');if(r){r.poste='check';r.states={prepare:'ok',fix:'ok',check:'err'};r.fils.forEach(f=>{f.cur=false;});}})}});
  out.push({fam,ico:'🌙',n:'Le soir au 3e',d:'Le soir et le week-end, comme au RDC : chaque bureau occupé s\'allume comme une pièce, les bureaux libres restent dans l\'ombre, la lampe du boss reste allumée',w:'Hors des heures de bureau',ok,
    play:{len:20e3,speed:60,setup:s=>{const n=parisMidnight(s)+22.5*36e5;T=n;SCENE_DEMO.e=n+20e3*60;}}});
  return out;
}
