// ---------- ménage du soir : un invité on « cleaning » fait le tour du bureau vide, une heure, avec son chariot ----------
// Les jours ouvrés, il arrive à une heure tirée au sort pour la date (la même au rejeu) entre la fin des heures de bureau
// et 20h, et reste une heure : un arrêt au bout de chaque îlot, puis la cafétéria, les toilettes et la salle de réunion
// (une pièce absente du plan se replie ailleurs, ZONE_FALLBACK). Les pièces où il passe s'éclairent comme pour tout le
// monde (42-light.js). Deux lignes dans le fil : son arrivée et son départ.
const CLEAN_DUR=60*60e3, CLEAN_ROOMS=[['coffee','la cafétéria'],['wc','les toilettes'],['meet','la salle de réunion']];
// {s, e} du jour de t ; null le week-end
function cleaningVisit(c,t){
  if(SCENE_DEMO&&SCENE_DEMO.visit&&SCENE_DEMO.visit.c===c)return SCENE_DEMO.visit.v; // 46-gallery.js : sa tournée, jouée maintenant
  if(RHYTHM.weekend.includes(parisHM(t).wd))return null;
  const r=rng(keySeed(c.key)*7919+daySeed(t)), h1=RHYTHM.office_hours[1]*60, m0=h1+r()*Math.max(0,20*60-h1);
  const s=parisMidnight(t)+m0*60e3;return {s,e:s+CLEAN_DUR};
}
// les arrêts : le bout de chaque îlot (côté allée), puis les pièces
function cleaningStops(){
  const out=[];
  for(const [i,cx] of (ISLANDS||[]).entries()){const y=(IROWS||[]).length?IROWS[IROWS.length-1]+1:null;
    if(y!=null&&walkable(cx,y))out.push({zone:'visit',visit:[cx,y,'up'],room:'îlot '+(i+1)});}
  return out.concat(CLEAN_ROOMS.map(([zone,room])=>({zone,room})));
}
function cleaningState(c,t){
  const v=cleaningVisit(c,t);
  if(!v||t<v.s)return {st:'off',label:'Passe le soir, après les heures de bureau'};
  if(t>=v.e)return {st:'gone',label:'A fait le ménage de '+hm(v.s)+' à '+hm(v.e)};
  const stops=cleaningStops(), p=stops[Math.min(stops.length-1,Math.floor((t-v.s)/(CLEAN_DUR/stops.length)))];
  return {st:'idle',zone:p.zone,...(p.visit?{visit:p.visit}:{}),label:'Fait le ménage : '+p.room+' · arrivé à '+hm(v.s)+', repart vers '+hm(v.e),bubble:'🧹'};
}
// son chariot, devant lui (seau bleu, flacon jaune, balai) ; trié avec les personnages (41-render.js)
function cleaningCarts(){
  const out=[];
  for(const c of chars){if(c.on!=='cleaning'||!c._st||!c.pos||['off','gone'].includes(c._st.st))continue;
    const [dx,dy]={left:[-20,0],right:[20,0]}[c.dir]||[20,2]; /* de face ou de dos : à côté de lui, jamais derrière un bureau */out.push({x:c.pos.x+dx,y:c.pos.y+dy,z:c.pos.y+dy+.5});}
  return out;
}
function drawCart(m){
  const x=Math.round(m.x)-11,y=Math.round(m.y);
  R(ctx,x,y-16,22,13,'#5d6470');R(ctx,x+2,y-14,18,4,'#8a929e');R(ctx,x+3,y-22,8,7,'#3d8bd8');R(ctx,x+13,y-21,5,6,'#e0b23a');
  R(ctx,x+17,y-28,2,25,'#b08a5a');R(ctx,x+2,y-3,4,3,'#22252c');R(ctx,x+16,y-3,4,3,'#22252c');
}
