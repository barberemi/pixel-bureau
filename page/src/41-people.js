// ---------- familles : équipe (humains), workflows (agents IA), visiteurs (discussions) ----------
const famOf=c=>c.visitor?'vis':c.person?'team':'wf';
const FAM={
  team:{t:'Équipe',ico:'',bg:'rgba(20,22,30,.8)',c:'#cfc6b2'},
  wf:{t:'Agents',ico:'⚙ ',bg:'#1d4ed8',c:'#3b82f6'},
  vis:{t:'Visiteurs',ico:'💬 ',bg:'#c2410c',c:'#d97757'}
};
let FILTER=null; // null = tout le monde ; sinon une famille mise en avant
// workflows en hologramme : teinte cyan, lignes de balayage qui défilent, scintillement rare ; sur le sol beige,
// un contour sombre de 1 px et un halo cyan (silhouette décalée) le détachent du décor
const HOLO=document.createElement('canvas');HOLO.width=64;HOLO.height=64;const hctx=HOLO.getContext('2d');
const HOLO_EDGE=document.createElement('canvas');HOLO_EDGE.width=64;HOLO_EDGE.height=64;const ectx=HOLO_EDGE.getContext('2d');
function holoSilhouette(img,sx,sy,col){
  ectx.globalCompositeOperation='source-over';ectx.clearRect(0,0,64,64);ectx.drawImage(img,sx,sy,64,64,0,0,64,64);
  ectx.globalCompositeOperation='source-in';ectx.fillStyle=col;ectx.fillRect(0,0,64,64);
  ectx.globalCompositeOperation='source-over';return HOLO_EDGE;
}
function holoFrame(img,sx,sy,now,lines){
  hctx.globalCompositeOperation='source-over';hctx.clearRect(0,0,64,64);hctx.drawImage(img,sx,sy,64,64,0,0,64,64);
  // teinte cyan ; vert fantôme à Halloween (46-themes.js)
  hctx.globalCompositeOperation='source-atop';hctx.fillStyle=themeIs('halloween')?'rgba(150,255,170,.6)':'rgba(70,190,255,.55)';hctx.fillRect(0,0,64,64);
  if(lines){
    hctx.globalCompositeOperation='destination-out';
    hctx.fillStyle='rgba(0,0,0,.4)';
    const off=Math.floor(now/90)%3;
    for(let y=off;y<64;y+=3)hctx.fillRect(0,y,64,1);
  }
  hctx.globalCompositeOperation='source-over';return HOLO;
}
function drawChar(c,now){
  const img=spriteOf(c); if(!ready(img)||!c.pos)return;
  const [fx,fy]=frameFor(c,now); const x=Math.round(c.pos.x), y=Math.round(c.pos.y);
  const st=c._st?c._st.st:'idle';
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(x,y+1,11,4,0,0,7);ctx.fill();
  const col=ST_COLOR[st];
  if(col&&st!=='idle'&&st!=='coffee'){
    // la forme double la couleur (daltonisme) : tirets = en panne, pointillés = attend une validation, plein = le reste
    ctx.strokeStyle=col;
    ctx.lineWidth=st==='error'?2.5:2;
    ctx.setLineDash(st==='error'?[5,3]:st==='gate'||st==='ask'?[2,3]:[]);
    ctx.beginPath();
    ctx.ellipse(x,y+1,13,5,0,0,7);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if(sel===c.key){
    const p=(Math.sin(now/260)+1)/2;
    ctx.save();
    ctx.globalAlpha=.35+.3*p;
    ctx.fillStyle=ST_COLOR[st]||'#ffffff';
    ctx.beginPath();
    ctx.ellipse(x,y+1,15+p*3,6+p,0,0,7);
    ctx.fill();
    ctx.globalAlpha=1;
    ctx.strokeStyle='#ffffff';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.ellipse(x,y+1,17+p*3,7+p,0,0,7);
    ctx.stroke();
    ctx.restore();
  }
  const bob=(c.pose==='type'&&!c.moving&&(c.dir==='left'||c.dir==='right')?(Math.floor(now/320+c.phase)%2):0)+(c.boss&&!c.moving&&c.tile&&c.tile[0]===BOSS_SEAT[0]&&c.tile[1]===BOSS_SEAT[1]?9:0);
  const dx=x-32-(c.sprite==='boss_sax'?5:0), dy=y-60+bob;
  if(famOf(c)==='wf'){
    const glitch=(Math.floor(now/110)+Math.floor(c.phase*7))%41===0;
    const gx=dx+(glitch?1:0);
    ctx.save();
    ctx.globalAlpha=glitch?.2:.35; holoSilhouette(img,fx*64,fy*64,'#5fd4ff');
    for(const [ox,oy] of [[-2,0],[2,0],[0,-2],[0,2]])ctx.drawImage(HOLO_EDGE,gx+ox,dy+oy);
    ctx.globalAlpha=glitch?.45:.95; holoSilhouette(img,fx*64,fy*64,'#0b3a4a');
    for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]])ctx.drawImage(HOLO_EDGE,gx+ox,dy+oy);
    ctx.globalAlpha=glitch?.45:.92;
    ctx.drawImage(holoFrame(img,fx*64,fy*64,now,true),gx,dy);ctx.restore();
  }else ctx.drawImage(img,fx*64,fy*64,64,64,dx,dy,64,64);
  themeOnChar(c,x,dy+(c.sprite==='boss_sax'?3:14),now); // 46-themes.js : chapeau, lunettes, couronne
}
// chemin vers sa place quand le personnage sélectionné n'y est pas (café, réunion, toilettes...)
let TRAIL={k:null,v:null};
function drawSeatTrail(c,now){
  const s=c.boss?BOSS_SEAT:c.seat; if(!s||!c.tile)return;
  const d=tileCenter(s[0],s[1]); if(Math.hypot(d.x-c.pos.x,d.y-c.pos.y)<48)return;
  const k=c.tile.join(',')+'>'+s.join(','); if(TRAIL.k!==k)TRAIL={k,v:findPath(c.tile[0],c.tile[1],s[0],s[1])};
  ctx.save();ctx.setLineDash([4,6]);ctx.lineDashOffset=-now/50;ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(c.pos.x,c.pos.y);for(const [tx,ty] of TRAIL.v){const p=tileCenter(tx,ty);ctx.lineTo(p.x,p.y-4);}ctx.stroke();
  ctx.setLineDash([]);ctx.strokeStyle='#ffffff';ctx.strokeRect(d.x-13,d.y-22,26,24);
  ctx.font='bold 9px ui-sans-serif,system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.fillStyle='#ffffff';
  ctx.fillText('sa place',d.x,d.y-26);
  ctx.textAlign='left';
  ctx.restore();
}
// étiquette de nom sous les pieds : toujours pour le sélectionné ; tous les noms de la famille choisie dans le
// panneau (« Sur le plan ») ou en mode TV ; sinon au survol
let NAMES='hover', hoverKey=null, NAME_BOXES=[];
const TV_TXT=1.45; // agrandissement des noms et des bulles en mode TV
function drawName(c){
  const on=sel===c.key; if(!c.pos||!(on||NAMES==='all'||NAMES==='hover'&&hoverKey===c.key))return;
  const fm=FAM[famOf(c)], x=Math.round(c.pos.x), y=Math.round(c.pos.y)+6, t=fm.ico+(c.apprentice?'🎓 ':'')+String(c.name||'').slice(0,24);
  const S=TV?TV_TXT:1; // mode TV : lisible à 3 m
  ctx.font='bold '+Math.round((on?11:9)*S)+'px ui-sans-serif,system-ui,sans-serif';
  const w=Math.ceil(ctx.measureText(t).width)+(on?10:8), h=Math.round((on?15:12)*S);
  // assis aux îlots : sur le côté allée (sous la bulle), sinon il couvrirait le voisin du dessous
  let bx=x-w/2, by=y;
  if(!c.moving&&c.tile&&SEATS.some(s=>s.x===c.tile[0]&&s.y===c.tile[1])){bx=c.dir==='right'?x-14-w:x+14;by=y-32;}
  // pas de chevauchement : une étiquette qui en touche une autre descend d'un cran (3 essais)
  for(let i=0;i<3&&NAME_BOXES.some(b=>bx<b.x+b.w+2&&bx+w+2>b.x&&by<b.y+b.h+1&&by+h+1>b.y);i++)by+=h+2;
  NAME_BOXES.push({x:bx,y:by,w,h});
  const cx=bx+w/2;
  ctx.fillStyle=on?'#fffdf8':fm.bg;ctx.beginPath();ctx.roundRect?ctx.roundRect(bx,by,w,h,4):ctx.rect(bx,by,w,h);ctx.fill();
  if(on){ctx.strokeStyle=famOf(c)==='team'?(ST_COLOR[(c._st||{}).st]||'#2f6fd6'):fm.c;ctx.lineWidth=famOf(c)==='team'?1.5:2.5;ctx.stroke();}
  ctx.fillStyle=on?'#25221d':'#ffffff';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(t,cx,by+h/2+.5);
  ctx.textAlign='left';
  ctx.textBaseline='alphabetic';
}
function drawApprentice(c){
  if(!c.apprentice||!c.pos)return;
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y);
  const seated=!c.moving&&c.tile&&SEATS.some(s=>s.x===c.tile[0]&&s.y===c.tile[1]);
  const bx=seated?(c.dir==='right'?x+9:x-9):x+11, by=y-54;
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(bx-6,by+1,13,4);
  ctx.fillStyle='#1d2433';ctx.beginPath();ctx.moveTo(bx-7,by);ctx.lineTo(bx,by-3);ctx.lineTo(bx+7,by);ctx.lineTo(bx,by+3);ctx.closePath();ctx.fill();
  ctx.fillRect(bx-3,by+1,6,4);ctx.fillStyle='#e0a020';ctx.fillRect(bx+5,by,1,6);ctx.fillRect(bx+4,by+5,3,2);
}
function drawOverlay(c,now){
  if(!c.pos)return;
  drawApprentice(c);
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y), st=c._st||{};
  if(sel===c.key){
    const a=Math.sin(now/200)*2;
    ctx.fillStyle='#ffffff';
    ctx.beginPath();
    ctx.moveTo(x-5,y-66+a);
    ctx.lineTo(x+5,y-66+a);
    ctx.lineTo(x,y-60+a);
    ctx.fill();
  }
  if(isFocus(c))return; // bulle détaillée, dessinée par-dessus tout le reste
  const bb=bubbleFor(c,st,T,now); if(!bb||c.moving&&st.st!=='gate')return;
  const txt=bb.head, isIcon=txt.length<=2;
  const S=TV?TV_TXT:1;
  ctx.font=isIcon?Math.round(13*S)+'px system-ui,sans-serif':'bold '+Math.round(9*S)+'px ui-monospace,Menlo,monospace';
  const w=Math.ceil(ctx.measureText(txt).width)+(isIcon?8:10)+(bb.tone?3:0), h=Math.round((isIcon?18:15)*S);
  const seated=!c.moving&&c.tile&&SEATS.some(s=>s.x===c.tile[0]&&s.y===c.tile[1]);
  let bx=x-w/2, by=y-62-h-(sel===c.key?8:0);
  if(seated){const out=c.dir==='right'?-1:1;bx=out<0?x-14-w:x+14;by=y-48;}
  // panne / validation : un emoji (🚨, ✋) sur fond rouge ou ambre ne se lit pas ; bulle claire cerclée à la place (seul « ! » reste blanc sur rouge)
  const alert=st.st==='error'||st.st==='gate', ring=alert&&txt!=='!', ringCol=st.st==='error'?'#c62828':'#b7791f';
  const bc=ring?'#fffdf8':st.st==='error'?'#d1453b':st.st==='gate'?'#e0a020':'#fffdf8';
  if(bb.cloud){
    if(!seated)by-=4; // place pour les bouffées sous le nuage
    drawCloud(bx,by,w,h,x,y-56);
    if(bb.tone){ctx.fillStyle=bb.tone;ctx.fillRect(bx+2,by+3,2,h-5);}
  }else{
    ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(bx+1,by+2,w,h);
    ctx.fillStyle=bc;ctx.fillRect(bx,by,w,h);
    if(seated)ctx.fillRect(c.dir==='right'?bx+w:bx-3,by+h/2-2,3,4);else ctx.fillRect(x-2,by+h,4,3);
    if(bb.tone){ctx.fillStyle=bb.tone;ctx.fillRect(bx,by,3,h);}
    if(ring){ctx.strokeStyle=ringCol;ctx.lineWidth=2;ctx.strokeRect(bx+1,by+1,w-2,h-2);}
  }
  const ph=toolPhase(c,bb.tool,now); if(ph)drawToolBubble(bb.tool,ph,bx,by);
  ctx.fillStyle=ring?ringCol:alert?'#fff':'#25221d';ctx.textBaseline='middle';ctx.textAlign='center';
  ctx.fillText(txt,bx+w/2+(bb.tone?1.5:0),by+h/2+1);ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
