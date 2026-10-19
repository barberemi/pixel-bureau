// ---------- tournée de café (#84) : un invité on « coffee » passe à la machine à café, puis apporte un café à chacun ----------
// Réglages de l'invité (roster ou config, clé guests) : at « HH:MM » + jitter en minutes (heure tirée pour la date, la même
// au rejeu), shout (sa bulle à la machine, toujours la même), feed (la ligne du fil à son arrivée, {name} : son nom), until
// « HH:MM » (les tasses restent jusque-là, 17:00 par défaut). Tous les jours ouvrés, quoi qu'il arrive. Reçoivent un café
// les collègues présents au bureau (pas en télétravail ni absents), le boss compris, au plus court depuis la machine : il se
// place derrière chacun (du côté opposé à son regard), le boss à gauche de son bureau. Chacun garde sa tasse côté écran.
const COFFEE_BREW=3*60e3, COFFEE_STEP=2*60e3;
let COFFEE_M={};
const coffeeSeat=p=>p.boss?SPOTS.boss[0]:p.seat;
// la tournée du jour de t : {s : arrivée, at : premier café, e : départ, list : qui le reçoit, dans l'ordre} ; null le week-end
function coffeeTour(c,t){
  const v=guestVisit(c,t);if(!v)return null;
  const k=c.key+v.s,M=COFFEE_M;if(M.k===k&&M.team===TEAM&&M.abs===ABSENCES&&M.data===DATA)return M.r; // recalculée quand les données changent
  const at=v.s+COFFEE_BREW, left=chars.filter(p=>p.person&&coffeeSeat(p)&&(p.boss||(s=>s&&!s.tt&&!['off','absent','gone'].includes(s.st))(stateAt(p,at)))), list=[];
  let q=(SPOTS.coffee||[[0,0]])[0];
  while(left.length){left.sort((a,b)=>Math.hypot(coffeeSeat(a)[0]-q[0],coffeeSeat(a)[1]-q[1])-Math.hypot(coffeeSeat(b)[0]-q[0],coffeeSeat(b)[1]-q[1]));list.push(left.shift());q=coffeeSeat(list[list.length-1]);}
  COFFEE_M={k,team:TEAM,abs:ABSENCES,data:DATA,r:{s:v.s,at,e:at+list.length*COFFEE_STEP,list}};return COFFEE_M.r;
}
const COFFEE_BACK={left:[1,0],right:[-1,0],up:[0,1],down:[0,-1]};
const faceTo=(dx,dy)=>Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
// où se placer pour lui donner son café : derrière lui, tourné vers lui ; le boss à son bureau : à gauche du bureau
function coffeeSpot(p){
  const s=p._st||{};
  if(p.boss&&p.atBoss){const d=(LAYOUT.furniture||[]).find(f=>f.type==='boss_desk'),b=SPOTS.boss[0],x=(d?d.at[0]:b[0])-1;if(walkable(x,b[1]))return [x,b[1],'right'];}
  if(!p.boss&&p.seat&&(s.zone==='desk'||!p.tile))return besideSeat(p.seat);
  const [x,y]=p.tile||coffeeSeat(p),[dx,dy]=COFFEE_BACK[p.dir]||[0,1];
  for(const [ox,oy] of [[dx,dy],[dy,dx],[-dy,-dx],[-dx,-dy]])if(walkable(x+ox,y+oy))return [x+ox,y+oy,faceTo(-ox,-oy)];
  return [x,y+1,'up'];
}
function coffeeState(c,t){
  const r=coffeeTour(c,t);
  if(!r||t<r.s)return {st:'off',label:"Pas encore passé aujourd'hui"};
  if(t>=r.e)return {st:'gone',label:'A apporté '+plural(r.list.length,'café','cafés')+' à partir de '+hm(r.at)};
  if(t<r.at)return {st:'brew',zone:'coffee',label:'Prépare les cafés à la machine',bubble:c.shout||'☕ La tournée de café !',big:true};
  const p=r.list[Math.floor((t-r.at)/COFFEE_STEP)];
  return {st:'serve',zone:'visit',visit:coffeeSpot(p),label:'Apporte un café à '+p.name,bubble:'☕ Et un café pour '+p.name+' !'};
}
// les tasses : celles déjà servies (côté écran, jusqu'à until) et celle qu'il porte ; triées avec les personnages (41-render.js)
function coffeeMugs(){
  const out=[];
  for(const c of chars){if(c.on!=='coffee'||!c._st)continue;
    if((c._st.st==='brew'||c._st.st==='serve')&&c.pos){const o={left:[-14,-24],right:[14,-24],up:[8,-40],down:[10,-14]}[c.dir]||[10,-14];
      out.push({x:c.pos.x+o[0],y:c.pos.y+o[1],z:c.pos.y+.5,hot:true,flip:c.dir==='left'});}
    const r=coffeeTour(c,T),u=(c.until||'17:00').split(':');if(!r||T>=parisMidnight(T)+(u[0]*60+ +u[1])*60e3)continue;
    r.list.forEach((p,i)=>{if(T<r.at+(i+.5)*COFFEE_STEP)return;const s=coffeeSeat(p),q=tileCenter(s[0],s[1]);
      const d=p.boss?'boss':seatDir(s[0],s[1]),o={left:[-16,-20],right:[16,-20],up:[10,-40],down:[13,-14],boss:[-22,-10]}[d]||[13,-14];
      out.push({x:q.x+o[0],y:q.y+o[1],z:q.y+.5,flip:d==='left'});});
  }
  return out;
}
function drawMug(m,now){
  const x=Math.round(m.x),y=Math.round(m.y),o='#4a3a2c',hx=m.flip?x-8:x+5;
  R(ctx,x-5,y-5,10,10,o);R(ctx,x-4,y-4,8,8,'#fbf7ee');R(ctx,x-4,y-4,8,2,'#6b3e1e');R(ctx,x-4,y+3,8,1,'#d8cfbf'); // tasse, café
  R(ctx,hx,y-3,3,5,o);R(ctx,hx+(m.flip?1:0),y-2,2,3,'#fbf7ee'); // l'anse, côté extérieur
  if(m.hot){const s=Math.floor(now/300)%2;R(ctx,x-2+s,y-9,1,3,'rgba(255,255,255,.9)');R(ctx,x+1-s,y-13,1,3,'rgba(255,255,255,.7)');}
}
