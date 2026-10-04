// ---------- thèmes saisonniers : décor, chapeaux et effets selon la date du plan (heure de Paris) ----------
// Choisis par la date affichée (T), donc rejoués par « Rejouer ». Config : ui.themes:false les coupe, ui.theme force
// un thème. Le sélecteur de « Comment lire le plan » en force un le temps de la visite (pas de stockage dans Kronn).
const THEMES=[
  {id:'nouvel-an',ico:'🎆',label:'Nouvel an',from:'12-31',to:'01-02'},
  {id:'galette',ico:'👑',label:'Galette des rois',from:'01-05',to:'01-10'},
  {id:'saint-valentin',ico:'💘',label:'Saint-Valentin',from:'02-13',to:'02-14'},
  {id:'poisson-avril',ico:'🐟',label:"Poisson d'avril",from:'04-01',to:'04-01'},
  {id:'ete',ico:'😎',label:'Été',from:'06-21',to:'08-31'},
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
// le roi de la galette et les victimes du poisson d'avril : tirés au sort pour la journée (même tirage pour tous)
function pickOfDay(list,salt,n){
  const sd=daySeed(T)%100000;
  return list.slice().sort((a,b)=>hash(sd+keySeed(a.key),salt)-hash(sd+keySeed(b.key),salt)).slice(0,n).map(c=>c.key);
}

// ---------- décor (entrées dynamiques de FURN, triées en profondeur avec les personnages) ----------
function banner(){
  const th=themeNow(); if(!th)return;
  const yr=+parisYMD(T).slice(0,4)+(parisYMD(T).slice(5,7)==='12'?1:0);
  const txt={'nouvel-an':'BONNE ANNÉE '+yr,'galette':'VIVE LES ROIS !','saint-valentin':'SAINT-VALENTIN','poisson-avril':"POISSON D'AVRIL",
    'ete':parisYMD(T).slice(5)==='06-21'?'FÊTE DE LA MUSIQUE':'BEL ÉTÉ !','halloween':'HAPPY HALLOWEEN','noel':'JOYEUX NOËL'}[th.id];
  const pal={'nouvel-an':['#1d2440','#f2c314'],'galette':['#7a5a10','#ffe9a8'],'saint-valentin':['#b0254f','#ffe1ea'],'poisson-avril':['#1f6fb2','#e9f6ff'],
    'ete':['#e07b1a','#fff6d8'],'halloween':['#2a1a38','#ff9a2e'],'noel':['#8e1b1b','#fff6e0']}[th.id];
  const x0=33*TS+14, x1=38*TS+18, y=5*TS+7;
  R(ctx,x0,y,x1-x0,15,pal[0]);R(ctx,x0,y,x1-x0,2,'rgba(255,255,255,.25)');R(ctx,x0,y+15,x1-x0,2,'rgba(0,0,0,.25)');
  R(ctx,x0-3,y-3,3,20,'#5a4636');R(ctx,x1,y-3,3,20,'#5a4636');
  ctx.fillStyle=pal[1];ctx.font='bold 9px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.fillText(txt,(x0+x1)/2,y+11);ctx.textAlign='left';
}
// guirlande le long du mur du fond (rangée 1) : ampoules qui clignotent, fanions ou serpentins selon le thème
function garland(now){
  const th=themeNow(); if(!th||th.id==='poisson-avril'||th.id==='galette')return;
  const cols={'nouvel-an':['#f2c314','#e8e2d0','#3fb8c9','#d46fb0'],'saint-valentin':['#e0457b','#ff9ab8','#fff'],'ete':['#e0a020','#3fb8c9','#e8573a'],
    'halloween':['#ff9a2e','#7a3fb0','#3fd16b'],'noel':['#e53935','#ffd23f','#43a047','#42a5f5']}[th.id];
  const y0=TS+27, sag=6;
  ctx.strokeStyle='#2a2b33';ctx.lineWidth=1;ctx.beginPath();
  for(let x=0;x<=W;x+=4){const k=(x%96)/96;ctx.lineTo(x,y0+Math.sin(k*Math.PI)*sag);}ctx.stroke();
  for(let x=8,i=0;x<W;x+=16,i++){
    const k=(x%96)/96, y=Math.round(y0+Math.sin(k*Math.PI)*sag)+1, c=cols[i%cols.length];
    if(th.id==='noel'||th.id==='halloween'){const on=(Math.floor(now/500)+i)%3!==0;R(ctx,x-1,y,3,4,on?c:'#3a3a3a');if(on){ctx.globalAlpha=.25;R(ctx,x-3,y-2,7,8,c);ctx.globalAlpha=1;}}
    else{ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.lineTo(x,y+7);ctx.closePath();ctx.fill();}
  }
}
function pumpkin(x,y,now,big){
  const s=big?1.8:1.4, w=Math.round(10*s), h=Math.round(8*s);
  R(ctx,x-w/2,y-h,w,h,'#e8731a');R(ctx,x-w/2+2,y-h,2,h,'#c95d10');R(ctx,x+w/2-4,y-h,2,h,'#c95d10');R(ctx,x-1,y-h-3,2,3,'#4a7a2a');
  const glow=daylight(T).k<.6&&(Math.floor(now/700+x)%7)!==0; // allumée le soir
  R(ctx,x-3,y-h+2,2,2,glow?'#ffe066':'#3a1a05');R(ctx,x+1,y-h+2,2,2,glow?'#ffe066':'#3a1a05');R(ctx,x-3,y-3,6,1,glow?'#ffe066':'#3a1a05');
}
function cobweb(x,y,flip){
  ctx.strokeStyle='rgba(70,72,84,.75)';ctx.lineWidth=1;const d=flip?-1:1;
  for(const a of [0,.33,.66,1]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+d*24*Math.cos(a*Math.PI/2),y+24*Math.sin(a*Math.PI/2));ctx.stroke();}
  for(const r of [8,15,22]){ctx.beginPath();ctx.arc(x,y,r,flip?Math.PI/2:0,flip?Math.PI:Math.PI/2);ctx.stroke();}
}
function xmasTree(now){
  const px=13*TS+16, py=12*TS+30;
  R(ctx,px-12,py-2,24,4,'rgba(0,0,0,.2)');R(ctx,px-3,py-8,6,7,'#6b4423');
  for(const [w,yy] of [[30,-10],[24,-22],[17,-33],[10,-43]]){ctx.fillStyle='#2e7d32';ctx.beginPath();ctx.moveTo(px-w/2,py+yy);ctx.lineTo(px+w/2,py+yy);ctx.lineTo(px,py+yy-14);ctx.closePath();ctx.fill();
    R(ctx,px-w/2+2,py+yy-1,w-4,1,'#1b5e20');}
  ctx.fillStyle='#ffd23f';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?2.2:5;ctx.lineTo(px+Math.cos(a)*r,py-58+Math.sin(a)*r);}ctx.closePath();ctx.fill();
  const bulbs=[[-9,-14],[7,-17],[-5,-26],[6,-29],[-3,-38],[3,-46],[-11,-12],[10,-12]];
  bulbs.forEach(([bx,by],i)=>R(ctx,px+bx,py+by,2,2,(Math.floor(now/400)+i)%2?['#e53935','#42a5f5','#ffd23f','#fff'][i%4]:'#1b5e20'));
  for(const [gx,w,c,r] of [[-16,9,'#c62828','#ffd23f'],[8,10,'#1565c0','#fff'],[-6,7,'#6a1b9a','#ffd23f']]){R(ctx,px+gx,py-7,w,7,c);R(ctx,px+gx+Math.floor(w/2)-1,py-7,2,7,r);R(ctx,px+gx,py-5,w,1,r);}
}
function galette(){
  const x=5*TS+4, y=6*TS-4;
  ctx.fillStyle='#d9a441';ctx.beginPath();ctx.ellipse(x,y,9,5,0,0,7);ctx.fill();ctx.strokeStyle='#a8752a';ctx.stroke();
  R(ctx,x-4,y-11,8,3,'#e8b923');for(const dx of [-4,-1,2])R(ctx,x+dx,y-14,2,3,'#e8b923');
}
function fan(x,y,now){R(ctx,x-1,y-14,2,10,'#8a8f99');R(ctx,x-5,y-4,10,3,'#6b7080');const a=now/60;ctx.fillStyle='#cfd8e3';
  for(let i=0;i<3;i++){const an=a+i*2.09;ctx.beginPath();ctx.ellipse(x+Math.cos(an)*4,y-17+Math.sin(an)*4,4,2,an,0,7);ctx.fill();}R(ctx,x-1,y-18,2,2,'#555');}
