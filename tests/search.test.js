// Chercher dans le bureau (64-search.js) : tickets, PR, personnes, agents et pages Kronn, chaque mot tapé dans la ligne,
// sans accents ni casse ; ↵ ouvre (volet du Kanban, fiche), ⇧↵ montre la personne sur le plan.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const find = q => J(`srFind(${JSON.stringify(q)}).map(r=>r.g+':'+r.k)`);

test('rien de tapé : rien de trouvé', () => {
  assert.deepEqual(find(''), []);
  assert.deepEqual(find('   '), []);
});

test('un ticket par son numéro, ou par les mots de son titre (sans accents ni casse)', () => {
  const t = J('TEAM.people.flatMap(p=>p.tickets)[0]');
  const n = t.key.replace(/^[A-Z]+-/, '');
  assert.ok(find(n).includes('Tickets:' + n));
  const words = t.summary.replace(/[[\]]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 2);
  const q = words.map(w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()).join(' ');
  assert.ok(find(q).includes('Tickets:' + n), q);
});

test('les tickets en cours avant les déployés', () => {
  const cats = J("srFind('a').filter(r=>r.g==='Tickets').map(r=>TORDER.indexOf(r.cat))");
  assert.deepEqual(cats, [...cats].sort((a, b) => a - b));
});

test('une PR par son numéro, avec son auteur', () => {
  const x = J('(()=>{const p=TEAM.people.find(q=>(q.prs||[]).length);return {n:p.prs[0].n,who:kbCharOf(p)};})()');
  const r = J(`srFind('#${x.n}').find(r=>r.g==='PR')`);
  assert.equal(r.k, '#' + x.n);
  assert.equal(r.who, x.who);
});

test('une personne et un agent par leur nom ou leur rôle', () => {
  const c = J('chars.find(c=>c.person)'), a = J("chars.find(c=>famOf(c)==='wf'&&c.role)");
  assert.ok(find(c.name.toUpperCase()).some(s => s.startsWith('Personnes:') && s.endsWith(c.name)));
  assert.ok(find(a.role.split(' ')[0]).some(s => s.startsWith('Agents:') && s.endsWith(a.name)));
});

test('une page Kronn de l\'écran du boss, ouverte dans Kronn', () => {
  run("BOSS_PAGES=[{id:'p1',title:'Ventes du trimestre'}];PAGELIST=null;");
  const r = J("srFind('trimestre').find(r=>r.g==='Pages Kronn')");
  assert.equal(r.txt, 'Ventes du trimestre');
  assert.match(r.href, /#page\/p1$/);
  run('BOSS_PAGES=[];');
});

test('↵ ouvre le ticket dans le Kanban, ⇧↵ montre sa personne sur le plan', () => {
  run("closeBossPages=()=>{};globalThis.SR_LOG=[];openTicket=k=>SR_LOG.push('ticket:'+k);select=k=>SR_LOG.push('fiche:'+k);");
  const t = J('(()=>{const p=TEAM.people.find(q=>q.tickets.length);return {key:p.tickets[0].key,who:kbCharOf(p)};})()');
  run(`SR_ROWS=srFind(${JSON.stringify(t.key)});srOpen(SR_ROWS[0],false);srOpen(SR_ROWS[0],true);`);
  assert.deepEqual(J('SR_LOG'), ['ticket:' + t.key, 'fiche:' + t.who]);
});
