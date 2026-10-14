// ---------- fraîcheur des données : prochain passage de chaque cron, compte à rebours, retards ----------
// Chaque source (dataset) est publiée par un cron ; on prévoit son prochain passage depuis son calendrier
// (DATA.crons) et la durée observée de son dernier run (generated_at moins la minute de déclenchement).
const FRESH_SRC=[
  {key:'live',label:'Direct (runs, gates)',period:60e3,grace:120e3,gen:()=>LIVE&&LIVE.generated_at},
  {key:'office',label:'Bureau (journée)',period:600e3,grace:300e3,gen:()=>OFFICE&&!OFFICE.empty&&OFFICE.generated_at},
  {key:'team',label:'Équipe (Jira, GitHub)',period:600e3,grace:300e3,gen:()=>TEAM_BASE&&TEAM_BASE.generated_at},
  {key:'payroll',label:'Fiche de paie',period:3600e3,grace:600e3,gen:()=>PAYROLL&&PAYROLL.generated_at},
  {key:'canard',label:'Canard d\'équipe',period:3600e3,grace:600e3,gen:()=>DUCKGAME&&DUCKGAME.generated_at},
  {key:'absences',label:'Absences (planning)',period:3600e3,grace:600e3,gen:()=>ABSENCES&&!ABSENCES.demo&&ABSENCES.generated_at},
  {key:'courrier',label:'Courrier',period:600e3,grace:300e3,gen:()=>MAILS&&!MAILS.demo&&MAILS.generated_at},
];
function cronOf(key){
  if((CFG.schedules||{})[key])return CFG.schedules[key]; // modèles de workflows (assemblage)
  const id=(CFG.workflows||{})[key]; if(!id||!DATA)return null;
  const c=(DATA.crons||[]).find(x=>x.wf===id);return c&&c.schedule||null;
}
// prochain déclenchement du cron strictement après t (pas d'une minute, au plus 3 jours)
function nextFire(schedule,t){
  let m=Math.floor(t/60e3)*60e3+60e3;
  for(let i=0;i<3*1440;i++,m+=60e3)if(cronMatch(schedule,new Date(m)))return m;
  return null;
}
// état d'une source à l'instant now : âge, arrivée prévue, retard
function freshness(src,now){
  const gen=ms(src.gen()); if(!gen)return null;
  const sch=cronOf(src.key), run=Math.min(60e3,Math.max(2e3,gen-Math.floor(gen/60e3)*60e3)); // durée du dernier run
  const next=sch?nextFire(sch,gen):gen+src.period, eta=next!=null?next+run+3e3:null;
  return {src,gen,age:now-gen,eta,late:eta!=null&&now>eta+src.grace?now-eta:0};
}
// anneau de progression (couleur = currentColor)
function freshRing(frac,size){
  const s=size||16, R=s*.375, C=2*Math.PI*R, c=s/2, w=s/8;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="${w}"/>`+
    `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-dasharray="${(C*frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${c} ${c})" stroke-linecap="round"/></svg>`;
}
// attente avant la prochaine arrivée : secondes, minutes, ou pause du cron (hors de ses heures) avec l'heure de reprise
const parisDay=t=>dtf('en-CA',{}).format(new Date(t));
const DAY_FR={Mon:'lundi',Tue:'mardi',Wed:'mercredi',Thu:'jeudi',Fri:'vendredi',Sat:'samedi',Sun:'dimanche'};
function waitTxt(f,now){
  const left=f.eta-now, frac=Math.min(1,Math.max(0,(now-f.gen)/Math.max(1,f.eta-f.gen)));
  if(f.eta-f.gen>3*f.src.period&&left>5*60e3){ // le cron ne tourne pas à ces heures-là
    const d=parisDay(f.eta), when=d===parisDay(now)?'':d===parisDay(now+864e5)?'demain ':DAY_FR[parisHM(f.eta).wd]+' ';
    return {txt:'en pause · reprise '+when+'à '+hm(f.eta).replace(':','h').replace(/^0/,''),frac:0,paused:true};
  }
  if(left>=120e3)return {txt:'dans '+Math.ceil(left/60e3)+' min',frac};
  return {txt:'dans '+Math.ceil(left/1e3)+' s',frac};
}
// diagnostic sous le tableau : crons du Bureau en échec (Jira refusé, script en erreur), erreurs GitHub du cron
// équipe, dernier nettoyage des vieux runs (cron office, 7h et 13h)
function diagTxt(){
  const out=[], failed=(OFFICE&&OFFICE.bureau_failed)||{};
  for(const [key,f] of Object.entries(failed)){
    const src=FRESH_SRC.find(s=>s.key===key), label=src?src.label:key;
    out.push(`<div class="diag late">${esc(label)} : dernier passage en échec${f.at?' à '+hm(ms(f.at)):''}`+
      (f.step?` (étape ${esc(f.step)}${f.err?' : '+esc(f.err):''})`:'')+'</div>');
  }
  const src=TEAM_BASE&&TEAM_BASE.sources;
  if(src&&src.github_errors&&src.github_errors.length)
    out.push('<div class="diag late">GitHub : '+src.github_errors.slice(0,3).map(esc).join(' · ')+'</div>');
  if(src&&!src.jira&&CFG.jira_site&&!failed.team)out.push('<div class="diag">Jira : aucun ticket reçu au dernier passage du cron équipe</div>');
  const p=OFFICE&&OFFICE.purge;
  if(p&&p.at)out.push(`<div class="diag${p.errors?' late':''}">Nettoyage des runs de plus de 7 jours : ${p.deleted} supprimé${p.deleted>1?'s':''} à ${hm(ms(p.at))}`+
    (p.errors?` · ${p.errors} erreur${p.errors>1?'s':''} (${esc(p.last_error||'')})`:'')+'</div>');
  return out.join('');
}
const hmin=m=>m<60?m+' min':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0'); // minutes arrondies d'abord : jamais « 4 h 60 »
const agoTxt=d=>d<60e3?Math.max(0,Math.round(d/1e3))+' s':hmin(Math.round(d/60e3));
let FRESH_LAST=null, FRESH_FLASH=0, FRESH_VIEW=null; // FRESH_VIEW : dernier état affiché (repris par le mode TV)
function updateFresh(){
  const b=document.getElementById('badge'); if(!b||!DATA)return;
  let el=document.getElementById('fresh');
  if(!el){el=document.createElement('span');el.id='fresh';b.appendChild(el);}
  const now=Date.now(), all=FRESH_SRC.map(s=>freshness(s,now)).filter(Boolean), live=all.find(f=>f.src.key==='live');
  let pop=document.getElementById('freshpop');
  if(!pop){pop=document.createElement('div');pop.id='freshpop';pop.setAttribute('role','tooltip');b.appendChild(pop);b.tabIndex=0;}
  if(!LIVE_DATA||!live){el.innerHTML='';pop.innerHTML='';b.classList.remove('late');FRESH_VIEW=null;return;}
  if(FRESH_LAST&&live.gen!==FRESH_LAST)FRESH_FLASH=now+2500; // nouvelles données arrivées
  FRESH_LAST=live.gen;
  const late=all.filter(f=>f.late).sort((x,y)=>y.late-x.late)[0], failed=(OFFICE&&OFFICE.bureau_failed)||{};
  b.classList.toggle('late',!!late||Object.keys(failed).length>0);
  let txt, frac;
  if(late){txt=late.src.label.split(' (')[0]+' en retard de '+agoTxt(late.late);frac=1;}
  else if(now<FRESH_FLASH){txt='✓ à jour';frac=1;}
  else if(live.eta&&now<live.eta)({txt,frac}=waitTxt(live,now));
  else{txt='imminent';frac=1;}
  FRESH_VIEW={txt,frac,late:!!late};
  el.innerHTML=freshRing(frac)+esc(txt);
  // panneau au survol (pas d'attribut title : son texte change chaque seconde, le navigateur ne l'afficherait jamais) ;
  // pas refait pendant un clic ni tant que la carte Kronn d'une relance y est ouverte (elle serait détruite)
  if(performance.now()<PRESS_HOLD||KM_OPEN&&pop.contains(KM_OPEN))return; // 50-panel.js, 55-actions.js
  pop.innerHTML='<b>Fraîcheur des données</b><table>'+all.map(f=>`<tr class="${f.late||failed[f.src.key]?'late':''}" data-k="${esc(f.src.key)}"><td>${esc(f.src.label)}</td><td>il y a ${agoTxt(f.age)}</td>`+
    `<td>${failed[f.src.key]?'en échec':f.late?'en retard de '+agoTxt(f.late):f.eta&&f.eta>now?(waitTxt(f,now).paused?waitTxt(f,now).txt:'prochain ~'+hm(f.eta)):'imminent'}</td><td class="rl"></td></tr>`).join('')+'</table>'+diagTxt()+'<small>Prochain passage estimé : calendrier du cron + durée de son dernier run.</small>';
  for(const tr of pop.querySelectorAll('tr[data-k]'))freshRelaunch(tr.querySelector('td.rl'),tr.dataset.k,all.find(f=>f.src.key===tr.dataset.k).src.label,tr.classList.contains('late'));
}
// relancer le cron d'une source (#44) : « ↻ Relancer » sur une ligne en échec ou en retard, « ↻ » discret sur les autres
// (rafraîchir sans attendre) ; action bureau-relaunch, ligne de gates.workflows marquée de la clé de la source, carte
// Kronn en fenêtre centrée. Rien pour Direct (le cron live passe chaque minute) ni en mode TV.
function freshRelaunch(td,key,label,urgent){
  const w=key!=='live'&&ACTIONS.relaunch&&!TV&&RELAUNCH.find(x=>x.bureau===key); if(!w)return;
  const host=document.createElement('div');host.className='relaunch fr-rl';host.setAttribute('data-kronn-action-slot-host','');
  host.innerHTML=`<div class="rl-n">${esc(label)}</div><div class="rl-s">Lance tout de suite un nouveau passage de ce cron du Bureau, en plus de ses passages prévus.</div>`;
  const b=document.createElement('button');b.textContent=urgent?'↻ Relancer':'↻';if(!urgent){b.className='rl-mini';b.title='Rafraîchir maintenant';b.setAttribute('aria-label','Rafraîchir '+label+' maintenant');}
  b.setAttribute('data-kronn-action','bureau-relaunch');b.setAttribute('data-kronn-bindings',JSON.stringify({wf_id:w.wf}));
  host.appendChild(b);td.appendChild(host);kronnModal(host,b,'Relancer un cron du Bureau');
}
