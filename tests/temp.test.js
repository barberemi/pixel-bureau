// Run d'un workflow hors casting (un workflow lancé depuis la page, un nouveau cron) : un intérimaire, et le reste
// de setData se fait quand même (collègues rattachés à leurs tickets, de passage compris).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

test('workflow inconnu : un intérimaire, et les collègues gardent leurs tickets', () => {
  const r = J(`(() => {
    TEAM.people.push({id: 'acc-zoe-0001', name: 'Zoé Nouvelle', gh: [], prs: [], merged: [], tickets: [{key: 'DM-9002', cat: 'doing', status: 'En cours', summary: 'x'}]});
    for (const c of chars) c.team = null; // première ouverture de la page : personne n'est encore rattaché
    const d = JSON.parse(JSON.stringify(DATA));
    d.runs.push({wf: 'deadbeef-0000-0000', wf_name: 'Réestimer un ticket', run: 'r-temp', status: 'Success', start: d.generated_at, end: d.generated_at, steps: []});
    setData(d, true);
    const t = chars.find(c => c.key === 'temp_deadbeef');
    return {temp: t && [t.name, t.temp], withTeam: chars.filter(c => c.person && c.team).length,
      zoe: !!chars.find(c => c.person === 'Zoé Nouvelle' && c.team)};
  })()`);
  assert.deepEqual(r.temp, ['Intérimaire 1', true]);
  assert.ok(r.withTeam > 1);
  assert.equal(r.zoe, true); // de passage : créé par attachTeam, en fin de setData
});

test('DISC_BY_RUN repart de zéro à chaque rafraîchissement', () => {
  run(`DISC_BY_RUN = {fantome: [1]}; setData(DATA, true);`);
  assert.equal(J(`'fantome' in DISC_BY_RUN`), false);
});
