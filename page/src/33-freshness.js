// ---------- fraîcheur des données : prochain passage de chaque cron, compte à rebours, retards ----------
// Chaque source (dataset) est publiée par un cron ; on prévoit son prochain passage depuis son calendrier
// (DATA.crons) et la durée observée de son dernier run (generated_at moins la minute de déclenchement).
const FRESH_SRC=[
  {key:'live',label:'Direct (runs, gates)',period:60e3,grace:120e3,gen:()=>LIVE&&LIVE.generated_at},
  {key:'office',label:'Bureau (journée)',period:600e3,grace:300e3,gen:()=>OFFICE&&!OFFICE.empty&&OFFICE.generated_at},
  {key:'team',label:'Équipe (Jira, GitHub)',period:600e3,grace:300e3,gen:()=>TEAM_BASE&&TEAM_BASE.generated_at},
  {key:'payroll',label:'Fiche de paie',period:3600e3,grace:600e3,gen:()=>PAYROLL&&PAYROLL.generated_at},
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
const agoTxt=d=>d<60e3?Math.max(0,Math.round(d/1e3))+' s':d<3600e3?Math.round(d/60e3)+' min':Math.floor(d/3600e3)+' h '+String(Math.round(d%3600e3/60e3)).padStart(2,'0');
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
  const late=all.filter(f=>f.late).sort((x,y)=>y.late-x.late)[0];
  b.classList.toggle('late',!!late);
  let txt, frac;
  if(late){txt=late.src.label.split(' (')[0]+' en retard de '+agoTxt(late.late);frac=1;}
  else if(now<FRESH_FLASH){txt='✓ à jour';frac=1;}
  else if(live.eta&&now<live.eta){const left=live.eta-now;txt='dans '+Math.ceil(left/1e3)+' s';frac=Math.min(1,Math.max(0,(now-live.gen)/Math.max(1,live.eta-live.gen)));}
  else{txt='imminent';frac=1;}
  FRESH_VIEW={txt,frac,late:!!late};
  el.innerHTML=freshRing(frac)+esc(txt);
  // panneau au survol (pas d'attribut title : son texte change chaque seconde, le navigateur ne l'afficherait jamais)
  pop.innerHTML='<b>Fraîcheur des données</b><table>'+all.map(f=>`<tr class="${f.late?'late':''}"><td>${esc(f.src.label)}</td><td>il y a ${agoTxt(f.age)}</td>`+
    `<td>${f.late?'en retard de '+agoTxt(f.late):f.eta&&f.eta>now?'prochain ~'+hm(f.eta):'imminent'}</td></tr>`).join('')+'</table><small>Prochain passage estimé : calendrier du cron + durée de son dernier run.</small>';
}
