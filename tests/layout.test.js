// Lot 7, phase 1 : le monde construit depuis layouts/open-space.json (le plan type, même géométrie que le plan d'origine)
// est exactement celui de l'ancien plan codé en dur (tests/fixtures/world_open-space.json, figé avant l'extraction) : grille, sols, portes, vitres, sièges, places, cases
// bloquées, cases praticables, pièces éclairées, objets cliquables, places libres.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'world_open-space.json'), 'utf8'));
const now = JSON.parse(page.run(`JSON.stringify({TS,COLS,ROWS,W,H,EXIT,grid,floorOf,DOORS,GLASS:[...GLASS].sort(),ISLANDS,IROWS,SEATS:SEATS.map(({id,...s})=>s),
  seatTiles:[...seatTiles].sort(),blocked:[...blocked].sort(),SPOTS,FREE_SEATS:LAYOUT.free_seats,ROOMS,TVR,KANR,PAYR,EMPR,
  walk:Array.from({length:ROWS},(_,y)=>Array.from({length:COLS},(_,x)=>walkable(x,y)?1:0).join('')).join('|')})`));

for (const k of Object.keys(ref)) {
  test(`plan extrait : ${k} identique à l'ancien plan codé en dur`, () => assert.deepEqual(now[k], ref[k]));
}

test('plan : chaque rangée a la largeur annoncée et chaque caractère est dans la légende', () => {
  const L = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'layouts', 'open-space.json'), 'utf8'));
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
  assert.deepEqual(r.seatless, []); // places du roster réattribuées sur des sièges de ce plan
  assert.ok(r.chars > 10);
});

// pack d'équipe fictif (tests/fixtures/pack-exemple) : son plan place l'équipe (seating)
const PACK = './tests/fixtures/pack-exemple', PACK_PLAN = 'tests/fixtures/pack-exemple/layouts/plan.json';

// Lot 7, phase 4 : sièges par numéro. La page (10-world.js) et tools/plan.py (assign) placent tout le monde pareil.
test('sièges : même attribution dans la page et dans tools/plan.py (plans, boss, agents avec ou sans place)', () => {
  const {execFileSync} = require('child_process');
  const fixture = {...JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bureau.config.json'), 'utf8')), team: PACK, people: []};
  const roster = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pack-exemple', 'roster.json'), 'utf8')).people;
  const bare = fixture.agents.map(({seat, ...a}) => a);
  fixture.agents = bare.map((a, i) => ({...a, seat: ['I4.L1', 'I4.L2', 'I4.L3', 'I4.R1', 'I4.R2', 'I4.R3', 'I5.L1', 'I5.L2', 'I5.L3', 'I5.R1', 'I5.R2', 'I5.R3'][i]}));
  // l'ancien format [x, y] (les mêmes places) n'est plus lu : mêmes sièges que sans place
  const legacy = bare.map((a, i) => ({...a, seat: [[23, 14], [23, 15], [23, 16], [25, 14], [25, 15], [25, 16], [29, 14], [29, 15], [29, 16], [31, 14], [31, 15], [31, 16]][i]}));
  for (const layout of [PACK_PLAN, 'exemple-startup'])
    for (const owner of ['p_bob', 'p_lynn', null]) {
      const got = {};
      for (const agents of [fixture.agents, bare, legacy]) {
        const p = load({layout, owner, config: {...fixture, agents}});
        const js = JSON.parse(p.run(`JSON.stringify({seats:Object.fromEntries(CAST.filter(c=>c.seat).map(c=>[c.key,seatAt(c.seat).id])),
          temps:FREE_SEATS.map(s=>seatAt(s).id)})`));
        const py = JSON.parse(execFileSync('python3', ['-c', `import json,sys;sys.path.insert(0,'tools');import plan
d=json.load(sys.stdin);f=d['layout'] if '/' in d['layout'] else 'layouts/'+d['layout']+'.json'
got,temps=plan.assign(json.load(open(f)),d['people'],d['owner'])
print(json.dumps({'seats':got,'temps':temps}))`], {cwd: path.join(__dirname, '..'),
          input: JSON.stringify({layout, owner, people: [...roster, ...agents]})}));
        const kind = agents === bare ? 'sans' : agents === legacy ? 'ancien format' : 'avec';
        assert.deepEqual(js, py, `${layout}, boss ${owner}, agents ${kind} place`);
        got[kind] = js;
      }
      assert.deepEqual(got['ancien format'], got.sans, `${layout}, boss ${owner} : une place [x, y] est ignorée`);
    }
});

test('sièges : le plan du pack place l\'équipe et les agents sans leur place du roster', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bureau.config.json'), 'utf8'));
  const p = load({owner: 'p_lynn', config: {...fixture, team: PACK, people: []}});
  const s = JSON.parse(p.run(`JSON.stringify(Object.fromEntries(CAST.map(c=>[c.key,c.seat])))`));
  assert.deepEqual(s.p_bob, [12, 15]); // I2.R2
  assert.deepEqual(s.dwight, [23, 14]); // I4.L1
  assert.equal(s.p_lynn, null); // le boss
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
  const p = load({layout: 'open-space'});
  const before = p.run(WORLD);
  assert.equal(p.run(`applyLayout(${JSON.stringify(EXAMPLE)})`), true);
  const hot = JSON.parse(p.run(WORLD));
  const fresh = JSON.parse(load({layout: 'exemple-startup'}).run(WORLD));
  assert.deepEqual(hot, fresh); // même monde qu'une page chargée directement avec ce plan
  assert.ok(JSON.parse(p.run('JSON.stringify(chars.filter(c=>c.seat&&!seatAt(c.seat)).map(c=>c.key))')).length === 0);
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
