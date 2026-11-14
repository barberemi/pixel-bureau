// ---------- les Combles : l'étage secret ----------
// Une chambre de geek sous le toit, au-dessus du dernier étage : alphabet de Stranger Things, présentoir Poudlard et Hyrule,
// carte de la Terre du Milieu, lit Pac-Man, table de jeu de rôle, borne d'arcade, l'Anneau en lampe de chevet. Caché tant que
// le digicode du RDC n'a pas été trouvé (bureau:combles, dans ce navigateur) : pas d'onglet, pas de tuile dans L'immeuble,
// pas de mode TV. Dessiné au repère de la maquette (981 × 576), agrandi ×1,5 à la taille des étages (AT_W × AT_H).
const CB_FLOOR=4, CB_S=1.5, CB_VW=AT_W/CB_S, CB_VH=AT_H/CB_S, CB_WALL=128;
let CB_HITS=[], CB_GLOW=[], CB_PICK=null;
const comblesOn=()=>{try{return localStorage.getItem('bureau:combles')==='1';}catch(e){return false;}};
function comblesUnlock(){try{localStorage.setItem('bureau:combles','1');}catch(e){}atelierTabs();}
function comblesForget(){try{localStorage.removeItem('bureau:combles');}catch(e){}setFloor(0);}
function cbReset(){CB_HITS=[];CB_PICK=null;}
const cbUrl=()=>typeof CFG.combles_url==='string'&&/^https:\/\//.test(CFG.combles_url)?CFG.combles_url:null;
// la nuit des Combles : hors des heures de bureau, la lucarne montre la lune et la pièce passe en lumière de veillée
const cbNight=t=>{const h=parisHM(t).h;return h>=RHYTHM.office_hours[1]||h<RHYTHM.office_hours[0];};
const CB_HELP={tabs:[['qui','Qui'],['ou','Où'],['moments','Moments']],
  bar:()=>'<span>🕹 la borne : Sprint Quest</span><span>🌙 le soir, l\'équipe monte</span><span>✨ le vif d\'or se promène</span>',
  postes:()=>[],
  qui:'<p><b>L\'équipe</b>, le soir après les heures de bureau : elle monte jouer, et change de place de temps en temps.</p><p>Le jour, la pièce est vide.</p>',
  ou:'<p><b>La borne</b> : Sprint Quest, la rétro en jeu d\'arcade. <b>La table</b> : la quête du sprint, avec son MJ. <b>Le lit</b>, l\'Anneau en lampe de chevet, et la trappe qui redescend.</p>',
  moments:'<p><b>🌙 Le soir</b> : la lucarne s\'allume de lune, les lettres du mur s\'éclairent.</p>'};
