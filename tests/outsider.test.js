// Collègues « de passage » (dans le sprint, absents du roster) : gardés d'un rafraîchissement à l'autre, place réservée
// prise par la fin des places libres (jamais celle d'un autre), au bureau seulement avec un ticket en cours, pas au daily.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = hm => Date.parse(`2026-10-08T${hm}:00+02:00`); // un jeudi
run(`TEAM.people.push({id: 'acc-alexis-0001', name: 'Alexis Nouveau', gh: [], prs: [], merged: [],
  tickets: [{key: 'DM-9001', cat: 'review', status: 'To Review', summary: 'x'}]}); attachTeam();`);

test('de passage : rôle, la place libre la plus au fond du plan, jamais celle d\'un autre personnage', () => {
  const r = J(`(() => { const c = chars.find(x => x.person === 'Alexis Nouveau');
    return {role: c.role, outsider: c.outsider, seat: c.seat, last: FREE_SEATS.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).at(-1),
            clash: chars.filter(x => x !== c && x.seat && c.seat && x.seat[0] === c.seat[0] && x.seat[1] === c.seat[1]).map(x => x.key)}; })()`);
  assert.equal(r.role, 'De passage');
  assert.equal(r.outsider, true);
  assert.deepEqual(r.seat, r.last);
  assert.deepEqual(r.clash, []);
});

test('rafraîchissement des données : le même personnage (position et place gardées), il ne ressort pas par l\'entrée', () => {
  const r = J(`(() => { const c = chars.find(x => x.person === 'Alexis Nouveau'); c.pos = {x: 111, y: 222};
    setData(DATA, true); attachTeam();
    const d = chars.find(x => x.person === 'Alexis Nouveau');
    return {same: c === d, pos: d.pos, seat: d.seat, inChars: chars.filter(x => x.person === 'Alexis Nouveau').length}; })()`);
  assert.equal(r.same, true);
  assert.deepEqual(r.pos, {x: 111, y: 222});
  assert.equal(r.inChars, 1);
});

test('à sa place tant qu\'il a un ticket ouvert (en cours : au travail) ; pas au daily ; pas le soir', () => {
  const rv = J(`outsiderState(chars.find(x => x.person === 'Alexis Nouveau'), ${at('11:00')})`); // en review : à sa place, sans se promener
  assert.deepEqual([rv.st, rv.zone], ['idle', 'desk']);
  run(`chars.find(x => x.person === 'Alexis Nouveau').team.tickets[0].cat = 'doing';`);
  const s = J(`outsiderState(chars.find(x => x.person === 'Alexis Nouveau'), ${at('09:45')})`); // pendant le daily
  assert.deepEqual([s.st, s.zone, s.bubble], ['work', 'desk', 'DM-9001']);
  assert.equal(J(`outsiderState(chars.find(x => x.person === 'Alexis Nouveau'), ${at('23:30')}).st`), 'off'); // le soir
});
