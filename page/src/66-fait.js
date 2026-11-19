// ---------- « 👁 Ce qu'il fait » : ce que fait l'agent d'un poste, dans sa fiche (1er, 2e, 3e, -1) ----------
// Données : le fait d'un bureau, écrit par le relevé de chaque étage (workflows/_lecteurs.py), en trois niveaux qui ne
// dépendent pas d'un seul agent : 1. base (fichiers touchés, rapport du poste fini, compteur de Kronn), 2. carnet de
// l'agent, 3. détail action par action lu par le lecteur de son agent (Claude Code aujourd'hui ; sans lecteur, la fiche le
// dit). Jamais une commande entière ni un chemin absolu : le relevé ne garde que l'outil, le fichier et le premier mot.
// En direct seulement (comme atAct) : le fait dit ce que l'agent fait maintenant, pas à l'heure du rejeu.
const FA_AGENT={ClaudeCode:'Claude Code',Codex:'Codex',GeminiCli:'Gemini',OpenCode:'OpenCode',Vibe:'Vibe',Kiro:'Kiro',CopilotCli:'Copilot',Ollama:'Ollama'};
const FA_ICO={lecture:'📖',recherche:'🔎',modification:'✏️',commande:'▶',rapport:'📝','sous-agent':'👥',autre:'⚙'};
const FA_VERB={lecture:'lit',recherche:'cherche',modification:'modifie',commande:'lance',rapport:'écrit son rapport','sous-agent':'confie',autre:'utilise'};
const FA_PL={lecture:'lectures',recherche:'recherches',modification:'modifications',rapport:'rapports',commande:'commandes','sous-agent':'sous-agents',autre:'autres'};
const FA_COL={lecture:ST_VIF.info,recherche:'#9a7be0',modification:ST_VIF.ok,rapport:ST_VIF.ok,commande:ST_VIF.warn,'sous-agent':'#4fb0c6',autre:'#8a8478'};
const FA_KCAT={Read:'lecture',Execute:'commande',Edit:'modification',Write:'modification',Search:'recherche',Agent:'sous-agent'};
const faAg=a=>FA_AGENT[a]||String(a||'?');
// le relevé est-il celui de l'heure affichée (3 min près, comme atAct) : sinon, rien (le rejeu ne date pas le fait)
const faNear=d=>{const g=d&&d.generated_at;return !!g&&Math.abs(T-Date.parse(g))<=180e3;};
const faAgo=iso=>{const t=Date.parse(iso||'');return isFinite(t)?atAgo(Math.max(0,T-t)):'';};
const faAge=s=>s==null?'':s<60?s+' s':s<3600?Math.floor(s/60)+' min':Math.floor(s/3600)+' h';
const faN=c=>Object.values(c||{}).reduce((a,b)=>a+(+b||0),0);
const faCode=s=>s?'<code>'+esc(s)+'</code>':'';
const faSrc=t=>`<span class="fa-src">${esc(t)}</span>`;
// une action : [heure, catégorie, cible] ; un fichier montre son nom en code et son dossier en petit
function faAct([t,c,x]){
  const f=String(x||''), file=(c==='lecture'||c==='modification'||c==='rapport')&&/\.\w{1,6}( \(\w+\))?$/.test(f), name=file?f.replace(/ \(\w+\)$/,''):f;
  const cible=c==='recherche'?(f?'« '+esc(f)+' »':''):file?faCode(name.split('/').pop())+(name.includes('/')?'<small> '+esc(name.split('/').slice(0,-1).join('/'))+'/</small>':''):faCode(f);
  return `<li><time>${esc(hm(ms(t)))}</time><span class="i">${FA_ICO[c]||'⚙'}</span><span>${FA_VERB[c]||'utilise'} ${cible}</span></li>`;
}
function faBar(c){const ks=Object.keys(FA_PL).filter(k=>c&&c[k]);if(!ks.length)return '';
  return `<div class="fa-bar">${ks.map(k=>`<i style="flex:${c[k]};background:${FA_COL[k]}"></i>`).join('')}</div>`+
    `<div class="fa-leg">${ks.map(k=>`<span><b style="background:${FA_COL[k]}"></b>${c[k]} ${c[k]>1?FA_PL[k]:FA_PL[k].slice(0,-1)}</span>`).join('')}</div>`;}
