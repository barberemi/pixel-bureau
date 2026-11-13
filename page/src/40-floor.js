// ---------- plan : toile, sol et murs (cuits une fois dans bg), fenêtres et horloge ----------
const cv=document.getElementById('cv');
let ctx=cv.getContext('2d'); // let : la cuisson des meubles (40-furniture.js) dessine un moment dans une autre toile
const bg=document.createElement('canvas'), g=bg.getContext('2d');
// toile et fond à la taille du plan (cases de 32 px) ; rappelé quand le plan change
function sizeCanvas(){
  cv.width=W;cv.height=H;bg.width=W;bg.height=H;
  document.documentElement.style.setProperty('--plan-ratio',String(W/H)); // proportions du plan (mode TV)
  ctx.imageSmoothingEnabled=false;
}
sizeCanvas();
const R=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
// tracé d'une bulle ou d'une étiquette aux coins crénelés (3 px, deux marches), comme les cadres pixel de la page :
// remplace roundRect sur le plan (audit UX 3.10) ; à suivre de fill() ou stroke()
function pixRect(c,x,y,w,h){
  const s=3, p=[[x+s,y],[x+w-s,y],[x+w-s,y+1],[x+w-1,y+1],[x+w-1,y+s],[x+w,y+s],[x+w,y+h-s],[x+w-1,y+h-s],[x+w-1,y+h-1],[x+w-s,y+h-1],
    [x+w-s,y+h],[x+s,y+h],[x+s,y+h-1],[x+1,y+h-1],[x+1,y+h-s],[x,y+h-s],[x,y+s],[x+1,y+s],[x+1,y+1],[x+s,y+1]];
  c.beginPath();c.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)c.lineTo(p[i][0],p[i][1]);c.closePath();
}
// plaque pixel : fond sombre, liseré du haut à la couleur donnée, encre claire ; renvoie sa largeur (titre d'étage, 68-atelier.js)
function plaque(c,x,y,text,accent){
  c.save();c.font='bold 12px ui-monospace,Menlo,monospace';const w=Math.ceil(c.measureText(text).width)+16, h=20;
  R(c,x+2,y+2,w,h,'rgba(0,0,0,.35)');pixRect(c,x,y,w,h);c.fillStyle='#1c1f26';c.fill();R(c,x+2,y,w-4,2,accent||'#646a78');
  c.fillStyle='#efe9dc';c.textBaseline='middle';c.textAlign='left';c.fillText(text,x+8,y+h/2+1);c.restore();return w;
}
function hash(x,y){let h=x*374761393+y*668265263;h=(h^(h>>13))*1274126177;return ((h^(h>>16))>>>0)/4294967295;}
function drawFloor(c,x,y,f){
  const px=x*TS,py=y*TS;
  if(f==='wood'){
    R(c,px,py,TS,TS,'#b98a5c');
    for(let i=0;i<4;i++){
      R(c,px,py+i*8,TS,1,'#a37650');
      const o=(hash(x,y+i)*24)|0;
      R(c,px+o,py+i*8,1,8,'#a37650');
    }
  }
  else if(f==='carpet'){
    R(c,px,py,TS,TS,'#c9c2b2');
    for(let i=0;i<6;i++){
      const a=hash(x*7+i,y*3);
      R(c,px+((a*30)|0),py+((hash(x,y*5+i)*30)|0),2,2,'#bdb5a4');
    }
  }
  else if(f==='carpetB'){R(c,px,py,TS,TS,'#7c8aa3');for(let i=0;i<5;i++){R(c,px+((hash(x*3+i,y)*30)|0),py+((hash(x,y*9+i)*30)|0),2,2,'#71809a');}}
  else if(f==='server'){R(c,px,py,TS,TS,'#5d6470');R(c,px,py,TS,1,'#525865');R(c,px,py,1,TS,'#525865');R(c,px+15,py+15,2,2,'#6b7280');}
  else if(f==='tiles'){const a=(x+y)%2===0;R(c,px,py,TS,TS,a?'#ece6d8':'#d8cfbc');}
  else if(f==='wc'){for(let i=0;i<2;i++)for(let j=0;j<2;j++)R(c,px+i*16,py+j*16,16,16,(i+j)%2?'#d6e6ee':'#eef5f8');}
  else if(f==='mat'){R(c,px,py,TS,TS,'#5a4636');R(c,px+4,py+4,TS-8,TS-8,'#6b5543');}
  else if(f==='stage'){
    R(c,px,py,TS,TS,'#7a3540');
    R(c,px,py,TS,1,'#8f4250');
    R(c,px+((x*11)%28),py+((y*7)%28),2,2,'#6a2c37');
    if(grid[y][x]===0&&(!floorOf[y+1]||floorOf[y+1][x]!=='stage'||DOORS.some(d=>d[0]===x&&d[1]===y+1)))R(c,px,py+TS-3,TS,3,'#5a2530'); // bord avant du plateau
  }
}
const isFloor=(x,y)=>y>=0&&y<ROWS&&x>=0&&x<COLS&&grid[y][x]===0;
// décor mural : chaque type dessiné à sa place d'origine (ancre, en cases), décalé là où le plan le pose
const WALL_DECOR={
  whiteboard:{anchor:[20,1],draw:g=>{ // tableau blanc de la salle de réunion
    R(g,20*TS+4,TS+4,3*TS-8,22,'#f7f7f4');R(g,20*TS+4,TS+24,3*TS-8,3,'#9aa0aa');
    g.strokeStyle='#d1453b';g.lineWidth=1;g.beginPath();g.moveTo(20*TS+14,TS+18);g.lineTo(20*TS+40,TS+10);g.lineTo(20*TS+60,TS+16);g.stroke();
    g.strokeStyle='#2f6fd6';g.beginPath();g.moveTo(21*TS+30,TS+9);g.lineTo(22*TS+4,TS+20);g.lineTo(22*TS+20,TS+12);g.stroke();
  }},
  mirror:{anchor:[38,1],draw:g=>{R(g,38*TS+6,TS+6,20,18,'#cfe6f2');R(g,38*TS+8,TS+8,4,14,'#f2fafd');}}, // miroir des toilettes
  sign:{anchor:[21,5],draw:(g,d)=>{ // panneau (texte et couleurs du plan) sur un mur vu du couloir
    const x0=21*TS-8, y0=5*TS+10, w=(d.w||3)*TS+16;
    R(g,x0,y0,w,16,d.bg||'#0b2a4a');R(g,x0,y0,w,2,d.accent||'#0172f0');
    g.fillStyle='#ffffff';g.font='bold 12px ui-monospace,Menlo,monospace';g.textAlign='center';g.fillText(d.text||'',x0+w/2,y0+13);g.textAlign='left';
  }},
};
function buildBg(){
  R(g,0,0,W,H,'#2a2b33');
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(floorOf[y][x])drawFloor(g,x,y,floorOf[y][x]);
  R(g,0,0,W,TS,'#4b4a52');
  for(let y=1;y<ROWS;y++)for(let x=0;x<COLS;x++){
    if(grid[y][x]===0)continue;
    const px=x*TS, py=y*TS, glass=GLASS.has(x+','+y);
    if(y===ROWS-1){R(g,px,py,TS,8,'#efe9dc');continue;}
    if(isFloor(x,y+1)||y===1){ // mur vu de face
      R(g,px,py,TS,8,'#efe9dc');
      if(glass){R(g,px,py+8,TS,24,'#a9cfe3');R(g,px+((x*7)%20),py+10,3,18,'#d8edf7');R(g,px,py+8,1,24,'#8fb4c8');}
      else{R(g,px,py+8,TS,24,'#d9d2c3');R(g,px,py+28,TS,4,'#a99f8c');}
    }else{ // mur vu de dessus (cloison)
      const l=isFloor(x-1,y)?floorOf[y][x-1]:null; if(l)drawFloor(g,x,y,l);
      R(g,px+10,py,12,TS,glass?'#bfe0ee':'#efe9dc');R(g,px+10,py,1,TS,'#cfc6b4');R(g,px+21,py,1,TS,'#cfc6b4');
    }
  }
  // seuils : aucun sur le bord du plan (sortie) ; en bas de la case dans un mur horizontal (murs à gauche et à droite), en haut sinon
  for(const [x,y] of DOORS){
    if(x===0||y===0||x===COLS-1||y===ROWS-1)continue;
    const inHWall=grid[y][x-1]===1&&grid[y][x+1]===1;
    R(g,x*TS+2,y*TS+(inHWall?26:2),TS-4,4,'#8d7b62');
  }
  // décor mural et noms des pièces : posés par le plan (LAYOUT.wall, LAYOUT.labels)
  for(const d of LAYOUT.wall||[]){const t=WALL_DECOR[d.type]; if(!t)continue;
    g.save();g.translate((d.at[0]-t.anchor[0])*TS,(d.at[1]-t.anchor[1])*TS);t.draw(g,d);g.restore();}
  g.font='bold 12px ui-monospace,Menlo,monospace';g.textAlign='center'; // 12 px, encre à 50 % : 9,4 px affichés à 1440 px (audit UX 2.2, 2.3)
  for(const l of LAYOUT.labels||[]){g.fillStyle=l.color||'rgba(0,0,0,.5)';g.fillText(l.text,l.at[0]*TS,l.at[1]*TS);}
  g.textAlign='left';
}
function drawWindows(t,now){
  const s=skyColor(t); // 42-light.js : hauteur du soleil au bureau
  for(const x of LAYOUT.windows||[]){
    R(ctx,x*TS+4,TS+4,TS*1.5,20,'#e7e1d3');
    R(ctx,x*TS+6,TS+6,TS*1.5-4,16,s);
    drawStars(x*TS+6,TS+6,TS*1.5-4,16,now||0);
    themeWindow(x*TS+6,TS+6,TS*1.5-4,16,now||0,x); // 46-themes.js : neige, feux d'artifice
    R(ctx,x*TS+4+TS*.75,TS+4,2,20,'#e7e1d3');
  }
  // horloge murale (LAYOUT.clock)
  if(!LAYOUT.clock)return;
  const cx=LAYOUT.clock[0]*TS, cy=LAYOUT.clock[1]*TS+18;
  ctx.fillStyle='#f7f5ef';ctx.beginPath();ctx.arc(cx,cy,10,0,7);ctx.fill();ctx.strokeStyle='#3a3530';ctx.lineWidth=2;ctx.stroke();
  const parts=dtf('en-GB',{hour:'numeric',minute:'numeric',hour12:false}).formatToParts(new Date(t));
  const hh=+parts.find(p=>p.type==='hour').value, mm=+parts.find(p=>p.type==='minute').value;
  const ha=((hh%12)+mm/60)/12*Math.PI*2-Math.PI/2, ma=mm/60*Math.PI*2-Math.PI/2;
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ha)*5,cy+Math.sin(ha)*5);ctx.stroke();
  ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ma)*8,cy+Math.sin(ma)*8);ctx.stroke();
}

