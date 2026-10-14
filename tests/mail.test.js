// Courrier (48-mail.js, #30) : dataset mails, une boîte par compte dehors à droite du bureau du boss, badge (nombre,
// « ? » sans règles, « ! » en échec), fiche Courrier par compte ; « nombre seul » ne montre ni nom ni objet.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const acc = (id, extra = {}) => ({id, label: id, color: '#123456', show: 'list', provider: 'mac-mail', ok: true, unread: 9, useful_n: 2,
  useful: [{id: 'm1', name: 'Jan Levinson', addr: 'jan@x.example', subject: 'Budget <b>', at: '2026-10-01T08:42:00Z', direct: true, open: 'message://%3Cm1%3E'},
           {id: 'm2', name: 'Robot', addr: 'r@x.example', subject: 'Lien', at: '2026-10-01T07:00:00Z', direct: false, open: 'javascript:alert(1)'}],
  ignored: [['Jira', 4]], ignored_n: 4, unknown: 1, ...extra});
const side = () => `(() => { const s = {kids: [], appendChild(x) { this.kids.push(x); }}; return s; })()`;
const fiche = (first) => run(`(() => { const s = ${side()}; renderMail(s, '${first}'); return s.kids.map(k => k.innerHTML || k.textContent || '').join('\\n'); })()`);

test('lecture du dataset : objet ou chaîne JSON, current des datasets Kronn ; autre chose -> null', () => {
  const d = {generated_at: 'x', sorted: true, accounts: []};
  assert.deepEqual(J(`readMails({datasets: {mails: {current: ${JSON.stringify(JSON.stringify(d))}}}})`), d);
  assert.deepEqual(J(`readMails({datasets: {mails: ${JSON.stringify(d)}}})`), d);
  assert.equal(J('readMails({datasets: {mails: {current: "pas du json"}}})'), null);
  assert.equal(J('readMails({datasets: {}})'), null);
});

test('boîte : nombre de mails utiles, « ? » tant qu\'aucune règle, « ! » si le compte est en échec', () => {
  run(`MAILS = {sorted: true, accounts: []};`);
  assert.equal(J(`mailBadge(${JSON.stringify(acc('pro'))})`), '2');
  run(`MAILS.sorted = false;`);
  assert.equal(J(`mailBadge(${JSON.stringify(acc('pro'))})`), '?');
  assert.equal(J(`mailBadge(${JSON.stringify(acc('pro', {ok: false}))})`), '!');
});

test('place : dehors, juste à droite du bureau vitré du boss (plan type), sinon la case « mailbox » du plan', () => {
  assert.deepEqual(J('mailboxTile()'), [28, 10]);
  run(`MAILS = {sorted: true, accounts: [{id: 'a'}, {id: 'b'}]};`);
  assert.deepEqual(J('mailboxTile()'), [28, 10]); // deux boîtes : la place pour les deux
  run(`LAYOUT.mailbox = [30, 12];`);
  assert.deepEqual(J('mailboxTile()'), [30, 12]);
  run(`delete LAYOUT.mailbox;`);
});

test('fiche : le compte cliqué d\'abord, objets échappés, liens Mail et https seulement', () => {
  run(`T = Date.parse('2026-10-01T11:00:00+02:00'); MAILS = {generated_at: '2026-10-01T08:40:00Z', sorted: true, accounts: [${JSON.stringify(acc('pro'))}, ${JSON.stringify(acc('perso', {provider: 'imap'}))}]};`);
  const h = fiche('perso');
  assert.ok(h.indexOf('perso') < h.indexOf('pro ·') || h.indexOf('🏠 perso') < h.indexOf('💼 pro'));
  assert.match(h, /4 mails utiles/);
  assert.match(h, /Budget &lt;b&gt;/);
  assert.match(h, /href="message:\/\/%3Cm1%3E"/);
  assert.doesNotMatch(h, /javascript:/);
  assert.match(h, /Ignorés : Jira 4/);
  assert.match(h, /à toi/);
  assert.match(h, /en copie/);
});

test('fiche : « nombre seul » sans nom ni objet ; compte en échec avec son erreur ; pas trié', () => {
  run(`MAILS = {generated_at: '2026-10-01T08:40:00Z', sorted: false, accounts: [${JSON.stringify(acc('pro', {show: 'count'}))}, ${JSON.stringify(acc('perso', {ok: false, error: 'mot de passe introuvable'}))}]};`);
  const h = fiche('pro');
  assert.doesNotMatch(h, /Jan Levinson|Budget/);
  assert.match(h, /masqués/);
  assert.match(h, /Lecture en échec : mot de passe introuvable/);
  assert.match(h, /Pas encore trié/);
});

test('démo : deux comptes (appli Mail et IMAP), triés', () => {
  run(`MAILS = mailDemo();`);
  const d = J('MAILS');
  assert.equal(d.sorted, true);
  assert.deepEqual(d.accounts.map(a => [a.id, a.provider, a.useful_n]), [['pro', 'mac-mail', 3], ['perso', 'imap', 2]]);
});
