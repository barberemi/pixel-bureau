// ---------- mobilier (trié en profondeur avec les avatars) ----------
// fixed : meuble immobile, cuit une fois par bakeFurniture() ; sinon redessiné à chaque image (écrans, voyants, données)
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
      y:r*TS+1,fixed:true,
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
  y:8*TS+2,fixed:true,
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
  y:3*TS,fixed:true,draw:()=>{
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
  y:2*TS+30,fixed:true,
  draw:()=>{
    const px=1*TS+2,py=TS+8;
    R(ctx,px,py,28,52,'#eef1f3');
    R(ctx,px,py+20,28,2,'#c9ced3');
    R(ctx,px+22,py+6,2,10,'#9aa3ab');
    R(ctx,px+22,py+26,2,16,'#9aa3ab');
  }
});
FURN.push({
  y:6*TS,fixed:true,
  draw:()=>{
    const x0=4*TS+2,y0=6*TS-10;
    R(ctx,x0,y0+28,60,3,'rgba(0,0,0,.18)');
    R(ctx,x0,y0,60,26,'#d9b98c');
    R(ctx,x0,y0,60,2,'#ecd2a8');
    R(ctx,x0,y0+22,60,6,'#b8956a');
    R(ctx,x0+24,y0+6,8,6,'#d1453b');
  }
});
FURN.push({y:10*TS-6,fixed:true,draw:()=>{R(ctx,8*TS-4,10*TS-6,3*TS+8,16,'#3f6b8a');R(ctx,8*TS-4,10*TS-6,3*TS+8,3,'#4f80a3');}});
FURN.push({
  y:10*TS+31,fixed:true,
  draw:()=>{
    R(ctx,8*TS-8,10*TS+16,3*TS+16,14,'#355c77');
    R(ctx,8*TS-8,10*TS+4,8,26,'#2d4f66');
    R(ctx,11*TS,10*TS+4,8,26,'#2d4f66');
  }
});
FURN.push({
  y:7*TS+28,fixed:true,
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
  y:9*TS+28,fixed:true,
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
  y:2*TS-2,fixed:true,
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
  y:9*TS+31,fixed:true,draw:()=>{
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
  y:y*TS+28,fixed:true,
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
// meubles immobiles cuits une fois : ceux d'une même profondeur (même y) dessinés ensemble dans une toile de travail,
// rognés à leur rectangle utile, puis remplacés dans FURN par une seule recopie (tri en profondeur inchangé).
// Sans lecture des pixels possible (getImageData indisponible), ils restent dessinés à chaque image.
function bakeFurniture(){
  const scratch=document.createElement('canvas');scratch.width=W;scratch.height=H;
  const sc=scratch.getContext('2d',{willReadFrequently:true}), groups=new Map(), keep=ctx;
  for(const f of FURN)if(f.fixed){if(!groups.has(f.y))groups.set(f.y,[]);groups.get(f.y).push(f);}
  const baked=[];
  for(const [y,list] of groups){
    sc.clearRect(0,0,W,H);ctx=sc;try{for(const f of list)f.draw(0);}finally{ctx=keep;}
    let px;try{px=new Uint32Array(sc.getImageData(0,0,W,H).data.buffer);}catch(e){return;}
    if(px.length!==W*H)return;
    let x0=W,y0=H,x1=-1,y1=-1;
    for(let j=0;j<H;j++){const row=j*W;for(let i=0;i<W;i++)if(px[row+i]){if(i<x0)x0=i;if(i>x1)x1=i;if(y0===H)y0=j;y1=j;}}
    if(x1<0)continue;
    const spr=document.createElement('canvas');spr.width=x1-x0+1;spr.height=y1-y0+1;
    spr.getContext('2d').drawImage(scratch,x0,y0,spr.width,spr.height,0,0,spr.width,spr.height);
    baked.push({y,draw:()=>ctx.drawImage(spr,x0,y0)});
  }
  const moving=FURN.filter(f=>!f.fixed);
  FURN.length=0;FURN.push(...moving,...baked);
}
