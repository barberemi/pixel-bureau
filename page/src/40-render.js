// ---------- drawing ----------
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
ctx.imageSmoothingEnabled=false;
const bg=document.createElement('canvas'); bg.width=W; bg.height=H; const g=bg.getContext('2d');
const R=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
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
    if(y===4)R(c,px,py+TS-3,TS,3,'#5a2530');
  }
}
const isFloor=(x,y)=>y>=0&&y<ROWS&&x>=0&&x<COLS&&grid[y][x]===0;
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
  for(const [x,y] of DOORS)if(x!==39)R(g,x*TS+2,y*TS+(y===11||y===5?26:2),TS-4,4,'#8d7b62');
  // tableau blanc de la salle de réunion
  R(g,20*TS+4,TS+4,3*TS-8,22,'#f7f7f4');R(g,20*TS+4,TS+24,3*TS-8,3,'#9aa0aa');
  g.strokeStyle='#d1453b';g.lineWidth=1;g.beginPath();g.moveTo(20*TS+14,TS+18);g.lineTo(20*TS+40,TS+10);g.lineTo(20*TS+60,TS+16);g.stroke();
  g.strokeStyle='#2f6fd6';g.beginPath();g.moveTo(21*TS+30,TS+9);g.lineTo(22*TS+4,TS+20);g.lineTo(22*TS+20,TS+12);g.stroke();
  // bibliothèque du boss (mur du haut, rangée 7)
  // miroir des toilettes
  R(g,38*TS+6,TS+6,20,18,'#cfe6f2');R(g,38*TS+8,TS+8,4,14,'#f2fafd');
  // panneau LE BUREAU sur le mur de la salle de réunion (vu du couloir)
  R(g,21*TS-8,5*TS+10,3*TS+16,16,'#0b2a4a');
  R(g,21*TS-8,5*TS+10,3*TS+16,2,'#0172f0');
  g.fillStyle='#ffffff';
  g.font='bold 10px ui-monospace,Menlo,monospace';
  g.textAlign='center';
  g.fillText('LE BUREAU',22*TS+16,5*TS+23);
  // noms des pièces
  g.font='bold 9px ui-monospace,Menlo,monospace';
  const lab=(t,x,y,c)=>{g.fillStyle=c||'rgba(0,0,0,.22)';g.fillText(t,x,y);};
  lab('CAFÉTÉRIA',6*TS,10*TS+8); lab('SERVEURS',14*TS+16,4*TS+26,'rgba(255,255,255,.3)'); lab('SALLE DE RÉUNION',22*TS+16,2*TS+10);
  lab('PLATEAU TV',30*TS,4*TS+26,'rgba(255,255,255,.35)'); lab('TOILETTES',36*TS+16,4*TS+26); lab('BUREAU DU BOSS',22*TS+16,10*TS+26);
  lab('ENTRÉE PRINCIPALE',36*TS+8,8*TS+20); lab('OPEN SPACE',20*TS,18*TS+24);
  g.textAlign='left';
}
function drawWindows(t,now){
  const s=skyColor(t); // 42-light.js : hauteur du soleil au bureau
  for(const x of [1,4,7,9,18,24,34]){
    R(ctx,x*TS+4,TS+4,TS*1.5,20,'#e7e1d3');
    R(ctx,x*TS+6,TS+6,TS*1.5-4,16,s);
    drawStars(x*TS+6,TS+6,TS*1.5-4,16,now||0);
    R(ctx,x*TS+4+TS*.75,TS+4,2,20,'#e7e1d3');
  }
  // horloge sur le mur bas de la cafétéria
  const cx=3*TS, cy=11*TS+18;
  ctx.fillStyle='#f7f5ef';ctx.beginPath();ctx.arc(cx,cy,10,0,7);ctx.fill();ctx.strokeStyle='#3a3530';ctx.lineWidth=2;ctx.stroke();
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'numeric',minute:'numeric',hour12:false}).formatToParts(new Date(t));
  const hh=+parts.find(p=>p.type==='hour').value, mm=+parts.find(p=>p.type==='minute').value;
  const ha=((hh%12)+mm/60)/12*Math.PI*2-Math.PI/2, ma=mm/60*Math.PI*2-Math.PI/2;
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ha)*5,cy+Math.sin(ha)*5);ctx.stroke();
  ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ma)*8,cy+Math.sin(ma)*8);ctx.stroke();
}

