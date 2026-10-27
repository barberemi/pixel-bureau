// ---------- « 🚀 Déployer la branche » d'une PR, hors prod (modèle deploy) ----------
// Sous « Sur la PR », une ligne par env du réglage deploy de son dépôt (CFG.deploy_envs) : ce qui l'occupe (LIVE.envs,
// relu chaque minute par le cron live), puis un bouton qui lance le modèle sur la ligne actions.deploys « dépôt#n|env ».
// Env pris par la branche de quelqu'un d'autre : « ⇄ Remplacer… », et la fenêtre de la carte Kronn le dit avant Lancer.
// Juste après un lancement, « ⏳ demandé » jusqu'à ce que le run GitHub arrive (DP_ASKED, ce navigateur, 15 min au plus).
const DP_ASK_MS=15*60e3;
let DP_ASKED={};try{DP_ASKED=JSON.parse(localStorage.getItem('bureau:deploy')||'{}')||{};}catch(e){DP_ASKED={};}
for(const k in DP_ASKED)if(!(Date.now()-DP_ASKED[k]<DP_ASK_MS))delete DP_ASKED[k];
const dpSave=()=>{try{localStorage.setItem('bureau:deploy',JSON.stringify(DP_ASKED));}catch(e){}};
// [{repo, env}] où déployer la branche de cette PR ; [] hors réglage, sans le modèle ou PR mergée
function dpEnvs(p){
  if(!ACTIONS.deploy||!p||p.merged||!p.head)return [];
  const r=Object.keys(CFG.deploy_envs||{}).find(k=>String(k).toLowerCase()===String(prRepo(p)).toLowerCase());
  return r?CFG.deploy_envs[r].map(env=>({repo:r,env})):[];
}
// état d'un env vu de cette PR : o (occupant), mine (la branche de cette PR), asked (lancé d'ici, run pas encore vu),
// run (déploiement en cours), ko (dernier run en échec), who (son personnage), other (quelqu'un d'autre l'occupe)
function dpState(p,repo,env){
  const k=repo+'|'+env, o=((LIVE&&LIVE.envs)||{})[k]||null, a=DP_ASKED[k];
  const asked=a&&Date.now()-a<DP_ASK_MS&&!(o&&ms(o.start)>=a-60e3)?a:null;
  const who=o&&o.by?byChar(o.by):null, boss=chars.find(c=>c.boss);
  const mine=!!o&&!o.tag&&o.ref===p.head;
  return {k,o,asked,mine,who,run:!!o&&o.status!=='completed',ko:!!o&&o.status==='completed'&&o.conclusion!=='success',
    other:!!o&&!mine&&!(who&&who===boss)};
}
// écart arrondi à l'unité qui parle : 40 s, 4 min, 2 h, 3 j
const dpSpan=d=>d<60e3?Math.max(0,Math.round(d/1e3))+' s':d<36e5?Math.round(d/60e3)+' min':d<864e5?Math.floor(d/36e5)+' h':Math.floor(d/864e5)+' j';
const dpAgo=t=>dpSpan(Math.max(0,T-ms(t)));
const dpWho=s=>s.who?s.who.name:s.o.by||'quelqu\'un';
const dpRef=s=>s.mine?'ta branche':s.o.ref||'?';
// ce qui occupe l'env, en une ligne
function dpOcc(s){
  const run=s.o&&s.o.url?` · <a href="${esc(s.o.url)}" target="_blank" rel="noopener">run ↗</a>`:'';
  if(s.asked)return `<em>⏳ demandé</em> · lancé il y a ${esc(dpSpan(Math.max(0,Date.now()-s.asked)))}`;
  if(!s.o)return '<em>libre</em> · aucun déploiement récent';
  if(s.run)return `<em>⏳ ${esc(dpRef(s))} arrive</em> · lancé il y a ${esc(dpAgo(s.o.start))}`+(s.mine?'':' · '+esc(dpWho(s)))+run;
  if(s.ko)return `<em>❌ échec</em> · ${esc(dpRef(s))} · lancé il y a ${esc(dpAgo(s.o.start))}`+run;
  return `<em>${s.mine?'✅ ta branche':esc(s.o.tag?s.o.ref+' (version)':s.o.ref)}</em> · ${esc(dpWho(s))} · il y a ${esc(dpAgo(s.o.end||s.o.start))}`+run;
}
// libellé du bouton, ou null quand il est grisé (déploiement de cette branche déjà en route)
function dpLabel(s){
  if(s.asked||s.run&&s.mine)return null;
  if(s.mine)return s.ko?'↻ Relancer':'↻ Redéployer';
  return s.other?'⇄ Remplacer…':'🚀 Déployer';
}
const dpHead=c=>c?`<b>${esc(c.name)}</b> déploie la branche`:'<b>Déployer la branche</b>'; // son agent, sinon le titre seul
function deployBlock(box,p){
  const envs=dpEnvs(p);if(!envs.length)return;
  const rows=new Set(((ACTS&&ACTS.deploys)||[]).map(d=>d.id));
  const host=document.createElement('div');host.className='relaunch la dp';host.setAttribute('data-kronn-action-slot-host','');
  const c=actAgent('bureau-deploy'); // un agent par bouton des fiches ; sans agent, la fusée
  if(c)host.appendChild(agentFace(c,'la-av'));else host.innerHTML='<div class="la-av" aria-hidden="true">🚀</div>';
  const t=document.createElement('div');t.className='la-t';
  t.innerHTML=`<div class="la-n">${dpHead(c)}</div><div class="rl-s">Construit <code class="dp-br">${esc(p.head)}</code> et la pousse sur un env partagé. Qui l'occupe en ce moment :</div>`;
  const list=document.createElement('div');list.className='dp-envs';
  for(const {repo,env} of envs){
    const s=dpState(p,repo,env), E=env.toUpperCase(), id=prId(p)+'|'+env, label=dpLabel(s);
    const row=document.createElement('div');row.className='dp-env'+(s.run||s.asked?' run':s.ko?' ko':'');
    row.innerHTML=`<b class="dp-n">${esc(E)}</b><div class="dp-o"></div>`;
    const o=row.querySelector('.dp-o');if(s.who&&!s.asked)o.appendChild(portrait(s.who,20));
    o.insertAdjacentHTML('beforeend',`<span>${dpOcc(s)}</span>`);
    const b=document.createElement('button');b.type='button';
    if(!label||!rows.has(id)){
      b.disabled=true;b.textContent=label||'↻ Redéployer';
      b.title=label?'PR pas encore relevée par le cron équipe : le bouton arrive au prochain relevé':'Déploiement en cours';
    }else{
      b.textContent=label;b.setAttribute('data-kronn-action','bureau-deploy');
      b.setAttribute('data-kronn-bindings',JSON.stringify(bindsFor('bureau-deploy',{id})));
      new MutationObserver(()=>{if(b.getAttribute('data-kronn-action-state')==='succeeded'){DP_ASKED[s.k]=Date.now();dpSave();}})
        .observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
      const warn=s.other?`⚠ ${E} porte ${s.o.tag?'la version '+s.o.ref:s.o.ref} de ${dpWho(s)} (il y a ${dpAgo(s.o.start)}) : en la remplaçant, son test s'arrête. Préviens-le s'il teste encore.`
        :'Hors prod seulement : le workflow refuse tout env ou dépôt hors réglage, et tout workflow de prod.';
      kronnModal(host,b,(s.other?'Remplacer ':'Déployer sur ')+E,{ico:'🚀',tag:label.replace(/…$/,''),name:p.head+' sur '+E,small:warn});
    }
    row.appendChild(b);list.appendChild(row);
  }
  t.appendChild(list);
  t.insertAdjacentHTML('beforeend','<div class="dp-safe">🔒 Hors prod seulement : jamais la prod.</div>');
  host.appendChild(t);box.appendChild(host);
}
// ---------- état d'une PR partagé par le Kanban, la fiche et les listes : CI et envs où tourne sa branche ----------
const PR_CI={ok:['✓ CI','var(--ok)','CI verte'],ko:['✗ CI','var(--err)','CI en échec'],run:['⏳ CI','var(--warn)','CI en cours']};
const DP_ICO={dev:'🧪',stg:'🎭',staging:'🎭'};
// [{env, ico, run, since}] : les envs (dataset live) dont le dernier déploiement est la branche de la PR, réussi ou en cours
function prEnvs(p){
  if(!p||!p.head||!LIVE||!LIVE.envs)return [];
  const r=String(prRepo(p)).toLowerCase()+'|';
  return Object.entries(LIVE.envs).filter(([k,o])=>k.toLowerCase().startsWith(r)&&o&&!o.tag&&o.ref===p.head&&(o.status!=='completed'||o.conclusion==='success'))
    .map(([k,o])=>{const env=k.slice(r.length);return {env,ico:DP_ICO[env]||'🚀',run:o.status!=='completed',since:o.end||o.start};});
}
// l'adresse de l'env de branche d'une PR (relevée dans le commentaire du bot par le cron équipe), en entier, cliquable
function prEnvLine(p){
  if(!p||!safeUrl(p.env_url))return '';
  return `<div class="tk-env">🌿 <a ${hrefOf(p.env_url)} target="_blank" rel="noopener">${esc(p.env_url.replace(/^https:\/\//,''))}</a>`+
    `<small>env de branche${p.env_at?' · prêt '+esc(spWhen(p.env_at)):''}</small></div>`;
}
// ---------- « 🌿 Générer l'env de branche » : où en est le build de l'env de la PR ----------
// Le dernier build de sa branche (LIVE.branch_envs, workflow env.workflow relu chaque minute par le cron live) et son
// adresse (p.env_url, cron équipe) ; juste après un clic d'ici, « ⏳ demandé » jusqu'au run GitHub (EB_ASKED, ce
// navigateur, 15 min au plus), comme pour les envs partagés. step : none, asked, run, ko ou ok.
const EB_ASK_MS=15*60e3;
let EB_ASKED={};try{EB_ASKED=JSON.parse(localStorage.getItem('bureau:envbranch')||'{}')||{};}catch(e){EB_ASKED={};}
for(const k in EB_ASKED)if(!(Date.now()-EB_ASKED[k]<EB_ASK_MS))delete EB_ASKED[k];
const ebSave=()=>{try{localStorage.setItem('bureau:envbranch',JSON.stringify(EB_ASKED));}catch(e){}};
function ebState(p){
  const r=String(prRepo(p)).toLowerCase()+'|'+p.head, all=(LIVE&&LIVE.branch_envs)||{};
  const o=p.head&&all[Object.keys(all).find(k=>k.toLowerCase()===r.toLowerCase())]||null, a=EB_ASKED[prId(p)];
  const asked=a&&Date.now()-a<EB_ASK_MS&&!(o&&ms(o.start)>=a-60e3)?a:null, url=safeUrl(p.env_url);
  const step=asked?'asked':o&&o.status!=='completed'?'run':o&&o.conclusion!=='success'?'ko':o||url?'ok':'none';
  return {k:prId(p),o,asked,url,step};
}
// l'état en une ligne, puis les trois étapes : label posé › build AWS › en ligne (l'adresse, cliquable)
function ebHtml(s){
  const run=s.o&&safeUrl(s.o.url)?` · <a ${hrefOf(s.o.url)} target="_blank" rel="noopener">run ↗</a>`:'';
  const line={none:'<em>Pas encore d\'env</em> · le bouton pose le label',
    asked:`<em>⏳ demandé</em> · il y a ${esc(dpSpan(Math.max(0,Date.now()-s.asked)))}, GitHub démarre`,
    run:`<em>⏳ construction en cours</em> · lancée il y a ${esc(dpAgo(s.o&&s.o.start))}${run}`,
    ko:`<em>❌ build en échec</em> · il y a ${esc(dpAgo(s.o&&(s.o.end||s.o.start)))}${run}`,
    ok:`<em>✅ en ligne</em>${s.o?' · construit il y a '+esc(dpAgo(s.o.end||s.o.start)):''}${run}`}[s.step];
  const build=s.step==='asked'?['cur','attend GitHub']:s.step==='run'?['cur','en cours']:s.step==='ko'?['ko','en échec']:s.step==='ok'?['done','fait']:['','—'];
  const live=s.url?`<a ${hrefOf(s.url)} target="_blank" rel="noopener">${s.step==='ok'?'ouvrir ↗':'version d\'avant ↗'}</a>`:s.step==='ok'?'adresse au prochain relevé':'—';
  return `<div class="dp-envs"><div class="dp-env eb-l${s.step==='run'||s.step==='asked'?' run':s.step==='ko'?' ko':''}"><div class="dp-o"><span>${line}</span></div></div></div>`+
    `<div class="eb-st"><div class="${s.step==='none'?'':'done'}"><b>1 · label</b>${s.step==='none'?'à poser':'posé'}</div>`+
    `<div class="${build[0]}"><b>2 · build</b>${build[1]}</div><div class="${s.step==='ok'&&s.url?'done':''}"><b>3 · en ligne</b>${live}</div></div>`;
}
// sous le bouton de l'env (launchBlock) : son état, et le clic retenu pour « ⏳ demandé »
function ebMount(host,p){
  const s=ebState(p), t=host.querySelector('.la-t'), b=host.querySelector('button[data-kronn-action]');
  if(t)t.insertAdjacentHTML('beforeend',ebHtml(s));
  host.classList.remove('off'); // grisé pendant le build : le bouton seul, l'état reste lisible
  if(b)new MutationObserver(()=>{if(b.getAttribute('data-kronn-action-state')==='succeeded'){EB_ASKED[s.k]=Date.now();ebSave();}})
    .observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
}
