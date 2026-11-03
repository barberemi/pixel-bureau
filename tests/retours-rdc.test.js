// Le 3e étage vu du RDC (69-retours-rdc.js) : une tuile en haut de page et ses PR au travail dans « Qui fait quoi » (page
// et mode TV) ; tout mène à l'étage.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

function page() {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; T = DAY0 + 11 * 36e5; setMode('live'); RETOURS = retoursDemo(); rtReset();`);
  return {p, J};
}

test('la tuile : PR en correction sur six bureaux, celles qui t\'attendent, les pannes, les poussées du jour, la file', () => {
  const {J} = page();
  assert.deepEqual(J('rtKpi(T)'), {rooms: 5, wait: 2, out: 2, queue: 2, pannes: 1});
  const h = J('rtKpiHtml(rtKpi(T))');
  assert.match(h, /data-open="retours"/);
  assert.match(h, /<h3>Le 3e étage<\/h3>/);
  assert.match(h, /5<small>\/6<\/small>/);
  assert.match(h, /✋ 2 t'attendent.*🧯 1 panne.*📤 2 poussées aujourd'hui.*⏳ 2 en file/);
  assert.match(h, /class="dash retours click err"/, 'une panne : la bordure rouge');
  assert.equal(J('rtKpi(DAY0 + 9 * 36e5).out'), 1, 'en rejeu : les poussées jusqu\'au curseur');
});

test('la tuile en haut de page, après celle du 1er', () => {
  const {p, J} = page();
  p.run('KPI_SIG = ""; renderKpis();');
  const h = J('KPI_SIG');
  assert.ok(h.indexOf('Le 1er étage') > 0 && h.indexOf('Le 1er étage') < h.indexOf('Le 3e étage'));
  assert.equal((h.match(/<section class="dash /g) || []).length, 5);
});

test('Qui fait quoi : une carte par bureau du 3e, ta validation en premier plan ; un clic monte à l\'étage', () => {
  const {p, J} = page();
  const rows = J('rtWhoRows(T)');
  assert.equal(rows.length, 5);
  const g = rows.find(x => x.run === 'demo-f2');
  assert.deepEqual([g.attn, g.st, g.ico, g.name, g.sub], [true, 'gate', '✋', "T'attend", 'ses corrections à valider']);
  const e = rows.find(x => x.run === 'demo-f3');
  assert.deepEqual([e.st, e.ico, e.name], ['error', '🧯', '🧪 Contrôles en panne'.slice(3)]);
  const f = rows.find(x => x.run === 'demo-f1');
  assert.match(f.sub, /^3 fils à traiter · 2 corrigés/);
  assert.match(f.what, /^site#2042 Le lecteur vidéo/);
  assert.match(J('rtWhoHtml(T)'), /🛠 3e étage <span class="cnt">5<\/span>.*data-rt-run="demo-f2"/s);
  assert.match(J('rtTvWhoHtml(T)'), /<h2>3e étage<\/h2>/);
  const desk = g.i;
  p.run("rtGoto('demo-f2');");
  assert.deepEqual(J('[FLOOR, RTSEL]'), [3, 'demo-f2']);
  assert.equal(J("rtSlots().findIndex(r => r && r.run === 'demo-f2')"), desk, 'le même bureau, vu du RDC et à l\'étage');
});

test('un 3e vide : pas de carte dans « Qui fait quoi »', () => {
  const {p, J} = page();
  p.run('RETOURS = {rooms: [], events: [], queue: [], pannes: []}; rtReset();');
  assert.deepEqual(J('rtWhoRows(T)'), []);
  assert.equal(J('rtWhoHtml(T)'), '');
});
