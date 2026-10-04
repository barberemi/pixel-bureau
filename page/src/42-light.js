// ---------- lumière du jour : soleil à Paris, voile de nuit, pièces et lampes allumées ----------
const [SUN_LAT,SUN_LON]=RHYTHM.location; // position du bureau (config, Paris par défaut)
// hauteur du soleil (degrés) et matin/soir, formule approchée (précision ~1°, suffisante pour l'ambiance)
function sunAt(t){
  const n=t/864e5+2440587.5-2451545, rad=Math.PI/180;
  const g=((357.528+0.9856003*n)%360)*rad, L=(280.46+0.9856474*n)%360;
  const lam=(L+1.915*Math.sin(g)+0.02*Math.sin(2*g))*rad, eps=(23.439-0.0000004*n)*rad;
  const dec=Math.asin(Math.sin(eps)*Math.sin(lam)), ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam));
  const gmst=((18.697374558+24.06570982441908*n)%24+24)%24;
  let ha=(gmst*15+SUN_LON)*rad-ra; ha=Math.atan2(Math.sin(ha),Math.cos(ha)); // ramené dans [-π, π]
  const la=SUN_LAT*rad;
  return {elev:Math.asin(Math.sin(la)*Math.sin(dec)+Math.cos(la)*Math.cos(dec)*Math.cos(ha))/rad, morning:ha<0};
}
// k : 1 en plein jour, 0 la nuit (crépuscule civil : de -6° à +8°) ; twi : 0..1, maximum au lever et au coucher
function daylight(t){
  const s=sunAt(t), k=Math.max(0,Math.min(1,(s.elev+6)/14));
  return {k,twi:Math.max(0,1-Math.abs(s.elev-1)/7),morning:s.morning,elev:s.elev,
    phase:k<=0?'nuit':k>=1?'jour':s.morning?'aube':'crépuscule'};
}
const mixC=(a,b,f)=>a.map((v,i)=>Math.round(v+(b[i]-v)*f));
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
// couleur du ciel dans les fenêtres
function skyColor(t){
  const d=daylight(t), night=[27,37,71], day=[143,198,236], warm=d.morning?[240,170,110]:[236,140,130];
  return rgb(mixC(mixC(night,day,d.k),warm,d.twi*0.8));
}
// pièces éclairées quand quelqu'un s'y trouve (cases)
let ROOMS, ROOM_LV;
function buildRooms(){ // rappelé quand le plan change
  ROOMS=[
    ...LAYOUT.light_rooms||[],                                                                // pièces et allées du plan
    ...ISLANDS.map(cx=>[cx-2,IROWS[0]-2,cx+2,IROWS[IROWS.length-1]+2])                     // un plafonnier par îlot
  ];
  ROOM_LV=ROOMS.map(()=>0);
  LIGHT_CV=null; LIGHT_AT=0; // toiles de la lumière refaites à la taille du plan
}
const NIGHT_MAX=.55; // opacité du voile au cœur de la nuit (0,7 rendait plan et personnages illisibles)
let LIGHT_CV=null, LIGHT_AT=0, LIGHT_D=0;
function lightSources(){
  const S=[]; // {x,y,r,a,c} : a = part du voile retirée au centre, c = halo coloré ajouté
  for(const s of SEATS){
    const o=deskOwner(s.x,s.y); if(!o||!o.present||!o._st||['off','absent','gone'].includes(o._st.st))continue;
    const left=s.dir==='right', x0=s.cx*TS+3, py=s.y*TS;
    S.push({x:left?x0+4:x0+TS-9,y:py+20,r:30,a:.85,c:'rgba(255,214,150,.18)'}); // lampe de bureau
    if(o._st.st==='work'&&!o.moving)S.push({x:left?x0+7:x0+TS-12,y:py+4,r:16,a:.6,c:'rgba(120,200,255,.14)'}); // écran allumé
  }
  const b=chars.find(c=>c.boss);
  if(b&&b.present&&b.atBoss)S.push({x:BOSS_SEAT[0]*TS+16,y:(BOSS_SEAT[1]+1)*TS-14,r:46,a:.85,c:'rgba(255,214,150,.2)'});
  for(const o of FURN_AT.server_rack||[])S.push({x:13*TS+16+o.dx,y:2*TS+2+o.dy,r:22,a:.35,c:'rgba(95,240,138,.12)'}); // baies serveurs
  if(typeof TVR!=='undefined'&&!stageClosed(T))S.push({x:TVR.x+TVR.w/2,y:TVR.y+TVR.h/2,r:44,a:.5,c:'rgba(150,180,255,.12)'});
  const cm=furnAt('counter'); // machine à café du comptoir
  if(cm&&chars.some(c=>c.present&&c._st&&c._st.st==='coffee'))S.push({x:3*TS+17+cm.dx,y:2*TS-20+cm.dy,r:22,a:.5,c:'rgba(255,190,120,.16)'});
  S.push({x:EXIT[0]*TS+4,y:EXIT[1]*TS-8,r:26,a:.4,c:'rgba(80,230,120,.22)'}); // panneau Sortie
  themeLights(S); // 46-themes.js : citrouilles, sapin
  return S;
}
// occupation des pièces (cases) ; chaque pièce s'allume et s'éteint en fondu (ROOM_LV : 0 éteinte, 1 allumée)
function roomTargets(){
  const occ=chars.filter(c=>c.present&&c.pos&&c._st&&!['off','absent','gone'].includes(c._st.st))
    .map(c=>[Math.floor(c.pos.x/TS),Math.floor((c.pos.y-4)/TS)]);
  return ROOMS.map(([x0,y0,x1,y1])=>occ.some(([x,y])=>x>=x0&&x<=x1&&y>=y0&&y<=y1)?1:0);
}
const LIGHT_FADE=1200; // ms pour s'allumer ou s'éteindre
// plafonniers d'une pièce : une flaque de lumière toutes les 3 cases
function ceilingLamps([x0,y0,x1,y1]){
  const xs=[], ys=[], w=x1-x0+1, h=y1-y0+1;
  if(w<=3)xs.push((x0+x1+1)/2);else for(let x=x0+1.5;x<=x1+.5;x+=3)xs.push(x);
  if(h<=3)ys.push((y0+y1+1)/2);else for(let y=y0+1.5;y<=y1+.5;y+=3)ys.push(y);
  return xs.flatMap(x=>ys.map(y=>[x*TS,y*TS]));
}
// voile de nuit : masque en basse résolution (1/4), flouté puis agrandi en lissé, donc sans bords nets ;
// halos colorés ajoutés à part en pleine résolution ; recalculé au plus 5 fois par seconde
const LQ=4;
let LIGHT_MASK=null, LIGHT_HALO=null;
buildRooms();
function lightCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function softSpot(g,x,y,r,a,col){
  const rg=g.createRadialGradient(x,y,0,x,y,r);
  rg.addColorStop(0,col?col:`rgba(0,0,0,${a})`);rg.addColorStop(.55,col?col.replace(/[\d.]+\)$/,m=>(parseFloat(m)*.45).toFixed(3)+')'):`rgba(0,0,0,${a*.45})`);rg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=rg;g.fillRect(x-r,y-r,r*2,r*2);
}
function drawLight(now){
  const d=daylight(T), dark=(1-d.k)*NIGHT_MAX; LIGHT_D=dark;
  if(dark<.02){ROOM_LV.fill(0);LIGHT_AT=0;return;}
  if(!LIGHT_CV){LIGHT_MASK=lightCanvas(W/LQ,H/LQ);LIGHT_CV=lightCanvas(W/LQ,H/LQ);LIGHT_HALO=lightCanvas(W,H);}
  if(now-LIGHT_AT>200||!LIGHT_AT){
    const dt=LIGHT_AT?Math.min(1000,now-LIGHT_AT):LIGHT_FADE; LIGHT_AT=now;
    roomTargets().forEach((tg,i)=>{ROOM_LV[i]+=(tg-ROOM_LV[i])*Math.min(1,dt/LIGHT_FADE);});
    const tint=mixC([10,14,40],d.morning?[70,40,24]:[66,30,52],d.twi*.7), src=lightSources();
    // 1. masque : voile plein, puis on retire la lumière (pièces, plafonniers, lampes)
    const m=LIGHT_MASK.getContext('2d');
    m.setTransform(1,0,0,1,0,0);m.globalCompositeOperation='source-over';m.clearRect(0,0,W/LQ,H/LQ);
    m.fillStyle=`rgba(${tint[0]},${tint[1]},${tint[2]},${dark})`;m.fillRect(0,0,W/LQ,H/LQ);
    m.setTransform(1/LQ,0,0,1/LQ,0,0);m.globalCompositeOperation='destination-out';
    ROOMS.forEach((r,i)=>{const lv=ROOM_LV[i];if(lv<.01)return;
      const [x0,y0,x1,y1]=r;m.fillStyle=`rgba(0,0,0,${(.22*lv).toFixed(3)})`;m.fillRect(x0*TS,y0*TS-6,(x1-x0+1)*TS,(y1-y0+1)*TS+6);
      for(const [x,y] of ceilingLamps(r))softSpot(m,x,y,2.6*TS,.7*lv);});
    for(const s of src)softSpot(m,s.x,s.y,s.r,s.a);
    // chaque personnage présent reste lisible : le voile s'ouvre autour de lui (sous lui le décor reste dans l'ombre)
    for(const c of chars)if(c.present&&c.pos)softSpot(m,c.pos.x,c.pos.y-26,30,.8);
    // 2. flou du masque (bords doux), dessiné en basse résolution
    const l=LIGHT_CV.getContext('2d');l.clearRect(0,0,W/LQ,H/LQ);
    l.filter='blur(3px)';l.drawImage(LIGHT_MASK,0,0);l.filter='none';
    // 3. halos colorés (lampes chaudes, écrans bleus, LED vertes)
    const h=LIGHT_HALO.getContext('2d'), f=Math.min(1,dark/NIGHT_MAX*1.4);
    h.clearRect(0,0,W,H);
    for(const s of src)softSpot(h,s.x,s.y,s.r*.9,0,s.c.replace(/[\d.]+\)$/,mm=>(parseFloat(mm)*f).toFixed(3)+')'));
    ROOMS.forEach((r,i)=>{const lv=ROOM_LV[i];if(lv<.01)return;for(const [x,y] of ceilingLamps(r))softSpot(h,x,y,2.2*TS,0,`rgba(255,226,170,${(.07*lv*f).toFixed(3)})`);});
  }
  const sm=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(LIGHT_CV,0,0,W,H);
  ctx.imageSmoothingEnabled=sm;
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.drawImage(LIGHT_HALO,0,0);ctx.restore();
  // panneau « Sortie » au-dessus de l'entrée, net
  ctx.fillStyle='#1d7a3c';ctx.fillRect(EXIT[0]*TS-10,EXIT[1]*TS-14,26,9);
  ctx.fillStyle='#d8ffe2';ctx.font='bold 6px ui-monospace,Menlo,monospace';ctx.fillText('SORTIE',EXIT[0]*TS-8,EXIT[1]*TS-7);
}
// étoiles dans les fenêtres la nuit
function drawStars(x,y,w,h,now){
  const d=daylight(T); if(d.k>.25)return;
  const a=(1-d.k/.25)*.9;
  for(let i=0;i<4;i++){
    const sx=x+2+Math.floor(hash(x+i,7)*(w-4)), sy=y+2+Math.floor(hash(i,x)*(h-4)), tw=.5+.5*Math.sin(now/700+i*1.7+x);
    ctx.fillStyle=`rgba(255,250,220,${(a*(.45+.55*tw)).toFixed(2)})`;ctx.fillRect(sx,sy,1,1);
  }
}
