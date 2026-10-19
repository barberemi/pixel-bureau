// Vaisseau-mère (team.events, kind sprint_in) : un ticket entre dans le sprint après son démarrage ; le vaisseau descend
// au-dessus du poste de l'assigné et la facilitatrice y est déposée. Démo : DM-7931 (13 pts) pour Andy à 14h20.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const at = hm => Date.parse(`2026-10-01T${hm}:00+02:00`);
const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
run('TEAM=mergedTeam();');

test('la démo : une visite pour DM-7931, 13 pts, au poste d\'Andy', () => {
  assert.deepEqual(J('ufoLandings().map(u=>[u.at,u.keys,u.pts,u.dev&&u.dev.key])'), [[at('14:20'), ['DM-7931'], 13, 'p_andy']]);
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

test('pendant la visite, la facilitatrice est dans le vaisseau ; les autres restent visibles', () => {
  run(`FX.cur.set('x',{id:'x',kind:'ufo',t0:0,...ufoLandings()[0]});
    byKey.p_kelly.pos={x:100,y:100};byKey.p_kelly._st={st:'work'};byKey.p_kelly.present=true;`);
  try {
    assert.equal(run('ufoHides(byKey.p_kelly)'), true);
    assert.equal(run('ufoHides(byKey.p_andy)'), false);
    run(`byKey.p_kelly._st={st:'absent'}`); // absente ce jour-là : le vaisseau vient sans elle
    assert.equal(run('ufoSm()'), null);
    assert.equal(run('fxDuckBusy()'), false); // le canard n'est pas en scène
  } finally { run(`FX.cur.clear();`); }
});

test('le fil dit qu\'un ticket arrive en cours de sprint, pour qui', () => {
  const txt = run(`teamEventTxt({kind:'sprint_in',key:'DM-7931',points:13,who:'dm:0002'}).txt`);
  assert.match(txt, /🛸 .*DM-7931.* arrive en cours de sprint \(13 pts\) pour .*Andy/);
});

test('avec « réduire les animations » : pas de vaisseau', () => {
  const p = load({globals: {matchMedia: q => ({matches: q === '(prefers-reduced-motion: reduce)'})}});
  p.run('TEAM=mergedTeam();');
  assert.ok(!JSON.parse(p.run(`JSON.stringify(fxEvents(${at('14:21')}).map(e=>e.kind))`)).includes('ufo'));
});
