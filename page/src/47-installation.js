// ---------- État de l'installation : ce qui tourne, ce que ça apporte, ce que ça coûte, la commande pour agir ----------
// Une ligne par capacité du Bureau, lue dans ce que la page sait déjà : les réglages assemblés (ce qui est installé), la
// fraîcheur et les avertissements de chaque cron (33-freshness.js). Ouverte depuis le panneau Fraîcheur, dans la même
// fenêtre que Mes pages Kronn (openWide). La page ne connaît pas la dernière version publiée : elle donne la sienne et
// la commande de mise à jour, sans annoncer de nouveauté.
const BUREAU_VERSION='__VERSION__';
// fresh : la source du panneau Fraîcheur ; warn : le dataset de ses avertissements ; on : installé (sinon : l'id de son cron)
const INSTALL_CAPS=[
  {k:'team',n:'Équipe (Jira, GitHub)',a:'sprint, tickets, PR, mises en prod',fresh:'team',warn:'team'},
  {k:'live',n:'Direct (runs, décisions)',a:'le plan bouge en direct, tes décisions',fresh:'live',warn:'live'},
  {k:'office',n:'Bureau (journée)',a:'la journée rejouable, le fil',fresh:'office',warn:'office'},
  {k:'payroll',n:'Fiche de paie',a:'runs et jetons des agents',fresh:'payroll',warn:'payroll'},
  {k:'absences',n:'Absences',a:'le calendrier de l\'équipe',fresh:'absences'},
  {k:'courrier',n:'Courrier',a:'les mails à traiter',fresh:'courrier',warn:'mails'},
  {k:'canard',n:'Canard d\'équipe',a:'le canard du sprint',fresh:'canard',warn:'duck'},
  {k:'support',n:'Caserne Support (-1)',a:'réponses Teams, sous ton nom',ia:true,fresh:'support_poll',on:()=>caserneOn()},
  {k:'atelier',n:'Atelier (1er)',a:'un ticket implémenté jusqu\'à la PR',ia:true,on:()=>atelierOn()},
  {k:'redaction',n:'Rédaction (2e)',a:'des tickets rédigés depuis une intention',ia:true,on:()=>DEMO||!!(CFG.ticket&&CFG.ticket.wf)},
  {k:'revue',n:'Revue de PR (2e)',a:'les PR relues',ia:true,on:()=>DEMO||(CFG.revue_wf||[]).length>0},
  {k:'retours',n:'Retours de PR (3e)',a:'les commentaires de PR corrigés',ia:true,on:()=>retoursOn()}];
const INSTALL_CMD='python3 tools/install.py', UPDATE_CMD='git pull && python3 tools/publish.py all';
// état d'une capacité : [ton, libellé, ce qu'il faut faire]
function installState(c,now){
  const on=c.on?c.on():DEMO||!!(CFG.workflows||{})[c.k]; // l'id du cron, posé par l'installateur (son calendrier, lui, existe toujours)
  if(!on)return ['info','non installé',`<code>${esc(INSTALL_CMD)}</code> le propose`];
  if(!c.fresh)return ['ok','installé',''];
  if(DEMO)return ['ok','actif','']; // la démo est datée du 1er octobre : pas de retard à calculer
  const src=FRESH_SRC.find(s=>s.key===c.fresh), f=src&&freshness(src,now), failed=((OFFICE&&OFFICE.bureau_failed)||{})[c.fresh];
  if(failed)return ['err','en échec',esc((failed.step?'étape '+failed.step+(failed.err?' : '+failed.err:''):'dernier passage en échec'))+' · « ↻ Relancer » dans Fraîcheur'];
  if(!f)return ['soft','pas encore de données','au premier passage de son cron'];
  if(f.late)return ['warn','en retard',`de ${agoTxt(f.late)} · « ↻ Relancer » dans Fraîcheur`];
  const w=c.warn&&(WARNINGS||{})[c.warn];
  if(w&&w.length)return ['warn','à vérifier',esc(w[0])+(w.length>1?` (+${w.length-1})`:'')];
  return ['ok','actif',''];
}
function installHtml(now){
  const rows=INSTALL_CAPS.map(c=>{const [t,l,act]=installState(c,now);
    return `<tr><td><span class="etat ${t}">${l}</span></td><td><b>${esc(c.n)}</b></td><td>${esc(c.a)}</td>`+
      `<td>${c.ia?'IA, voir la fiche de paie':'0 jeton'}</td><td>${act||'<span class="muted">·</span>'}</td></tr>`;}).join('');
  return `<div class="in-ver">Le Bureau <b>${esc(BUREAU_VERSION)}</b> · mettre à jour : <code>${esc(UPDATE_CMD)}</code></div>`+
    `<table class="in-t"><thead><tr><th>État</th><th>Capacité</th><th>Apporte</th><th>Coût</th><th>Pour agir</th></tr></thead><tbody>${rows}</tbody></table>`+
    '<p class="muted in-note">Un cron publie ses données à chaque passage : son état vient de la fraîcheur et de ses avertissements. Les agents IA coûtent à chaque run (fiche de paie).</p>';
}
const openInstall=()=>openWide('install','État de l\'installation',box=>{box.innerHTML=installHtml(Date.now());});
