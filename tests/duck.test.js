// Le canard en plastique (39-duck.js) : position fonction pure du temps (même canard à chaque calcul, quel que soit
// l'instant affiché), toujours sur une case marchable, qui bouge et visite plusieurs pièces dans la journée ; sa fiche
// (un sélecteur de projet et un seul bouton, lié au projet choisi, pas de bouton en mode TV) ; ses discussions jamais en visiteurs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = (d, hm) => Date.parse(`2026-10-${d}T${hm}:00+02:00`);

// une position par minute sur la journée, calculée de zéro (cache vidé), T placé ailleurs
function day(d, tNow) {
  return J(`(() => { DUCK_DAY = null; const t0 = T; T = ${tNow}; const d0 = ${at(d, '00:00')}, out = [];
    try { for (let t = d0; t < d0 + 864e5; t += 60e3) out.push(duckAt(t)); } finally { T = t0; }
    return out; })()`);
}

for (const [d, name] of [['01', 'jeudi'], ['02', 'vendredi (plateau fermé)'], ['04', 'dimanche']]) {
  test(`${name} : même parcours à chaque calcul, sur des cases marchables, hors places assises`, () => {
    const a = day(d, at('05', '15:00')), b = day(d, at(d, '11:00'));
    assert.deepEqual(a, b);
    const bad = J(`${JSON.stringify(a.map(p => p.tile))}.filter(([x, y]) => (T = ${at(d, '12:00')}, !walkable(x, y) || seatTiles.has(x + ',' + y)))`);
    assert.deepEqual(bad, []);
  });
}

test('il bouge dans la journée et passe par plusieurs pièces', () => {
  const a = day('01', at('01', '11:00'));
  assert.ok(a.some(p => p.moving) && a.some(p => !p.moving));
  assert.ok(new Set(a.map(p => p.tile.join(','))).size > 40);
  const kinds = J(`[...new Set(${JSON.stringify(a.map(p => p.tile))}.map(([x, y]) => floorOf[y][x]))]`);
  assert.ok(kinds.length >= 3, kinds.join(', '));
});

test('lent et sans saut : au plus une case par pas de DUCK_STEP', () => {
  const pts = J(`(() => { DUCK_DAY = null; const d0 = ${at('01', '10:00')}, out = [];
    for (let t = d0; t < d0 + 3600e3; t += 700) out.push(duckAt(t)); return out; })()`);
  const step = J('DUCK_STEP'), ts = J('TS');
  for (let i = 1; i < pts.length; i++)
    assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) <= ts * 700 / step + 0.01, `saut à ${i}`);
});

test('bouton « parler au canard » : liaison project_id = id de la ligne', () => {
  assert.deepEqual(J("bindsFor('bureau-duck', {id: 'p1'})"), {project_id: 'p1'});
});

// boutons de la fiche : [action, liaison, nom]
function duckButtons(tv, chosen = 'none') {
  return J(`(() => {
    const calls = [], lb = launchBlock, fs = foldSection, tv0 = TV;
    launchBlock = (box, o) => calls.push([o.action, o.bind, o.name]);
    foldSection = () => ({appendChild() {}});
    TV = ${tv}; DUCK_PROJECT = ${JSON.stringify(chosen)};
    DUCK_PROJECTS = [{id: 'none', name: 'Sans projet'}, {id: 'p1', name: 'Front'}];
    DUCKS = [{id: 'd1', title: '🦆 Le menu casse', project: 'Front', updated: '2026-10-01T09:00:00Z', awaiting: true}];
    try { renderDuck({appendChild() {}}); } finally { launchBlock = lb; foldSection = fs; TV = tv0; }
    return calls;
  })()`);
}

test('fiche : un seul bouton, lié au projet choisi (« Sans projet » par défaut ou inconnu) ; aucun en mode TV', () => {
  assert.deepEqual(duckButtons(false), [['bureau-duck', {id: 'none'}, 'Sans projet']]);
  assert.deepEqual(duckButtons(false, 'p1'), [['bureau-duck', {id: 'p1'}, 'Front']]);
  assert.deepEqual(duckButtons(false, 'supprimé'), [['bureau-duck', {id: 'none'}, 'Sans projet']]);
  assert.deepEqual(duckButtons(true), []);
});

test('dataset gates : projets et discussions du canard lus, tolérant', () => {
  const k = {datasets: {gates: {current: JSON.stringify({gates: [], projects: [{id: 'none', name: 'Sans projet'}], ducks: [{id: 'd1'}]})}}};
  assert.deepEqual(J(`readDuckData(${JSON.stringify(k)})`), {projects: [{id: 'none', name: 'Sans projet'}], ducks: [{id: 'd1'}]});
  assert.equal(J("readDuckData({datasets: {gates: {current: '{\"gates\": []}'}}})"), null);
  assert.equal(J("readDuckData({datasets: {gates: {current: 'pas du json'}}})"), null);
});

test('les discussions « 🦆 » et « Le Bureau · … » ne sont pas des visiteurs', () => {
  assert.deepEqual(J("[{title: '🦆 Le menu'}, {title: 'Le Bureau · interroger un agent'}, {title: 'Pourquoi ça casse ?'}].map(bureauDisc)"), [true, true, false]);
});

test('vu de face en descendant, de dos en montant, de profil sur les côtés : les 4 sens dans la journée', () => {
  const seen = J(`(() => { const s = new Set(); const d0 = Date.parse('2026-10-08T00:00:00+02:00');
    for (let t = d0; t < d0 + 864e5; t += 7e3) { const p = duckAt(t); if (p && p.moving) s.add(p.dir); } return [...s].sort(); })()`);
  assert.deepEqual(seen, ['down', 'left', 'right', 'up']);
});

test('il attend ta réponse : en direct, il marche jusqu\'au bureau du boss et y reste avec un « ? » ; en rejeu, il se promène', () => {
  const r = J(`(() => {
    const now = Date.now, t0 = now(), d0 = DUCKS;
    DUCKS = [{id: 'd1', title: '🦆 Le menu casse', awaiting: true}]; DUCK_CALL = null;
    try {
      const to = duckBossTile();
      const start = duckAt(t0), end = duckAt(t0 + 120e3); // 2 min plus tard : arrivé (marche lente)
      const replay = duckAt(t0 - 864e5); // la veille : pas d'appel, la promenade
      DUCKS = []; const free = duckAt(t0 + 121e3); // réponse donnée : promenade reprise
      return {startCall: !!start.call, end: [end.tile[0], end.tile[1]], to: [to[0], to[1]], endCall: end.call, endMoving: end.moving,
              replayCall: !!replay.call, freeCall: !!free.call};
    } finally { DUCKS = d0; DUCK_CALL = null; }
  })()`);
  assert.deepEqual(r.end, r.to);
  assert.deepEqual([r.startCall, r.endCall, r.endMoving, r.replayCall, r.freeCall], [true, true, false, false, false]);
});

test('À traiter : « Le canard attend ta réponse », bouton Répondre vers la discussion dans un nouvel onglet', () => {
  const it = J(`(() => { const d0 = DUCKS; DUCKS = [{id: 'd1', title: '🦆 Le menu casse', awaiting: true}, {id: 'd2', title: '🦆 Rien', awaiting: false}];
    try { return todoItems(Date.now()).filter(x => x.key.startsWith('duck:')); } finally { DUCKS = d0; } })()`);
  assert.equal(it.length, 1);
  assert.match(it[0].txt, /Le canard<\/b> attend ta réponse <small>Le menu casse/);
  assert.match(it[0].act.href, /index\.html#discussion-d1$/);
});
