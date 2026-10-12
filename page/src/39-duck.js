// ---------- le canard en plastique (méthode du canard) : il se promène dans tout le bureau, jour et nuit ----------
// Sa position est une fonction pure du temps (rejeu, même canard pour tout le monde à un instant donné) : à partir de
// minuit (heure du bureau), une suite tirée au sort pour la date de segments « marche vers une case libre (findPath),
// puis pause de 20 à 60 s ». Cases : marchables, hors places assises. Suite prolongée au besoin et gardée par jour.
// Un clic ouvre sa fiche (vue 'duck') : parler au canard (workflow « Le Bureau · parler au canard », un bouton par
// projet Kronn) et ses discussions (dataset gates : projects, ducks, publiés chaque minute par gates_snapshot.py).
const DUCK_STEP=1400; // ms par case : bien plus lent que les humains (95 px/s, trois cases par seconde)
const DUCK_PAUSE=[20e3,60e3];
const DUCK_WIKI='https://fr.wikipedia.org/wiki/M%C3%A9thode_du_canard_en_plastique';
let DUCK_DAY=null; // {d0, lay, r, cur, s, dir, cells, segs:[{a, b, pts, dir}]} : la journée en cours de calcul
let DUCK_PROJECTS=[], DUCKS=[]; // dataset gates : projets Kronn (« Sans projet » en tête), discussions du canard
function readDuckData(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.gates;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.projects)?{projects:d.projects,ducks:Array.isArray(d.ducks)?d.ducks:[]}:null;
  }catch(e){return null;}
}
// walkable() regarde si le plateau est fermé à l'instant T : on calcule la journée à midi de ce jour-là, quel que soit
// l'instant affiché, pour que la suite ne dépende que de la date
function duckWith(d0,fn){const t0=T;T=d0+12*3600e3;try{return fn();}finally{T=t0;}}
function duckDay(t){
  const d0=parisMidnight(t);
  if(DUCK_DAY&&DUCK_DAY.d0===d0&&DUCK_DAY.lay===LAYOUT)return DUCK_DAY;
  const r=rng(keySeed('duck')*7919+daySeed(t));
  const cells=duckWith(d0,()=>{const l=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(walkable(x,y)&&!seatTiles.has(x+','+y))l.push([x,y]);return l;});
  const cur=cells.length?cells[Math.floor(r()*cells.length)]:EXIT;
  return DUCK_DAY={d0,lay:LAYOUT,r,cur,s:d0,dir:'right',cells,segs:[]};
}
// prolonge la suite jusqu'à t : une marche (si la case tirée est accessible), puis une pause
function duckExtend(D,t){
  let n=0;
  duckWith(D.d0,()=>{
    while(D.s<=t&&n++<5000){
      if(D.cells.length){
        const g=D.cells[Math.floor(D.r()*D.cells.length)], path=findPath(D.cur[0],D.cur[1],g[0],g[1]);
        const last=path[path.length-1], first=path[0];
        // findPath rend [[gx, gy]] quand la case est inaccessible : pas de saut, le canard reste où il est
        if(path.length&&last[0]===g[0]&&last[1]===g[1]&&Math.abs(first[0]-D.cur[0])+Math.abs(first[1]-D.cur[1])===1){
          const pts=[D.cur,...path], d0=D.dir;
          for(let i=1;i<pts.length;i++)D.dir=duckDir(pts[i-1],pts[i]);
          D.segs.push({a:D.s,b:D.s+path.length*DUCK_STEP,pts,dir:d0});
          D.s+=path.length*DUCK_STEP;D.cur=g;
        }
      }
      const p=DUCK_PAUSE[0]+D.r()*(DUCK_PAUSE[1]-DUCK_PAUSE[0]);
      D.segs.push({a:D.s,b:D.s+p,pts:[D.cur],dir:D.dir});
      D.s+=p;
    }
  });
}
// sens d'un pas d'une case à la suivante : vers le bas du plan = de face, vers le haut = de dos
const duckDir=(a,b)=>b[0]>a[0]?'right':b[0]<a[0]?'left':b[1]>a[1]?'down':'up';
// {x, y (pixels, pieds), tile, dir ('left'|'right'|'down'|'up'), moving} à l'instant t
function duckWalk(t){
  const D=duckDay(t); duckExtend(D,t);
  const S=D.segs; if(!S.length)return null;
  let lo=0,hi=S.length-1;
  while(lo<hi){const m=(lo+hi+1)>>1;if(S[m].a<=t)lo=m;else hi=m-1;}
  const g=S[lo];
  if(g.pts.length===1||t<g.a){const c=tileCenter(g.pts[0][0],g.pts[0][1]);return {x:c.x,y:c.y,tile:g.pts[0],dir:g.dir,moving:false};}
  const f=Math.min(g.pts.length-1,(t-g.a)/DUCK_STEP), i=Math.min(g.pts.length-2,Math.floor(f)), k=f-i;
  const p0=g.pts[i], p1=g.pts[i+1], c0=tileCenter(p0[0],p0[1]), c1=tileCenter(p1[0],p1[1]);
  let dir=g.dir;
  for(let j=1;j<=i+1;j++)dir=duckDir(g.pts[j-1],g.pts[j]);
  return {x:c0.x+(c1.x-c0.x)*k,y:c0.y+(c1.y-c0.y)*k,tile:k<.5?p0:p1,dir,moving:true};
}
// le canard dessiné à la main (16 x 14 px) : de profil (tourné vers la droite, miroir pour la gauche), de face, de dos
const DUCK_ARTS={side:[
  '.........YYYY...',
  '........YYYYYY..',
  '........YYWYKY..',
  '........YYYYYYOO',
  '........YYYYYOOO',
  '.........YYYYY..',
  'Y.......YYYYY...',
  'YY....YYYYYYYY..',
  'YYYYYYYYWWYYYYY.',
  'YYYYYYYYYYYYYYY.',
  '.YYYYYYYYYYYYYY.',
  '.yYYYYYYYYYYYYy.',
  '..yyYYYYYYYYyy..',
  '....yyyyyyyy....'],
front:[
  '.....YYYYYY.....',
  '....YYYYYYYY....',
  '....YKWYYKWY....',
  '....YYOOOOYY....',
  '.....YYOOYY.....',
  '......YYYY......',
  '...YYYYYYYYYY...',
  '..YYYYYYYYYYYY..',
  '.yYYWWYYYYYYYYy.',
  '.yYYYYYYYYYYYYy.',
  '.yYYYYYYYYYYYYy.',
  '..yYYYYYYYYYYy..',
  '...yyYYYYYYyy...',
  '.....yyyyyy.....'],
back:[
  '.....YYYYYY.....',
  '....YYYYYYYY....',
  '....YWYYYYYY....',
  '....YYYYYYYY....',
  '.....yYYYYy.....',
  '......yyyy......',
  '...YYYYYYYYYY...',
  '..YYYYYYYYYYYY..',
  '.yYYYYYYYYYYYYy.',
  '.yYYYYYYYYYYYYy.',
  '.yYYYYYYYYYYYYy.',
  '..yYYYYYYYYYYy..',
  '...yyYYYYYYyy...',
  '.....yyYYyy.....']};
