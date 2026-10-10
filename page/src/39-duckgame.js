// ---------- le canard d'équipe (KT-7) : il grandit avec le sprint, ses canetons, ses succès ----------
// Collectif seulement : rien par personne. Le cron « Le Bureau · canard » (duck_snapshot.py, dataset duck) publie la cible
// du sprint (moyenne des points terminés des 4 derniers sprints fermés), les sprints tenus (un caneton chacun) et les succès.
// Le stade se calcule ici, à l'instant affiché : points des tickets du sprint passés en terminé avant T, rapportés à la
// cible ; il suit donc le rejeu, et repart de l'œuf au sprint suivant (mue). Sans données, le canard reste un canard de bain.
let DUCKGAME=null;
function readDuckGame(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.duck;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&d.generated_at&&Array.isArray(d.sprints)?d:null;
  }catch(e){return null;}
}
const DUCK_STAGES=[{id:'oeuf',name:'Œuf',at:0},{id:'caneton',name:'Caneton',at:.25},{id:'bain',name:'Canard de bain',at:.5},
  {id:'detective',name:'Canard détective',at:.75},{id:'sage',name:'Canard sage',at:1},{id:'dore',name:'Canard doré',at:1.2}];
// succès collectifs et l'accessoire qu'ils lui font porter tant qu'ils sont gagnés (période : semaine, sprint, ou pour de bon)
const DUCK_TROPHIES=[
  {id:'zero_panne',name:'Zéro panne',what:'Aucun agent en panne de la semaine',acc:'lunettes'},
  {id:'leve_tot',name:'Lève-tôt',what:'Une mise en prod avant 11 h dans le sprint',acc:'casquette'},
  {id:'pas_reopen',name:'Pas un reopen',what:'Aucun ticket réouvert au sprint précédent',acc:'aureole'},
  {id:'relu_24h',name:'Relu dans la journée',what:'Toutes les PR de la semaine relues en moins de 24 h ouvrées',acc:'loupe'},
  {id:'bavard',name:'Bavard',what:'10 discussions avec le canard',acc:'cape'},
  {id:'triple',name:'Triplé',what:'3 sprints tenus d\'affilée',acc:'couronne'}];
const DUCK_HEADS=['couronne','aureole','casquette']; // un seul couvre-chef : le plus rare gagne, et il remplace le chapeau du détective
const DUCK_KIDS_MAX=6;
// démo : une équipe à 4 sprints tenus sur 8, canard détective (119 points sur 140), lunettes et loupe gagnées cette semaine
const DUCKGAME_DEMO={generated_at:'2026-10-01T09:23:00Z',sprint:{name:'26-39'},target:140,canetons:4,streak:2,
  sprints:[{name:'26-37',done:150,target:132,held:true},{name:'26-35',done:141,target:128,held:true},{name:'26-33',done:98,target:135,held:false},
    {name:'26-31',done:120,target:139,held:false},{name:'26-29',done:144,target:131,held:true},{name:'26-27',done:136,target:126,held:true},
    {name:'26-25',done:118,target:130,held:false},{name:'26-23',done:112,target:133,held:false}],
  trophies:{zero_panne:{ok:true,period:'sem. du 21 sept.',detail:'aucun agent en panne'},leve_tot:{ok:false,period:'26-39',detail:'pas encore de MEP avant 11h'},
    pas_reopen:{ok:false,period:'26-37',detail:'2 réouvertures'},relu_24h:{ok:true,period:'sem. du 21 sept.',progress:'9 / 9'},
    bavard:{ok:false,progress:'3 / 10'},triple:{ok:false,progress:'2 / 3'}},errors:[]};
// ---------- son allure : calques posés sur son dessin (toile 24 x 24, canard de base en 4, 8) ----------
const DG_PAL={caneton:{Y:'#ffe98a',y:'#e3c24a',O:'#f3a24a',K:'#1a1a1a',W:'#ffffff'},dore:{Y:'#f0b000',y:'#a06a00',O:'#e0661c',K:'#1a1a1a',W:'#fff6c0'}};
const DG_C={br:'#8a5a2b',br2:'#5e3a17',red:'#d8342c',red2:'#9e1f19',gold:'#ffcf33',gold2:'#b07d00',k:'#141414',kg:'#6a6a6a',wh:'#f4f4f4',gr:'#bdbdbd',
  halo:'#ffe45c',halo2:'#c99a00',blue:'#2f6fd6',glass:'#cfe3ff'};
