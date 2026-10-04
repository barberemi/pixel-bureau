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

test('Thèmes : choisis par la date de Paris, forçables, désactivables', () => {
  const at = d => run(`(themeAt(Date.parse('${d}'))||{id:null}).id`);
  assert.equal(at('2026-10-31T21:00:00Z'), 'halloween');
  assert.equal(at('2026-10-31T23:30:00Z'), null); // déjà le 1er novembre à Paris
  assert.equal(at('2026-12-24T10:00:00Z'), 'noel');
  assert.equal(at('2026-12-31T10:00:00Z'), 'nouvel-an');
  assert.equal(at('2027-01-02T10:00:00Z'), 'nouvel-an'); // la période passe d'une année à l'autre
  assert.equal(at('2027-02-14T10:00:00Z'), 'saint-valentin');
  assert.equal(at('2027-01-06T10:00:00Z'), null);
  assert.equal(at('2027-07-14T10:00:00Z'), null);
  assert.equal(at('2027-03-10T10:00:00Z'), null);
  run(`THEME_FORCE='noel'`); assert.equal(at('2027-03-10T10:00:00Z'), 'noel');
  run(`THEME_FORCE='off'`); assert.equal(at('2026-12-24T10:00:00Z'), null);
  run(`THEME_FORCE=null; CFG.ui={themes:false}`); assert.equal(at('2026-12-24T10:00:00Z'), null);
  run(`CFG.ui={}`);
});

test('Thèmes : chaque décor se dessine sans erreur', () => {
  for (const id of JSON.parse(run('JSON.stringify(THEMES.map(x=>x.id))'))) {
    run(`THEME_FORCE='${id}'; THEME_MEMO={k:null,v:null};
      banner(); garland(1000); themeOverlay(1000); themeWindow(10,10,40,16,1000,24); themeLights([]); themeEnvelope(50,50);
      for(const f of FURN)f.draw(1000);
      for(const c of chars)themeOnChar(c,100,100,1000);`);
  }
  run(`THEME_FORCE=null; THEME_MEMO={k:null,v:null}`);
});

test("Nouvel an : les confettis couvrent toute la largeur (pas seulement la gauche)", () => {
  const xs = JSON.parse(run('JSON.stringify([...Array(60)].map((_,i)=>spread(i)))'));
  assert.ok(Math.min(...xs) < 0.05 && Math.max(...xs) > 0.95);
  assert.ok(xs.filter(x => x > 0.5).length >= 25);
});

test('Nouvel an : compte à rebours jusqu\'à minuit le 31 décembre après midi', () => {
  run(`THEME_FORCE=null; T=Date.parse('2026-12-31T21:30:00Z'); THEME_MEMO={k:null,v:null}`);
  assert.equal(run('bannerText(themeNow())'), 'MINUIT DANS 1 H 30'); // 22h30 à Paris
  run(`T=Date.parse('2027-01-01T09:00:00Z'); THEME_MEMO={k:null,v:null}`);
  assert.equal(run('bannerText(themeNow())'), 'BONNE ANNÉE 2027 !');
  run(`T=Date.parse('2026-12-13T09:00:00Z'); THEME_MEMO={k:null,v:null}`);
  assert.equal(run('bannerText(themeNow())'), 'JOYEUX NOËL · J-12');
});

test("Âge réel : un ticket en review depuis 12 j reste bloqué même si la bascule de sprint l'a touché hier", () => {
  const t = Date.parse('2026-10-04T10:00:00Z');
  run(`TEAM={people:[{name:'Darryl',tickets:[
      {key:'EW-6550',cat:'review',since:'2026-09-22T10:00:00.000+0200',updated:'2026-10-02T16:13:27.490+0200'},
      {key:'EW-1',cat:'review',since:'2026-10-03T18:00:00.000+0200',updated:'2026-10-03T18:00:00.000+0200'},
      {key:'EW-2',cat:'test',updated:'2026-09-28T10:00:00.000+0200'}],
    prs:[{n:7,review:'pending',created:'2026-09-25T10:00:00Z',updated:'2026-10-04T09:00:00Z'}]}],unassigned:[],other_prs:[]};`);
  const blocked = JSON.parse(run(`JSON.stringify(blockedTickets(${t}).map(x=>x.key))`));
  assert.deepEqual(blocked, ['EW-6550', 'EW-2']); // EW-2 : vieil instantané sans since, repli sur updated
  assert.deepEqual(JSON.parse(run(`JSON.stringify(stalePrs(${t}).map(x=>x.n))`)), [7]); // poussée ce matin, ouverte il y a 9 j
  assert.equal(run(`tkAge(TEAM.people[0].tickets[0],${t})`), '12 j');
  run('TEAM=null');
});
