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
const KRONN_MIN='0.15.2'; // MIN_VERSION de tools/install.py : la page dépasse 1 000 000 octets, la limite des Kronn plus anciens
// ---------- l'écran mural : l'adresse du mode TV, faite avec kronn.ui et l'id de cette page ----------
// Kronn passe les paramètres de l'adresse autonome (/standalone/pages/<id>?tv=1…) à la page (75-tv.js, applyViewParams).
// Les choix restent jusqu'au rechargement (la fenêtre suit les données, wideRefresh) ; l'étage par défaut alterne
// les étages occupés quand il y en a plusieurs.
const WALL={floor:null,scene:'',loupe:''};
const WALL_FLOORS={'-1':'-1',0:'RDC',1:'1er',2:'2e',3:'3e'};
const pageIdOf=d=>d&&d.page&&typeof d.page.id==='string'&&d.page.id?d.page.id:null;
function wallUrl(id){
  const fl=WALL.floor!==null?WALL.floor:floorsOn().length>1?'alt':'0';
  const q=['tv=1',fl!=='0'?'floor='+fl:'',WALL.scene?'scene='+WALL.scene:'',WALL.loupe?'loupe='+WALL.loupe:''].filter(Boolean).join('&');
  return KRONN_BASE.replace(/\/*$/,'/')+'standalone/pages/'+(id?encodeURIComponent(id):'<id de la page>')+'?'+q;
}
function wallHtml(){
  const fl=WALL.floor!==null?WALL.floor:floorsOn().length>1?'alt':'0';
  const chip=(k,v,t,on)=>`<button type="button" class="in-chip" data-wall="${k}" data-v="${esc(v)}" aria-pressed="${on}">${esc(t)}</button>`;
  const floors=(floorsOn().length>1?[chip('floor','alt','Alterner',fl==='alt')]:[]).concat(
    [...floorsOn()].sort((a,b)=>a-b).map(f=>chip('floor',String(f),WALL_FLOORS[f],fl===String(f))));
  return '<div class="in-wall"><h3>📺 Adresse de l\'écran mural</h3><div class="in-opts">'+
    `<span>Étage</span>${floors.join('')}<span>Démarrer</span>${chip('scene','','Plan',!WALL.scene)}${chip('scene','standup','Daily',WALL.scene==='standup')}`+
    `<span>Loupe</span>${chip('loupe','','oui',!WALL.loupe)}${chip('loupe','0','non',WALL.loupe==='0')}</div>`+
    `<div class="in-url"><input type="text" readonly aria-label="Adresse de l'écran mural" value="${esc(wallUrl(pageIdOf(window.KronnPageData)))}">`+
    '<button type="button" class="on" data-wall-copy>📋 Copier</button></div><p class="muted in-note" aria-live="polite">'+
    'À ouvrir dans le navigateur du poste branché à l\'écran : il doit joindre le Kronn de cette installation (même machine ou réseau). '+
    'Faite avec <code>kronn.ui</code> de ta config et l\'id de cette page.</p></div>';
}
function wallClick(e,box){
  const b=e.target.closest('[data-wall],[data-wall-copy]');if(!b)return;
  if(b.dataset.wall){WALL[b.dataset.wall]=b.dataset.v;box.innerHTML=installHtml(Date.now());box.querySelector(`[data-wall="${b.dataset.wall}"][aria-pressed="true"]`).focus();return;}
  const inp=box.querySelector('.in-url input'),note=box.querySelector('.in-wall .in-note'),said=t=>{note.textContent=t;};
  const pick=()=>{inp.focus();inp.select();said('Adresse sélectionnée : ⌘C (ou Ctrl+C) pour la copier.');}; // presse-papiers refusé par le cadre de Kronn
  try{navigator.clipboard.writeText(inp.value).then(()=>said('Adresse copiée.'),pick);}catch(err){pick();}
}
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
  const wall='<tr><td><span class="etat ok">prêt</span></td><td><b>Écran mural (mode TV)</b></td><td>la page en plein écran pour l\'open space</td>'+
    '<td>0 jeton</td><td>l\'adresse ci-dessous</td></tr>';
  return `<div class="in-ver">Le Bureau <b>${esc(BUREAU_VERSION)}</b> · il faut Kronn ${KRONN_MIN} ou plus · mettre à jour : <code>${esc(UPDATE_CMD)}</code></div>`+
    `<table class="in-t"><thead><tr><th>État</th><th>Capacité</th><th>Apporte</th><th>Coût</th><th>Pour agir</th></tr></thead><tbody>${rows}${wall}</tbody></table>`+wallHtml()+
    '<p class="muted in-note">Un cron publie ses données à chaque passage : son état vient de la fraîcheur et de ses avertissements. Les agents IA coûtent à chaque run (fiche de paie).</p>';
}
const openInstall=()=>openWide('install','État de l\'installation',box=>{box.innerHTML=installHtml(Date.now());box.onclick=e=>wallClick(e,box);});