const DG_LAYERS={ // [x, y, l, h, couleur] par vue
  detective:{front:[[7,6,10,2,'br'],[9,4,6,2,'br'],[10,5,1,1,'br2'],[13,5,1,1,'br2'],[6,7,1,2,'br2'],[17,7,1,2,'br2']],
    side:[[11,6,9,2,'br'],[12,4,6,2,'br'],[20,7,1,1,'br2'],[10,7,1,1,'br2'],[14,5,1,1,'br2']],
    back:[[7,6,10,2,'br'],[9,4,6,2,'br'],[11,5,2,1,'br2'],[6,7,1,2,'br2'],[17,7,1,2,'br2']]},
  sage:{front:[[9,9,2,1,'wh'],[13,9,2,1,'wh'],[9,13,6,2,'wh'],[10,15,4,1,'wh'],[11,16,2,1,'gr'],[9,13,1,1,'gr'],[14,13,1,1,'gr']],
    side:[[14,9,3,1,'wh'],[16,13,3,2,'wh'],[17,15,2,1,'wh'],[18,16,1,1,'gr']],back:[]},
  lunettes:{front:[[8,10,8,1,'k'],[8,11,3,1,'k'],[13,11,3,1,'k'],[9,10,1,1,'kg'],[14,10,1,1,'kg']],side:[[13,10,5,1,'k'],[15,11,3,1,'k'],[16,10,1,1,'kg']],back:[[8,10,8,1,'k']]},
  casquette:{front:[[9,5,6,1,'red'],[8,6,8,2,'red'],[7,8,10,1,'red2'],[11,6,2,1,'wh']],side:[[12,5,6,1,'red'],[11,6,8,2,'red'],[18,8,4,1,'red2']],
    back:[[9,5,6,1,'red'],[8,6,8,2,'red'],[11,8,2,1,'red2']]},
  couronne:{front:[[9,4,1,1,'gold'],[11,3,2,1,'gold'],[14,4,1,1,'gold'],[9,5,6,2,'gold'],[9,7,6,1,'gold2'],[11,5,2,1,'red']],
    side:[[13,4,1,1,'gold'],[16,4,1,1,'gold'],[13,5,4,2,'gold'],[13,7,4,1,'gold2'],[14,5,1,1,'red']],
    back:[[9,4,1,1,'gold'],[11,3,2,1,'gold'],[14,4,1,1,'gold'],[9,5,6,2,'gold'],[9,7,6,1,'gold2']]},
  aureole:{front:[[8,3,8,1,'halo'],[7,4,1,1,'halo2'],[16,4,1,1,'halo2'],[8,5,8,1,'halo2']],side:[[11,3,7,1,'halo'],[10,4,1,1,'halo2'],[18,4,1,1,'halo2'],[11,5,7,1,'halo2']],
    back:[[8,3,8,1,'halo'],[7,4,1,1,'halo2'],[16,4,1,1,'halo2'],[8,5,8,1,'halo2']]},
  cape:{front:[[4,14,2,7,'red'],[18,14,2,7,'red'],[8,13,8,1,'red2']],side:[[9,13,4,2,'red'],[5,15,5,5,'red'],[3,19,3,2,'red2']],
    back:[[6,14,12,7,'red'],[7,13,10,1,'red2'],[6,20,12,1,'red2']]},
  loupe:{front:[[19,15,3,1,'blue'],[18,16,1,2,'blue'],[22,16,1,2,'blue'],[19,18,3,1,'blue'],[19,16,3,2,'glass'],[20,19,1,3,'br']],
    side:[[19,14,3,1,'blue'],[18,15,1,2,'blue'],[22,15,1,2,'blue'],[19,17,3,1,'blue'],[19,15,3,2,'glass'],[17,18,2,1,'br'],[16,19,1,1,'br']],back:[[19,17,1,3,'br']]}};