const DUCK_COL={Y:'#f5c518',y:'#d29b0c',O:'#f08a1c',K:'#1a1a1a',W:'#ffffff'};
// une discussion du canard attend ta réponse : en direct (pas en rejeu), il quitte sa promenade, marche jusqu'au bureau
// du boss et y attend avec un « ? » ; réponse donnée (awaiting retombe), il reprend sa promenade là où elle en est
let DUCK_CALL=null; // {since, pts:[[x,y]…]} : le chemin depuis là où il était quand l'attente a commencé
// où il attend : devant le bureau du boss, côté open space (là où les agents attendent leurs gates), sinon la première
// case libre et accessible autour de sa place ; jamais derrière le meuble, où il serait caché
function duckBossTile(){
  if(!BOSS_SEAT)return null;
  const [sx,sy]=BOSS_SEAT, desk=(LAYOUT.boss&&LAYOUT.boss.desk)||[], cand=[];
  const front=desk.map(([x,y])=>[x,y+1]).sort((a,b)=>Math.abs(a[0]-sx)-Math.abs(b[0]-sx));
  cand.push(...front);
  for(let r=1;r<=3;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))===r)cand.push([sx+dx,sy+dy]);
  return cand.find(([x,y])=>walkable(x,y)&&!seatTiles.has(x+','+y))||null;
}
function duckAt(t){
  const live=Math.abs(t-Date.now())<3*60e3, to=live&&DUCKS.some(d=>d.awaiting)?duckBossTile():null;
  if(!to){DUCK_CALL=null;return duckWalk(t);}
  if(!DUCK_CALL){
    const p=duckWalk(t), from=p?p.tile:to;
    DUCK_CALL={since:t,pts:[from,...(findPath(from[0],from[1],to[0],to[1])||[])]};
  }
  const P=DUCK_CALL.pts, f=Math.max(0,(t-DUCK_CALL.since)/DUCK_STEP);
  if(f>=P.length-1||P.length<2){const e=P[P.length-1],c=tileCenter(e[0],e[1]);return {x:c.x,y:c.y,tile:e,dir:'down',moving:false,call:true};}
  const i=Math.floor(f), k=f-i, c0=tileCenter(P[i][0],P[i][1]), c1=tileCenter(P[i+1][0],P[i+1][1]);
  return {x:c0.x+(c1.x-c0.x)*k,y:c0.y+(c1.y-c0.y)*k,tile:k<.5?P[i]:P[i+1],dir:duckDir(P[i],P[i+1]),moving:true,call:true};
}
let DUCK_POS=null; // dernière position dessinée (zone de clic)
const DUCK_SCALE=1.6; // plus grand que son dessin de 16 px : il se perdait sur la moquette, et ses accessoires doivent se lire (choix de Rémi)
const DUCK_K=DUCK_SCALE/1.3; // bulle, anneau et zone de clic, réglés à l'origine pour ×1,3
function drawDuck(now){
  const p=DUCK_POS; if(!p)return;
  const look=fxDuckLook(duckLook(T),now); drawDuckKids(now,look); // canard d'équipe (39-duckgame.js) : stade, accessoires, canetons
  const x=Math.round(p.x), y=Math.round(p.y)-4; // posé un peu au-dessus des pieds des humains : il est petit
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(x,y+1,7*DUCK_SCALE,2*DUCK_SCALE,0,0,7);ctx.fill();
  const w=p.moving?Math.sin(now/140):0; // dandinement : inclinaison et ±1 px
  ctx.save();ctx.translate(x,y+(p.moving&&w>0?-1:0));ctx.rotate(w*.14+fxDuckWobble(now));if(p.dir==='left')ctx.scale(-1,1);ctx.scale(DUCK_SCALE,DUCK_SCALE);
  ctx.drawImage(duckGameImg(p.dir==='down'?'front':p.dir==='up'?'back':'side',look.stage,look.acc),-12,-22);
  ctx.restore();
  if(look.stage==='dore')drawDuckSparkles(x,y,now);
  fxDrawKid(x-Math.round(14*DUCK_SCALE)*(p.dir==='left'?-1:1),y,now); // 43-fx.js : le caneton qui naît, juste derrière lui
  fxDrawDuck(x,y,now); // 43-fx.js : succès qui tombe, éclosion, « pouf »
  if(p.call&&!p.moving){ // il attend ta réponse : une bulle « ? » qui respire au-dessus de lui
    const by=y-Math.round(34*DUCK_K)+Math.round(Math.sin(now/400));
    ctx.fillStyle='#ffffff';ctx.strokeStyle='#c47f00';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-7,by,14,13,4);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-2,by+13);ctx.lineTo(x,by+17);ctx.lineTo(x+2,by+13);ctx.fill();
    ctx.fillStyle='#c47f00';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('?',x,by+10);ctx.textAlign='left';
  }else if(!fxDuckBusy()){ // sinon une flèche jaune qui flotte au-dessus de lui, pour le repérer sur le plan (pas pendant une scène : sa bulle la remplace)
    const ay=y-Math.round((look.acc.some(a=>DUCK_HEADS.includes(a))||look.stage==='detective'?20:14)*DUCK_SCALE)-12+Math.round(2*Math.sin(now/300));
    ctx.fillStyle='#f5c518';ctx.strokeStyle='#3a2a00';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x-5,ay);ctx.lineTo(x+5,ay);ctx.lineTo(x,ay+6);ctx.closePath();ctx.fill();ctx.stroke();
  }
  if(sel==='duck'||hoverKey==='duck'){ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y+1,12*DUCK_K,4*DUCK_K,0,0,7);ctx.stroke();}
}
// ---------- sa ligne dans le panneau (groupe « Et aussi ») ----------
// la pièce où il est : le libellé du plan posé dans la même pièce éclairée (light_rooms), sinon l'open space
function duckRoom(tile){
  const r=(LAYOUT.light_rooms||[]).find(([x0,y0,x1,y1])=>tile[0]>=x0&&tile[0]<=x1&&tile[1]>=y0&&tile[1]<=y1);
  const l=r&&(LAYOUT.labels||[]).find(({at:[x,y]})=>x>=r[0]&&x<=r[2]+1&&y>=r[1]&&y<=r[3]+1);
  return l?l.text.toLowerCase():'open space';
}
function duckStatus(){
  const p=DUCK_POS||duckAt(T); if(!p)return {txt:'au repos',col:'var(--idle)'};
  if(p.call)return {txt:p.moving?'vient te voir':'attend ta réponse',col:ST_CSS.ask};
  return {txt:(p.moving?'se promène':'halte')+' · '+duckRoom(p.tile),col:'var(--idle)'};
}
function duckRow(){
  const b=document.createElement('button');b.className='who';b.dataset.fid='who:duck';
  b.onclick=()=>select('duck');
  b.onmouseenter=b.onfocus=()=>{hoverKey='duck';};
  b.onmouseleave=b.onblur=()=>{if(hoverKey==='duck')hoverKey=null;};
  const p=document.createElement('canvas');p.width=40;p.height=40;const x=p.getContext('2d');x.imageSmoothingEnabled=false;
  const look=duckLook(T), pr=duckProgress(T);
  x.drawImage(duckGameImg('front',look.stage,look.acc),0,-2,40,40);p.style.width=p.style.height='36px';b.appendChild(p);
  const t=document.createElement('div');t.className='t';t.innerHTML=`<div class="n">🦆 Le canard</div><div class="r">${pr?esc(pr.stage.name):'Mascotte'}</div>`;b.appendChild(t);
  const st=duckStatus(), s=document.createElement('div');s.className='s';
  s.innerHTML=`<span class="dot" style="background:${st.col}"></span>${esc(st.txt)}`;b.appendChild(s);
  return b;
}
// survol, clic : le rectangle du canard dessiné
function duckHit(mx,my){const p=DUCK_POS;return !!p&&Math.abs(mx-p.x)<=12*DUCK_K&&my>=p.y-Math.round(22*DUCK_SCALE+16)&&my<=p.y;} // flèche comprise
// ---------- sa fiche ----------
// projet choisi pour parler au canard : retenu dans ce navigateur (confort ; « Sans projet » par défaut)
let DUCK_PROJECT='none';
function duckProject(id){
  if(id!==undefined){DUCK_PROJECT=id;try{localStorage.setItem('bureau:duckProject',id);}catch(e){}return id;}
  try{const v=localStorage.getItem('bureau:duckProject');if(v)DUCK_PROJECT=v;}catch(e){}
  return DUCK_PROJECT;
}
// questions des discussions du canard qui attendent ta réponse à t (aussi chez le boss, avec les autres)
const duckQuestions=t=>QUESTIONS.filter(q=>(ms(q.since)||0)<=t&&String(q.title||'').startsWith('🦆'));
function renderDuck(side){
  const h=document.createElement('h2');h.textContent='🦆 Le canard';side.appendChild(h);
  const intro=document.createElement('div');intro.className='note';intro.style.margin='0 0 12px';
  intro.innerHTML='Méthode du canard en plastique : expliquer son problème, pas à pas, à un canard qui écoute sans juger. '+
    'En le formulant, on trouve souvent la solution soi-même. Ici, il répond dans une discussion Kronn. '+
    `<a href="${DUCK_WIKI}" target="_blank" rel="noopener" style="color:var(--accent)">Wikipédia ↗</a>`;
  side.appendChild(intro);
  const qs=duckQuestions(T); if(qs.length)intro.style.margin='0 0 14px'; // 14 px jusqu'à la carte, comme jusqu'à un titre de groupe
  for(const q of qs)questionCard(side,q,null); // la carte de réponse, comme dans la fiche d'un visiteur
  renderDuckGame(side); // son sprint, ses canetons, ses trophées (39-duckgame.js)
  if(!TV){
    const box=foldSection(side,'duck-talk','Parler au canard',null,true);
    const note=t=>{const e=document.createElement('div');e.className='note';e.textContent=t;box.appendChild(e);};
    if(!ACTIONS.duck)note('Workflow « Le Bureau · parler au canard » non installé : python3 tools/publish.py workflows le crée.');
    else if(!DUCK_PROJECTS.length)note('Les projets arrivent au prochain passage du cron live (1 min au plus).');
    else{ // un sélecteur de projet et un seul bouton, dont la liaison suit le projet choisi
      let cur=DUCK_PROJECTS.find(p=>p.id===duckProject())||DUCK_PROJECTS[0];
      const sel=document.createElement('select');sel.className='duck-project';sel.dataset.fid='duck-project';sel.setAttribute('aria-label','Projet de la discussion');
      for(const p of DUCK_PROJECTS){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;o.selected=p===cur;sel.appendChild(o);}
      box.appendChild(sel);
      launchBlock(box,{action:'bureau-duck',bind:{id:cur.id},name:cur.name,sub:cur.id==='none'?'Discussion libre, hors de tout projet':'Discussion dans ce projet',
        label:'🦆 Parler au canard',title:'Parler au canard',done:'<b style="color:var(--ok)">✓ Discussion ouverte.</b> Elle apparaît ci-dessous d\'ici une minute.'});
      sel.onchange=()=>{
        cur=DUCK_PROJECTS.find(p=>p.id===sel.value)||cur;duckProject(cur.id);
        const host=box.querySelector('.relaunch'), b=host&&host.querySelector('[data-kronn-action="bureau-duck"]');
        if(b)b.setAttribute('data-kronn-bindings',JSON.stringify(bindsFor('bureau-duck',{id:cur.id})));
        if(host){host.querySelector('.rl-n').textContent=cur.name;host.querySelector('.rl-s').textContent=cur.id==='none'?'Discussion libre, hors de tout projet':'Discussion dans ce projet';}
      };
    }
  }
  const list=DUCKS.slice().sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||'')));
  const db=foldSection(side,'duck-discs','Ses discussions',list.length,true);
  if(!list.length){const e=document.createElement('div');e.className='empty';e.textContent='Personne ne lui a parlé ces 14 derniers jours.';db.appendChild(e);return;}
  const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
  for(const d of list){
    const li=document.createElement('li'), t=ms(d.updated);
    li.innerHTML=`<span class="dot" style="background:${d.awaiting?'var(--warn)':'var(--idle)'}"></span>`+
      `<span>${discLink(d.id,esc(String(d.title||'').replace(/^🦆\s*/,'')))}<br><small style="color:var(--muted)">${esc(d.project||'Sans projet')}${t?' · '+esc(fmtDay(t)):''}</small></span>`+
      `<span class="k">${d.awaiting?'<b style="color:var(--warn)">attend ta réponse</b>':''}</span>`;
    ul.appendChild(li);
  }
  db.appendChild(ul);
}
// « 14:05 » aujourd'hui, « lun. 5 oct. » avant
function fmtDay(t){
  const day=x=>dtf('en-CA',{}).format(new Date(x));
  return day(t)===day(T||Date.now())?hm(t):dtf('fr-FR',{weekday:'short',day:'numeric',month:'short'}).format(new Date(t));
}