// ---------- mobilier (trié en profondeur avec les avatars) ----------
function deskOwner(x,y){return chars.find(c=>c.seat&&c.seat[0]===x&&c.seat[1]===y&&!(c.boss&&c.atBoss));}
function lampColor(c){if(!c||!c._st)return '#5a5a5a';return ST_COLOR[c._st.st]||'#5a5a5a';}
function pileOf(c){
  const t=c&&c.team&&c.team.tickets;
  return t?t.filter(x=>x.cat!=='done').sort((a,b)=>TORDER.indexOf(b.cat)-TORDER.indexOf(a.cat)).slice(-5):[];
}
const FURN=[];
// îlots
for(const cx of ISLANDS){
  FURN.push({y:14*TS-2,draw:(now)=>{
    const x0=cx*TS+3, y0=14*TS-8, h=3*TS+4;
    R(ctx,x0+2,y0+h,TS-6,4,'rgba(0,0,0,.18)');
    R(ctx,x0,y0,TS-6,h,'#a87b4f');R(ctx,x0,y0,TS-6,2,'#c79a6a');R(ctx,x0,y0+h-6,TS-6,6,'#7d5634');
    for(const r of IROWS){
      for(const side of ['L','R']){
        const sx=side==='L'?cx-1:cx+1, o=deskOwner(sx,r), py=r*TS;
        const mx=side==='L'?x0+3:x0+TS-6-11;
        R(ctx,mx,py-4,8,16,'#2c2f38'); drawScreen(side==='L'?mx:mx+3,py-3,5,14,screenState(o),now,sx*31+r); // face tournée vers la place
        const kx=side==='L'?x0+12:x0+4; R(ctx,kx,py+2,5,10,'#e6e6e6');
        const pile=pileOf(o); const bx=side==='L'?x0+12:x0+4;
        pile.forEach((t,i)=>{R(ctx,bx-1,py+22-i*3,8,3,TCAT[t.cat].c);});
        const lc=o&&o.present?lampColor(o):'#55524c'; R(ctx,side==='L'?x0+2:x0+TS-11,py+18,4,4,lc);
      }
    }
  }});
  for(const r of IROWS)for(const side of ['L','R']){
    const sx=side==='L'?cx-1:cx+1;
    FURN.push({
      y:r*TS+1,
      draw:()=>{
        const px=sx*TS+16,py=r*TS;
        const bx=side==='L'?px-13:px+9;
        R(ctx,px-7,py+12,14,10,'#6a7080');
        R(ctx,bx,py+2,4,20,'#4d5363');
        R(ctx,bx,py+2,4,2,'#7a8090');
      }
    });
  }
}
// bureau du boss
FURN.push({
  y:8*TS+2,
  draw:()=>{
    const px=22*TS+16,py=8*TS;
    R(ctx,px-18,py-16,36,30,'#5a2e2e');
    R(ctx,px-18,py-16,36,4,'#723a3a');
    R(ctx,px-22,py-2,6,18,'#4a2424');
    R(ctx,px+16,py-2,6,18,'#4a2424');
    R(ctx,px-22,py-2,6,2,'#6a3434');
    R(ctx,px+16,py-2,6,2,'#6a3434');
  }
});
FURN.push({
  y:9*TS,draw:(now)=>{
    const x0=21*TS-2,top=9*TS-20;
    R(ctx,x0,top+30,3*TS+4,3,'rgba(0,0,0,.2)');
    R(ctx,x0,top,3*TS+4,18,'#6e4a2c');
    R(ctx,x0,top,3*TS+4,2,'#8a6040');
    R(ctx,x0,top+18,3*TS+4,13,'#56391f');
  R(ctx,x0+6,top-12,18,13,'#2c2f38');
  {const b=chars.find(c=>c.boss);drawScreen(x0+7,top-11,16,10,b?screenState(b):'off',now,97);}
  R(ctx,x0+12,top+1,5,3,'#2c2f38');
  R(ctx,x0+44,top+4,15,5,'#e6e6e6');
  R(ctx,x0+76,top+2,6,7,'#fbfbf6');
  R(ctx,x0+77,top+4,4,2,'#d1453b');
  ctx.fillStyle='#f3e6d2';
  ctx.font='bold 8px ui-monospace,Menlo,monospace';
  ctx.textAlign='center';
  ctx.fillText("WORLD'S BEST BOSS",22*TS+16,top+27);
  ctx.textAlign='left';
  }
  });
// table de réunion
FURN.push({
  y:3*TS,draw:()=>{
    const x0=19*TS+2,y0=3*TS-6;
    R(ctx,x0,y0+30,7*TS-4,4,'rgba(0,0,0,.2)');
    R(ctx,x0,y0,7*TS-4,28,'#8a6a48');
    R(ctx,x0,y0,7*TS-4,3,'#a58260');
    R(ctx,x0,y0+24,7*TS-4,6,'#6a4f34');
  for(let i=0;i<6;i++)R(ctx,x0+14+i*34,y0+9,12,8,'#f4f1e8');R(ctx,x0+100,y0+10,16,8,'#2c2f38');}});
// baies serveurs
for(const x of [13,15])FURN.push({y:2*TS+20,draw:(now)=>{const px=x*TS+2,py=TS+10;R(ctx,px,py,28,52,'#23262d');R(ctx,px,py,28,3,'#3a3e47');
  for(let i=0;i<5;i++){
    R(ctx,px+3,py+7+i*9,22,6,'#2f333c');
    const on=hash(x+i,Math.floor(now/(300+i*70)))>.35;
    R(ctx,px+5,py+9+i*9,2,2,on?'#5ff08a':'#1e4a2a');
    R(ctx,px+9,py+9+i*9,2,2,hash(i,x+Math.floor(now/450))>.6?'#f0b03a':'#4a3a12');
  }
  }
  });