const DG_BEHIND={cape:{front:1,side:1}}; // derrière le canard
const DG_EGG=['...WWWW...','..WWWWWW..','.WWWWYWWW.','.WWWWWWWW.','WWYWWWWWWW','WWWWWWWKWW','WWWWWWKWKW','WWWWWKWWWW','WWWWWWWWYW','.WWWWWWWW.','..WWWWWW..','...wwww...'];
const DG_IMG={};
function dgPaint(g,rows,pal,ox,oy){rows.forEach((row,j)=>[...row].forEach((ch,i)=>{if(pal[ch]){g.fillStyle=pal[ch];g.fillRect(ox+i,oy+j,1,1);}}));}
function dgLayer(g,name,view){for(const [x,y,w,h,c] of DG_LAYERS[name][view]){g.fillStyle=DG_C[c];g.fillRect(x,y,w,h);}}
// son dessin pour une vue (front, side, back), un stade et des accessoires : toile 24 x 24, pieds en bas au centre
function duckGameImg(view,stage,acc){
  acc=acc||[];const k=view+'|'+stage+'|'+acc.join(',');if(DG_IMG[k])return DG_IMG[k];
  const c=document.createElement('canvas');c.width=c.height=24;const g=c.getContext('2d');
  if(stage==='oeuf'){dgPaint(g,DG_EGG,{W:'#fff4d6',w:'#d9c49a',Y:'#f5c518',K:'#b39a68'},7,10);return DG_IMG[k]=c;}
  const head=acc.some(a=>DUCK_HEADS.includes(a));
  if(stage==='caneton'){ // plus petit, une houppette ; ses accessoires (choix de Rémi : réduits avec lui, pixels nets)
    const t=document.createElement('canvas');t.width=t.height=24;const f=t.getContext('2d');
    for(const a of acc)if(DG_BEHIND[a]&&DG_BEHIND[a][view])dgLayer(f,a,view);
    dgPaint(f,DUCK_ARTS[view],DG_PAL.caneton,4,8);
    for(const a of acc)if(!(DG_BEHIND[a]&&DG_BEHIND[a][view]))dgLayer(f,a,view);
    g.imageSmoothingEnabled=false;g.drawImage(t,0,0,24,24,4.25,7.5,16.5,16.5);
    if(!head){g.fillStyle=DG_PAL.caneton.y;g.fillRect(12,12,1,1);g.fillRect(13,11,1,1);}
    return DG_IMG[k]=c;
  }
  const L=[...(stage==='detective'&&!head?['detective']:[]),...(stage==='sage'?['sage']:[]),...acc];
  for(const a of L)if(DG_BEHIND[a]&&DG_BEHIND[a][view])dgLayer(g,a,view);
  dgPaint(g,DUCK_ARTS[view],DG_PAL[stage]||DUCK_COL,4,8);
  if(stage==='dore'){g.fillStyle='#fff6c0';g.fillRect(6,16,1,1);g.fillRect(8,18,1,1);g.fillRect(10,9,1,1);}
  for(const a of L)if(!(DG_BEHIND[a]&&DG_BEHIND[a][view]))dgLayer(g,a,view);
  return DG_IMG[k]=c;
}
// ---------- où il en est, à l'instant t ----------
function duckPts(t){
  if(!TEAM)return 0;
  const all=[...TEAM.people.flatMap(p=>p.tickets||[]),...(TEAM.unassigned||[])];
  return all.filter(x=>x.cat==='done'&&(!x.since||ms(x.since)<=t)).reduce((a,x)=>a+(+x.points||0),0);
}
function duckProgress(t){
  const D=DUCKGAME; if(!D||!D.target||!TEAM)return null;
  const pts=duckPts(t), pct=pts/D.target;
  let i=0;DUCK_STAGES.forEach((s,k)=>{if(pct>=s.at)i=k;});
  return {pts,target:D.target,pct,stage:DUCK_STAGES[i],next:DUCK_STAGES[i+1]||null};
}
function duckWorn(t){ // un succès daté (at) ne se porte qu'à partir de sa date : il suit le rejeu
  const T_=(DUCKGAME&&DUCKGAME.trophies)||{}, won=DUCK_TROPHIES.filter(x=>T_[x.id]&&T_[x.id].ok&&!(T_[x.id].at&&ms(T_[x.id].at)>t)).map(x=>x.acc);
  const head=DUCK_HEADS.find(a=>won.includes(a));
  return won.filter(a=>!DUCK_HEADS.includes(a)||a===head);
}
// allure : stade, accessoires (pas sur l'œuf), canetons ; sans données, le canard de bain d'avant
function duckLook(t){
  const p=duckProgress(t); if(!p)return {stage:'bain',acc:[],kids:0};
  return {stage:p.stage.id,acc:p.stage.id==='oeuf'?[]:duckWorn(t),kids:DUCKGAME.canetons||0};
}
// ---------- sur le plan : la file des canetons derrière lui (là où il était quelques pas plus tôt, plus loin s'ils sont grands) ----------
function drawDuckKids(now,look){
  const n=Math.min(DUCK_KIDS_MAX,look.kids); if(!DUCK_POS)return;
  const at=i=>(DUCK_POS.call?null:duckWalk(T-i*.9*DUCK_SCALE*DUCK_STEP))||{x:DUCK_POS.x-i*TS*.6*DUCK_SCALE,y:DUCK_POS.y,dir:DUCK_POS.dir,moving:false};
  for(let i=n;i>=1;i--){
    const q=at(i);
    const x=Math.round(q.x), y=Math.round(q.y)-4, w=q.moving?Math.sin(now/120+i):0;
    ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(x,y+1,4*DUCK_SCALE,1.2*DUCK_SCALE,0,0,7);ctx.fill();
    ctx.save();ctx.translate(x,y+(q.moving&&w>0?-1:0));ctx.rotate(w*.12);if(q.dir==='left')ctx.scale(-1,1);ctx.scale(DUCK_SCALE,DUCK_SCALE);
    ctx.drawImage(duckGameImg(q.dir==='down'?'front':q.dir==='up'?'back':'side','caneton'),-12,-22);ctx.restore();
    if(i===n&&look.kids>DUCK_KIDS_MAX){ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillStyle='#3a2a00';ctx.fillText('×'+look.kids,x,y-Math.round(11*DUCK_SCALE));ctx.textAlign='left';}
  }
}
function drawDuckSparkles(x,y,now){
  for(let i=0;i<4;i++){const a=(Math.sin(now/250+i*2)+1)/2;if(a<.4)continue;
    const sx=x+[-11,10,-6,8][i], sy=y-[22,16,6,26][i];ctx.fillStyle=`rgba(255,240,150,${a})`;ctx.fillRect(sx-1,sy,3,1);ctx.fillRect(sx,sy-1,1,3);}
}
// ---------- loupe : il change de stade, un caneton naît (premières heures d'un sprint qui suit un sprint tenu) ----------
const DUCK_LOUPE_CHAR={key:'duck',name:'Le canard',get pos(){return DUCK_POS&&{x:DUCK_POS.x,y:DUCK_POS.y};},get moving(){return !!(DUCK_POS&&DUCK_POS.moving);},_st:{st:'duck',label:''}};
const DUCK_HATCH_CHAR={key:'duck',name:'Le canard',get pos(){return DUCK_POS&&{x:DUCK_POS.x,y:DUCK_POS.y};},get moving(){return !!(DUCK_POS&&DUCK_POS.moving);},_st:{st:'hatch',label:''}};
function duckLoupeEvents(t){
  const out=[], p=duckProgress(t); if(!p||!DUCK_POS)return out;
  const sp=(TEAM&&TEAM.sprint)||{};
  DUCK_LOUPE_CHAR._st.label=p.stage.id==='oeuf'?'Nouveau sprint : il mue et repart de l\'œuf':'Devient '+p.stage.name.toLowerCase()+' · '+Math.round(p.pct*100)+' % de la cible';
  out.push({id:'duck:'+(sp.name||'')+':'+p.stage.id,kind:'duck',cs:[DUCK_LOUPE_CHAR]});
  const last=DUCKGAME.sprints[0], st=ms(sp.start);
  if(last&&last.held&&st&&t>=st&&t<st+2*3600e3&&DUCKGAME.sprint&&DUCKGAME.sprint.name===sp.name){
    DUCK_HATCH_CHAR._st.label='Un caneton est né : le sprint '+last.name+' est tenu ('+DUCKGAME.canetons+' en tout)';
    out.push({id:'hatch:'+sp.name,kind:'hatch',cs:[DUCK_HATCH_CHAR]});
  }
  const T_=DUCKGAME.trophies||{};
  for(const x of DUCK_TROPHIES){const s=T_[x.id];if(s&&s.ok&&s.at&&ms(s.at)<=t&&t-ms(s.at)<FX_WIN){
    const c={...DUCK_LOUPE_CHAR,_st:{st:'trophy',label:'Succès débloqué : '+x.name+(s.detail&&!/^aucun/.test(s.detail)?' · '+s.detail:'')}};
    Object.defineProperties(c,{pos:{get:()=>DUCK_POS&&{x:DUCK_POS.x,y:DUCK_POS.y}},moving:{get:()=>!!(DUCK_POS&&DUCK_POS.moving)}});
    out.push({id:'trophy:'+x.id+':'+s.at,kind:'trophy',cs:[c]});}}
  return out;
}
// ---------- sa fiche : « Son sprint » et « Ses trophées » ----------
function dgPix(c,size){const k=document.createElement('canvas');k.width=k.height=size;const g=k.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(c,0,0,size,size);
  k.className='dg-pix';k.style.width=k.style.height=size+'px';return k;}
