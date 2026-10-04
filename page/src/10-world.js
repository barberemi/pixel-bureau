// ---------- world ----------
// Le plan vient de LAYOUT (layouts/*.json, format bureau-layout/1, embarqué par tools/assemble.py) : sol en texte
// (une chaîne par rangée, un caractère par case), portes, sortie, îlots, bureau du boss, cases bloquées par le décor,
// places de chaque zone. Plan de l'installation (assemble.layout_path : config, profil d'équipe, sinon layouts/open-space.json) ; un plan
// partagé par le workflow « Le Bureau · plan » (dataset layout) le remplace (00-config.js).
// buildWorld() remplit tout ce qui en découle ; il est rappelé quand un plan partagé arrive (applyLayout, 90-boot.js).
let TS, COLS, ROWS, W, H, EXIT, grid, floorOf, GLASS, DOORS, ISLANDS, IROWS, SEATS, BOSS_SEAT, SPOTS, CLOSABLE;
const blocked=new Set(), seatTiles=new Set(); const B=(x,y)=>blocked.add(x+','+y);
// un siège du plan désigné par son numéro (« I2.R2 ») ou, ancien format, par ses coordonnées [x, y]
const seatRef=s=>typeof s==='string'?SEATS.find(t=>t.id===s):Array.isArray(s)?SEATS.find(t=>t.x===s[0]&&t.y===s[1]):undefined;
const seatDir=(x,y)=>{const s=SEATS.find(s=>s.x===x&&s.y===y);return s?s.dir:'down';};
function buildWorld(){
  TS=LAYOUT.tile; COLS=LAYOUT.size[0]; ROWS=LAYOUT.size[1]; W=COLS*TS; H=ROWS*TS;
  EXIT=LAYOUT.exit;
  grid=[]; floorOf=[]; GLASS=new Set(); blocked.clear(); seatTiles.clear();
  LAYOUT.tiles.forEach((row,y)=>{grid.push([]);floorOf.push([]);[...row].forEach((ch,x)=>{
    const kind=LAYOUT.legend[ch], wall=kind==='wall'||kind==='glass';
    grid[y].push(wall?1:0);floorOf[y].push(wall?null:kind);
    if(kind==='glass')GLASS.add(x+','+y);
  });});
  DOORS=LAYOUT.doors.map(([x,y])=>[x,y,floorOf[y][x]]); // seuils dessinés par buildBg
  // îlots : table verticale (une case par rang), places à gauche (regardent à droite) et à droite (regardent à gauche) ;
  // numérotées comme tools/plan.py : I2.R2 = îlot 2, côté droit, rang 2
  ISLANDS=LAYOUT.islands.x; IROWS=LAYOUT.islands.rows; SEATS=[];
  ISLANDS.forEach((cx,i)=>IROWS.forEach((r,k)=>{
    B(cx,r);
    for(const [sx,dir,side] of [[cx-1,'right','L'],[cx+1,'left','R']]){SEATS.push({id:'I'+(i+1)+'.'+side+(k+1),x:sx,y:r,dir,cx});seatTiles.add(sx+','+r);}
  }));
  placeCast();
  // bureau du boss : sa place et son bureau
  BOSS_SEAT=LAYOUT.boss.seat;
  for(const [x,y] of LAYOUT.boss.desk)B(x,y); seatTiles.add(BOSS_SEAT.join(','));
  // plantes et cases bloquées en plus (les meubles du catalogue bloquent leur emprise : 40-furniture.js)
  for(const [x,y] of LAYOUT.blocked||[])B(x,y);
  for(const [x,y] of LAYOUT.plants)B(x,y);
  SPOTS=LAYOUT.spots;
  // porte qui se ferme (plateau TV fermé le vendredi et le week-end)
  CLOSABLE=new Set(LAYOUT.closable.map(c=>c.at.join(',')));
}
// places : le plan est maître (LAYOUT.seating {siège: clé}) ; sinon la place du roster ou de l'agent si c'est un siège
// libre de ce plan ; sinon un siège libre, dans l'ordre du casting (collègues, puis agents) : d'abord les sièges
// ordinaires, puis ceux réservés à quelqu'un d'absent, enfin ceux des intérimaires (free_seats).
// Même règle que assign() de tools/plan.py (vérifié par un test).
// Le boss reçoit aussi une place, libérée pour les intérimaires tant qu'il est à son bureau.
function placeCast(){
  const who=[...ROSTER,...AGENTS], got=new Map(), taken=new Set();
  const give=(k,t)=>{got.set(k,t);taken.add(t.id);};
  const seating=Object.entries(LAYOUT.seating||{});
  for(const [id,k] of seating){const t=seatRef(id);if(t&&!taken.has(t.id)&&!got.has(k)&&who.some(w=>w.key===k))give(k,t);}
  for(const w of who)if(!got.has(w.key)){const t=seatRef(w.seat);if(t&&!taken.has(t.id))give(w.key,t);}
  const free=(LAYOUT.free_seats||[]).map(seatRef).filter(Boolean), reserved=new Set(seating.map(([id])=>id));
  const plain=SEATS.filter(t=>!taken.has(t.id)&&!free.includes(t)&&!reserved.has(t.id));
  const spare=[...plain,...SEATS.filter(t=>!taken.has(t.id)&&!free.includes(t)&&reserved.has(t.id)),...free.filter(t=>!taken.has(t.id))];
  for(const w of who)if(!got.has(w.key)){const t=spare.shift();if(t)give(w.key,t);}
  for(const c of CAST){const t=got.get(c.key);c.seat=t&&!c.boss?[t.x,t.y]:null;}
  // places des intérimaires (et des collègues hors roster) : free_seats dans l'ordre, la place du boss, puis les sièges restants
  const boss=got.get(OWNER), rest=SEATS.filter(t=>!taken.has(t.id)&&!free.includes(t));
  FREE_SEATS.length=0;
  for(const t of [...free,...(boss&&!free.includes(boss)?[boss]:[]),...rest])FREE_SEATS.push([t.x,t.y]);
}
buildWorld();
// seules les places des îlots et du boss bloquent le passage ; réunion, café, toilettes se traversent
const walkable=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS&&grid[y][x]===0&&!blocked.has(x+','+y)&&!(CLOSABLE.has(x+','+y)&&typeof T!=='undefined'&&stageClosed(T));

function findPath(sx,sy,gx,gy){
  if(sx===gx&&sy===gy)return [];
  const key=(x,y)=>y*COLS+x, prev=new Map([[key(sx,sy),-1]]), q=[[sx,sy]];
  while(q.length){
    const [x,y]=q.shift();
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy, k=key(nx,ny);
      if(prev.has(k))continue;
      const goal=nx===gx&&ny===gy;
      if(!goal&&(!walkable(nx,ny)||seatTiles.has(nx+','+ny)))continue;
      if(goal&&!(grid[ny]&&grid[ny][nx]===0))continue;
      prev.set(k,key(x,y));
      if(goal){const path=[];let c=k;while(c!==key(sx,sy)){path.unshift([c%COLS,Math.floor(c/COLS)]);c=prev.get(c);}return path;}
      q.push([nx,ny]);
    }
  }
  return [[gx,gy]];
}

