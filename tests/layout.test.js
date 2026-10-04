// Lot 7, phase 1 : le monde construit depuis layouts/equipe.json est exactement celui de l'ancien plan codé en dur
// (tests/fixtures/world_equipe.json, figé avant l'extraction) : grille, sols, portes, vitres, sièges, places, cases
// bloquées, cases praticables, pièces éclairées, objets cliquables, places libres.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const page = load({layout: 'equipe'});
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'world_equipe.json'), 'utf8'));
const now = JSON.parse(page.run(`JSON.stringify({TS,COLS,ROWS,W,H,EXIT,grid,floorOf,DOORS,GLASS:[...GLASS].sort(),ISLANDS,IROWS,SEATS:SEATS.map(({id,...s})=>s),
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

// Lot 7, phase 4 : sièges par numéro. La page (10-world.js) et tools/plan.py (assign) placent tout le monde pareil.
test('sièges : même attribution dans la page et dans tools/plan.py (plans, boss, agents avec ou sans place)', () => {
  const {execFileSync} = require('child_process');
  const fixture = {...JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bureau.config.json'), 'utf8')), team: 'equipe', people: []};
  const roster = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'teams', 'equipe', 'roster.json'), 'utf8')).people;
  const bare = fixture.agents.map(({seat, ...a}) => a);
  fixture.agents = bare.map((a, i) => ({...a, seat: [[23, 14], [23, 15], [23, 16], [25, 14], [25, 15], [25, 16], [29, 14], [29, 15], [29, 16], [31, 14], [31, 15], [31, 16]][i]})); // ancien format [x, y]
  for (const layout of ['equipe', 'exemple-startup'])
    for (const owner of ['p_remi', 'p_coll2', null])
      for (const agents of [fixture.agents, bare]) {
        const p = load({layout, owner, config: {...fixture, agents}});
        const js = JSON.parse(p.run(`JSON.stringify({seats:Object.fromEntries(CAST.filter(c=>c.seat).map(c=>[c.key,seatRef(c.seat).id])),
          temps:FREE_SEATS.map(s=>seatRef(s).id)})`));
        const py = JSON.parse(execFileSync('python3', ['-c', `import json,sys;sys.path.insert(0,'tools');import plan
d=json.load(sys.stdin);got,temps=plan.assign(json.load(open('layouts/'+d['layout']+'.json')),d['people'],d['owner'])
print(json.dumps({'seats':got,'temps':temps}))`], {cwd: path.join(__dirname, '..'),
          input: JSON.stringify({layout, owner, people: [...roster, ...agents]})}));
        assert.deepEqual(js, py, `${layout}, boss ${owner}, agents ${agents === bare ? 'sans' : 'avec'} place`);
      }
});

test('sièges : le plan equipe place l\'équipe et les agents sans leur place du roster', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bureau.config.json'), 'utf8'));
  const p = load({owner: 'p_coll2', config: {...fixture, team: 'equipe', people: []}});
  const s = JSON.parse(p.run(`JSON.stringify(Object.fromEntries(CAST.map(c=>[c.key,c.seat])))`));
  assert.deepEqual(s.p_remi, [12, 15]); // I2.R2
  assert.deepEqual(s.dwight, [23, 14]); // I4.L1
  assert.equal(s.p_coll2, null); // le boss
});

// Plan d'équipe partagé (dataset layout, workflow « Le Bureau · plan ») : lu au démarrage, appliqué à chaud
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'layouts', 'exemple-startup.json'), 'utf8'));
const WORLD = `JSON.stringify({W,H,grid,SEATS,blocked:[...blocked].sort(),seats:CAST.map(c=>c.seat),free:FREE_SEATS,rooms:ROOMS.length,furn:FURN.length})`;

test('plan partagé : lu au démarrage à la place du plan embarqué', () => {
  const p = load({kronnPageData: {datasets: {layout: {current: {layout: EXAMPLE}}}}});
  assert.deepEqual(JSON.parse(p.run('JSON.stringify([W,H,LAYOUT.id])')), [960, 512, 'exemple-startup']);
  const off = load({kronnPageData: {datasets: {layout: {current: {layout: null}}}}}); // « defaut » : plan embarqué
  assert.equal(off.run('LAYOUT.id'), 'open-space'); // plan embarqué de la démo
});

test('plan partagé : appliqué à chaud, puis retour au plan embarqué sans aucune différence', () => {
  const p = load({layout: 'equipe'});
  const before = p.run(WORLD);
  assert.equal(p.run(`applyLayout(${JSON.stringify(EXAMPLE)})`), true);
  const hot = JSON.parse(p.run(WORLD));
  const fresh = JSON.parse(load({layout: 'exemple-startup'}).run(WORLD));
  assert.deepEqual(hot, fresh); // même monde qu'une page chargée directement avec ce plan
  assert.ok(JSON.parse(p.run('JSON.stringify(chars.filter(c=>c.seat&&!seatRef(c.seat)).map(c=>c.key))')).length === 0);
  assert.equal(p.run(`applyLayout(${JSON.stringify(EXAMPLE)})`), false); // même plan : rien à refaire
  p.run('applyLayout(EMBEDDED_LAYOUT)');
  assert.equal(p.run(WORLD), before);
});

test('thèmes : chaque décor se dessine sur un autre plan, même sans les meubles où il s\'accroche', () => {
  const bare = {...EXAMPLE, furniture: EXAMPLE.furniture.filter(f => !['toilets', 'kitchen_table', 'counter', 'boss_desk'].includes(f.type))};
  const p = load({layout: 'exemple-startup'});
  p.run(`applyLayout(${JSON.stringify(bare)})`);
  for (const th of ['noel', 'nouvel-an', 'saint-valentin', 'halloween'])
    for (const h of [11, 20.25])
      p.run(`THEME_FORCE='${th}';T=DAY0+${h}*3600e3;THEME_MEMO={k:null,v:null};render(${h * 1000});lightSources();`);
  assert.equal(p.run('furnAt("toilets")'), null); // pas de toilettes : pas de banderole, pas d'erreur
});

test('plan sans les listes facultatives (porte refermable, plantes, fenêtres, meubles, lumières) : la page démarre et se dessine', () => {
  const lean = {...EXAMPLE};
  for (const k of ['closable', 'plants', 'windows', 'furniture', 'light_rooms', 'blocked', 'wall', 'labels', 'clock', 'free_seats']) delete lean[k];
  const p = load({kronnPageData: {datasets: {layout: {current: {layout: lean}}}}});
  assert.equal(p.run('LAYOUT.id'), 'exemple-startup');
  for (const h of [11, 20.25]) p.run(`T=DAY0+${h}*3600e3;render(${h * 1000});lightSources();`);
});