FURN.push({y:-1,draw:now=>{banner();garland(now);}});
FURN.push({y:2*TS,draw:()=>{if(!themeIs('halloween'))return;cobweb(TS,2*TS,false);cobweb(12*TS,2*TS,true);cobweb(18*TS,2*TS,false);cobweb(27*TS,2*TS,true);cobweb(TS,12*TS,false);cobweb(39*TS,12*TS,true);}});
FURN.push({y:2*TS+31,draw:now=>{if(themeIs('halloween'))pumpkin(5*TS+4,2*TS-12,now);}});
FURN.push({y:12*TS+29,draw:now=>{if(themeIs('noel'))xmasTree(now);}});
FURN.push({y:6*TS+1,draw:()=>{if(themeIs('galette'))galette();}});
FURN.push({y:14*TS-1,draw:now=>{
  if(themeIs('halloween'))for(const cx of ISLANDS)pumpkin(cx*TS+16-3,14*TS-6,now,cx===18||cx===30);
  if(themeIs('ete'))for(const cx of [11,24,36])fan(cx*TS+13,14*TS-4,now);
}});

// ---------- fenêtres : neige, feux d'artifice, soleil d'été ----------
function themeWindow(x,y,w,h,now,i){
  const th=themeNow(); if(!th)return;
  if(th.id==='noel'){
    ctx.fillStyle='rgba(255,255,255,.9)';
    for(let k=0;k<5;k++){const fx=x+((k*7+i*5)%w), fy=y+((now/40+k*13+i*17)%h);ctx.fillRect(Math.floor(fx),Math.floor(fy),1,1);}
    R(ctx,x,y+h-2,w,2,'#f4f8ff');
  }else if(th.id==='nouvel-an'&&daylight(T).k<.5){
    const p=(now/1600+i*.37)%1, cx=x+4+((i*11)%(w-8)), cy=y+h*.55-p*4, col=['#ffd23f','#ff6fb5','#5fd4ff','#7dff8a'][i%4];
    if(p>.35){const r=(p-.35)*16;ctx.globalAlpha=1-(p-.35)/.65;for(let k=0;k<8;k++){const a=k*Math.PI/4;ctx.fillStyle=col;ctx.fillRect(Math.round(cx+Math.cos(a)*r),Math.round(cy+Math.sin(a)*r*.6),1,1);}ctx.globalAlpha=1;}
    else{ctx.fillStyle='#fff';ctx.fillRect(Math.round(cx),Math.round(y+h-p*h*2),1,2);}
  }else if(th.id==='halloween'&&daylight(T).k<.6){R(ctx,x+w-9,y+3,6,6,'#fff3c4');R(ctx,x+w-7,y+3,4,4,'#e9dca6');}
}

