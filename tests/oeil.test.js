// L'Œil du RDC (69-oeil.js) : lecture du dataset oeil ; ronde des cibles (la plus urgente d'abord, puis la plus ancienne),
// sans brouillons, PR qui dorment ni relectures pas prêtes, rangées à part ; rien loin du relevé ; clic sur une carte qui y
// pose l'œil ; fiche par sections avec « 🛠 Corriger » lié par « owner/dépôt#n ».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const {run} = load();
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = m => new Date(Date.now() - m * 60e3).toISOString();
const pr = (repo, n, o) => ({id: repo + '#' + n, repo, n, title: 'PR ' + n, url: 'https://x/' + n, draft: false, review: 'review', threads: 0, ci: null, conflict: false,
  updated: at(5), last: null, ...o});
const OE = {generated_at: at(2), me: 'michaelscott', warnings: [],
  mine: [pr('acme/site', 2051, {review: 'changes', threads: 1, updated: at(30), last: {who: 'jimh', at: at(30), text: 'Le cache', k: 'changes'}}),
    pr('acme/api', 31, {ci: 'ko', conflict: true, updated: at(300)}),
    pr('acme/api', 40, {}), // rien à faire
    pr('acme/api', 41, {draft: true, threads: 3}), // brouillon
    pr('acme/api', 42, {threads: 2, updated: at(45 * 1440)})], // dort depuis 45 jours
  asked: [{...pr('other/web', 16, {}), author: 'pambeesly', since: at(26 * 60)},
    {...pr('other/web', 17, {conflict: true}), author: 'dwight', since: at(60)}, // pas prête
    {...pr('other/web', 18, {draft: true}), author: 'dwight', since: at(60)}]};
const setup = `OEIL = ${JSON.stringify(OE)}; GATES = [{run: 'r1', wf: 'w', wf_name: 'Corriger', gate: 'gate', message: '', since: '${at(10)}'}];
  STATUTS = null; MAILS = null; OE_FOCUS = null; OE_CUR = null; mode = 'live'; T = Date.now();`;

test('lecture : le dataset oeil en texte comme en objet ; refusé sans ses deux listes', () => {
  const src = v => ({datasets: {oeil: {current: v}}});
  assert.equal(J(`readOeil(${JSON.stringify(src(JSON.stringify(OE)))}).mine.length`), 5);
  assert.equal(J(`readOeil(${JSON.stringify(src(OE))}).asked[0].author`), 'pambeesly');
  assert.equal(J(`readOeil(${JSON.stringify(src({mine: []}))})`), null);
  assert.equal(J(`readOeil(${JSON.stringify(src('pas du json'))})`), null);
});

