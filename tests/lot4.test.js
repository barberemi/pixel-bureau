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

test('Agents empilés : une zone pleine décale chaque surnuméraire, jamais deux sprites au même pixel', () => {
  const pos = JSON.parse(run(`(()=>{
    const taken=new Set(), out=[];
    const zone=Object.keys(SPOTS).find(z=>z!=='boss'&&SPOTS[z].length>0), n=SPOTS[zone].length+3;
    for(let i=0;i<n;i++){const s=pickSpot({key:'k'+i},zone,taken);taken.add(s.key);const p=spotPos(s);out.push(p.x+','+p.y);}
    return JSON.stringify(out);})()`));
  assert.equal(new Set(pos).size, pos.length);
});

test('Flânerie à graine fixe : même personnage, même jour, même suite de pauses', () => {
  const seq = () => JSON.parse(run(`(()=>{const c={key:'jim',person:false},out=[];
    for(let i=0;i<6;i++){c.idlePlan=null;out.push(wanderZone(c,i));}return JSON.stringify(out);})()`));
  const a = seq(), b = seq();
  assert.deepEqual(a, b);
  assert.ok(new Set(a).size > 1); // ce n'est pas toujours la même pause
});

test("tick en deux passes : l'état du boss ne dépend pas de l'ordre des personnages", () => {
  const boss = () => run(`(()=>{
    const g=chars.find(c=>!c.person&&!c.visitor&&!c.boss); const b=chars.find(c=>c.boss); if(!g||!b)return 'skip';
    const keep=stateAt; stateAt=(c,t)=>c===g?{st:'gate',zone:'boss',label:'x'}:keep(c,t);
    try{for(const c of chars)c._st=null; tick(0); return b._st.label;}finally{stateAt=keep;}
  })()`);
  run('chars.reverse()'); const a = boss();
  run('chars.reverse()'); const b = boss();
  assert.match(a, /validation/); // le boss voit la validation, qu'il soit calculé avant ou après l'agent
  assert.equal(a, b);
});