// cafétéria : comptoir, machine à café, frigo, table, canapé, fontaine
FURN.push({
  y:2*TS+30,draw:(now)=>{
    const x0=2*TS,top=2*TS-14;
    R(ctx,x0,top,6*TS,16,'#c8c2b4');
    R(ctx,x0,top,6*TS,2,'#e0dbcf');
    R(ctx,x0,top+16,6*TS,22,'#8b6e52');
    for(let i=0;i<6;i++)R(ctx,x0+i*TS+14,top+24,4,2,'#d8c9b0');
  const cm=3*TS+6;R(ctx,cm,top-22,22,24,'#3a2f2c');R(ctx,cm+2,top-20,18,6,'#5a4a44');R(ctx,cm+8,top-6,6,6,'#f5f2ec');
  if(chars.some(c=>c.present&&c._st&&c._st.st==='coffee'))for(let i=0;i<3;i++){
    const k=((now/900)+i/3)%1;
    ctx.fillStyle=`rgba(255,255,255,${.6*(1-k)})`;
    ctx.fillRect(cm+10+Math.sin(k*8)*2,top-10-k*16,2,3);
  }
  R(ctx,6*TS+4,top+2,24,10,'#9aa8b4');R(ctx,6*TS+14,top-6,3,8,'#7d8a96');R(ctx,5*TS+6,top-8,8,10,'#e6dfc9');R(ctx,5*TS+8,top-11,4,3,'#2e9e5b');}});