test('ronde : validation, relecture prête, tes retours, ta PR en panne ; ni brouillon, ni PR qui dort, ni relecture pas prête', () => {
  run(setup);
  assert.deepEqual(J(`oeRound(T).map(t => t.kind + ':' + (t.p ? t.p.id : t.g.run))`),
    ['gate:r1', 'asked:other/web#16', 'fix:acme/site#2051', 'broken:acme/api#31']);
  assert.match(J(`oeRound(T)[2].txt`), /site#2051 : changements demandés, 1 fil · jimh/);
  assert.match(J(`oeRound(T)[3].txt`), /api#31 : en conflit, CI rouge/);
  assert.deepEqual(J(`(a => ({nr: a.notReady.map(p => p.id), idle: a.idle.map(p => p.id), calm: a.calm}))(oeAside())`),
    {nr: ['other/web#17'], idle: ['acme/api#41', 'acme/api#42', 'other/web#18'], calm: 1});
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

test('clic sur une carte : l\'œil s\'y pose (OE_FOCUS_MS), puis reprend sa ronde', () => {
  run(setup + `OEIR = {x: 1160, y: 412};`);
  run(`oeFocus('c:acme/api#31'); oeilOverlay(performance.now())`);
  assert.equal(J(`OE_CUR`), 'c:acme/api#31');
  run(`oeilOverlay(performance.now() + OE_FOCUS_MS + 1)`);
  assert.notEqual(J(`OE_FOCUS && performance.now() + OE_FOCUS_MS + 1 < OE_FOCUS.until`), true);
  run(`OEIR = null`);
});

test('fiche : sections dans l\'ordre, une carte par cible, « 🛠 Corriger », « ⟳ Remettre à jour » et « 🔎 Faire relire » liés, pas prêtes sans bouton', () => {
  run(setup + `const el = t => ({tag: t, attrs: {}, kids: [], style: {}, dataset: {}, html: '', classList: {toggle() {}},
      set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; }, insertAdjacentHTML(p, h) { this.kids.push({html: h}); },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, appendChild(x) { this.kids.push(x); }, append(...x) { this.kids.push(...x); },
      getContext() { return {drawImage() {}}; }});
    document.createElement = el; MutationObserver = function () { this.observe = () => {}; }; kronnModal = () => {};
    ACTIONS.fix_pr = true; ACTIONS.rebase = true; ACTIONS.review = true; OE_CUR = 'f:acme/site#2051';`);
  const f = J(`(() => { const side = {kids: [], appendChild(x) { this.kids.push(x); }}; renderOeil(side); const box = side.kids[0];
    const flat = n => [n, ...(n.kids || []).flatMap(flat)];
    return {head: box.html, seq: box.kids.map(k => k.attrs && k.attrs['data-oek'] ? 'carte ' + k.attrs['data-oek'] + (k.className.includes('oe-grey') ? ' (grise)' : '') + (k.className.includes('oe-now') ? ' (regardée)' : '')
        : (k.html || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim()),
      links: flat(box).filter(n => n.tag === 'a').map(n => n.textContent),
      acts: flat(box).filter(n => n.attrs && n.attrs['data-kronn-action']).map(n => n.attrs['data-kronn-action'] + ' ' + n.attrs['data-kronn-bindings'])}; })()`);
  assert.match(f.head, /4 choses t(&#39;|')attendent/);
  assert.deepEqual(f.seq.slice(0, 9), ['✋ À décider 1', 'carte g:r1', '🛠 À corriger 2', 'carte f:acme/site#2051 (regardée)', 'carte c:acme/api#31',
    '👀 À relire 1', 'carte a:other/web#16', '⏸ Pas prêtes 1', 'carte n:other/web#17 (grise)']);
  assert.match(f.seq[9], /^📝 Brouillons et PR qui dorment 3 api#41 brouillon .* api#42 sans activité depuis 45 j .* web#18 brouillon/);
  assert.equal(f.seq[10], '1 autre PR ouverte sans retour à traiter.');
  assert.ok(f.acts.some(a => a.startsWith('bureau-fixpr') && a.includes('acme/site#2051')), f.acts.join(' | '));
  assert.ok(f.acts.some(a => a.startsWith('bureau-rebase') && a.includes('acme/api#31')), f.acts.join(' | '));
  assert.ok(f.acts.some(a => a.startsWith('bureau-review') && a.includes('other/web#16')), f.acts.join(' | '));  // à relire : la revue à la demande
  assert.ok(!f.acts.some(a => a.includes('other/web#17')), 'une relecture pas prête n\'a pas de bouton');
  assert.ok(f.links.length && f.links.every(t => t === '↗ GitHub'), f.links.join(' | '));  // un seul libellé de lien, « À relire » compris
});

test('fiche : « ↻ Revoir » relance le cron office (bureau-relaunch), seulement quand la relance est installée et hors mode TV', () => {
  const acts = J(`(() => { const out = []; const side = {kids: [], appendChild(x) { this.kids.push(x); }};
    const flat = n => [n, ...(n.kids || []).flatMap(flat)];
    const once = () => { side.kids = []; renderOeil(side); return flat(side.kids[0]).filter(n => n.attrs && n.attrs['data-kronn-action'] === 'bureau-relaunch')
      .map(n => n.textContent + ' ' + n.attrs['data-kronn-bindings']); };
    ACTIONS.relaunch = false; RELAUNCH = [{wf: 'wf-office', bureau: 'office'}]; out.push(once());
    ACTIONS.relaunch = true; out.push(once());
    TV = true; out.push(once()); TV = false;
    RELAUNCH = []; out.push(once());
    return out; })()`);
  assert.deepEqual(acts, [[], ['↻ Revoir {"wf_id":"wf-office","params":"wf-office"}'], [], []]);
});
