// ---------- plan : toile, sol et murs (cuits une fois dans bg), fenêtres et horloge ----------
const cv=document.getElementById('cv');
let ctx=cv.getContext('2d'); // let : la cuisson des meubles (40-furniture.js) dessine un moment dans une autre toile
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
    themeWindow(x*TS+6,TS+6,TS*1.5-4,16,now||0,x); // 46-themes.js : neige, feux d'artifice
    R(ctx,x*TS+4+TS*.75,TS+4,2,20,'#e7e1d3');
  }
  // horloge sur le mur bas de la cafétéria
  const cx=3*TS, cy=11*TS+18;
  ctx.fillStyle='#f7f5ef';ctx.beginPath();ctx.arc(cx,cy,10,0,7);ctx.fill();ctx.strokeStyle='#3a3530';ctx.lineWidth=2;ctx.stroke();
  const parts=dtf('en-GB',{hour:'numeric',minute:'numeric',hour12:false}).formatToParts(new Date(t));
  const hh=+parts.find(p=>p.type==='hour').value, mm=+parts.find(p=>p.type==='minute').value;
  const ha=((hh%12)+mm/60)/12*Math.PI*2-Math.PI/2, ma=mm/60*Math.PI*2-Math.PI/2;
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ha)*5,cy+Math.sin(ha)*5);ctx.stroke();
  ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ma)*8,cy+Math.sin(ma)*8);ctx.stroke();
}