FURN.push({
  y:2*TS+30,
  draw:()=>{
    const px=1*TS+2,py=TS+8;
    R(ctx,px,py,28,52,'#eef1f3');
    R(ctx,px,py+20,28,2,'#c9ced3');
    R(ctx,px+22,py+6,2,10,'#9aa3ab');
    R(ctx,px+22,py+26,2,16,'#9aa3ab');
  }
});
FURN.push({
  y:6*TS,
  draw:()=>{
    const x0=4*TS+2,y0=6*TS-10;
    R(ctx,x0,y0+28,60,3,'rgba(0,0,0,.18)');
    R(ctx,x0,y0,60,26,'#d9b98c');
    R(ctx,x0,y0,60,2,'#ecd2a8');
    R(ctx,x0,y0+22,60,6,'#b8956a');
    R(ctx,x0+24,y0+6,8,6,'#d1453b');
  }
});
FURN.push({y:10*TS-6,draw:()=>{R(ctx,8*TS-4,10*TS-6,3*TS+8,16,'#3f6b8a');R(ctx,8*TS-4,10*TS-6,3*TS+8,3,'#4f80a3');}});
FURN.push({
  y:10*TS+31,
  draw:()=>{
    R(ctx,8*TS-8,10*TS+16,3*TS+16,14,'#355c77');
    R(ctx,8*TS-8,10*TS+4,8,26,'#2d4f66');
    R(ctx,11*TS,10*TS+4,8,26,'#2d4f66');
  }
});
FURN.push({
  y:7*TS+28,
  draw:()=>{
    const px=11*TS+16,py=7*TS+28;
    R(ctx,px-7,py-18,14,18,'#d9dde2');
    R(ctx,px-6,py-34,12,16,'#7fc4ea');
    R(ctx,px-6,py-34,3,16,'#a9dcf5');
    R(ctx,px-2,py-12,4,3,'#2f6fd6');
  }
});
// copieur et carton de papier près de l'entrée
FURN.push({
  y:9*TS+28,
  draw:()=>{
    const px=38*TS+16,py=9*TS+28;
    R(ctx,px-13,py-26,26,26,'#c3c7cc');
    R(ctx,px-13,py-26,26,5,'#e2e5e8');
    R(ctx,px-9,py-14,18,3,'#555');
    R(ctx,px+6,py-23,3,2,'#5ff08a');
  }
});
// toilettes : cuvettes, cloisons, portes, voyants, lavabo
FURN.push({
  y:2*TS-2,
  draw:()=>{
    for(const sx of [34,35,36,37]){
      const px=sx*TS+16,py=2*TS;
      R(ctx,px-7,py-14,14,8,'#f4f7f9');
      R(ctx,px-7,py-14,14,1,'#c9d3da');
      R(ctx,px-8,py-6,16,14,'#ffffff');
      R(ctx,px-6,py-4,12,10,'#dbe7ee');
    }
  }
});
FURN.push({y:2*TS+31,draw:(now)=>{
  for(const sx of [34,35,36,37]){
    const px=sx*TS, py=2*TS, occ=chars.find(c=>c.present&&c.spotKey&&c.spotKey.startsWith('wc:')&&c.tile&&c.tile[0]===sx&&c.tile[1]===2&&!c.moving);
    R(ctx,px,py-22,2,54,'#9fb0bd');
    if(occ){
      const wob=Math.sin(now/180+sx)>0.92?1:0;
      R(ctx,px+2+wob,py+12,28,20,'#8fb3cf');
      R(ctx,px+2+wob,py+12,28,2,'#a9c7de');
      R(ctx,px+24+wob,py+20,3,3,'#3d4250');
    }
    else{R(ctx,px+2,py+12,4,20,'#8fb3cf');}
    R(ctx,px+13,py-26,6,4,occ?'#ff4b4b':'#5ff08a');
  }
  R(ctx,38*TS,2*TS-22,2,54,'#9fb0bd');
  R(ctx,38*TS+6,2*TS-2,20,12,'#ffffff');R(ctx,38*TS+14,2*TS-6,3,6,'#9aa3ab');
  ctx.fillStyle='#5a6b78';ctx.font='bold 6px ui-monospace,monospace';ctx.fillText('🧻',33*TS+8,2*TS+28);
}});
// plateau TV : écran au mur du fond
const TVR={x:28*TS+6,y:TS+3,w:4*TS-12,h:28};
// ---------- chiffres du jour pour le bandeau du mode TV ----------
const KPIW={x:33*TS+2,y:5*TS+3,w:6*TS-4,h:26}, KPIS=[]; // mur retiré (doublon des tuiles du haut) : runs / échecs / tokens sont dans le bandeau du mode TV
function kpiWallData(){
  if(!DATA)return null;
  const ids=new Set(DATA.runs.map(r=>r.run)), top=DATA.runs.filter(r=>r._s<=T&&(!r.parent||!ids.has(r.parent)));
  const hours=new Array(12).fill(0);for(const r of top){const k=Math.floor((T-r._s)/3600e3);if(k>=0&&k<12)hours[11-k]++;}
  const fails=top.filter(r=>r.status==='Failed'&&(r._e||0)<=T), recentFail=fails.some(r=>T-(r._e||r._s)<3600e3);
  const tok=top.reduce((a,r)=>a+(r.tok||0),0);
  const meps=TEAM?mepsAt(T):[], prs=TEAM?TEAM.people.reduce((a,p)=>a+(p.prs||[]).length,0):0, doing=TEAM?TEAM.people.reduce((a,p)=>a+p.tickets.filter(x=>x.cat==='doing').length,0):0;
  const rot=[['MEP DU JOUR',meps.filter(x=>x.phase==='done').length,'#a98cf0'],['PR OUVERTES',prs,'#7aa2f2'],['EN COURS',doing,'#2f6fd6']];
  return {runs:top.length,hours,fails:fails.length,recentFail,tok,rot};
}
function tapeBand(x1,y1,x2,y2,w){ // ruban de chantier jaune et noir
  const L=Math.hypot(x2-x1,y2-y1),a=Math.atan2(y2-y1,x2-x1);ctx.save();ctx.translate(x1,y1);ctx.rotate(a);
  ctx.fillStyle='#f2c314';
  ctx.fillRect(0,-w/2,L,w);
  ctx.fillStyle='#1a1a1a';
  for(let i=0;i<L;i+=10){
    ctx.beginPath();
    ctx.moveTo(i,-w/2);
    ctx.lineTo(i+5,-w/2);
    ctx.lineTo(i+1,w/2);
    ctx.lineTo(i-4,w/2);
    ctx.fill();
  }
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(0,w/2,L,1);ctx.restore();
}
FURN.push({y:5*TS+30,draw:()=>{
  if(!stageClosed(T))return;
  R(ctx,28*TS,2*TS,4*TS,3*TS,'rgba(8,10,18,.62)'); // lumière éteinte
  const dx=29*TS, dy=5*TS; // porte
  tapeBand(dx-10,dy+2,dx+TS+10,dy+TS-4,6);tapeBand(dx-10,dy+TS-4,dx+TS+10,dy+2,6);
  // panneau
  const px=27*TS+4, py=5*TS+4;R(ctx,px,py,TS+6,20,'#f2c314');R(ctx,px+1,py+1,TS+4,18,'#1a1a1a');
  ctx.fillStyle='#f2c314';
  ctx.font='bold 7px ui-monospace,Menlo,monospace';
  ctx.textAlign='center';
  ctx.fillText('FERMÉ',px+TS/2+3,py+9);
  ctx.font='bold 5px ui-monospace,Menlo,monospace';
  ctx.fillText('PAS DE MEP',px+TS/2+3,py+16);
  ctx.textAlign='left';
}});
FURN.push({y:-1,draw:(now)=>{
  const {x,y,w,h}=TVR, sg=stageAt(T);
  R(ctx,x-2,y-2,w+4,h+4,'#111216');R(ctx,x,y,w,h,'#0e1b30');
  if(stageClosed(T)){
    ctx.font='bold 8px ui-monospace,Menlo,monospace';
    ctx.fillStyle='#5a6478';
    ctx.textAlign='center';
    ctx.fillText('PLATEAU FERMÉ',x+w/2,y+11);
    ctx.fillStyle='#f2c314';
    ctx.fillText('REPRISE LUNDI',x+w/2,y+22);
    ctx.textAlign='left';
    return;
  }
  ctx.font='bold 8px ui-monospace,Menlo,monospace';
  const liveNow=sg&&sg.phase!=='done';
  if(liveNow&&Math.floor(now/600)%2){ctx.fillStyle='#ff4b4b';ctx.beginPath();ctx.arc(x+7,y+8,3,0,7);ctx.fill();}
  ctx.fillStyle=liveNow?'#ff8a8a':'#9fb7d9';ctx.fillText(liveNow?'EN DIRECT':'MISES EN PROD',x+13,y+11);
  const items=mepsAt(T).slice().reverse().map(z=>z.m.tag+' '+(z.m.ticket||'')+' '+(z.phase==='done'?'en prod ✓':z.phase==='failed'?'échec ✗':MEP_TXT[z.phase]));
  const txt=items.length?items.join('   ·   ')+'   ·   ':"Aucune mise en prod aujourd'hui   ·   ";
  ctx.save();ctx.beginPath();ctx.rect(x+3,y+14,w-6,13);ctx.clip();
  ctx.fillStyle='#ffffff';const tw=ctx.measureText(txt).width, off=(now/25)%tw;
  for(let k=-1;k<3;k++)ctx.fillText(txt,x+3-off+k*tw,y+24);
  ctx.restore();
}});
// employé du sprint : cadre sur le mur bas de la cafétéria
const EMPR={x:8*TS+4,y:11*TS+2,w:62,h:28};
// enveloppe de paie posée sur le bureau du boss -> fiche de paie
const PAYR={x:23*TS+16,y:8*TS+17,w:14,h:10};
FURN.push({
  y:9*TS+31,draw:()=>{
    const {x,y,w,h}=PAYR;
    R(ctx,x,y,w,h,'#e9dcb8');
    ctx.strokeStyle='#8a6d2e';
    ctx.lineWidth=1;
    ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  ctx.beginPath();
  ctx.moveTo(x+.5,y+.5);
  ctx.lineTo(x+w/2,y+h/2);
  ctx.lineTo(x+w-.5,y+.5);
  ctx.stroke();
  ctx.fillStyle='#2e9e5b';
  ctx.font='bold 7px ui-monospace,Menlo,monospace';
  ctx.fillText('$',x+w-6,y+h-1);
  }
  });