// la bulle du plan : une phrase coupée à un mot près de n signes
function faShort(p,n){n=n||30;p=String(p||'').replace(/^(Je |J')/,m=>m.toLowerCase()).replace(/[.!?…]$/,'');if(p.length<=n)return p;const c=p.slice(0,n), k=c.lastIndexOf(' ');return (k>8?c.slice(0,k):c)+'…';}
// le texte de la bulle d'un agent au travail : carnet (sans « HH:MM · poste · »), sinon sa dernière phrase lue, sinon ses fichiers modifiés ; null
// sinon (la bulle garde le compteur de Kronn)
function faBulle(f){if(!f)return null;
  if((f.carnet||[]).length)return '« '+faShort(String(f.carnet[0]).replace(/^\d\d:\d\d · [\w-]+ · /,''))+' »';
  const p=f.d&&f.d.phrases;if(p&&p.length)return '« '+faShort(p[p.length-1])+' »';
  if(f.diff&&f.diff.n)return '✏ '+plural(f.diff.n,'fichier modifié','fichiers modifiés');
  return null;}
// 🧮 le compteur de Kronn (niveau 1) : catégorie de la dernière action et nombre d'actions de l'étape
function faKronn(k,label){if(!k||!k.at)return '';const c=FA_KCAT[k.cat]||'autre';
  return `<div class="fa-sub">🧮 Compteur de Kronn${label?' <small>('+esc(label)+')</small>':''}</div><div class="fa-k">${FA_ICO[c]||'⚙'} <b>${plural(+k.n||0,'action','actions')}</b>, dernière : ${esc(c)} <small>${esc(faAgo(k.at))}</small></div>`;}
function faFiles(d,max){const l=d.l||[];
  return `<div class="fa-sub">📂 Fichiers touchés <span class="fa-n">${plural(d.n,'fichier','fichiers')} · <b class="p">+${d.plus||0}</b> <b class="m">−${d.moins||0}</b></span></div>`+
    `<table class="fa-files">${l.slice(0,max).map(([p,a,m,age])=>`<tr><td>${faCode(String(p).split('/').pop())}<small> ${esc(String(p).split('/').slice(0,-1).join('/'))}</small></td><td class="p">+${+a||0}</td><td class="m">${m?'−'+m:''}</td><td class="fa-age">${esc(faAge(age))}</td></tr>`).join('')}</table>`+
    (d.n>Math.min(max,l.length)?`<div class="fa-more">+ ${d.n-Math.min(max,l.length)} autres, plus anciens</div>`:'')+
    (d.commits||[]).map(([t,s])=>`<div class="fa-com">🔖 commité à ${esc(hm(ms(t)))} · ${faCode(s)}</div>`).join('')+
    (d.encours?`<div class="fa-com">✏ ${plural(d.encours,'fichier en cours, pas encore commité','fichiers en cours, pas encore commités')}</div>`:'');}
function faCarnet(c){return `<div class="fa-lvl"><div class="fa-sub">📓 Ce qu'il raconte ${faSrc('écrit par l\'agent dans son carnet')}</div><ol class="fa-car">${c.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`;}
const faNone=f=>`<div class="fa-none">🔍 Détail des actions pas encore lu pour ${esc(faAg(f.ag))}.</div>`;
// le détail (niveau 3) : la dernière phrase en tête (sauf carnet), la répartition, les 10 dernières actions, ce qu'il a dit avant
function faDetail(f,o){const d=f.d, n=faN(d.compte), ph=o.phrases!==false&&!(f.carnet||[]).length?(d.phrases||[]):[];
  return `<div class="fa-lvl"><div class="fa-sub">🔍 Détail ${faSrc('lu dans le journal de '+faAg(f.ag))}</div>`+
    (ph.length?`<blockquote class="fa-say">« ${esc(ph[ph.length-1])} »</blockquote>`:'')+
    `<div class="fa-n">${plural(n,'action','actions')}${d.depuis?' depuis '+esc(hm(ms(d.depuis))):''}${d.partiel?' (fin du journal)':''}</div>${faBar(d.compte)}`+
    ((d.actions||[]).length?`<div class="fa-sub">🕑 Ses ${Math.min(10,d.actions.length)} dernières actions</div><ol class="fa-acts">${d.actions.slice(0,10).map(faAct).join('')}</ol>`:'')+
    (ph.length>1?`<div class="fa-sub">💬 Ce qu'il a dit juste avant</div>${ph.slice(0,-1).reverse().map(p=>`<p class="fa-said">« ${esc(p)} »</p>`).join('')}`:'')+
    `<div class="fa-from">On n'affiche que l'outil, le nom du fichier et le premier mot des commandes (git avec sa sous-commande).</div></div>`;}
// la section « 👁 Ce qu'il fait » d'un agent au travail ; o.phrases=false : jamais de phrase (Support)
function faitHtml(f,o){o=o||{};if(!f)return '';
  const at=(f.k&&f.k.at)||(f.d&&f.d.dernier), lus=(f.lus||[]).slice(0,7);
  return `<section class="fa-do"><h3 class="fa-h">👁 ${esc(o.title||'Ce qu\'il fait')}${at?` <span class="fa-live">● ${esc(faAgo(at))}</span>`:''}${f.ag?`<span class="fa-ag">agent : ${esc(faAg(f.ag))}</span>`:''}</h3>`+
    `<div class="fa-lvl">${f.diff&&f.diff.n?faFiles(f.diff,f.d||(f.carnet||[]).length?5:7):''}`+
    (lus.length?`<div class="fa-sub">📖 Ce qu'il lit <span class="fa-n">${esc(o.lus||'')}</span></div><ul class="fa-lus">${lus.map(p=>`<li>${faCode(String(p).split('/').pop())}<small> ${esc(String(p).split('/').slice(0,-1).join('/'))}</small></li>`).join('')}</ul>`:'')+
    faKronn(f.k)+`<div class="fa-from">${esc(o.base||'Dossier du run et Kronn')} : ne dépend pas de l'agent.</div></div>`+
    ((f.carnet||[]).length?faCarnet(f.carnet):'')+
    (f.d?faDetail(f,o):f.lu===false?faNone(f):'')+'</section>';}
// le dernier poste fini (1er) : son rapport d'abord, puis ses dernières actions repliées
const FA_STAT={a_corriger:['bloq','🔒 Bloquant : renvoie au code'],non_concerne:['skip','Sauté : non concerné'],en_panne:['bloq','🧯 Sans rapport (en panne)']};
function faitRapportHtml(fi){if(!fi||!fi.rapport)return '';const r=fi.rapport, v=FA_STAT[r.statut]||['ok','✓ Validé'];
  return `<section class="fa-do"><h3 class="fa-h">📝 Son rapport <span class="fa-n">fini à ${esc(hm(ms(r.at)))}</span>${fi.ag?`<span class="fa-ag">agent : ${esc(faAg(fi.ag))}</span>`:''}</h3>`+
    `<div class="fa-verdict ${v[0]}">${esc(v[1])}</div>`+(r.resume?`<p class="fa-res">${esc(r.resume)}</p>`:'')+
    (r.constats||[]).map(([g,ou,pb,co])=>`<div class="fa-c ${g==='bloquant'?'bloq':'avis'}"><b>${g==='bloquant'?'Bloquant':'Avis'}</b>${ou?' · '+faCode(ou):''}${pb?'<br>'+esc(pb):''}${co?`<br><span class="fa-fix">→ ${esc(co)}</span>`:''}</div>`).join('')+
    (r.commits!=null?`<div class="fa-com">🔖 ${plural(r.commits,'commit','commits')}</div>`:'')+
    `<div class="fa-from">Rapport du poste (<code>.kronn/chaine/${esc(fi.poste)}.json</code>) ; le texte complet est dans la PR et dans Kronn.</div>`+
    (fi.d&&(fi.d.actions||[]).length?`<details class="fa-det"><summary>▸ Ses dernières actions ${faSrc('lu dans le journal de '+faAg(fi.ag))}</summary><ol class="fa-acts">${fi.d.actions.map(faAct).join('')}</ol></details>`
      :fi.lu===false?faNone(fi):'')+'</section>';}
// les contrôles (1er) : avec un lecteur, un sous-agent par poste ; sinon, une ligne par rapport rendu
function faitSousHtml(f,postes,states,focus){
  const st=states||{}, ks=postes.filter(p=>st[p.k]), rendus=ks.filter(p=>['ok','bloq','avis','skip','err'].includes(st[p.k])).length, sous=f&&f.sous||[];
  const head=`<h3 class="fa-h">👥 Ce qu'ils font <span class="fa-n">${rendus}/${ks.length} rapports rendus</span>${f&&f.ag?`<span class="fa-ag">agent : ${esc(faAg(f.ag))}</span>`:''}</h3>`;
  const lbl=s=>s==='run'?'au travail':s==='skip'?'sauté':s==='bloq'?'bloquant rendu':s==='err'?'en panne':'rapport rendu';
  const rows=ks.map(p=>{const s=st[p.k], x=sous.find(y=>y.poste===p.k), a=x&&x.a;
    return `<div class="fa-card ${s}${focus===p.k?' cur':''}"><div class="fa-agh"><b>${p.i} ${esc(p.n)}</b><span class="fa-st">${x&&s==='run'?'● '+plural(x.n,'action','actions'):esc(lbl(s))}</span></div>`+
      (a?`<div class="fa-agl">${a[1]==='rapport'?'📝 a écrit son rapport':(FA_ICO[a[1]]||'⚙')+' '+(FA_VERB[a[1]]||'utilise')+' '+(a[1]==='recherche'?(a[2]?'« '+esc(a[2])+' »':''):faCode(String(a[2]).replace(/ \(\w+\)$/,'').split('/').pop()))} <small>${esc(faAgo(a[0]))}</small>${x.modele?' <small>· '+esc(x.modele)+'</small>':''}</div>`:'')+
      (x&&x.p?`<div class="fa-agp">« ${esc(x.p)} »</div>`:'')+'</div>';}).join('');
  return `<section class="fa-do">${head}<div class="fa-lvl">${faKronn(f&&f.k,'tous les postes ensemble')}</div>`+
    (sous.length?`<div class="fa-sub">🔍 Un sous-agent par poste ${faSrc('lu dans le journal de '+faAg(f.ag))}</div>`:'')+rows+
    `<div class="fa-from">${sous.length?'La séparation par sous-agent vient du lecteur '+esc(faAg(f.ag))+' (un journal par sous-agent).':f&&f.lu===false?'Une ligne par poste, d\'après les rapports rendus. Le détail par sous-agent demande un lecteur pour '+esc(faAg(f.ag))+', pas encore écrit.':'Une ligne par poste, d\'après les rapports rendus.'}</div></section>`;}