// ---------- sur les personnages : chapeaux, lunettes, couronne, poisson dans le dos ----------
function themeOnChar(c,x,top,now){
  const th=themeNow(); if(!th)return;
  const side=c.dir==='left'?-1:c.dir==='right'?1:0;
  if(th.id==='noel'){
    ctx.fillStyle='#d32f2f';ctx.beginPath();ctx.moveTo(x-7,top+3);ctx.lineTo(x+7,top+3);ctx.lineTo(x+9-side*3,top-8);ctx.closePath();ctx.fill();
    R(ctx,x-8,top+2,16,3,'#fafafa');R(ctx,x+8-side*3,top-10,4,4,'#fafafa');
  }else if(th.id==='nouvel-an'){
    ctx.fillStyle='#7a5cc8';ctx.beginPath();ctx.moveTo(x-5,top+3);ctx.lineTo(x+5,top+3);ctx.lineTo(x+side,top-10);ctx.closePath();ctx.fill();
    R(ctx,x-3,top-1,6,1,'#ffd23f');R(ctx,x-2,top-5,4,1,'#3fb8c9');R(ctx,x-1+side,top-12,3,3,'#ffd23f');
  }else if(th.id==='halloween'){
    R(ctx,x-10,top+2,20,2,'#1d1726');ctx.fillStyle='#1d1726';ctx.beginPath();ctx.moveTo(x-6,top+2);ctx.lineTo(x+6,top+2);ctx.lineTo(x+3-side*2,top-12);ctx.closePath();ctx.fill();
    R(ctx,x-6,top,12,2,'#7a3fb0');
  }else if(th.id==='galette'&&pickOfDay(chars.filter(z=>z.present&&!z.visitor),'roi',1).includes(c.key)){
    R(ctx,x-6,top,12,4,'#e8b923');for(const dx of [-6,-1,4])R(ctx,x+dx,top-3,2,3,'#e8b923');R(ctx,x-1,top+1,2,2,'#d32f2f');
  }else if(th.id==='ete'&&c.dir!=='up'){
    const ex=x+side*3, ey=top+12;R(ctx,ex-6,ey,12,3,'#111');R(ctx,ex-1,ey,2,1,'#111');
    if(parisYMD(T).slice(5)==='06-21'&&!c.moving){const k=((now/1300)+c.phase)%1;ctx.fillStyle=`rgba(201,162,39,${1-k})`;ctx.font='bold 11px system-ui,sans-serif';ctx.fillText(k<.5?'♪':'♫',x+8,top-4-k*20);}
  }else if(th.id==='poisson-avril'&&pickOfDay(chars.filter(z=>z.present&&!z.person&&!z.visitor),'poisson',3).includes(c.key)){
    const fx=x-6, fy=top+22; // dans le dos : jamais un humain, seulement des agents
    ctx.fillStyle='#fffdf5';ctx.beginPath();ctx.ellipse(fx+5,fy,6,3,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(fx-1,fy);ctx.lineTo(fx-5,fy-3);ctx.lineTo(fx-5,fy+3);ctx.closePath();ctx.fill();
    R(ctx,fx+8,fy-1,1,1,'#1a1320');ctx.strokeStyle='#4a90d9';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(fx+5,fy,6,3,0,0,7);ctx.stroke();
  }else if(th.id==='saint-valentin'&&!c.moving){
    const k=((now/2200)+c.phase*.37)%1; if(k<.6){ctx.globalAlpha=1-k/.6;drawHeart(x+8,top-6-k*30,'#e0457b');ctx.globalAlpha=1;}
  }
}
function drawHeart(x,y,col){x=Math.round(x);y=Math.round(y);R(ctx,x-5,y,4,3,col);R(ctx,x+1,y,4,3,col);R(ctx,x-6,y+2,12,3,col);R(ctx,x-5,y+5,10,2,col);R(ctx,x-3,y+7,6,2,col);R(ctx,x-1,y+9,2,1,col);}

// ---------- par-dessus le plan (après le voile) : chauves-souris, confettis ----------
function themeOverlay(now){
  const th=themeNow(); if(!th)return;
  if(th.id==='halloween'){
    for(let i=0;i<3;i++){const p=((now/9000)+i*.31)%1; if(p>.6)continue; const k=p/.6, x=-20+k*(W+40), y=40+i*60+Math.sin(k*18+i)*14, f=Math.floor(now/120+i)%2;
      ctx.fillStyle='#1d1726';R(ctx,x-2,y-1,4,3,'#1d1726');ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x-9,y-(f?5:-2));ctx.lineTo(x-5,y+1);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(x+2,y);ctx.lineTo(x+9,y-(f?5:-2));ctx.lineTo(x+5,y+1);ctx.closePath();ctx.fill();}
  }else if(th.id==='nouvel-an'){
    const cols=['#ffd23f','#ff6fb5','#5fd4ff','#7dff8a','#ffffff'];
    for(let i=0;i<36;i++){const k=((now/5200)+hash(i,11))%1;R(ctx,hash(i,5)*W+Math.sin(now/400+i)*6,k*H,2,3,cols[i%5]);}
  }
}
// lumières du thème dans le voile de nuit (citrouilles, sapin)
function themeLights(S){
  if(themeIs('halloween'))for(const cx of ISLANDS)S.push({x:cx*TS+13,y:14*TS-10,r:20,a:.6,c:'rgba(255,150,40,.22)'});
  if(themeIs('noel'))S.push({x:13*TS+16,y:12*TS-2,r:34,a:.7,c:'rgba(255,210,90,.2)'});
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