FURN.push({y:-1,draw:()=>{
  const b=bestEmployee()[0]; if(!b||!b.pts)return;
  const c=empChar(b); if(!c)return; const {x,y,w,h}=EMPR;
  R(ctx,x,y,w,h,'#c9a227');R(ctx,x+2,y+2,w-4,h-4,'#f3e6c2');
  const img=spriteOf(c); if(ready(img))ctx.drawImage(img,2*64+16+(c.sprite==='boss_sax'?5:0),4*64+(c.sprite==='boss_sax'?2:10),32,32,x+3,y+3,22,22);
  ctx.fillStyle='#7a5a10';
  ctx.font='bold 6px ui-monospace,Menlo,monospace';
  ctx.fillText('EMPLOYÉ',x+27,y+11);
  ctx.fillText('DU SPRINT',x+27,y+18);
  ctx.fillText(Math.round(b.pts)+' PTS',x+27,y+25);
}});
// mur Kanban à droite du bureau du boss
const KANR={x:23*TS-2,y:7*TS-6,w:4*TS,h:36};
function kanbanCols(){
  const all=TEAM?[...TEAM.people.flatMap(p=>p.tickets.map(x=>({...x,owner:p.name}))),...(TEAM.unassigned||[]).map(x=>({...x,owner:null}))]:[];
  return ['todo','doing','review','test','deploy','done'].map(k=>({k,list:all.filter(x=>x.cat===k)}));
}
FURN.push({y:-1,draw:()=>{
  const {x,y,w,h}=KANR;
  R(ctx,x,y,w,h,'#7a5a43');R(ctx,x+2,y+2,w-4,h-4,'#f7f7f4');
  const cols=kanbanCols(), cw=(w-4)/6;
  ctx.font='bold 5px ui-monospace,Menlo,monospace';ctx.textAlign='center';
  cols.forEach((c,i)=>{
    const cx=x+2+i*cw; R(ctx,cx+1,y+3,cw-2,3,TCAT[c.k].c);
    const max=12; c.list.slice(0,max).forEach((t,j)=>{const col=j%3,row=Math.floor(j/3);R(ctx,cx+2+col*6,y+9+row*5,5,4,TCAT[c.k].c);});
    ctx.fillStyle='#4a4038';ctx.fillText(String(c.list.length),cx+cw/2,y+h-4);
  });
  ctx.textAlign='left';
}});
// planning mural des crons (couloir, à gauche du bureau du boss)
const PLANR={x:18*TS+4,y:7*TS-6,w:3*TS+4,h:36};
FURN.push({y:-1,draw:()=>{
  const {x,y,w,h}=PLANR;
  R(ctx,x,y,w,h,'#3d4250');R(ctx,x+2,y+2,w-4,h-4,'#1f2430');
  ctx.font='bold 5px ui-monospace,Menlo,monospace';ctx.fillStyle='#9fb7d9';ctx.fillText('PROCHAINS CRONS',x+5,y+9);
  const next=planningToday().filter(p=>p.t>=T&&!p.hourly).slice(0,3);
  ctx.font='6px ui-monospace,Menlo,monospace';
  if(!next.length){ctx.fillStyle='#8a93a6';ctx.fillText("fini pour aujourd'hui",x+5,y+20);}
  next.forEach((p,i)=>{
    ctx.fillStyle=i===0?'#ffd479':'#e6e9ef';
    ctx.fillText(hm(p.t)+' '+(p.who?p.who.name:String(p.c.name).slice(0,10)),x+5,y+17+i*7);
  });
}});
// plantes
const plant=(x,y)=>FURN.push({
  y:y*TS+28,
  draw:()=>{
    const px=x*TS+16,py=y*TS+28;
    R(ctx,px-7,py-12,14,12,'#b4643c');
    R(ctx,px-8,py-14,16,3,'#c97a4c');
    ctx.fillStyle='#3f8a4a';
    for(const [a,b,r] of [[0,-24,8],[-6,-18,6],[6,-19,6],[0,-32,5]]){ctx.beginPath();ctx.arc(px+a,py+b,r,0,7);ctx.fill();}
    ctx.fillStyle='#57a862';
    ctx.beginPath();
    ctx.arc(px-2,py-27,3,0,7);
    ctx.fill();
  }
});
plant(1,10);plant(11,2);plant(1,18);plant(38,18);plant(38,12);plant(13,12);

