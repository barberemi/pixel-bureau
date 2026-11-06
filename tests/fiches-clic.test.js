// Les fiches au clic du 2e et du 3e étage (68-redaction.js, 68-revue.js, 68-retours.js) : la PR lue, un auteur, le casier,
// la corbeille à la revue ; l'intention, un poste, la boîte Jira et la clé d'un ticket créé à la rédaction ; les liens du
// bureau, la fiche d'un poste et le couloir au 3e. Chaque fiche mène à la PR, au ticket, au run et au Mur Kanban.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

function page() {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; T = DAY0 + 11 * 36e5; setMode('live'); REDACTION = redactionDemo(); rdReset(); RETOURS = retoursDemo(); rtReset();
    KB_CALLS = []; openKanban = o => KB_CALLS.push(o); renderSide = () => {};`);
  return {p, J};
}
const click = (p, kind, extra = '') => p.run(`rdHitAt = () => RD_HITS.find(h => h.kind === '${kind}'${extra}); redactionClick({clientX: 0, clientY: 0});`);

test('revue : un clic sur le relecteur de la file ouvre la PR lue, ses liens, son Kanban et ce qui attend après elle', () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  const run = J('rvfState().reading.r.run');
  click(p, 'review', ` && h.run === '${run}'`);
  assert.deepEqual(J('RDF'), {k: 'review', run});
  const html = J('rdFicheHtml(RDF)');
  assert.match(html, /👀 En lecture <span class="cnt mono">api#2051<\/span>/);
  assert.match(html, /fournée du cron de 09:30/);
  assert.match(html, /href="https:\/\/github\.com\/dm\/api\/pull\/2051"[^>]*>🐙 La PR ↗/);
  assert.match(html, /pull\/2051\/files"[^>]*>± Le diff ↗/);
  assert.match(html, /data-kbpr="dm\/api#2051" data-au="pambeesly">🔍 Ouvrir dans le Kanban/);
  assert.match(html, /Après elle, au casier.*mobile#311.*api#2063/s, 'la file, dans l\'ordre');
  assert.match(html, /data-rva="pambeesly"/, 'l\'auteur mène à sa fiche');
  p.run(`fkAct({kbpr: 'dm/api#2051', au: 'pambeesly'});`);
  const c = J('KB_CALLS[0]');
  assert.equal(c.pr, 'dm/api#2051');
  assert.equal(c.who, J("(ghChar('pambeesly') || {}).key || ''"), 'le Kanban filtré sur l\'auteur quand c\'est quelqu\'un de l\'équipe');
});

test("revue : un auteur montre ses PR (lue, au casier avec leur rang, déjà relues) ; un auteur reparti n'a plus de fiche", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  click(p, 'author', ` && h.author === 'pambeesly'`);
  assert.equal(J('RDF.k'), 'author');
  const pam = J('rdFicheHtml(RDF)');
  assert.match(pam, /Sa PR est lue au premier bureau/);
  assert.match(pam, /En lecture.*api#2051/s);
  assert.match(pam, /Au casier.*<span class="k mono">3<\/span><span>api#2063/s, 'deuxième au casier, troisième à passer');
  const holly = J(`rvAuthorHtml('hollyflax')`);
  assert.match(holly, /Plus rien au casier/);
  assert.match(holly, /Déjà relues.*site#2042.*site#2060/s);
  assert.match(holly, /💬<\/span>.*✅<\/span>/s, 'le verdict de chaque avis');
  assert.equal(J(`rvAuthorHtml('personne')`), null);
  p.run(`RDF = {k: 'author', a: 'personne'}; drawRedactionSide(document.createElement('div'));`);
  assert.equal(J('RDF'), null, 'retour à la liste');
});

test('revue : le casier (la file dans l\'ordre) et la corbeille (les avis postés) ; une ligne relue ouvre sa fiche', () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  assert.ok(J('RD_HITS.some(h => h.kind === "postees")'), 'la corbeille est cliquable');
  click(p, 'postees');
  assert.deepEqual(J('RDF'), {k: 'postees'});
  const post = J('rdFicheHtml(RDF)');
  assert.match(post, /📤 Postées <span class="cnt">2<\/span>/);
  const run = J('rvfState().done[0].r.run');
  assert.match(post, new RegExp(`data-rvr="${run}"`));
  p.run(`fkAct({rvr: '${run}'});`);
  assert.deepEqual(J('RDF'), {k: 'review', run, back: {k: 'postees'}});
  assert.match(J('rdFicheHtml(RDF)'), /💬 Relue/);
  const cas = J(`rvFileHtml('casier')`);
  assert.match(cas, /📥 À relire <span class="cnt">2<\/span>/);
  assert.match(cas, /<span class="k mono">2<\/span><span>mobile#311.*<span class="k mono">3<\/span><span>api#2063/s);
  assert.match(J("rvfHover({kind: 'postees'})"), /2 PR relues · clic : la liste/);
});

test("rédaction : la table ouvre l'intention, chaque poste sa fiche (recherche, rédaction, critique) ; la boîte Jira les tickets du jour", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  assert.deepEqual(J('[...new Set(RD_HITS.filter(h => h.kind === "poste").map(h => h.p))]'), ['recherche', 'redaction', 'critique']);
  click(p, 'table');
  assert.deepEqual(J('RDF'), {k: 'intention'});
  const it = J('rdFicheHtml(RDF)');
  assert.match(it, /tour 2\/3/);
  assert.match(it, /Refondre le lecteur vidéo/);
  assert.match(it, /data-rdp="critique"[^>]*>🧐 Critique/, 'le poste en cours, avec son nom');
  assert.match(it, /data-rdtk="2"/);
  click(p, 'poste', ` && h.p === 'critique'`);
  assert.deepEqual(J('RDF'), {k: 'poste', p: 'critique', back: {k: 'intention'}});
  const cri = J('rdFicheHtml(RDF)');
  assert.match(cri, /Tour 2\/3 · 🔧 à retoucher/);
  assert.match(cri, /🔧<\/span><span><b>T1<\/b> Quel format de pistes/);
  assert.match(cri, /💡<\/span><span><b>T2<\/b> Citer la maquette/);
  assert.match(J(`rdPosteHtml(rdTable(), 'recherche')`), /DM-1984.*Sous-titres du direct.*Terminé/s);
  assert.match(J(`rdPosteHtml(rdTable(), 'redaction')`), /Version 2.*T3 : la reprise marche aussi hors connexion/s);
  p.run(`fkAct({rdtk: '1'});`);
  assert.deepEqual(J('[RDF, RDTK]'), [null, {run: 'demo-t1', k: 1}], 'une ligne de ticket ouvre sa fiche');
  click(p, 'jira');
  const jira = J('rdFicheHtml(RDF)');
  assert.match(jira, /🎫 La boîte Jira <span class="cnt">2<\/span>/);
  assert.match(jira, /DM-2102.*Export : le fichier CSV.*DM-2101/s, 'le plus récent en haut');
});

test('rédaction : un ticket créé montre sa clé Jira et ouvre le Kanban ; sans site Jira, la clé reste du texte', () => {
  const {p, J} = page();
  p.run(`REDACTION.tables[0].tickets[0].key = 'DM-2200';`);
  const html = J('rdTicketHtml(rdTables()[0], 0)');
  assert.match(html, /href="https:\/\/dunder-mifflin\.atlassian\.net\/browse\/DM-2200"[^>]*>🎫 DM-2200 ↗/);
  assert.match(html, /data-kbtk="DM-2200">🔍 Dans le Kanban/);
  assert.doesNotMatch(J('rdTicketHtml(rdTables()[0], 1)'), /data-kbtk/, 'pas encore créé : pas de clé');
  p.run('fkAct({kbtk: "DM-2200"});');
  assert.deepEqual(J('KB_CALLS[0]'), {ticket: 'DM-2200'});
  p.run(`CFG.jira_site = '';`);
  assert.match(J(`jiraA('DM-1')`), /<span class="lk mono">DM-1<\/span>/);
});

test("3e : la fiche du bureau a ses liens ; un clic sur un agent ouvre son poste (le fil en cours et son commentaire) ; le couloir, la file", () => {
  const {p, J} = page();
  p.run('setFloor(3); renderRetours(1000);');
  const html = J('retoursFicheHtml(rtSlots()[0], 0)');
  assert.match(html, /href="https:\/\/github\.com\/dm\/site\/pull\/2042"[^>]*>🐙 La PR ↗/);
  assert.match(html, /data-kbpr="dm\/site#2042" data-au="hollyflax"/);
  assert.match(html, /🔍 Ouvrir le Kanban des fils/, 'le Kanban des fils reste');
  assert.match(html, /data-rtp="fix"/, 'chaque poste du tableau mène à sa fiche');
  p.run(`rtHitAt = () => RT_HITS.find(h => h.kind === 'agent' && h.i === 0 && h.k === 'fix'); retoursClick({clientX: 0, clientY: 0});`);
  assert.deepEqual(J('[RTSEL, RTPOSTE]'), [J('rtSlots()[0].run'), 'fix']);
  p.run(`RETOURS.rooms[0].fils[2] = {...RETOURS.rooms[0].fils[2], cur: true, url: 'https://github.com/dm/site/pull/2042#discussion_r9'};`);
  const fix = J(`rtPosteHtml(rtSlots()[0], 0, RT_POSTES[1])`);
  assert.match(fix, /Le fil en cours · 3\//);
  assert.match(fix, /href="https:\/\/github\.com\/dm\/site\/pull\/2042#discussion_r9"[^>]*>💬 Le commentaire ↗/);
  assert.match(fix, /data-rtkb data-fil="t3"/);
  assert.match(fix, /Déjà traités.*src\/Player\.tsx:7/s);
  p.run(`RETOURS.queue = [{run: 'q1', repo: 'dm/api', pr: '77', since: new Date(DAY0 + 10 * 36e5).toISOString()}];
    rtHitAt = () => ({kind: 'queue'}); retoursClick({clientX: 0, clientY: 0});`);
  assert.deepEqual(J('[RTSEL, RTPOSTE, RTQ]'), [null, null, true]);
  assert.match(J('rtQueueHtml()'), /data-kbpr="dm\/api#77".*api#77.*depuis 10:00/s);
});

test("les liens : une PR au nom suspect n'a pas de lien GitHub ; un lien qui n'est pas https n'est pas posé", () => {
  const {J} = page();
  assert.equal(J(`ghPrUrl('dm/site', '12')`), 'https://github.com/dm/site/pull/12');
  assert.equal(J(`ghPrUrl('dm/site"><b', '12')`), null);
  assert.equal(J(`ghPrUrl('dm/site', '12x')`), null);
  assert.equal(J(`fkA('javascript:alert(1)', 'x')`), '');
  assert.equal(J(`fkRun('javascript:alert(1)')`), '');
  assert.doesNotMatch(J(`prLinksHtml('dm/site"><b', '12', '', '')`), /site"></, 'le nom est échappé');
});
