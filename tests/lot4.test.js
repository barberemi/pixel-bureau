// Lot 4 : diagnostic du panneau Fraîcheur, confort (mobile, accueil, nuit, hologrammes, filtre) et perf.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;

test('Fraîcheur : cron du Bureau en échec, erreurs GitHub, Jira muet, nettoyage', () => {
  run(`OFFICE={generated_at:'2026-10-04T08:00:00Z',runs:[],discussions:[],
    bureau_failed:{team:{at:'2026-10-04T07:50:00Z',step:'jira_team',err:'401 <Unauthorized>'}},
    purge:{at:'2026-10-04T05:01:00Z',deleted:3,errors:0}};
    TEAM_BASE={generated_at:'2026-10-04T07:40:00Z',sources:{jira:false,github:false,github_errors:['open : gh introuvable sur la machine']}};
    CFG.jira_site='https://acme.atlassian.net';`);
  const html = run('diagTxt()');
  assert.match(html, /Équipe \(Jira, GitHub\) : dernier passage en échec à 09:50 \(étape jira_team : 401 &lt;Unauthorized&gt;\)/);
  assert.match(html, /GitHub : open : gh introuvable sur la machine/);
  assert.doesNotMatch(html, /aucun ticket reçu/); // l'échec du cron équipe explique déjà l'absence de Jira
  assert.match(html, /3 supprimés à 07:01/);
  run(`OFFICE.bureau_failed={}; TEAM_BASE.sources={jira:false,github:true,github_errors:[]};`);
  assert.match(run('diagTxt()'), /Jira : aucun ticket reçu/);
  run(`OFFICE=null; TEAM_BASE=null;`);
  assert.equal(run('diagTxt()'), '');
});
