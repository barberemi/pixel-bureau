// L'Œil du RDC (69-oeil.js) : lecture du dataset oeil, ronde des cibles (la plus urgente d'abord, puis la plus ancienne),
// « ✓ Vu » qui sort une cible de la ronde jusqu'à du nouveau, rien loin du relevé, fiche avec « 🛠 Corriger » lié par
// « owner/dépôt#n ».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const {run} = load();
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = m => new Date(Date.now() - m * 60e3).toISOString();
const OE = {generated_at: at(2), me: 'michaelscott', warnings: [],
  mine: [{id: 'acme/site#2051', repo: 'acme/site', n: 2051, title: 'Fil d\'Ariane', url: 'https://x/2051', review: 'changes', threads: 1, ci: 'ok', conflict: false,
    updated: at(30), last: {who: 'jimh', at: at(30), text: 'Le cache', k: 'fil'}},
    {id: 'acme/api#31', repo: 'acme/api', n: 31, title: 'Tags', url: 'https://x/31', review: 'review', threads: 0, ci: 'ko', conflict: true, updated: at(300), last: null},
    {id: 'acme/api#40', repo: 'acme/api', n: 40, title: 'Calme', url: 'https://x/40', review: 'review', threads: 0, ci: 'ok', conflict: false, updated: at(5), last: null}],
  asked: [{id: 'other/web#16', repo: 'other/web', n: 16, title: 'Menu', url: 'https://x/16', author: 'pambeesly', since: at(26 * 60)}]};
const setup = `OEIL = ${JSON.stringify(OE)}; GATES = [{run: 'r1', wf: 'w', wf_name: 'Corriger', gate: 'gate', message: '', since: '${at(10)}'}];
  STATUTS = null; MAILS = null; OE_SEEN = {}; mode = 'live'; T = Date.now();`;

test('lecture : le dataset oeil en texte comme en objet ; refusé sans ses deux listes', () => {
  const src = v => ({datasets: {oeil: {current: v}}});
  assert.equal(J(`readOeil(${JSON.stringify(src(JSON.stringify(OE)))}).mine.length`), 3);
  assert.equal(J(`readOeil(${JSON.stringify(src(OE))}).asked[0].author`), 'pambeesly');
  assert.equal(J(`readOeil(${JSON.stringify(src({mine: []}))})`), null);
  assert.equal(J(`readOeil(${JSON.stringify(src('pas du json'))})`), null);
});

test('ronde : la validation, puis la relecture demandée, tes retours, ta PR en panne ; une PR sans retour n\'y est pas', () => {
  run(setup);
  assert.deepEqual(J(`oeRound(T).map(t => t.kind + ':' + (t.p ? t.p.id : t.g.run))`),
    ['gate:r1', 'asked:other/web#16', 'fix:acme/site#2051', 'broken:acme/api#31']);
  assert.match(J(`oeRound(T)[2].txt`), /site#2051 : changements demandés · jimh/);
  assert.match(J(`oeRound(T)[3].txt`), /api#31 : en conflit, CI rouge/);
});

test('« ✓ Vu » : la cible sort de la ronde, puis y revient quand un relecteur écrit de nouveau', () => {
  run(setup);
  run(`oeSee(oeRound(T).find(t => t.kind === 'fix'))`);
  assert.ok(!J(`oeRound(T).some(t => t.kind === 'fix')`));
  run(`OEIL.mine[0].last.at = '${at(1)}'`); // nouveau commentaire : autre signature
  assert.ok(J(`oeRound(T).some(t => t.kind === 'fix')`));
});

test('rejeu : loin de l\'heure de son relevé, l\'Œil ne regarde pas ; près de lui, si', () => {
  run(setup + `mode = 'play'; T = Date.now() - 2 * 36e5;`);
  assert.deepEqual(J(`oeRound(T)`), []);
  assert.match(J(`oeilTip()`), /loin de son relevé/);
  run(`T = Date.now()`);
  assert.equal(J(`oeRound(T).length`), 4);
  run(`mode = 'live'`);
  assert.match(J(`oeilTip()`), /4 choses t'attendent/);
});

test('fiche : une ligne par cible, « 🛠 Corriger » lié à « owner/dépôt#n », « ⟳ Remettre à jour » sur le conflit, la PR calme comptée', () => {
  run(setup + `const el = t => ({tag: t, attrs: {}, kids: [], style: {}, dataset: {}, html: '',
      set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; }, insertAdjacentHTML(p, h) { this.html += h; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, appendChild(x) { this.kids.push(x); }, append(...x) { this.kids.push(...x); },
      getContext() { return {drawImage() {}}; }});
    document.createElement = el; MutationObserver = function () { this.observe = () => {}; }; kronnModal = () => {};
    ACTIONS.fix_pr = true; ACTIONS.rebase = true;`);
  const f = J(`(() => { const side = {kids: [], appendChild(x) { this.kids.push(x); }}; renderOeil(side); const box = side.kids[0];
    const flat = n => [n, ...(n.kids || []).flatMap(flat)];
    return {head: box.html, rows: box.kids.map(r => r.html), acts: flat(box).filter(n => n.attrs && n.attrs['data-kronn-action'])
      .map(n => n.attrs['data-kronn-action'] + ' ' + n.attrs['data-kronn-bindings'])}; })()`);
  assert.equal(f.rows.length, 4);
  assert.match(f.head, /4 choses t(&#39;|')attendent/);
  assert.match(f.rows[2], /« Le cache »/);
  assert.ok(f.acts.some(a => a.startsWith('bureau-fixpr') && a.includes('acme/site#2051')), f.acts.join(' | '));
  assert.ok(f.acts.some(a => a.startsWith('bureau-rebase') && a.includes('acme/api#31')), f.acts.join(' | '));
  assert.match(f.head + f.rows.join(''), /Fil d/);
  assert.match(f.head, /1 autre PR ouverte sans retour/);
});
