// Les scènes de la galerie aux étages (46-gallery.js et les 68-*.js) : lancées depuis la pause, elles ont leur loupe ; le
// boss part de son fauteuil pour la barrière ; la rédaction du 2e montre le changement au lieu de poser l'état final ; la
// revue du 2e a ses loupes ; le soir, des bureaux libres pour voir ceux qui restent éclairés.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

// depuis la pause à 11 h, à l'étage f, comme quand on a fait glisser le curseur ; la loupe n'attend pas la fin du setFloor
function page(f, prep = '') {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; CFG.atelier = true; ATELIER = atelierDemo(); SUPPORT = supportDemo(); REDACTION = redactionDemo(); ${prep}
    T = DAY0 + 11 * 36e5; setFloor(${f}); setMode('pause'); LOUPE.settle = 0; LOUPE.seen = null;`);
  const render = {1: 'renderAtelier', 2: 'renderRedaction', 3: 'renderRetours', '-1': 'renderCaserne'}[f];
  return {p, J, draw: n => p.run(`${render}(${n});`), play: n => p.run(`demoStart(galleryScenes().find(x => x.n === ${JSON.stringify(n)}));`),
    fresh: () => J('loupeScan().map(e => e.kind)')};
}

test('depuis la pause, la scène de chaque étage a sa loupe (elle ne passe plus pour déjà vue)', () => {
  for (const [f, n, kind] of [[1, 'Un ticket arrive', 'at_arrive'], [3, 'Une PR monte au 3e', 'rt_arrive'], [-1, 'Intervention en panne', 'cs_err'], [2, 'Le tampon', 'rd_gate']]) {
    const {draw, play, fresh} = page(f);
    draw(500); draw(600);
    play(n); draw(700);
    assert.ok(fresh().includes(kind), `${f} : ${n}`);
  }
});

test('1er, « Le boss va à la porte » : les autres gates levées, il se lève de son fauteuil et marche jusqu\'à la porte', () => {
  const {p, J, draw, play, fresh} = page(1);
  draw(500); draw(600);
  play('Le boss va à la porte'); draw(700);
  assert.equal(J('atRooms().filter(r => r.gate).length'), 1, 'une seule gate : celle de la scène');
  assert.equal(J('AT_MEM.boss.target'), J('atSlots().findIndex(r => r && r.gate)'));
  assert.ok(J('AT_MEM.boss.walk.path.length') > 0, 'il marche');
  assert.ok(J('Math.hypot(AT_MEM.boss.walk.pos.x - AT_CHAIR.x, AT_MEM.boss.walk.pos.y - AT_CHAIR.y)') < 40, 'depuis son fauteuil');
  assert.ok(fresh().includes('at_gate'));
  p.run('demoEnd();');
});

test('3e, « À toi de valider » : le boss part de son bureau du couloir, il ne saute plus à la barrière', () => {
  const {J, draw, play} = page(3);
  draw(500); draw(600);
  play('À toi de valider'); draw(700);
  assert.ok(J('RT_MEM.boss.target') != null);
  assert.ok(J('RT_MEM.boss.walk.path.length') > 0, 'il marche');
  // la mémoire du boss survit au reset des autres scènes : pas de saut
  const {J: J2, draw: d2, play: p2, p} = page(3);
  d2(500); d2(600); p.run('var __b = RT_MEM.boss;');
  p2('Contrôles rouges'); d2(700);
  assert.equal(p.run('RT_MEM.boss === __b'), true);
  assert.equal(J2("rtLoupeEvents().find(e => e.kind === 'rt_err').cs[0].name"), 'Les contrôles');
});

test('-1, « À toi de valider » : l\'autre vanne refermée, le capitaine quitte son bureau', () => {
  const {J, draw, play} = page(-1);
  draw(500); draw(600);
  play('À toi de valider'); draw(700);
  assert.equal(J("SUPPORT.threads.filter(t => t.state === 'gate').length"), 1);
  assert.ok(J('CS_MEM.boss.target') != null);
  assert.ok(J('CS_MEM.boss.walk.path.length') > 0, 'il marche');
});

test('2e, la rédaction : l\'étage d\'avant est posé, la scène montre le changement', () => {
  // le découpage part d'une intention sans tickets : les fiches apparaissent, avec leur loupe
  let {J, draw, play, fresh} = page(2);
  draw(500); draw(600);
  play('Une intention découpée');
  assert.ok(J('rdTable().tickets.length') >= 2);
  draw(700);
  assert.ok(fresh().includes('rd_cut'));
  // Jira : le boss porte le premier ticket à la boîte, au lieu de tout poser vert d'un coup
  ({J, draw, play, fresh} = page(2));
  draw(500); draw(600);
  play('Les tickets partent dans Jira'); draw(700); draw(800);
  assert.equal(J('RD_LV.job && RD_LV.job.kind'), 'jira');
  assert.ok(fresh().includes('rd_jira'));
});

test('2e, la revue : la fournée, le dossier pris et l\'avis ont leur loupe ; toutes les loupes du 2e ont leur icône', () => {
  const {p, J, draw, play, fresh} = page(2);
  draw(500); draw(600);
  play('La fournée du cron'); draw(1000);
  p.run('T += 2000;'); draw(1100);
  assert.ok(fresh().includes('rv_batch'));
  p.run('demoEnd();');
  play("L'avis est posté");
  let seen = [];
  for (let k = 0; k < 40 && !seen.includes('rv_stamp'); k++) { p.run('T += 500;'); draw(2000 + k * 100); seen = seen.concat(fresh()); }
  assert.ok(seen.includes('rv_stamp'), 'le tampon du verdict');
  assert.ok(J('rdLoupeEvents().every(e => LOUPE_KINDS[e.kind] && LOUPE_ORDER.includes(e.kind))'));
});

test('le soir au 1er et au 3e : des bureaux libres, pour voir ceux qui restent éclairés', () => {
  let {p, J, play} = page(1);
  play('Le soir au 1er');
  assert.equal(J('atRooms().length'), 2);
  p.run('demoEnd();');
  assert.equal(J('atRooms().length'), 4, 'la journée revient telle quelle');
  ({p, J, play} = page(3));
  play('Le soir au 3e');
  assert.equal(J('rtRooms().length'), 3);
  assert.equal(J('officeOpen(T)'), false);
  p.run('demoEnd();');
  assert.equal(J('rtRooms().length'), 5);
});

test("2e, « L'auteur repart » et « Une revue à la demande » : leur loupe ; la démo de la revue suit l'heure du plan", () => {
  const {p, J, draw, play, fresh} = page(2);
  assert.equal(J("(() => { T = DAY0 + 10 * 36e5; return rvActive().map(r => r.run); })()").includes('demo-r2'), false, 'pas encore lancée à 10 h');
  p.run('T = DAY0 + 11 * 36e5;'); draw(500); draw(600);
  for (const [n, kind] of [["L'auteur repart", 'rv_leave'], ['Une revue à la demande', 'rv_ask']]) {
    play(n);
    let seen = [];
    for (let k = 0; k < 60 && !seen.includes(kind); k++) { p.run('T += 500;'); draw(3000 + k * 100); seen = seen.concat(fresh()); }
    assert.ok(seen.includes(kind), n);
    p.run('demoEnd();');
  }
});