function renderDuckGame(side){
  const D=DUCKGAME, p=duckProgress(T); if(!D)return;
  const box=foldSection(side,'duck-sprint','Son sprint',null,true);
  if(p){
    const look=duckLook(T), top=document.createElement('div');top.className='dg-top';
    top.appendChild(dgPix(duckGameImg('front',look.stage,look.acc),72));
    const t=document.createElement('div');t.className='dg-txt';
    const marks=DUCK_STAGES.slice(1).map(s=>`<i style="left:${s.at/1.2*100}%" title="${esc(s.name)}"></i>`).join('');
    t.innerHTML=`<div class="dg-name">${esc(p.stage.name)}</div>`+
      `<div class="note">Sprint ${esc((TEAM.sprint||{}).name||'')} · <b>${fmtPts(p.pts)} / ${fmtPts(Math.round(p.target))} pts</b> déployés, ${Math.round(p.pct*100)} % de la cible</div>`+
      `<div class="dg-bar" title="Cible : moyenne des points terminés des 4 derniers sprints"><b style="width:${Math.min(100,p.pct/1.2*100)}%"></b>${marks}</div>`+
      `<div class="note">${p.next?`${esc(p.next.name)} à ${Math.round(p.next.at*100)} %`:'Stade le plus haut'} · repart de l'œuf au prochain sprint</div>`;
    top.appendChild(t);box.appendChild(top);
    const st=document.createElement('div');st.className='dg-stages';
    DUCK_STAGES.forEach(s=>{const d=document.createElement('div');d.className='dg-st'+(s.id===p.stage.id?' cur':s.at<=p.pct?'':' off');d.title=s.name;
      d.appendChild(dgPix(duckGameImg('front',s.id),36));d.appendChild(Object.assign(document.createElement('span'),{textContent:Math.round(s.at*100)+' %'}));st.appendChild(d);});
    box.appendChild(st);
  }else{const e=document.createElement('div');e.className='note';e.textContent='Le stade arrive avec les tickets du sprint (cron équipe).';box.appendChild(e);}
  const held=D.sprints.filter(s=>s.held), kids=document.createElement('div');kids.className='dg-kids';
  const pts=v=>fmtPts(Math.round(+v||0));
  for(const s of held.slice(0,DUCK_KIDS_MAX)){const k=dgPix(duckGameImg('side','caneton'),28);k.title=`${s.name} : ${pts(s.done)} pts, moyenne des 4 sprints d'avant ${pts(s.target)}`;kids.appendChild(k);}
  kids.appendChild(Object.assign(document.createElement('div'),{className:'note',
    innerHTML:held.length?`<b>${held.length} caneton${held.length>1?'s':''}</b> : un par sprint où l'équipe a fait mieux que sa moyenne des 4 sprints d'avant. ${held.length} sur les ${D.sprints.length} derniers : ${esc(held.map(s=>s.name).join(', '))}.`
      :`Pas encore de caneton : il en naît un à chaque sprint où l'équipe fait mieux que sa moyenne des 4 sprints d'avant.`}));
  box.appendChild(kids);
  const T_=D.trophies||{}, n=DUCK_TROPHIES.filter(x=>T_[x.id]&&T_[x.id].ok).length;
  const tb=foldSection(side,'duck-trophies','Ses trophées',n+' / '+DUCK_TROPHIES.length,true);
  const gr=document.createElement('div');gr.className='dg-troph';
  for(const x of DUCK_TROPHIES){
    const s=T_[x.id]||{}, soon=s.ok&&s.at&&ms(s.at)>T, c=document.createElement('div');c.className='dg-tr'+(s.ok?soon?' won soon':' won':' off');c.title=x.what;
    c.appendChild(dgPix(duckGameImg('front','bain',[x.acc]),40));
    // gagné mais daté plus tard (succès de la semaine passée : le lundi à l'ouverture) : il ne le porte pas encore
    const day=t=>{const d=dtf('fr-FR',{weekday:'long'}).format(new Date(t));return fmtDay(t)===hm(t)?'aujourd\'hui à '+hm(t):d+' à '+hm(t);};
    const info=[s.ok?(soon?'✓ gagné · le porte '+day(ms(s.at)):'✓ gagné'+(s.period?' · '+s.period:'')):s.progress||s.detail||(s.period?'pas cette fois · '+s.period:'pas encore')].filter(Boolean);
    c.appendChild(Object.assign(document.createElement('div'),{innerHTML:`<b>${esc(x.name)}</b><small>${esc(x.what)}</small><small>${esc(info.join(' · '))}</small>`}));
    gr.appendChild(c);
  }
  tb.appendChild(gr);
}
