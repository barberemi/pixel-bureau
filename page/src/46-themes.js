// ---------- thèmes saisonniers : décor, chapeaux et effets selon la date du plan (heure de Paris) ----------
// Choisis par la date affichée (T), donc rejoués par « Rejouer ». Config : ui.themes:false les coupe, ui.theme force
// un thème. Le sélecteur de « Comment lire le plan » en force un le temps de la visite (pas de stockage dans Kronn).
const THEMES=[
  {id:'nouvel-an',ico:'🎆',label:'Nouvel an',from:'12-31',to:'01-02'},
  {id:'saint-valentin',ico:'💘',label:'Saint-Valentin',from:'02-13',to:'02-14'},
  {id:'halloween',ico:'🎃',label:'Halloween',from:'10-24',to:'10-31'},
  {id:'noel',ico:'🎄',label:'Noël',from:'12-01',to:'12-30'},
];
let THEME_FORCE=(CFG.ui||{}).theme||null; // id d'un thème, 'off', ou null = selon la date
const parisYMD=t=>dtf('en-CA',{}).format(new Date(t)); // AAAA-MM-JJ
function themeAt(t){
  if(THEME_FORCE==='off')return null;
  if(THEME_FORCE)return THEMES.find(x=>x.id===THEME_FORCE)||null;
  if((CFG.ui||{}).themes===false)return null;
  const md=parisYMD(t).slice(5);
  return THEMES.find(x=>x.from<=x.to?md>=x.from&&md<=x.to:md>=x.from||md<=x.to)||null;
}
let THEME_MEMO={k:null,v:null};
function themeNow(){const k=Math.floor(T/60e3)+'|'+THEME_FORCE;if(THEME_MEMO.k!==k)THEME_MEMO={k,v:themeAt(T)};return THEME_MEMO.v;}
const themeIs=id=>{const th=themeNow();return !!th&&th.id===id;};
const GOLD=.6180339887; // suite de Weyl : positions bien réparties sur toute la largeur (hash() reste dans les petites valeurs)
const spread=(i,salt)=>(i*GOLD+(salt||0)*.137)%1;
const night=()=>daylight(T).k<.5;

// ---------- emojis : rendus une fois dans une petite toile (police couleur du système), puis recopiés ----------
const EMO={};
function emo(e,size){
  const k=e+'|'+size; if(EMO[k])return EMO[k];
  const c=document.createElement('canvas'), s=Math.ceil(size*1.35); c.width=c.height=s;
  const g=c.getContext('2d'); g.font=size+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign='center';g.textBaseline='middle';g.fillText(e,s/2,s/2+size*.08);
  return EMO[k]=c;
}
function E(e,x,y,size,alpha){
  const c=emo(e,size); if(alpha!=null)ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
  ctx.drawImage(c,Math.round(x-c.width/2),Math.round(y-c.height/2)); if(alpha!=null)ctx.globalAlpha=1;
}

// ---------- banderole (mur des toilettes, au-dessus du couloir) et guirlande (mur du fond) ----------
function bannerText(th){
  const ymd=parisYMD(T), md=ymd.slice(5);
  if(th.id==='noel'){const d=25-+md.slice(3);return d>0?'JOYEUX NOËL · J-'+d:'JOYEUX NOËL !';}
  if(th.id==='nouvel-an'){
    const yr=+ymd.slice(0,4)+(md==='12-31'?1:0), left=parisMidnight(T)+864e5-T;
    if(md==='12-31'&&parisHM(T).h>=12)return 'MINUIT DANS '+Math.floor(left/36e5)+' H '+String(Math.floor(left/6e4)%60).padStart(2,'0');
    return 'BONNE ANNÉE '+yr+' !';
  }
  return {'saint-valentin':'SAINT-VALENTIN','halloween':'HAPPY HALLOWEEN'}[th.id];
}
function banner(){
  const th=themeNow(); if(!th)return;
  const pal={'nouvel-an':['#1d2440','#f2c314'],'saint-valentin':['#b0254f','#ffe1ea'],'halloween':['#2a1a38','#ff9a2e'],'noel':['#8e1b1b','#fff6e0']}[th.id];
  const x0=33*TS+14, x1=38*TS+18, y=5*TS+7;
  R(ctx,x0,y,x1-x0,15,pal[0]);R(ctx,x0,y,x1-x0,2,'rgba(255,255,255,.25)');R(ctx,x0,y+15,x1-x0,2,'rgba(0,0,0,.25)');
  R(ctx,x0-3,y-3,3,20,'#5a4636');R(ctx,x1,y-3,3,20,'#5a4636');
  ctx.fillStyle=pal[1];ctx.font='bold 9px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.fillText(bannerText(th),(x0+x1)/2,y+11);ctx.textAlign='left';
  E(th.ico,x0-10,y+8,14);E(th.ico,x1+12,y+8,14);
}
function garland(now){
  const th=themeNow(); if(!th)return;
  const cols={'nouvel-an':['#f2c314','#e8e2d0','#c0c6cf','#d46fb0'],'saint-valentin':['#e0457b','#ff9ab8','#fff'],
    'halloween':['#ff9a2e','#7a3fb0','#3fd16b'],'noel':['#e53935','#ffd23f','#43a047','#42a5f5']}[th.id];
  const y0=TS+27, sag=6, lights=th.id==='noel'||th.id==='halloween';
  ctx.strokeStyle=th.id==='nouvel-an'?'#c9a227':'#2a2b33';ctx.lineWidth=1;ctx.beginPath();
  for(let x=0;x<=W;x+=4){const k=(x%96)/96;ctx.lineTo(x,y0+Math.sin(k*Math.PI)*sag);}ctx.stroke();
  for(let x=8,i=0;x<W;x+=16,i++){
    const k=(x%96)/96, y=Math.round(y0+Math.sin(k*Math.PI)*sag)+1, c=cols[i%cols.length];
    if(lights){const on=(Math.floor(now/500)+i)%3!==0;R(ctx,x-1,y,3,4,on?c:'#3a3a3a');if(on){ctx.globalAlpha=.25;R(ctx,x-3,y-2,7,8,c);ctx.globalAlpha=1;}}
    else{ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.lineTo(x,y+7);ctx.closePath();ctx.fill();}
  }
}

