// ---------- la vie des étages (2e, 3e) : des agents qui marchent d'une place à l'autre ----------
// Chaque agent voulu a une place : {id, path (les points du palier jusqu'à elle), dir, seat (assis à son poste, dessiné par
// l'étage), sofa (assis au canapé), delay (secondes avant de monter)}. Un agent qui apparaît monte par la porte de
// l'escalier (entry : de derrière la porte jusqu'au palier) ; un agent qui n'est plus voulu redescend par le même chemin ;
// une place qui change : il y va par les points de ses deux chemins (le palier seul en commun : d'une porte à l'autre, tout
// droit). En arrivant à l'étage (fresh), après un saut du curseur ou avec REDUCED_MOTION, chacun est posé à sa place.
// Utilisé par 68-redaction.js (les reporters, la revue à la demande) et 68-retours.js (les équipes des bureaux).
const LV_V=95;
const lvMem=()=>({who:{},spec:{},okAt:{},fresh:true,last:0,lastT:null});
function lvRoute(a,b){let k=0;while(k<a.path.length&&k<b.path.length&&a.path[k].x===b.path[k].x&&a.path[k].y===b.path[k].y)k++;
  const s=Math.max(k-1,1);return [...a.path.slice(s,-1).reverse(),...b.path.slice(s)];}
const lvEnd=s=>s.path[s.path.length-1];
// un pas pour chacun : want = {id: place} ; dt en secondes
function lvUpdate(M,want,entry,dt){
  if(M.fresh||REDUCED_MOTION){M.fresh=false;M.who={};for(const id in want)M.who[id]={spot:want[id],w:null,pos:{...lvEnd(want[id])},dir:want[id].dir,moving:false};return;}
  for(const id in want){const s=want[id], h=M.who[id];
    if(!h){M.who[id]={spot:s,w:atWalker([...entry,...s.path.slice(1)],LV_V),pos:{...entry[0]},dir:'up',moving:true,delay:s.delay||0};continue;}
    if(h.leaving){h.leaving=false;h.w=atWalker([{...h.pos},...s.path],LV_V);h.spot=s;continue;}
    if(h.spot.id!==s.id){h.w=atWalker([{...h.pos},...lvRoute(h.spot,s)],LV_V);h.spot=s;}}
  for(const id in M.who){const h=M.who[id];if(want[id]||h.leaving)continue;h.leaving=true;h.delay=0;
    h.w=atWalker([{...h.pos},...h.spot.path.slice(0,-1).reverse(),...entry.slice(0,-1).reverse()],LV_V);}
  for(const id of Object.keys(M.who)){const h=M.who[id];if(!h.w){h.moving=false;continue;}
    if(h.delay>0){h.delay-=dt;continue;} // l'un après l'autre dans l'escalier
    const done=atStep(h.w,dt);h.pos={...h.w.pos};h.dir=h.w.dir;h.moving=!done;
    if(done){h.w=null;h.dir=h.spot.dir;if(h.leaving)delete M.who[id];}}
}
// à sa place, assis à son poste : c'est l'étage qui le dessine (avec son bureau, son halo, son badge)
const lvSeated=(M,id)=>{const h=M.who[id];return !!(h&&!h.w&&!h.leaving&&h.spot.seat);};
// la tenue de l'étage : chirurgien (3e), chapeau mou ou visière (2e) ; assis, la tête descend de 6 px (comme mtKit)
function lvKit(kit,c){const x=Math.round(c.pos.x), y=Math.round(c.pos.y), seated=c.pose==='type'&&!c.moving;
  if(kit==='chirurgien')mtChirurgien(ctx,x,y,c.dir,seated);else if(kit)rdHat(ctx,kit,x,y+(seated?6:0),c.dir);}
// ceux qui marchent, prennent un café ou sont au canapé ; out(p) : encore derrière la porte de l'escalier
function lvDraw(M,people,now,out){
  for(const id in M.who){const h=M.who[id], sp=M.spec[id];if(!sp||lvSeated(M,id)||h.w&&h.delay>0)continue;const p=h.pos;if(out(p))continue;
    const sofa=!h.w&&h.spot.sofa, base=sp.src?sp.src():atWorker(sp.k,p.x,p.y,h.dir,false,'',null);if(!base)continue;
    const c=Object.assign(Object.create(Object.getPrototypeOf(base)),base,{pos:{x:p.x,y:p.y+(sofa?9:0)},tile:null,dir:h.dir,moving:h.moving,pose:'stand',present:true,_st:{st:'idle'},gear:null});
    people.push([c,null,false,()=>{lvKit(sp.kit,c);if(sofa&&h.spot.front)h.spot.front();}]);}
}
// le ✓ d'un poste fini, à côté de l'agent comme au 1er : il apparaît en grossissant un peu, posé tel quel en arrivant
function lvPop(M,id,on,now){if(!on){delete M.okAt[id];return 0;}if(M.okAt[id]==null)M.okAt[id]=M.fresh||M.f0?-1e12:now;
  const age=now-M.okAt[id];return age<600?Math.min(1,age/300)*(1+.4*Math.sin(age/600*Math.PI)):1;}
// « z Z » au-dessus de celui qui somnole à son poste, comme au 1er
const lvZz=(x,f,k,now)=>atTxt('z Z',x+12,f-58-(Math.floor(now/800+k)%2)*4,'#bfe6ff','bold 13px ui-monospace,Menlo,monospace');
// le pas de temps d'un étage (rejeu rapide : on marche plus vite) et un saut du curseur (plus de 2 min) : tout se pose
function lvTick(M,now){const dt=(M.last?Math.min(.1,(now-M.last)/1000):0)*walkBoost();M.last=now;
  if(M.lastT!=null&&Math.abs(T-M.lastT)>120e3)M.fresh=true;M.lastT=T;return dt;}