// ---------- le dessin ----------
const cbP=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const cbPoly=(pts,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(...pts[0]);for(const p of pts.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fill();};
const cbTxt=(s,x,y,size,c,font)=>{ctx.font=font||'bold '+size+'px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c;ctx.fillText(s,x,y);};
function cbGlow(x,y,r,c,a){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c.replace('A',a));g.addColorStop(1,c.replace('A',0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
// une zone du plan qui répond au survol (et au clic pour la borne), en coordonnées de la toile
const cbHit=(kind,x,y,w,h)=>CB_HITS.push({kind,x:x*CB_S,y:y*CB_S,w:w*CB_S,h:h*CB_S});
function cbSol(){
  const VW=CB_VW, VH=CB_VH, WALL=CB_WALL;
  cbP(0,0,VW,VH,'#7a4e30');
  for(let y=WALL;y<VH;y+=13)cbP(0,y,VW,1.5,'#6a4228');
  for(let i=0;i<40;i++)cbP((i*131)%VW,WALL+(i*37)%(VH-WALL),1.5,11,'#5e3a22');
  // le mur du fond, en lambris ; les côtés bas sous le toit, assombris ; les poutres vues d'en haut
  cbP(0,0,VW,WALL,'#8a6448');for(let x=0;x<VW;x+=16)cbP(x,0,2,WALL,'#7a563c');cbP(0,0,VW,10,'#3a2416');cbP(0,WALL-6,VW,6,'#4a2f1e');
  for(const L of [0,1]){const g=ctx.createLinearGradient(L?VW:0,0,L?VW-120:120,0);g.addColorStop(0,'rgba(20,10,5,.55)');g.addColorStop(1,'rgba(20,10,5,0)');ctx.fillStyle=g;ctx.fillRect(L?VW-120:0,WALL,120,VH);}
  for(const x of [250,730]){ctx.fillStyle='rgba(30,15,8,.22)';ctx.fillRect(x,WALL,26,VH-WALL);}
}
function cbAlphabet(night){
  const x0=18, y0=14, w=212, h=104, rows=['ABCDEFGH','IJKLMNOPQ','RSTUVWXYZ'], cols=['#e8504a','#3f8fe0','#f2b33d','#4fb06a','#ec7fb0'];
  cbP(x0,y0,w,h,'#d8c9a0');for(let i=0;i<40;i++)cbP(x0+4+(i*37)%(w-8),y0+4+(i*23)%(h-8),3,3,['#b86a5a','#7a9a6a'][i%2]);
  rows.forEach((row,r)=>{const yy=y0+14+r*32, st=(w-12)/row.length;
    ctx.strokeStyle='#1e2a1a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x0+2,yy-7);
    for(let i=0;i<row.length;i++){const bx=x0+6+i*st+st/2;ctx.quadraticCurveTo(bx-st/2,yy+1,bx,yy-6);}ctx.lineTo(x0+w-2,yy-8);ctx.stroke();
    [...row].forEach((L,i)=>{const bx=x0+6+i*st+st/2, on=night&&L==='R';
      if(on)CB_GLOW.push([bx,yy,30,'rgba(255,236,190,A)',.8]);
      cbP(bx-1,yy-7,2,2,'#1e2a1a');cbP(bx-3,yy-5,6,7,on?'#fffbe8':cols[(i*2+r)%5]);cbTxt(L,bx,yy+13,14,'#151210','bold 14px Georgia,serif');});});
  cbHit('alphabet',x0,y0,w,h);
}
// le présentoir Poudlard et Hyrule : le bouclier, le Nimbus 2000
function cbPresentoir(){
  const x=244, y=12, w=120, h=106;
  cbP(x-3,y-3,w+6,h+6,'#3a2416');cbP(x,y,w,h,'#7a4e30');
  cbPoly([[x+42,y+8],[x+78,y+8],[x+78,y+38],[x+60,y+56],[x+42,y+38]],'#2a4aa8');cbPoly([[x+45,y+11],[x+75,y+11],[x+75,y+36],[x+60,y+51],[x+45,y+36]],'#3f6fd0');
  cbPoly([[x+60,y+16],[x+65,y+25],[x+55,y+25]],'#ffcf4a');cbPoly([[x+55,y+25],[x+60,y+34],[x+50,y+34]],'#ffcf4a');cbPoly([[x+65,y+25],[x+70,y+34],[x+60,y+34]],'#ffcf4a');
  cbP(x+8,y+76,86,4,'#8a5a32');cbPoly([[x+92,y+72],[x+114,y+68],[x+114,y+88],[x+92,y+84]],'#c9a05a');cbP(x+20,y+72,3,8,'#c9c3d9');cbP(x+78,y+72,3,8,'#c9c3d9');
  cbTxt('NIMBUS 2000',x+52,y+96,7,'#ffd86b');
  cbHit('presentoir',x,y,w,h);
}
// au centre : la carte de la Terre du Milieu, le sabre laser et l'épée Brotherhood croisés derrière
function cbCarte(){
  const cx=CB_VW/2, y=16;
  CB_GLOW.push([cx,y+40,80,'rgba(90,220,120,A)',.25]);
  ctx.save();ctx.translate(cx,y+50);ctx.rotate(-0.5); // le sabre : la poignée en bas à gauche, la lame vers le haut à droite
  cbP(-112,-4,30,8,'#9aa3b5');cbP(-104,-3,4,6,'#e8504a');cbP(-90,-3,6,6,'#3a3f55');cbP(-82,-3,190,6,'#7af59a');cbP(-82,-1,190,2,'#e8ffe8');ctx.restore();
  ctx.save();ctx.translate(cx,y+50);ctx.rotate(0.5);ctx.scale(-1,1); // l'épée de Tidus, en miroir
  cbP(-112,-4,24,8,'#2a2f5a');cbP(-88,-11,6,22,'#c9c3d9');cbPoly([[-82,-7],[70,-9],[108,0],[70,9],[-82,7]],'#4fa8d8');cbPoly([[-78,-3],[66,-4],[96,0],[66,4],[-78,3]],'#9be0ff');ctx.restore();
  const w=104, h=70, x=cx-w/2, my=y+18;
  cbP(x-3,my-3,w+6,h+6,'#5e3a22');cbP(x,my,w,h,'#e3d3a6');
  cbP(x+8,my+8,32,20,'#b9a678');cbP(x+44,my+30,26,16,'#9a8a62');cbP(x+76,my+12,20,32,'#7a6a4a');
  ctx.strokeStyle='#8a3a2a';ctx.setLineDash([3,3]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x+12,my+52);ctx.quadraticCurveTo(x+44,my+22,x+84,my+30);ctx.stroke();ctx.setLineDash([]);
  cbP(x+82,my+26,6,6,'#c8433d');cbTxt('MORDOR',x+78,my+52,7,'#5a2a1a');cbTxt('TERRE DU MILIEU',cx,my+h-7,7,'#3a2416');
  cbHit('carte',x,my,w,h);
}
function cbLucarne(night){
  const x=624, y=14, w=70, h=96;cbP(x-6,y-6,w+12,h+12,'#3a2416');cbP(x,y,w,h,night?'#16163a':'#8fc8f0');
  if(night){ctx.fillStyle='#fff2c4';ctx.beginPath();ctx.arc(x+50,y+22,8,0,7);ctx.fill();for(let i=0;i<8;i++)cbP(x+6+(i*29)%58,y+8+(i*17)%70,1.5,1.5,'#ffe9a8');}
  cbP(x+w/2-2,y,4,h,'#3a2416');cbP(x,y+h/2-2,w,4,'#3a2416');
}
// l'étagère : le casque de Master Chief, la pokéball, la lampe bloc « ? »
function cbEtagere(night){
  const x=730, y=92;cbP(x,y,230,7,'#4a2f1e');
  cbP(x+14,y-34,40,34,'#556b2f');cbP(x+16,y-28,36,16,'#c98a1c');cbP(x+19,y-26,14,4,'#fff0b0');
  cbP(x+70,y-18,18,9,'#e8504a');cbP(x+70,y-9,18,9,'#f3f0e6');cbP(x+70,y-10,18,3,'#1a1a1a');
  cbP(x+104,y-28,26,28,'#f2b33d');cbTxt('?',x+117,y-13,18,'#7a4a10');if(night)CB_GLOW.push([x+117,y-14,60,'rgba(255,200,60,A)',.4]);
  cbHit('etagere',x,y-36,230,43);
}
// vus de dessus : le lit Pac-Man et son canard, l'écharpe de Gryffondor au pied
function cbLit(){
  const x=34, y=250, w=112, h=196;
  cbP(x-4,y-6,w+8,h+10,'#4a2f1e');cbP(x,y,w,h,'#1d2c78');cbP(x+10,y+6,w-20,30,'#e9e4d4');
  [[x+12,y+110,'#e8504a'],[x+44,y+118,'#ec7fb0'],[x+76,y+110,'#3fc1c0']].forEach(([gx,gy,c])=>{cbP(gx,gy,20,18,c);cbP(gx+4,gy+5,5,5,'#fff');cbP(gx+11,gy+5,5,5,'#fff');});
  for(let i=0;i<6;i++)cbP(x+12+i*15,y+160,4,4,'#ffd8b0');ctx.fillStyle='#ffcf4a';ctx.beginPath();ctx.arc(x+w-16,y+162,10,.5,2*Math.PI-.5);ctx.lineTo(x+w-16,y+162);ctx.fill();
  cbP(x+60,y+52,30,20,'#ffd84a');cbP(x+78,y+40,18,18,'#ffd84a');cbP(x+94,y+47,9,6,'#ff8a3d');cbP(x+87,y+44,3,3,'#17151f');
  for(let i=0;i<8;i++)cbP(x+w+4,y+4+i*8,9,8,i%2?'#ffcf4a':'#8a1a1a');
  cbHit('lit',x,y,w,h);
}
function cbTable(night){
  CB_GLOW.push([490,330,180,'rgba(255,190,110,A)',night?.22:.06]);
  ctx.fillStyle='#4a2a6a';ctx.beginPath();ctx.ellipse(490,330,175,100,0,0,7);ctx.fill();ctx.fillStyle='#5a3a7a';ctx.beginPath();ctx.ellipse(490,330,160,88,0,0,7);ctx.fill();
  cbP(388,270,204,120,'#6a4228');cbP(398,280,184,100,'#d9c99a');for(let x=398;x<582;x+=13)cbP(x,280,1,100,'#b9a678');for(let y=280;y<380;y+=13)cbP(398,y,184,1,'#b9a678');
  cbP(420,300,40,26,'#8fb36a');cbP(480,320,50,24,'#6a8fc0');cbP(548,296,24,30,'#c8433d');cbTxt('MJ',560,311,8,'#fff');
  cbPoly([[410,350],[419,345],[428,350],[428,360],[419,365],[410,360]],'#e8504a');cbTxt('20',419,355,7,'#fff');cbTxt('LA QUÊTE DU SPRINT',490,288,7,'#5a3a22');
  cbHit('table',388,270,204,120);
}
const CB_BORNE={x:826,y:196,w:78,h:156};
function cbBorne(now,night){
  const {x,y,w,h}=CB_BORNE, blink=!REDUCED_MOTION&&Math.floor(now/300)%2;if(night)CB_GLOW.push([x+39,y+60,120,'rgba(120,200,255,A)',.3]);
  cbP(x-4,y,4,h,'#2a2150');cbP(x+w,y,4,h,'#2a2150');cbP(x,y,w,h,'#3a2e6b');cbP(x,y,w,4,'#5a4a9e');
  cbP(x+6,y+8,w-12,16,blink?'#ff5fa8':'#ff8ac0');cbTxt('SPRINT QUEST',x+w/2,y+16,7,'#2a1240');
  cbP(x+8,y+30,w-16,50,'#05030c');cbTxt('INSERT',x+w/2,y+48,8,'#ffcf4a');cbTxt('COIN',x+w/2,y+62,8,'#ffcf4a');
  cbP(x+2,y+86,w-4,22,'#2a2150');cbP(x+12,y+90,4,10,'#17151f');cbP(x+9,y+88,10,5,'#e8504a');cbP(x+34,y+94,7,7,'#ffcf4a');cbP(x+46,y+94,7,7,'#3fc1c0');cbP(x+58,y+94,7,7,'#e8504a');
  cbP(x+16,y+114,w-32,30,'#241c46');cbP(x+24,y+120,10,4,'#05030c');cbP(x+44,y+120,10,4,'#05030c');cbP(x+24,y+128,10,4,'#ff5f6d');cbP(x+44,y+128,10,4,'#ff5f6d');
  cbP(x,y+h-6,w,6,'#241c46');
  cbHit('borne',x-4,y,w+8,h);
}
// la lampe de chevet : l'Anneau unique flotte au-dessus d'un pied en pierre
function cbAnneau(night){
  const x=172, y=262;
  cbP(x-18,y-6,36,30,'#5e3a22');cbP(x-18,y-6,36,4,'#7a4e30');
  cbP(x-6,y-14,12,10,'#7a7a8a');cbP(x-2,y-30,4,16,'#5a5a6a');
  CB_GLOW.push([x,y-38,night?70:30,'rgba(255,150,50,A)',night?.7:.35]);
  ctx.strokeStyle='#ffcf4a';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-38,9,5,0,0,7);ctx.stroke();
  ctx.strokeStyle='rgba(255,110,30,.9)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y-38,9,5,0,0,3.1);ctx.stroke();
  cbHit('anneau',x-18,y-48,36,72);
}
function cbTrappe(){cbP(452,520,76,52,'#2a1a10');cbP(455,523,70,49,'#120a06');for(let k=0;k<3;k++)cbP(462,528+k*13,56,4,'#8a5a32');cbHit('trappe',452,520,76,52);}
// le vif d'or : il se promène au-dessus de la pièce (immobile, au-dessus de la table, avec les animations réduites)
function cbVif(now,night){
  const t=REDUCED_MOTION?0:now, x=490+Math.sin(t/1700)*300, y=300+Math.sin(t/1130)*120, f=Math.floor(t/80)%2;
  if(night)CB_GLOW.push([x,y,20,'rgba(255,220,90,A)',.6]);
  ctx.fillStyle='#ffcf4a';ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fill();cbP(x-13,y-(f?6:2),9,3,'#f3f0e6');cbP(x+4,y-(f?6:2),9,3,'#f3f0e6');
}
// ---------- le soir, l'équipe monte ----------
// Des heures de bureau à 23 h, toute l'équipe présente ce jour-là est aux Combles (les absents de la journée ou de
// l'après-midi restent chez eux), chacun à une place tirée pour la date ; toutes les CB_MOVE, quelqu'un change de place, en
// contournant la table par les allées. Tout se déduit de T : le rejeu et les captures montrent la même soirée.
const CB_EVE_END=23, CB_MOVE=150e3, CB_SPEED=70; // vitesse en px de la maquette par seconde (les personnages y sont ×1,5)
const CB_SPOTS=[[420,430,'up'],[490,438,'up'],[560,430,'up'],[628,342,'left'],[864,392,'up'],[352,342,'right'],[300,172,'up'],[780,176,'up'],
  [470,222,'down'],[214,470,'up'],[690,470,'up'],[560,222,'down'],[380,222,'down'],[960,470,'left']];
const CB_LANE={top:250,bottom:420,left:360,right:620};
let CB_CREW_MEM=null;
function cbEvening(t){const h=parisHM(t).h;return h>=RHYTHM.office_hours[1]&&h<CB_EVE_END;}
const cbTeam=t=>chars.filter(c=>c.person&&c.sprite&&c.sprite!=='temp'&&!['journee','aprem','ferie'].includes(presenceAt(c,t).abs)).slice(0,CB_SPOTS.length);
// les places de chacun après n déplacements de la soirée ; move : le dernier {k, from, to}
function cbSeats(t){
  const d0=parisMidnight(t), start=d0+RHYTHM.office_hours[1]*36e5, n=Math.max(0,Math.floor((t-start)/CB_MOVE)), team=cbTeam(t), key=d0+':'+team.map(c=>c.key).join(',');
  if(!CB_CREW_MEM||CB_CREW_MEM.key!==key||CB_CREW_MEM.n>n){
    const r=rng(keySeed('combles-soir')*7919+daySeed(t)), order=CB_SPOTS.map((_,i)=>i);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    CB_CREW_MEM={key,n:0,r,team,at:team.map((_,i)=>order[i]),move:null,start};
  }
  const M=CB_CREW_MEM;
  while(M.n<n&&M.team.length){M.n++;
    const k=Math.floor(M.r()*M.team.length), free=CB_SPOTS.map((_,i)=>i).filter(i=>!M.at.includes(i));
    if(!free.length){M.move=null;continue;}
    const to=free[Math.floor(M.r()*free.length)];M.move={k,from:M.at[k],to,at:M.start+M.n*CB_MOVE};M.at[k]=to;}
  return M;
}
// le trajet d'une place à l'autre : jusqu'à l'allée du haut ou du bas, le long de l'allée, par une allée de côté si la table
// est entre les deux
function cbPath(a,b){
  const lane=p=>p[1]<330?CB_LANE.top:CB_LANE.bottom, la=lane(a), lb=lane(b), pts=[[a[0],a[1]],[a[0],la]];
  if(la!==lb){const sx=Math.abs((a[0]+b[0])/2-CB_LANE.left)<Math.abs((a[0]+b[0])/2-CB_LANE.right)?CB_LANE.left:CB_LANE.right;pts.push([sx,la],[sx,lb]);}
  pts.push([b[0],lb],[b[0],b[1]]);
  return pts;
}
// où est un marcheur parti à « at », à l'instant t : {x, y, dir, moving}
function cbWalk(pts,dt){
  let d=Math.max(0,dt)/1000*CB_SPEED;
  for(let i=1;i<pts.length;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],L=Math.abs(x1-x0)+Math.abs(y1-y0);if(!L)continue;
    if(d<L){const k=d/L;return {x:x0+(x1-x0)*k,y:y0+(y1-y0)*k,dir:x1>x0?'right':x1<x0?'left':y1>y0?'down':'up',moving:true};}d-=L;}
  return null;
}
function cbCrew(t){
  if(!cbEvening(t))return [];
  const M=cbSeats(t);
  return M.team.map((c,i)=>{const s=CB_SPOTS[M.at[i]];let p={x:s[0],y:s[1],dir:s[2],moving:false};
    if(M.move&&M.move.k===i){const w=cbWalk(cbPath(CB_SPOTS[M.move.from],s),t-M.move.at);if(w)p=w;}
    return {c,p};});
}
function cbDrawCrew(now){
  cbCrew(T).map(({c,p})=>Object.assign(Object.create(Object.getPrototypeOf(c)),c,{pos:{x:p.x,y:p.y},tile:null,dir:p.dir,moving:p.moving,pose:'stand',present:true,boss:false,_st:{st:'idle'}}))
    .sort((a,b)=>a.pos.y-b.pos.y).forEach(c=>{drawChar(c,now);cbHit('crew:'+c.key,c.pos.x-12,c.pos.y-44,24,46);});
}
function renderCombles(now){
  const night=cbNight(T);CB_HITS=[];CB_GLOW=[];
  ctx.save();ctx.setTransform(CB_S,0,0,CB_S,0,0);
  cbSol();cbAlphabet(night);cbPresentoir();cbCarte();cbLucarne(night);cbEtagere(night);cbLit();cbTable(night);cbAnneau(night);cbBorne(now,night);cbTrappe();cbDrawCrew(now);cbVif(now,night);
  if(night){ctx.save();ctx.globalCompositeOperation='multiply';ctx.fillStyle='rgba(70,60,120,.55)';ctx.fillRect(0,0,CB_VW,CB_VH);ctx.restore();}
  for(const g of CB_GLOW)cbGlow(...g);
  ctx.restore();
  const e=ETAGES[CB_FLOOR];plaque(ctx,10,6,(e.n+' · '+e.nom).toUpperCase(),e.c);
}
// ---------- survol, clic, panneau ----------
const CB_TIPS={borne:'La borne Sprint Quest : clic pour jouer',table:'La quête du sprint : la table de jeu de rôle, le MJ et son d20',lit:'Le lit Pac-Man, et le canard en peluche',
  anneau:'L\'Anneau unique, en lampe de chevet',alphabet:'L\'alphabet du mur : une lettre s\'allume le soir',presentoir:'Le bouclier d\'Hyrule et le Nimbus 2000',
  carte:'La Terre du Milieu, le sabre laser et l\'épée Brotherhood',etagere:'Le casque de Master Chief, une pokéball et le bloc « ? »',trappe:'La trappe : clic pour redescendre au RDC'};
function cbHitAt(e){
  const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width, my=(e.clientY-r.top)*AT_H/r.height;
  for(let k=CB_HITS.length-1;k>=0;k--){const h=CB_HITS[k];if(mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h)return h;}
  return null;
}
function comblesClick(e){
  const h=cbHitAt(e);if(h&&h.kind==='trappe'){setFloor(0);return;}
  CB_PICK=h&&h.kind==='borne'?'borne':null;SIDE_FOLDED=false;renderSide(true); // la borne : son lien dans le panneau (la sandbox bloque window.open)
}
function comblesHover(e){
  const h=cbHitAt(e), who=h&&h.kind.startsWith('crew:')&&byKey[h.kind.slice(5)], s=who?who.name+' · monté jouer aux Combles':h?CB_TIPS[h.kind]||'':'';cv.style.cursor=h&&(h.kind==='trappe'||h.kind==='borne')?'pointer':'default';
  if(s){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';tip.textContent=s;}else tip.style.display='none';
}
function drawComblesSide(side){
  if(sel!=null){setFloor(0);return;}
  const box=document.createElement('div');box.className='atelier combles';side.appendChild(box);
  if(CB_PICK==='borne'){const u=cbUrl();
    box.innerHTML='<button type="button" class="at-back">‹ Les Combles</button><h3>🕹 Sprint Quest</h3>'+(u
      ?'<p>La rétro du sprint en jeu d\'arcade, à plusieurs, sur claude.ai.</p><p><a class="cb-play" href="'+esc(u)+'" target="_blank" rel="noopener">▶ Jouer à Sprint Quest</a></p>'
      :'<p>La borne n\'est pas encore branchée.</p><p class="mut">Pour l\'allumer : l\'adresse de Sprint Quest dans <code>combles.url</code> de bureau.config.json, puis republier la page.</p>');
    box.querySelector('.at-back').addEventListener('click',()=>{CB_PICK=null;renderSide(true);});return;}
  box.innerHTML='<h3>🕹 Les Combles</h3><p>Tu as trouvé l\'étage secret. Le soir, l\'équipe monte jouer ; la borne ouvre Sprint Quest.</p>'+
    '<p class="mut">L\'onglet reste dans ce navigateur. Pour le cacher de nouveau, referme la trappe.</p>'+
    '<button type="button" class="cb-forget">Refermer la trappe</button>';
  box.querySelector('.cb-forget').addEventListener('click',comblesForget);
}
// ---------- le digicode du RDC ----------
// Un boîtier au mur, juste à côté de l'entrée principale (la sortie du plan) : au clic, son pavé s'ouvre ; on tape au clavier
// (flèches, B, A) ou au clic, les touches tapées s'affichent. Le code n'est pas écrit ici : seulement son empreinte SHA-256,
// comparée une fois dix touches tapées (un easter egg, pas une sécurité). Le bon code ouvre la trappe et monte aux Combles.
const DIGI_LEN=10, DIGI_SHA='c4e03bcf58b43b181b48758aaacab4697b08cf6839ef372cac24a610d4b0cda4';
const DIGI_KEYS={ArrowUp:'U',ArrowDown:'D',ArrowLeft:'L',ArrowRight:'R',b:'B',B:'B',a:'A',A:'A'}, DIGI_GLYPH={U:'↑',D:'↓',L:'←',R:'→',B:'B',A:'A'};
const DIGI_W=520, DIGI_H=420, DIGI_OK_MS=1600, DIGI_NO_MS=900;
let DIGI={open:false,typed:'',ok:0,no:0,hits:[]};
// SHA-256 en JS (crypto.subtle est asynchrone et absent hors contexte sûr) ; texte ASCII seulement, comme le code
function sha256(s){
  const K=[],H=[],ror=(x,n)=>x>>>n|x<<32-n;
  for(let n=2,i=0;i<64;n++){let p=true;for(let d=2;d*d<=n;d++)if(n%d===0){p=false;break;}if(!p)continue;if(i<8)H[i]=Math.pow(n,1/2)*2**32|0;K[i++]=Math.pow(n,1/3)*2**32|0;}
  const b=[...s].map(c=>c.charCodeAt(0)&255), l=b.length*8;b.push(0x80);while(b.length%64!==56)b.push(0);
  for(let i=7;i>=0;i--)b.push(i>3?0:l>>>i*8&255);
  for(let o=0;o<b.length;o+=64){
    const w=[];for(let i=0;i<64;i++)w[i]=i<16?b[o+i*4]<<24|b[o+i*4+1]<<16|b[o+i*4+2]<<8|b[o+i*4+3]
      :(ror(w[i-2],17)^ror(w[i-2],19)^w[i-2]>>>10)+w[i-7]+(ror(w[i-15],7)^ror(w[i-15],18)^w[i-15]>>>3)+w[i-16]|0;
    let [a,bb,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const t1=h+(ror(e,6)^ror(e,11)^ror(e,25))+(e&f^~e&g)+K[i]+w[i]|0, t2=(ror(a,2)^ror(a,13)^ror(a,22))+(a&bb^a&c^bb&c)|0;
      h=g;g=f;f=e;e=d+t1|0;d=c;c=bb;bb=a;a=t1+t2|0;}
    [a,bb,c,d,e,f,g,h].forEach((v,i)=>{H[i]=H[i]+v|0;});
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
// la place du boîtier : sur le mur qui borde l'entrée principale, côté intérieur (au-dessus de la porte, sinon en dessous) ;
// null si le plan n'en offre pas
function digiRect(){
  if(!EXIT)return null;
  const [ex,ey]=EXIT, vert=ex===0||ex===COLS-1, dx=ex===0?1:ex===COLS-1?-1:0, dy=vert?0:ey===0?1:-1;
  const door=(x,y)=>DOORS.some(d=>d[0]===x&&d[1]===y);
  let a=vert?ey:ex, b=a;while(door(vert?ex:a-1,vert?a-1:ey))a--;while(door(vert?ex:b+1,vert?b+1:ey))b++;
  const wall=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS&&grid[y][x]===1&&!GLASS.has(x+','+y);
  for(const k of [a-1,b+1]){const x=vert?ex+dx:k, y=vert?k:ey+dy;if(wall(x,y))return {x:x*TS+(TS-22)/2,y:y*TS+2,w:22,h:30};}
  return null;
}
const digiBlink=now=>REDUCED_MOTION||Math.floor(now/700)%2===0;
function drawDigicode(now){
  const r=digiRect();if(!r)return;
  const P=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
  P(r.x,r.y,22,30,'#2a2a3a');P(r.x+3,r.y+3,16,8,digiBlink(now)?'#62d48e':'#1f4a30');
  for(let k=0;k<6;k++)P(r.x+3+(k%3)*6,r.y+14+Math.floor(k/3)*6,4,4,'#c9c3d9');
  if(DIGI.open)drawDigiPad(now);
}
function digiPad(){return {x:Math.round((W-DIGI_W)/2),y:Math.max(0,Math.round((H-DIGI_H)/2)),w:DIGI_W,h:DIGI_H};}
function drawDigiPad(now){
  const P=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}, {x,y,w,h}=digiPad(), hits=[], ok=DIGI.ok&&now-DIGI.ok<DIGI_OK_MS, no=DIGI.no&&now-DIGI.no<DIGI_NO_MS;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='alphabetic';
  P(0,0,W,H,'rgba(10,8,20,.6)');
  P(x,y,w,h,'#2a2a3a');P(x+6,y+6,w-12,h-12,'#3a3a4e');P(x+6,y+6,w-12,4,'#ffcf4a');
  ctx.font='bold 22px ui-monospace,monospace';ctx.fillStyle='#ffcf4a';ctx.fillText(ok?'ACCÈS AUTORISÉ':no?'ACCÈS REFUSÉ':'ACCÈS RÉSERVÉ',x+w/2,y+38);
  P(x+w-44,y+16,28,28,'#1e1a2c');ctx.font='bold 18px ui-monospace,monospace';ctx.fillStyle='#c9c3d9';ctx.fillText('✕',x+w-30,y+37);hits.push({k:'close',x:x+w-44,y:y+16,w:28,h:28});
  P(x+30,y+60,w-60,70,no?'#3a1010':'#0a1a10');
  ctx.font='bold 30px ui-monospace,monospace';
  for(let i=0;i<DIGI_LEN;i++){const k=DIGI.typed[i];ctx.fillStyle=k?(no?'#ff6b6b':'#62d48e'):'#2a4a32';ctx.fillText(k?DIGI_GLYPH[k]:'_',x+58+i*45,y+106);}
  [['U',1,0],['L',0,1],['R',2,1],['D',1,2]].forEach(([k,c,r])=>{const bx=x+60+c*70, by=y+160+r*70;
    P(bx,by,60,60,'#c9c3d9');P(bx,by+54,60,6,'#7a748e');ctx.font='bold 28px ui-monospace,monospace';ctx.fillStyle='#1b1626';ctx.fillText(DIGI_GLYPH[k],bx+30,by+38);hits.push({k,x:bx,y:by,w:60,h:60});});
  [['B',330],['A',410]].forEach(([k,bx])=>{ctx.fillStyle='#c8433d';ctx.beginPath();ctx.arc(x+bx,y+260,30,0,7);ctx.fill();ctx.font='bold 26px ui-monospace,monospace';ctx.fillStyle='#fff';ctx.fillText(k,x+bx,y+270);hits.push({k,x:x+bx-30,y:y+230,w:60,h:60});});
  ctx.font='16px ui-sans-serif,system-ui';ctx.fillStyle='#c9c3d9';ctx.fillText(ok?'Une trappe s\'ouvre au plafond...':'Flèches et touches B / A, au clavier ou au clic',x+w/2,y+390);
  ctx.restore();DIGI.hits=hits;
}
function digiOpen(){DIGI={open:true,typed:'',ok:0,no:0,hits:[]};}
function digiClose(){DIGI.open=false;}
// une touche : à la dixième, l'empreinte décide ; le bon code monte aux Combles une fois l'écran « autorisé » lu
function digiPress(k){
  const now=Math.max(1,performance.now());if(!DIGI.open||DIGI.ok)return; // 0 se lirait « pas encore »
  if(DIGI.no){DIGI.no=0;DIGI.typed='';}
  DIGI.typed+=k;if(DIGI.typed.length<DIGI_LEN)return;
  if(sha256(DIGI.typed)===DIGI_SHA){DIGI.ok=now;comblesUnlock();setTimeout(()=>{if(DIGI.ok!==now)return;digiClose();setFloor(CB_FLOOR);},REDUCED_MOTION?0:DIGI_OK_MS);}
  else DIGI.no=now;
}
const digiXY=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height];};
const digiIn=(h,[mx,my])=>!!h&&mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h;
// au RDC, avant le reste : pavé ouvert, il prend tous les clics (dehors, il se ferme) ; sinon le boîtier l'ouvre
function digiClick(e){
  const m=digiXY(e);
  if(DIGI.open){const h=DIGI.hits.find(h=>digiIn(h,m));if(!h&&!digiIn(digiPad(),m)||h&&h.k==='close')digiClose();else if(h)digiPress(h.k);return true;}
  if(digiIn(digiRect(),m)){digiOpen();return true;}
  return false;
}
addEventListener('keydown',e=>{
  if(!DIGI.open||FLOOR||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==='Escape')digiClose();else if(DIGI_KEYS[e.key])digiPress(DIGI_KEYS[e.key]);else return;
  e.preventDefault();e.stopImmediatePropagation(); // ni défilement par les flèches, ni mode TV (T) pendant la saisie
});
// ---------- les indices, au RDC, tant que les Combles n'ont pas été trouvées ----------
// la diode du boîtier clignote (drawDigicode) ; le canard le dit une fois par jour, une minute à une heure tirée pour la date
// (la même pour tout le monde, rejouable) ; un post-it sur l'écran du boss, que son survol lit
const HINT_DUCK='Coin... le boîtier de l\'entrée aime les flèches', HINT_DUCK_MS=60e3;
function duckHintWindow(t){
  const r=rng(keySeed('combles')*7919+daySeed(t)), [h0,h1]=RHYTHM.office_hours, s=parisMidnight(t)+((h0+1)*60+r()*Math.max(0,(h1-h0-2)*60))*60e3;
  return {s,e:s+HINT_DUCK_MS};
}
function duckHintOn(t){if(comblesOn())return false;const w=duckHintWindow(t);return t>=w.s&&t<w.e;}
function drawDuckHint(x,y,now){
  if(!duckHintOn(T))return;
  ctx.save();ctx.font='bold 12px ui-monospace,monospace';
  const w=Math.ceil(ctx.measureText(HINT_DUCK).width)+14, h=20, bx=Math.max(2,Math.min(x-w/2,W-w-2)), by=y-Math.round(34*DUCK_K)-h-6;
  ctx.fillStyle='#ffffff';ctx.strokeStyle='#c47f00';ctx.lineWidth=1;pixRect(ctx,bx,by,w,h);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-3,by+h);ctx.lineTo(x,by+h+5);ctx.lineTo(x+3,by+h);ctx.fill();
  ctx.fillStyle='#3a2a00';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(HINT_DUCK,bx+7,by+h/2+1);ctx.restore();
}
// le post-it : au coin de l'écran du boss (bureau du boss, 40-furniture.js), dans le repère du meuble
const HINT_POSTIT='Un post-it sur l\'écran du boss : « ↑↑↓↓... et après ? »';
function drawBossPostit(x,y){
  if(comblesOn())return;
  R(ctx,x,y,9,9,'#f7e26b');R(ctx,x,y,9,2,'#e8c83a');R(ctx,x+2,y+4,5,1,'#5a4a10');R(ctx,x+2,y+6,4,1,'#5a4a10');
}
function bossPostitRect(){const o=furnAt('boss_desk');return o&&!comblesOn()?{x:21*TS-2+2+o.dx,y:9*TS-20-8+o.dy,w:9,h:9}:null;}
// au RDC, avant le reste : l'infobulle du digicode et du post-it
function comblesRdcTip(e){
  const m=digiXY(e);
  if(DIGI.open)return '';
  if(digiIn(digiRect(),m))return 'Un digicode, près de l\'entrée. Mais pour aller où ?';
  if(digiIn(bossPostitRect(),m))return HINT_POSTIT;
  return null;
}
