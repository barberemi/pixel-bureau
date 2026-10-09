// Tickets créés par l'équipe (team.new_tickets, cron équipe) : stand-up de la facilitatrice, fil, pile de documents
// sur son bureau. Démo du jeudi 1er octobre : 15 tickets créés depuis la veille, dont un par quelqu'un hors équipe.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = hm => Date.parse(`2026-10-01T${hm}:00+02:00`);

test('seuls les tickets de collègues comptent, avec leur auteur', () => {
  const all = J(`TEAM.new_tickets.length`);
  const team = J(`teamCreated(-Infinity,${at('23:00')}).map(x=>[x.key,x.c.key])`);
  assert.equal(all, 15);
  assert.equal(team.length, 14); // Robert California n'est pas de l'équipe
  assert.ok(team.some(([k, c]) => k === 'DM-7910' && c === 'p_jan'));
});

test('stand-up : la facilitatrice présente les tickets créés depuis le dernier daily, numéro, titre et auteur', () => {
  const html = J(`personScene(byKey.p_kelly,${at('09:42')})`);
  assert.match(html, /Tickets créés par l'équipe depuis le dernier daily \(7\)/); // de mercredi 9h40 à jeudi 9h42
  assert.match(html, /<b>DM-7908<\/b> \[Newsletter\] Désinscription en un clic <small>· Jan<\/small>/);
  assert.doesNotMatch(html, /Qui sommes-nous/);
});

test('pile de documents : les tickets créés depuis le dernier daily passé, remise à zéro au daily', () => {
  const n = hm => J(`teamCreated(lastDaily(${at(hm)}),${at(hm)}).length`);
  assert.equal(n('09:00'), 6); // avant le daily : depuis celui de mercredi
  assert.equal(n('09:45'), 0); // le daily vient de passer
  assert.equal(n('11:00'), 7); // créés entre 9h55 et 10h58
  run(`T=${at('11:00')};needTeleport=true;tick(0);render(1);`); // la pile se dessine sans erreur
});

test('fil : « Jan crée DM-7910 » pour les tickets du jour, sans doublon « Nouveau ticket »', () => {
  run(`T=${at('11:00')};renderFeed();`);
  const txt = J(`FEED_EV.map(e=>e.txt)`);
  assert.ok(txt.some(t => /data-who="[^"]+"[^>]*>Jan<\/a> crée <a class="lk lk-id lk-ext" href="[^"]*browse\/DM-7910"[^>]*>DM-7910<\/a>/.test(t))); // créé aujourd'hui : Jira
  assert.ok(!txt.some(t => /DM-7901|DM-7905/.test(t))); // créés la veille : pas dans le fil du jour
  assert.ok(!txt.some(t => /Qui sommes-nous/.test(t)));
  const keys = txt.filter(t => /DM-7910/.test(t));
  assert.equal(keys.length, 1);
});
