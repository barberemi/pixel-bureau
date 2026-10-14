// Contrat crons -> page (KT-57) : node tests/helpers/contract.js <sorties.json>
// <sorties.json> = {nom du dataset: sortie du script qui l'écrit} (tests/test_scripts.py, test_contract_*). Chaque
// dataset est passé à la page deux fois, comme Kronn peut le stocker : en texte JSON (stdout d'une étape Exec) puis
// en objet. Pour chaque forme : la page démarre sans démo sur ces seules données, et chaque lecteur readXxx de la page
// accepte son dataset ; et les avertissements de chaque cron (liste warnings, #8) arrivent tels quels au panneau
// Fraîcheur (readWarnings). Sortie : {forme: {lecteur: true | false | "erreur"}}.
'use strict';
const fs = require('fs');
const {load} = require('./page.js');

// lecteur de la page -> dataset lu (page/src/*.js)
const READERS = {
  readData: 'office', readLive: 'live', readTeam: 'team', readActs: 'actions',
  readGates: 'gates', readQuestions: 'gates', readRelaunch: 'gates', readAskable: 'gates', readDuckData: 'gates',
  readPayroll: 'payroll', readBossPages: 'bosspages', readGitfut: 'gitfut', readPosters: 'gitfut',
  readAbsences: 'absences', readDuckGame: 'duck', readAvatars: 'avatars', readLayout: 'layout',
};

const outputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const result = {};
for (const form of ['texte', 'objet']) {
  const datasets = Object.fromEntries(Object.entries(outputs).map(([name, out]) =>
    [name, {kind: 'snapshot', current: form === 'texte' ? JSON.stringify(out) : out, points: []}]));
  const r = result[form] = {};
  let page;
  try {
    page = load({kronnPageData: {version: 1, page: {id: 'p', slug: 'le-bureau', title: 'Le Bureau'}, datasets}, demo: false});
    r.demarrage = page.run('!!DATA && !DATA.empty && chars.length > 0 && !!TEAM');
  } catch (e) {
    r.demarrage = 'erreur : ' + String(e).slice(0, 200);
    continue;
  }
  for (const [reader, name] of Object.entries(READERS)) {
    if (!(name in outputs)) continue;
    try {
      const v = page.run(`${reader}(window.KronnPageData)`);
      r[reader] = v !== null && v !== undefined;
    } catch (e) {
      r[reader] = 'erreur : ' + String(e).slice(0, 200);
    }
  }
  // chaque sortie qui porte une liste warnings : la page la relit à l'identique, sous le nom de son dataset
  try {
    const got = JSON.parse(page.run('JSON.stringify(readWarnings(window.KronnPageData))'));
    const want = Object.entries(outputs).filter(([, out]) => out && Array.isArray(out.warnings));
    r.readWarnings = want.length > 0 && want.every(([name, out]) => JSON.stringify(got[name]) === JSON.stringify(out.warnings.slice(0, 20)))
      || 'avertissements perdus : ' + want.filter(([name, out]) => JSON.stringify(got[name]) !== JSON.stringify(out.warnings.slice(0, 20))).map(([n]) => n).join(', ');
  } catch (e) {
    r.readWarnings = 'erreur : ' + String(e).slice(0, 200);
  }
}
process.stdout.write(JSON.stringify(result));
