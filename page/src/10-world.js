// ---------- world ----------
// Le plan vient de LAYOUT (layouts/*.json, format bureau-layout/1, embarqué par tools/assemble.py) : sol en texte
// (une chaîne par rangée, un caractère par case), portes, sortie, îlots, bureau du boss, cases bloquées par le décor,
// places de chaque zone. Plan par défaut : layouts/equipe.json, d'après le croquis de Rémi (2026-10-02).
const TS=LAYOUT.tile, COLS=LAYOUT.size[0], ROWS=LAYOUT.size[1], W=COLS*TS, H=ROWS*TS;
const EXIT=LAYOUT.exit;
const grid=[], floorOf=[], GLASS=new Set();
LAYOUT.tiles.forEach((row,y)=>{grid.push([]);floorOf.push([]);[...row].forEach((ch,x)=>{
  const kind=LAYOUT.legend[ch], wall=kind==='wall'||kind==='glass';
  grid[y].push(wall?1:0);floorOf[y].push(wall?null:kind);
  if(kind==='glass')GLASS.add(x+','+y);
});});
const DOORS=LAYOUT.doors.map(([x,y])=>[x,y,floorOf[y][x]]); // seuils dessinés par buildBg
const blocked=new Set(); const B=(x,y)=>blocked.add(x+','+y);
const seatTiles=new Set();
// îlots : table verticale (une case par rang), places à gauche (regardent à droite) et à droite (regardent à gauche)
const ISLANDS=LAYOUT.islands.x, IROWS=LAYOUT.islands.rows;
const SEATS=[];
for(const cx of ISLANDS)for(const r of IROWS){
  B(cx,r);
  for(const [sx,dir] of [[cx-1,'right'],[cx+1,'left']]){SEATS.push({x:sx,y:r,dir,cx});seatTiles.add(sx+','+r);}
}
const seatDir=(x,y)=>{const s=SEATS.find(s=>s.x===x&&s.y===y);return s?s.dir:'down';};
// bureau du boss : sa place et son bureau
const BOSS_SEAT=LAYOUT.boss.seat;
for(const [x,y] of LAYOUT.boss.desk)B(x,y); seatTiles.add(BOSS_SEAT.join(','));
// décor qui bloque le passage (comptoir, tables, baies, copieur...) et plantes
for(const [x,y] of LAYOUT.blocked)B(x,y);
for(const [x,y] of LAYOUT.plants)B(x,y);
const SPOTS=LAYOUT.spots;
// porte qui se ferme (plateau TV fermé le vendredi et le week-end)
const CLOSABLE=new Set(LAYOUT.closable.map(c=>c.at.join(',')));
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

