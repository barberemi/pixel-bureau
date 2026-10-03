// ---------- world ----------
// Plan dessiné par Rémi (2026-10-02) : cafétéria à gauche, salles en haut, bureau du boss ouvert en bas,
// 6 îlots de 6 places, entrée principale à droite, toilettes = workflows en panne.
const TS=32, COLS=40, ROWS=20, W=COLS*TS, H=ROWS*TS;
const EXIT=[39,6];
const grid=[], floorOf=[];
for(let y=0;y<ROWS;y++){grid.push(new Array(COLS).fill(1));floorOf.push(new Array(COLS).fill(null));}
const fill=(x0,y0,x1,y1,f)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){grid[y][x]=0;floorOf[y][x]=f;}};
fill(13,6,38,18,'carpet'); fill(1,12,12,18,'carpet');   // open space + couloirs
fill(16,2,16,5,'carpet'); fill(32,2,32,5,'carpet');     // couloirs verticaux du haut
fill(1,2,11,10,'tiles');                                // cafétéria
fill(13,2,15,4,'server');                               // salle serveurs
fill(18,2,26,4,'carpetB');                              // salle de réunion
fill(28,2,31,4,'stage');                                // plateau TV
fill(34,2,38,4,'wc');                                   // toilettes
const wallLine=(x0,y0,x1,y1)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){grid[y][x]=1;floorOf[y][x]=null;}};
wallLine(17,7,27,7); wallLine(17,8,17,10); wallLine(27,8,27,10); fill(18,8,26,10,'wood'); // bureau du boss, ouvert en bas
const DOORS=[[12,6,'carpet'],[6,11,'tiles'],[14,5,'server'],[17,3,'carpetB'],[29,5,'stage'],[33,3,'wc'],[39,6,'mat'],[39,7,'mat']];
for(const [x,y,f] of DOORS){grid[y][x]=0;floorOf[y][x]=f;}
const GLASS=new Set(); for(let x=17;x<=27;x++)GLASS.add(x+',5'); for(let y=7;y<=10;y++){GLASS.add('17,'+y);GLASS.add('27,'+y);}
const blocked=new Set(); const B=(x,y)=>blocked.add(x+','+y);
const seatTiles=new Set();
// îlots : table verticale (3 cases), places à gauche (regardent à droite) et à droite (regardent à gauche)
const ISLANDS=[6,11,18,24,30,36], IROWS=[14,15,16];
const SEATS=[];
for(const cx of ISLANDS)for(const r of IROWS){
  B(cx,r);
  for(const [sx,dir] of [[cx-1,'right'],[cx+1,'left']]){SEATS.push({x:sx,y:r,dir,cx});seatTiles.add(sx+','+r);}
}
const seatDir=(x,y)=>{const s=SEATS.find(s=>s.x===x&&s.y===y);return s?s.dir:'down';};
// bureau du boss
B(21,9);B(22,9);B(23,9); seatTiles.add('22,8');
// cafétéria
for(let x=2;x<=7;x++)B(x,2); B(1,2); B(4,6);B(5,6); B(11,7);
// salle serveurs, réunion, toilettes, décor
 B(13,2);B(15,2); for(let x=19;x<=25;x++)B(x,3); B(38,2); B(38,9); B(1,10);B(11,2);B(1,18);B(38,18);B(38,12);B(13,12);
const SPOTS={
  boss:[[22,8,'down']],
  gate:[[19,10,'up'],[20,10,'up'],[24,10,'up'],[25,10,'up'],[18,9,'right'],[26,9,'left']],
  meet:[[19,2,'down'],[20,2,'down'],[21,2,'down'],[22,2,'down'],[23,2,'down'],[24,2,'down'],[25,2,'down'],[19,4,'up'],[20,4,'up'],[21,4,'up'],[22,4,'up'],[23,4,'up'],[24,4,'up'],[25,4,'up'],[26,3,'left']],
  srv:[[14,3,'up'],[13,3,'up'],[15,3,'up'],[14,4,'up']],
  coffee:[[2,3,'up'],[3,3,'up'],[4,3,'up'],[5,3,'up']],
  sofa:[[8,10,'down'],[9,10,'down'],[10,10,'down']],
  ktable:[[3,6,'right'],[6,6,'left'],[4,7,'up'],[5,7,'up']],
  cooler:[[10,7,'right']], copier:[[37,9,'right']],
  stage:[[29,3,'down'],[30,3,'down'],[28,3,'down'],[31,3,'down']],
  stageout:[[29,6,'up'],[30,6,'up'],[28,6,'up'],[31,6,'up']],
  wc:[[34,2,'down'],[35,2,'down'],[36,2,'down'],[37,2,'down']],
  daily:[[3,5,'down'],[4,5,'down'],[5,5,'down'],[6,5,'down'],[3,6,'right'],[6,6,'left'],[2,6,'right'],[7,6,'left'],[3,7,'up'],[4,7,'up'],[5,7,'up'],[6,7,'up']],
  sax:[[25,8,'down']],
  stagesax:[[31,4,'down']],
  kanban:[[24,8,'up'],[25,8,'up'],[26,8,'up'],[23,8,'up']],
};
// seules les places des îlots et du boss bloquent le passage ; réunion, café, toilettes se traversent
const walkable=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS&&grid[y][x]===0&&!blocked.has(x+','+y)&&!(x===29&&y===5&&typeof T!=='undefined'&&stageClosed(T));

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