// ---------- décor posé au sol ou sur les meubles (entrées dynamiques de FURN, triées en profondeur) ----------
const BOSS_DESK={x:21*TS-2,top:9*TS-20}, KTABLE={x:4*TS+2,y:6*TS-10}, COUNTER_TOP=2*TS-14;
const ISLAND_TOP=cx=>({x:cx*TS+16-3,y:14*TS-6}), ISLAND_END=cx=>({x:cx*TS+16-3,y:17*TS-6});
function pumpkin(x,y,now,big){
  const s=big?1.8:1.4, w=Math.round(10*s), h=Math.round(8*s);
  R(ctx,x-w/2,y-h,w,h,'#e8731a');R(ctx,x-w/2+2,y-h,2,h,'#c95d10');R(ctx,x+w/2-4,y-h,2,h,'#c95d10');R(ctx,x-1,y-h-3,2,3,'#4a7a2a');
  const glow=daylight(T).k<.6&&(Math.floor(now/700+x)%7)!==0; // allumée le soir
  R(ctx,x-3,y-h+2,2,2,glow?'#ffe066':'#3a1a05');R(ctx,x+1,y-h+2,2,2,glow?'#ffe066':'#3a1a05');R(ctx,x-3,y-3,6,1,glow?'#ffe066':'#3a1a05');
}
function xmasTree(now){
  const px=13*TS+16, py=12*TS+30;
  ctx.save();ctx.translate(px,py);ctx.scale(1.35,1.35);ctx.translate(-px,-py);
  R(ctx,px-12,py-2,24,4,'rgba(0,0,0,.2)');R(ctx,px-3,py-8,6,7,'#6b4423');
  for(const [w,yy] of [[30,-10],[24,-22],[17,-33],[10,-43]]){ctx.fillStyle='#2e7d32';ctx.beginPath();ctx.moveTo(px-w/2,py+yy);ctx.lineTo(px+w/2,py+yy);ctx.lineTo(px,py+yy-14);ctx.closePath();ctx.fill();
    R(ctx,px-w/2+2,py+yy-1,w-4,1,'#1b5e20');}
  const bulbs=[[-9,-14],[7,-17],[-5,-26],[6,-29],[-3,-38],[3,-46],[-11,-12],[10,-12],[0,-20],[-7,-33]];
  bulbs.forEach(([bx,by],i)=>R(ctx,px+bx,py+by,2,2,(Math.floor(now/400)+i)%2?['#e53935','#42a5f5','#ffd23f','#fff'][i%4]:'#1b5e20'));
  ctx.restore();
  E('⭐',px,py-78,14);E('🎁',px-18,py-4,14);E('🎁',px+17,py-3,12);E('🎁',px+2,py+6,11);
}
function balloon(e,x,y,now,i){const b=Math.sin(now/700+i)*3;ctx.strokeStyle='rgba(60,60,70,.6)';ctx.beginPath();ctx.moveTo(x,y+8+b);ctx.lineTo(x+Math.sin(now/900+i)*2,y+24);ctx.stroke();E(e,x,y+b,16);}
const BALLOONS=[[1.6,2.3],[10.4,2.3],[18.6,7.6],[26.4,7.6],[34.4,6.2],[12.6,11.4]];
function tombs(){ // agents en panne en ce moment : une tombe chacun (des agents, jamais un collègue)
  const down=chars.filter(c=>c.present!==false&&!c.person&&!c.visitor&&c._st&&c._st.st==='error').slice(0,4);
  down.forEach((c,i)=>{const x=(2.4+i*1.5)*TS, y=18*TS+12;E('🪦',x,y,22);
    ctx.fillStyle='#e9e4f2';ctx.font='bold 6px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.fillText('RIP '+String(c.name).slice(0,7).toUpperCase(),x,y+17);ctx.textAlign='left';});
}
FURN.push({y:-1,draw:now=>{banner();garland(now);
  if(themeIs('noel')){E('🎀',11.6*TS,TS+16,14);E('🎀',26.7*TS,TS+16,14);E('🔔',17.3*TS,TS+18,12);}
  if(themeIs('nouvel-an')){ // boule à facettes : taches de lumière qui tournent sur le sol de la cafétéria
    const cx=6.5*TS, cy=6*TS, cols=['#ff6fb5','#5fd4ff','#ffd23f','#7dff8a'];
    for(let i=0;i<10;i++){const a=now/1400+i*.63, r=40+(i%3)*42;ctx.globalAlpha=.32;R(ctx,cx+Math.cos(a)*r*1.3-4,cy+Math.sin(a)*r*.75-3,8,6,cols[i%4]);}ctx.globalAlpha=1;
  }
}});
FURN.push({y:2*TS,draw:()=>{if(!themeIs('halloween'))return;
  for(const [x,y] of [[1.4,2.4],[11.6,2.4],[18.4,2.4],[26.6,2.4],[34.4,2.4],[1.4,12.4],[38.6,11.4]])E('🕸️',x*TS,y*TS,30);}});
FURN.push({y:2*TS+31,draw:now=>{
  if(themeIs('halloween')){pumpkin(5*TS+4,COUNTER_TOP,now);E('🎃',36.5*TS,10.6*TS,20);}
  if(themeIs('noel'))for(const x of [2.6,4.6,6.6])E('🧦',x*TS,2*TS+12,13);
}});
FURN.push({y:3*TS+12,draw:()=>{if(themeIs('halloween'))E('💀',26.3*TS,3*TS+6,16);}});
FURN.push({y:6*TS+1,draw:()=>{const {x,y}=KTABLE;
  if(themeIs('noel')){E('☕',x+12,y+6,11);E('🍪',x+46,y+8,11);}
  if(themeIs('saint-valentin'))E('💐',x+46,y+2,16);
  if(themeIs('nouvel-an'))E('🎂',x+46,y+4,14);
}});
FURN.push({y:9*TS+1,draw:now=>{const {x,top}=BOSS_DESK;
  if(themeIs('halloween')){E('🕯️',x+34,top+(Math.floor(now/180)%3?0:1),12);E('🍬',x+92,top+2,11);}
  if(themeIs('noel'))E('🕯️',x+34,top,12);
  if(themeIs('saint-valentin')){E('🍫',x+34,top+2,12);E('💝',x+92,top+1,12);}
  if(themeIs('nouvel-an'))E('🎉',x+92,top+1,12);
}});
FURN.push({y:12*TS+29,draw:now=>{if(themeIs('noel'))xmasTree(now);}});
FURN.push({y:13*TS+28,draw:()=>{if(themeIs('noel'))E('☃️',2*TS+16,13*TS+12,28);}});
FURN.push({y:11*TS+28,draw:()=>{if(themeIs('noel'))E('🦌',37*TS+16,11*TS+14,24);}});
FURN.push({y:14*TS-1,draw:now=>{
  ISLANDS.forEach((cx,i)=>{const p=ISLAND_TOP(cx);
    if(themeIs('halloween'))pumpkin(p.x,p.y,now,i%2===0);
    if(themeIs('noel'))E('🎁',p.x,p.y-6,13);
    if(themeIs('saint-valentin'))E('🌹',p.x,p.y-7,14);
    if(themeIs('nouvel-an'))E(['🎊','🥳','🎉'][i%3],p.x,p.y-6,13);
  });
}});
FURN.push({y:17*TS,draw:()=>{if(!themeIs('saint-valentin')&&!themeIs('noel'))return;
  ISLANDS.forEach((cx,i)=>{if(i%2)return;const p=ISLAND_END(cx);E(themeIs('noel')?'🍬':'💌',p.x,p.y-4,12);});}});
FURN.push({y:18*TS+20,draw:()=>{if(themeIs('halloween'))tombs();}});

// ---------- fenêtres : neige, lune, feux d'artifice ----------
function themeWindow(x,y,w,h,now,i){
  const th=themeNow(); if(!th)return;
  if(th.id==='noel'){
    ctx.fillStyle='rgba(255,255,255,.9)';
    for(let k=0;k<5;k++){const fx=x+((k*7+i*5)%w), fy=y+((now/40+k*13+i*17)%h);ctx.fillRect(Math.floor(fx),Math.floor(fy),1,1);}
    R(ctx,x,y+h-2,w,2,'#f4f8ff');
  }else if(th.id==='nouvel-an'&&night()){
    const p=(now/1600+i*.37)%1, cx=x+4+((i*11)%(w-8)), cy=y+h*.55-p*4, col=['#ffd23f','#ff6fb5','#5fd4ff','#7dff8a'][i%4];
    if(p>.35){const r=(p-.35)*16;ctx.globalAlpha=1-(p-.35)/.65;for(let k=0;k<8;k++){const a=k*Math.PI/4;ctx.fillStyle=col;ctx.fillRect(Math.round(cx+Math.cos(a)*r),Math.round(cy+Math.sin(a)*r*.6),1,1);}ctx.globalAlpha=1;}
    else{ctx.fillStyle='#fff';ctx.fillRect(Math.round(cx),Math.round(y+h-p*h*2),1,2);}
  }else if(th.id==='halloween'&&daylight(T).k<.6&&i===24)E('🌕',x+w-8,y+8,11);
}

// ---------- sur les personnages : chapeaux, cœurs ----------
function themeOnChar(c,x,top,now){
  const th=themeNow(); if(!th)return;
  const side=c.dir==='left'?-1:c.dir==='right'?1:0;
  if(th.id==='noel'){
    ctx.fillStyle='#d32f2f';ctx.beginPath();ctx.moveTo(x-7,top+3);ctx.lineTo(x+7,top+3);ctx.lineTo(x+9-side*3,top-8);ctx.closePath();ctx.fill();
    R(ctx,x-8,top+2,16,3,'#fafafa');R(ctx,x+8-side*3,top-10,4,4,'#fafafa');
  }else if(th.id==='nouvel-an'){
    ctx.fillStyle=['#7a5cc8','#e0457b','#2e9e9b'][keySeed(c.key)%3];ctx.beginPath();ctx.moveTo(x-5,top+3);ctx.lineTo(x+5,top+3);ctx.lineTo(x+side,top-10);ctx.closePath();ctx.fill();
    R(ctx,x-3,top-1,6,1,'#ffd23f');R(ctx,x-2,top-5,4,1,'#3fb8c9');R(ctx,x-1+side,top-12,3,3,'#ffd23f');
  }else if(th.id==='halloween'){
    R(ctx,x-10,top+2,20,2,'#1d1726');ctx.fillStyle='#1d1726';ctx.beginPath();ctx.moveTo(x-6,top+2);ctx.lineTo(x+6,top+2);ctx.lineTo(x+3-side*2,top-12);ctx.closePath();ctx.fill();
    R(ctx,x-6,top,12,2,'#7a3fb0');
  }else if(th.id==='saint-valentin'&&!c.moving){
    const k=((now/2200)+c.phase*.37)%1; if(k<.6)E(['💕','❤️','💖'][keySeed(c.key)%3],x+9,top-6-k*30,12,1-k/.6);
  }
}
// enveloppes entre agents : cadeau, bonbon, lettre d'amour, cotillons ; false = enveloppe normale
function themeEnvelope(x,y){
  const th=themeNow(); if(!th)return false;
  E({'noel':'🎁','halloween':'🍬','saint-valentin':'💌','nouvel-an':'🎊'}[th.id],x,y,14);return true;
}

// ---------- par-dessus le plan (après le voile) : vols, flocons, confettis qui tombent, feux d'artifice, éclairs ----------
function burst(x,y,r,col,a){ctx.globalAlpha=Math.max(0,a);for(let k=0;k<12;k++){const an=k*Math.PI/6;R(ctx,x+Math.cos(an)*r-1,y+Math.sin(an)*r-1,2,2,col);}ctx.globalAlpha=1;}
function themeOverlay(now){
  const th=themeNow(); if(!th)return;
  if(th.id==='halloween'){
    for(let i=0;i<4;i++){const p=((now/9000)+i*.29)%1; if(p>.6)continue; const k=p/.6;E('🦇',-20+k*(W+40),40+i*55+Math.sin(k*18+i)*14,16);}
    {const p=(now/26000)%1, x=-40+p*(W+80), y=14.5*TS+Math.sin(p*14)*36;E('👻',x,y,32,.85);}
    ISLANDS.forEach((cx,i)=>{if(i%2)return;const x=cx*TS+30, y=12.6*TS+Math.sin(now/800+cx)*12;
      ctx.strokeStyle='rgba(230,230,240,.7)';ctx.beginPath();ctx.moveTo(x,11.3*TS);ctx.lineTo(x,y-6);ctx.stroke();E('🕷️',x,y,13);});
    if(night()){ // brume violette et éclair de temps en temps
      for(let i=0;i<6;i++){const x=((now/90+i*230)%(W+200))-100, y=17.3*TS+Math.sin(now/2000+i)*10;
        ctx.fillStyle='rgba(150,110,200,.10)';ctx.beginPath();ctx.ellipse(x,y,110,22,0,0,7);ctx.fill();}
      const ph=now%37000; if(ph<90||(ph>180&&ph<240)){ctx.fillStyle='rgba(235,235,255,.32)';ctx.fillRect(0,0,W,H);}
    }
  }else if(th.id==='noel'){
    for(let i=0;i<18;i++){const k=((now/14000)+spread(i,3))%1;E('❄️',spread(i)*W+Math.sin(now/1500+i)*10,-10+k*(H+20),9,.75);}
    const p=(now/45000)%1; if(p<.5){const x=W+60-p*2*(W+200), y=TS+12+Math.sin(p*20)*4; // le traîneau passe dans le ciel
      E('🦌',x,y,16);E('🦌',x+20,y+1,16);E('🛷',x+46,y+3,18);E('🎅',x+46,y-7,15);}
  }else if(th.id==='nouvel-an'){
    const cols=['#ffd23f','#ff6fb5','#5fd4ff','#7dff8a','#ffffff'];
    for(let i=0;i<60;i++){const k=((now/5200)+spread(i,2))%1;R(ctx,spread(i)*W+Math.sin(now/400+i)*6,k*H,2,3,cols[i%5]);}
    if(night())for(let i=0;i<3;i++){const p=(now/1900+i*.33)%1, n=Math.floor(now/1900+i*.33), x=spread(n*5+i,7)*W, y=(.12+spread(n+i,9)*.35)*H;
      if(p>.3)burst(x,y,(p-.3)*70,cols[(n+i)%4],1-(p-.3)/.7);else R(ctx,x,y+(.3-p)*400,2,5,'#fff');}
    BALLOONS.forEach(([bx,by],i)=>balloon(i===5?'🪩':'🎈',bx*TS,by*TS,now,i));
  }else if(th.id==='saint-valentin'){
    const p=(now/30000)%1; if(p<.6){const k=p/.6, x=-30+k*(W+60), y=4*TS+Math.sin(k*10)*30; // Cupidon
      E('👼',x,y,20);E('💘',x+18,y+4,14);for(let j=1;j<4;j++)E('💗',x-j*16,y+Math.sin(k*10-j*.6)*6,9,.7-j*.15);}
    BALLOONS.forEach(([bx,by],i)=>balloon('💗',bx*TS,by*TS,now,i));
    for(let i=0;i<8;i++){const k=((now/9000)+spread(i,4))%1;E('💕',spread(i,8)*W,H+10-k*(H+20),10,.35);}
  }
}
// lumières du thème dans le voile de nuit (citrouilles, sapin)
function themeLights(S){
  if(themeIs('halloween'))for(const cx of ISLANDS)S.push({x:cx*TS+13,y:14*TS-10,r:20,a:.6,c:'rgba(255,150,40,.22)'});
  if(themeIs('noel'))S.push({x:13*TS+16,y:12*TS-8,r:40,a:.7,c:'rgba(255,210,90,.22)'});
}

// ---------- sélecteur (« Comment lire le plan ») : forcer un thème le temps de la visite ----------
(function(){
  const host=document.querySelector('.legend-help .lh-grid'); if(!host||!host.insertAdjacentHTML)return;
  host.insertAdjacentHTML('afterend','<label class="themesel">Thème du bureau <select id="themesel"><option value="">Selon la date</option><option value="off">Aucun</option>'+
    THEMES.map(x=>`<option value="${x.id}">${x.ico} ${x.label}</option>`).join('')+'</select></label>');
  const s=document.getElementById('themesel'); if(!s)return;
  s.value=THEME_FORCE||'';
  s.addEventListener('change',()=>{THEME_FORCE=s.value||null;});
})();
