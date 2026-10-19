// Soucoupe-mère (team.events, kind sprint_in, #89) : un ticket entre dans le sprint après son démarrage ; la soucoupe va
// chercher la facilitatrice et la dépose devant le mur Kanban avec le ticket. Démo : DM-7931 (13 pts) pour Andy à 14h20.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const at = hm => Date.parse(`2026-10-01T${hm}:00+02:00`);
const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
run('TEAM=mergedTeam();');

test('la démo : une visite pour DM-7931, 13 pts', () => {
  assert.deepEqual(J('ufoLandings().map(u=>[u.at,u.keys,u.pts])'), [[at('14:20'), ['DM-7931'], 13]]);
});

test('jouée dans les 10 min qui suivent, pas avant ni après', () => {
  const kinds = t => J(`fxEvents(${t}).map(e=>e.kind)`);
  assert.ok(!kinds(at('14:19')).includes('ufo'));
  assert.ok(kinds(at('14:21')).includes('ufo'));
  assert.ok(!kinds(at('14:31')).includes('ufo'));
});

test('des tickets ajoutés coup sur coup : une seule visite, les points s\'additionnent', () => {
  const saved = run('JSON.stringify(TEAM.events)');
  try {
    run(`TEAM.events=[...TEAM.events,
      {t:'2026-10-01T14:23:00.000+0200',kind:'sprint_in',key:'DM-7932',points:5,who:null},
      {t:'2026-10-01T14:23:30.000+0200',kind:'sprint_in',key:'DM-7932',points:5,who:null},
      {t:'2026-10-01T16:00:00.000+0200',kind:'sprint_in',key:'DM-7940',points:null,who:null}];UFO_M={};`);
    assert.deepEqual(J('ufoLandings().map(u=>[u.keys,u.pts])'), [[['DM-7931', 'DM-7932'], 18], [['DM-7940'], 0]]);
  } finally { run(`TEAM.events=${saved};UFO_M={};`); }
});

// une visite en cours, la facilitatrice dans l'état donné (à son poste par défaut)
function visit(st, fn) {
  run(`byKey.p_kelly.pos={x:100,y:500};byKey.p_kelly.moving=false;byKey.p_kelly._st=${JSON.stringify(st)};byKey.p_kelly.present=true;
    FX.cur.set('x',{id:'x',kind:'ufo',t0:0,...ufoLandings()[0]});`);
  try { return fn(); } finally { run(`FX.cur.clear();`); }
}

test('à son poste : la soucoupe va la chercher (13 s), elle est cachée de son poste pendant la visite', () => visit({st: 'work', zone: 'desk'}, () => {
  assert.deepEqual(J(`(p=>[p.sm.key,p.pick,p.ms,p.from])(ufoPlan(fxOf('ufo')))`), ['p_kelly', true, 13e3, {x: 100, y: 500}]);
  assert.equal(run('ufoHides(byKey.p_kelly)'), true);
  assert.equal(run('ufoHides(byKey.p_andy)'), false);
  assert.equal(run('fxDuckBusy()'), false); // le canard n'est pas en scène
}));

test('déjà au mur Kanban : pas de prise en charge, la visite dure 10 s', () => visit({st: 'work', zone: 'kanban'}, () => {
  assert.deepEqual(J(`(p=>[p.pick,p.ms,p.A])(ufoPlan(fxOf('ufo')))`), [false, 1e4, .12]);
}));

test('absente ce jour-là : le ticket descend seul', () => visit({st: 'absent'}, () => {
  assert.deepEqual(J(`(p=>[p.sm,p.pick])(ufoPlan(fxOf('ufo')))`), [null, false]);
}));

test('déposée devant le mur, elle y reste après la visite (elle rentre ensuite à pied)', () => visit({st: 'work', zone: 'desk'}, () => {
  const d = J('ufoSpot()');
  run(`ufoDraw(${.4 + .6 * .3}*13e3)`); // posée, en train de ranger le ticket
  assert.deepEqual(J('[byKey.p_kelly.pos,byKey.p_kelly.tile,byKey.p_kelly.path]'), [{x: d.x, y: d.y}, [d.x0, d.y0], []]);
}));

test('la loupe s\'ouvre au dépôt, sur la soucoupe et le mur, au nom du ticket', () => visit({st: 'work', zone: 'desk'}, () => {
  assert.deepEqual(J('ufoLoupeEvents(.3*13e3)'), []); // encore à la prise en charge
  const ev = J('ufoLoupeEvents(.45*13e3)')[0];
  assert.equal(ev.kind, 'ufo');
  assert.equal(ev.cs[0].name, 'DM-7931 entre dans le sprint · 13 pts'.replace('DM-', ''));
  assert.equal(J(`loupeCaption(ufoLoupeEvents(.45*13e3)[0]).title`), '7931 entre dans le sprint · 13 pts');
}));

test('le fil dit qu\'un ticket arrive en cours de sprint, pour qui', () => {
  const txt = run(`teamEventTxt({kind:'sprint_in',key:'DM-7931',points:13,who:'dm:0002'}).txt`);
  assert.match(txt, /🛸 .*DM-7931.* arrive en cours de sprint \(13 pts\) pour .*Andy/);
});

test('avec « réduire les animations » : pas de vaisseau', () => {
  const p = load({globals: {matchMedia: q => ({matches: q === '(prefers-reduced-motion: reduce)'})}});
  p.run('TEAM=mergedTeam();');
  assert.ok(!JSON.parse(p.run(`JSON.stringify(fxEvents(${at('14:21')}).map(e=>e.kind))`)).includes('ufo'));
});
