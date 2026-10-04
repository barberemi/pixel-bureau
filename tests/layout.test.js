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
