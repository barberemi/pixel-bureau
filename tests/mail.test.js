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
  run(`MAILS = {sorted: true, accounts: []}; T = Date.parse('2026-10-01T12:00:00+02:00');`);
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

// ---------- le facteur ----------
const at = hm => `2026-10-01T${hm}:00+02:00`;
const withMails = times => run(`MAILS = {generated_at: '${at('19:00')}', sorted: true, accounts: [{id: 'pro', label: 'Pro', ok: true, unread: ${times.length},
  useful_n: ${times.length}, useful: ${JSON.stringify(times.map((t, i) => ({id: 'm' + i, name: 'X', subject: 's', at: t ? at(t) : null, direct: true})))}, ignored: []}]};`);
const P = hm => J(`(s => ({st: s.st, bubble: s.bubble || null, label: s.label}))(postmanState(byKey.g_facteur, Date.parse('${at(hm)}')))`);

test('facteur : un passage par arrivée, au plus un toutes les 30 min, la nuit reportée à l\'ouverture', () => {
  withMails(['06:10', '06:50', '10:00', '10:10', '10:20', '10:45', '21:00']);
  const v = J(`postVisits().map(v => [new Date(v.s).toISOString(), v.n])`);
  assert.deepEqual(v, [['2026-10-01T06:00:00.000Z', 2], ['2026-10-01T08:00:00.000Z', 1], ['2026-10-01T08:30:00.000Z', 2],
                       ['2026-10-01T09:00:00.000Z', 1]]); // 8h ; 10h ; 10h30 (10h10 et 10h20) ; 11h (10h45) ; 21h : le soir, rien
});

test('facteur : pas passé, en train de déposer « 📬 n » à côté des boîtes, puis reparti ; rien sans courrier', () => {
  withMails(['10:00', '10:10']);
  assert.equal(P('09:30').st, 'off');
  assert.deepEqual(P('10:01'), {st: 'idle', bubble: '📬 1', label: 'Dépose 1 lettre dans les boîtes aux lettres'});
  assert.equal(P('10:05').st, 'gone');
  assert.match(P('10:20').label, /Passé à 10:00/);
  assert.equal(P('10:31').bubble, '📬 1'); // celui de 10h10, au passage de 10h30
  assert.deepEqual(J(`postSpot()`), [29, 10, 'left']); // à droite de la boîte (un compte)
  run(`MAILS = null;`);
  assert.equal(P('10:01').st, 'off');
});

test('rejeu : la boîte ne compte que les mails déjà arrivés à l\'instant affiché', () => {
  withMails(['09:00', '11:00', null]);
  run(`T = Date.parse('${at('10:00')}');`);
  assert.equal(J(`mailCount(MAILS.accounts[0])`), 2); // 9h et celui sans heure
  run(`T = Date.parse('${at('12:00')}');`);
  assert.equal(J(`mailBadge(MAILS.accounts[0])`), '3');
});

test('règles : le facteur attend devant le bureau du boss tant que leur validation est ouverte', () => {
  withMails(['10:00']);
  run(`GATES = [{wf_name: 'Le Bureau · règles du courrier', gate: 'boss', since: '${at('10:30')}'}];`);
  assert.equal(P('10:20').st, 'gone'); // avant la demande : sa tournée
  assert.deepEqual(P('10:45'), {st: 'gate', bubble: '✋ 📮 On trie ton courrier ?', label: 'Te propose des règles pour trier ton courrier : attend ta validation'});
  assert.equal(J(`postmanState(byKey.g_facteur, Date.parse('${at('10:45')}')).run.wf_name`), 'Le Bureau · règles du courrier'); // sa carte dans sa fiche
  run(`GATES[0].wf = 'e3944095-7c8f'; byKey.g_facteur.wf = [];`);
  assert.equal(J('loneGates().length'), 0); // à lui avant même le calcul de son état : jamais comptée deux fois chez le boss
  run(`GATES = [];`);
  assert.equal(P('10:45').st, 'gone');
});

// ---------- porteurs ----------
const carried = (hm, when) => ({id: 'y1', name: 'Rédaction', subject: 'Programme du week-end', at: at(hm), direct: true, rule: 'gazette', carrier: 'g_david', bubble: '📰 Gazette', when: when || 'arrival'});
const S = (k, hm) => J(`(s => s && ({st: s.st, bubble: s.bubble || null}))(messengerState(byKey.${k}, Date.parse('${at(hm)}')))`);