// ---------- familles : équipe (humains), workflows (agents IA), visiteurs (discussions) ----------
const famOf=c=>c.visitor?'vis':c.person?'team':'wf';
const FAM={
  team:{t:'Équipe',ico:'',bg:'rgba(20,22,30,.8)',c:'#cfc6b2'},
  wf:{t:'Agents',ico:'⚙ ',bg:'#1d4ed8',c:'#3b82f6'},
  vis:{t:'Visiteurs',ico:'💬 ',bg:'#c2410c',c:'#d97757'}
};
let FILTER=null; // null = tout le monde ; sinon une famille mise en avant
// workflows en hologramme : teinte cyan, lignes de balayage qui défilent, halo, scintillement rare
const HOLO=document.createElement('canvas');HOLO.width=64;HOLO.height=64;const hctx=HOLO.getContext('2d');
function holoFrame(img,sx,sy,now,lines){
  hctx.globalCompositeOperation='source-over';hctx.clearRect(0,0,64,64);hctx.drawImage(img,sx,sy,64,64,0,0,64,64);
  hctx.globalCompositeOperation='source-atop';hctx.fillStyle='rgba(70,190,255,.55)';hctx.fillRect(0,0,64,64);
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
  const bob=(c.pose==='type'&&!c.moving&&(c.dir==='left'||c.dir==='right')?(Math.floor(now/320+c.phase)%2):0)+(c.boss&&!c.moving&&c.tile&&c.tile[0]===22&&c.tile[1]===8?9:0);
  const dx=x-32-(c.sprite==='boss_sax'?5:0), dy=y-60+bob;
  if(famOf(c)==='wf'){
    const glitch=(Math.floor(now/110)+Math.floor(c.phase*7))%41===0;
    ctx.save();ctx.globalAlpha=glitch?.45:.9;ctx.shadowColor='rgba(80,200,255,.75)';ctx.shadowBlur=7;
    ctx.drawImage(holoFrame(img,fx*64,fy*64,now,true),0,0,64,64,dx+(glitch?1:0),dy,64,64);ctx.restore();
  }else ctx.drawImage(img,fx*64,fy*64,64,64,dx,dy,64,64);
}
// chemin vers sa place quand le personnage sélectionné n'y est pas (café, réunion, toilettes...)
let TRAIL={k:null,v:null};
function drawSeatTrail(c,now){
  const s=c.boss?[22,8]:c.seat; if(!s||!c.tile)return;
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
// étiquette de nom sous les pieds : toujours pour le sélectionné, sinon selon le réglage « Noms sur le plan »
let NAMES='hover', hoverKey=null, NAME_BOXES=[];
const TV_TXT=1.45; // agrandissement des noms et des bulles en mode TV
try{NAMES=localStorage.getItem('bureau:names')||'hover';}catch(e){}
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
// ---------- bulles : ticket(s) d'un collègue, ticket ou PR d'un agent ----------
const TYPE_ICO={Bug:'🐛',Story:'📗',Tâche:'🔧',Task:'🔧','Sous-tâche':'🔹','Sub-task':'🔹',Epic:'⚡'};
const CAT_TXT={doing:'en cours',review:'en review',test:'en test',todo:'à faire'};
const CAT_COLOR={doing:'#2e9e5b',review:'#4a7fe0',test:'#7a5cc8',todo:'#8a8478'};
const BUBBLE_ROT=4000; // une bulle à plusieurs tickets passe au suivant toutes les 4 s
const clip=(s,n)=>{s=clean(s).trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;};
const tkHead=(x,short)=>(TYPE_ICO[x.type]||'🎫')+' '+(short?String(x.key).replace(/^[A-Z][A-Z0-9]*-/,''):x.key); // compact : sans le préfixe projet
function tkAge(x,t){const u=x&&ms(x.updated);if(!u)return '';const d=Math.floor((t-u)/864e5);return d>=1?d+' j':'';}
function tkLines(x,t){
  const age=tkAge(x,t);
  return [{txt:tkHead(x)+' · '+(CAT_TXT[x.cat]||x.status||'')+(age?' · '+age:''),b:true,tone:CAT_COLOR[x.cat]},{txt:clip(x.summary,40)}];
}
const keySeed=k=>[...String(k)].reduce((a,ch)=>a+ch.charCodeAt(0),0);
// head : texte compact toujours affiché ; detail : lignes du survol / de la sélection ; tone : couleur de l'état du ticket
function bubbleFor(c,st,t,clock){
  const tk=st.tk||[];
  if(tk.length){
    const i=tk.length>1?(Math.floor(clock/BUBBLE_ROT)+keySeed(c.key))%tk.length:0, x=tk[i];
    return {
      head:tkHead(x,true)+(tk.length>1?' '+(i+1)+'/'+tk.length:''),
      tone:CAT_COLOR[x.cat]||null,
      detail:tk.slice(0,4).flatMap(y=>tkLines(y,t)).concat(tk.length>4?[{txt:'+ '+(tk.length-4)+' autre(s)'}]:[])
    };
  }
  const ref=st.ref;
  if(ref){
    const what=ref.key||'PR #'+ref.pr, short=ref.key?String(ref.key).replace(/^[A-Z][A-Z0-9]*-/,''):'#'+ref.pr, busy=['work','srv','meet'].includes(st.st);
    const detail=[{txt:'🤖 '+what+(ref.key&&ref.pr?' · PR #'+ref.pr:''),b:true,tone:ref.t?CAT_COLOR[ref.t.cat]:null}];
    if(ref.t||ref.title)detail.push({txt:clip(ref.t?ref.t.summary:ref.title,40)});
    if(st.step)detail.push({txt:clip('Étape '+st.step.n+(st.act?' · '+st.act.label:''),40)});
    return {
      head:busy?'🤖 '+short:st.bubble||'🤖 '+short,
      tone:busy&&ref.t?CAT_COLOR[ref.t.cat]:null,
      detail,
      cloud:busy,
      tool:busy?st.act||null:null
    };
  }
  if(!st.bubble)return null;
  // agent au travail : nuage = l'étape en cours, l'outil part dans sa propre bulle
  const think=!c.person&&!c.visitor&&['work','srv','meet'].includes(st.st);
  const head=think&&st.act?String(st.stepBubble||'...'):String(st.bubble);
  return {head:st.st==='work'&&!c.visitor?head.slice(0,18):head,tone:null,detail:null,cloud:think,tool:think?st.act||null:null};
}
// ---------- double bulle (d'après ThoughtBubble.ts / ToolBubble.ts de Munder Difflin) ----------
// nuage clair = ce que fait l'agent (étape, ticket) ; bulle sombre = l'outil en cours, en entier pendant TOOL_FULL
// après chaque changement d'outil, puis réduite à son icône tant que l'outil reste le dernier connu (< 5 min)
const TOOL_FULL=6000, TOOL_POP=150;
function toolPhase(c,a,now){
  if(!a){c._tool=null;return null;}
  if(!c._tool||c._tool.k!==a.label)c._tool={k:a.label,since:now};
  const age=now-c._tool.since;
  return {full:age<TOOL_FULL,pop:Math.min(1,age/TOOL_POP)};
}
function drawCloud(bx,by,w,h,tx,ty){
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.roundRect?ctx.roundRect(bx+1,by+2,w,h,6):ctx.rect(bx+1,by+2,w,h);ctx.fill();
  ctx.fillStyle='#fffdf5';ctx.strokeStyle='#1a1320';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect?ctx.roundRect(bx+.5,by+.5,w,h,6):ctx.rect(bx+.5,by+.5,w,h);ctx.fill();ctx.stroke();
  // deux bouffées qui descendent vers la tête
  for(const [k,r] of [[.35,2.5],[.7,1.6]]){
    const px=bx+w/2+(tx-(bx+w/2))*k, py=by+h+(ty-(by+h))*k;
    ctx.beginPath();ctx.arc(Math.round(px)+.5,Math.round(py)+.5,r,0,7);ctx.fill();ctx.stroke();
  }
}
function drawToolBubble(a,ph,bx,by){
  const txt=ph.full?a.bubble:a.ico;
  const S=TV?TV_TXT:1;
  ctx.font=ph.full?'bold '+Math.round(9*S)+'px ui-monospace,Menlo,monospace':Math.round(11*S)+'px system-ui,sans-serif';
  const w=Math.ceil(ctx.measureText(txt).width)+(ph.full?10:6), h=Math.round((ph.full?14:15)*S), y=by-h-3+Math.round((1-ph.pop)*3);
  ctx.globalAlpha=ph.pop*.95;
  R(ctx,bx,y,w,h,'#1a1320');
  ctx.fillStyle='#fffdf5';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(txt,bx+w/2,y+h/2+1);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.globalAlpha=1;
}
const isFocus=c=>(sel===c.key||hoverKey===c.key)&&!!((c._st||{}).tk||(c._st||{}).ref);
// bulle détaillée au-dessus du personnage (survol ou sélection), gardée dans le canvas
function drawDetail(c,now){
  const st=c._st||{}, bb=bubbleFor(c,st,T,now); if(!c.pos||!bb||!bb.detail)return;
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y), lh=15, pad=7;
  const fontOf=l=>(l.b?'bold 12px':'11px')+' ui-sans-serif,system-ui,sans-serif';
  let w=0;for(const l of bb.detail){ctx.font=fontOf(l);w=Math.max(w,Math.ceil(ctx.measureText(l.txt).width));}
  w+=pad*2+4;const h=bb.detail.length*lh+pad;
  const bx=Math.max(4,Math.min(W-w-4,x-w/2)), by=Math.max(4,y-70-h-(sel===c.key?8:0));
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(bx+2,by+3,w,h);
  ctx.fillStyle='#fffdf8';ctx.fillRect(bx,by,w,h);
  ctx.fillRect(Math.max(bx+4,Math.min(bx+w-8,x-2)),by+h,4,3);
  ctx.textBaseline='middle';ctx.textAlign='left';
  bb.detail.forEach((l,i)=>{
    const ly=by+pad/2+i*lh;
    if(l.tone){ctx.fillStyle=l.tone;ctx.fillRect(bx,ly,3,l.b&&bb.detail[i+1]&&!bb.detail[i+1].b?lh*2:lh);}
    ctx.font=fontOf(l);ctx.fillStyle=l.b?'#25221d':'#5c564c';ctx.fillText(l.txt,bx+pad+2,ly+lh/2+.5);
  });
  ctx.textBaseline='alphabetic';
}
function render(now){
  ctx.drawImage(bg,0,0); drawWindows(T,now);
  const list=FURN.map(f=>({y:f.y,d:f.draw}));
  for(const c of chars)if(c.present&&c.pos)list.push({y:c.pos.y,d:n=>drawChar(c,n)});
  list.sort((a,b)=>a.y-b.y);
  for(const it of list)it.d(now);
  drawLight(now); // voile du soir et de la nuit, sous les bulles et les noms
  const shown=c=>!FILTER||famOf(c)===FILTER||c.key===sel;
  if(FILTER){ // les autres familles passent dans l'ombre, la famille choisie est redessinée par-dessus
    ctx.fillStyle='rgba(10,12,22,.58)';ctx.fillRect(0,0,W,H);
    for(const c of chars.filter(c=>c.present&&c.pos&&shown(c)).sort((a,b)=>a.pos.y-b.pos.y))drawChar(c,now);
  }
  const sc=sel&&byKey[sel];
  if(sc&&sc.present&&sc.pos){
    const gx=sc.pos.x, gy=sc.pos.y-26, g=ctx.createRadialGradient(gx,gy,30,gx,gy,120);
    g.addColorStop(0,'rgba(10,12,22,0)');g.addColorStop(1,'rgba(10,12,22,.52)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    drawSeatTrail(sc,now);
  }
  for(const c of chars)if(c.present&&shown(c))drawOverlay(c,now);
  drawEnvelopes(now,FILTER?shown:null);
  NAME_BOXES=[];
  for(const c of chars)if(c.present&&c.key!==sel&&shown(c))drawName(c);
  if(sc&&sc.present)drawName(sc);
  for(const c of chars)if(c.present&&shown(c)&&isFocus(c))drawDetail(c,now);
  {
    const b=chars.find(c=>c.boss);
    if(b&&b.pos&&b._st&&b._st.st==='sax'&&!b.moving){
      ctx.font='bold 12px system-ui,sans-serif';
      for(let i=0;i<3;i++){
        const k=((now/1400)+i/3)%1;
        ctx.fillStyle=`rgba(201,162,39,${1-k})`;
        ctx.fillText(i%2?'♫':'♪',b.pos.x+10+Math.sin(k*6+i)*6+k*10,b.pos.y-40-k*34);
      }
    }
  }
  const sg=stageAt(T);
  if(sg&&sg.phase==='done'){
    const cols=['#e0a020','#d1453b','#2f6fd6','#2e9e5b','#7a5cc8'];
    for(let i=0;i<40;i++){
      const k=((now/1800)+hash(i,3))%1;
      R(ctx,28*TS+hash(i,7)*4*TS+Math.sin(now/300+i)*4,2*TS-8+k*3*TS,3,3,cols[i%5]);
    }
  }
}

