// Lot 7, phase 1 : le monde construit depuis layouts/equipe.json est exactement celui de l'ancien plan codé en dur
// (tests/fixtures/world_equipe.json, figé avant l'extraction) : grille, sols, portes, vitres, sièges, places, cases
// bloquées, cases praticables, pièces éclairées, objets cliquables, places libres.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const page = load();
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'world_equipe.json'), 'utf8'));
const now = JSON.parse(page.run(`JSON.stringify({TS,COLS,ROWS,W,H,EXIT,grid,floorOf,DOORS,GLASS:[...GLASS].sort(),ISLANDS,IROWS,SEATS,
  seatTiles:[...seatTiles].sort(),blocked:[...blocked].sort(),SPOTS,FREE_SEATS:LAYOUT.free_seats,ROOMS,TVR,KANR,PLANR,PAYR,EMPR,
  walk:Array.from({length:ROWS},(_,y)=>Array.from({length:COLS},(_,x)=>walkable(x,y)?1:0).join('')).join('|')})`));

for (const k of Object.keys(ref)) {
  test(`plan extrait : ${k} identique à l'ancien plan codé en dur`, () => assert.deepEqual(now[k], ref[k]));
}

test('plan : chaque rangée a la largeur annoncée et chaque caractère est dans la légende', () => {
  const L = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'layouts', 'equipe.json'), 'utf8'));
  assert.equal(L.tiles.length, L.size[1]);
  for (const row of L.tiles) {
    assert.equal(row.length, L.size[0]);
    for (const ch of row) assert.ok(ch in L.legend, `caractère inconnu : ${ch}`);
  }
});

test("un autre plan (exemple-startup) : la page démarre, chaque siège et chaque place se rejoignent depuis la sortie", () => {
  const p = load({layout: 'exemple-startup'});
  const r = JSON.parse(p.run(`(()=>{
    const bad=[], reach=(x,y)=>{const path=findPath(EXIT[0],EXIT[1],x,y);const l=path[path.length-1];
      return path.length>1||(l&&Math.abs(l[0]-EXIT[0])+Math.abs(l[1]-EXIT[1])<=1);};
    for(const s of SEATS)if(!reach(s.x,s.y))bad.push('siège '+s.x+','+s.y);
    for(const [z,l] of Object.entries(SPOTS))for(const [x,y] of l)if(!reach(x,y))bad.push(z+' '+x+','+y);
    const seatless=CAST.filter(c=>c.seat&&!SEATS.some(t=>t.x===c.seat[0]&&t.y===c.seat[1])).map(c=>c.key);
    return JSON.stringify({W,H,bad,seatless,chars:chars.length});})()`));
  assert.deepEqual([r.W, r.H], [960, 512]);
  assert.deepEqual(r.bad, []);
  assert.deepEqual(r.seatless, []); // places du roster (plan equipe) réattribuées sur des sièges de ce plan
  assert.ok(r.chars > 10);
});