test('porteur : l\'invité de la règle attend devant le bureau du boss, dès l\'arrivée et tant que le mail est là', () => {
  run(`MAILS = {generated_at: '${at('19:00')}', sorted: true, accounts: [{id: 'pro', label: 'Pro', ok: true, unread: 1, useful_n: 0, useful: [], ignored: [], carried: [${JSON.stringify(carried('11:05'))}]}]};`);
  assert.equal(S('g_david', '11:00'), null);
  assert.deepEqual(S('g_david', '11:10'), {st: 'gate', bubble: '✋ 📰 Gazette'});
  assert.equal(J(`stateAt(byKey.g_david, Date.parse('${at('11:10')}')).st`), 'gate');
  run(`MAILS.accounts[0].carried = [];`);
  assert.equal(S('g_david', '11:10'), null);
});

test('porteur : reçu le vendredi, remis le lundi au créneau de la règle', () => {
  const fri = '2026-10-02T15:00:00+02:00';
  run(`MAILS = {sorted: true, accounts: [{id: 'pro', ok: true, carried: [${JSON.stringify({...carried('11:00'), at: fri, when: {received: 'Fri', deliver: 'Mon 09:00'}})}]}]};`);
  assert.equal(J(`new Date(carryStart(MAILS.accounts[0].carried[0])).toISOString()`), '2026-10-05T07:00:00.000Z');
});

test('fiche : la carte « Remis en personne » en tête, à lire dans la messagerie (pas de bouton pour la marquer lue)', () => {
  run(`MAILS = {generated_at: '${at('11:00')}', sorted: true, accounts: [{id: 'pro', label: 'Pro', ok: true, unread: 1, useful_n: 0, useful: [], ignored: [], carried: [${JSON.stringify(carried('11:05'))}]}]};`);
  const h = fiche('pro');
  assert.match(h, /📰 Gazette · remis en personne · Pro/);
  assert.match(h, /attend ta lecture/);
  assert.doesNotMatch(h, /data-kronn-action/);
});

test('porteur : ses mails dans sa fiche et dans celle du boss (qui les compte en validations)', () => {
  run(`MAILS = {generated_at: '${at('11:00')}', sorted: true, accounts: [{id: 'pro', label: 'Pro', ok: true, unread: 1, useful_n: 0, useful: [], ignored: [], carried: [${JSON.stringify(carried('11:05'))}]}]};
    T = Date.parse('${at('11:10')}'); for (const c of chars) c._st = stateAt(c, T);`);
  const draw = k => run(`(() => { const s = {kids: [], appendChild(x) { this.kids.push(x); }, querySelector() { return null; }, querySelectorAll() { return []; }};
    sel = '${k}'; drawSide(s); return s.kids.map(k => k.innerHTML || '').join('\\n'); })()`);
  for (const k of ['g_david', run('chars.find(c => c.boss).key')]) assert.match(draw(k), /📰 Gazette · remis en personne · Pro/, k);
  run(`sel = null;`);
});

test('porteur : son mail lu, il repart par la porte au lieu de disparaître sur place', () => {
  run(`MAILS = {generated_at: '${at('11:00')}', sorted: true, accounts: [{id: 'pro', label: 'Pro', ok: true, unread: 1, useful_n: 0, useful: [], ignored: [], carried: [${JSON.stringify(carried('11:05'))}]}]};
    mode = 'pause'; T = Date.parse('${at('11:10')}'); needTeleport = true; tick(0); needTeleport = false;`);
  assert.deepEqual(J(`[byKey.g_david._st.st, byKey.g_david.present]`), ['gate', true]);
  run(`MAILS.accounts[0].carried = []; byKey.g_david.on = undefined; guestVisit = () => null; tick(1000);`); // ni mail ni visite : « off »
  assert.deepEqual(J(`[byKey.g_david._st.st, byKey.g_david.present, byKey.g_david.target && byKey.g_david.target.key]`), ['off', true, 'exit']);
  assert.equal(J(`!!walksOut({}, {st: 'off'})`), false, 'un collègue « off » ne marche pas vers la sortie');
});
