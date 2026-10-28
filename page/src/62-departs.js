// ---------- tableau des départs : ce qui tourne sur DEV, STG et PRD de chaque projet ----------
// Panneau d'aéroport au mur (rectangle objects.departs du plan, facultatif) : les mises en prod, la plus récente en haut,
// DEP_ROWS par page, le changement de page en lettres qui défilent ; clic : la fenêtre « Tableau des départs » (DEV, STG
// et PRD de chaque dépôt suivi, LIVE.departs du cron live) ; mode TV : bloc « Les envs » au bout de « Qui fait quoi ».
// Couleurs : variables --dep-* (styles.css, surchargées par le thème d'un pack), lues aussi par le dessin du panneau.
let DEPR=null, DEP_PIN=null, DEP_PAL=null, DEP_SKIN=null; // DEP_PIN : page du panneau figée (captures)
const DEP_ROWS=3, DEP_PAGE_MS=5000, DEP_FLIP_MS=380;
const depRows=()=>(LIVE&&Array.isArray(LIVE.departs)?LIVE.departs:[]).filter(r=>r&&r.repo);
const depName=r=>String(r.label||String(r.repo).split('/').pop());
const depKey=ref=>(String(ref||'').match(/[A-Z][A-Z0-9]+-\d+/)||[null])[0]; // en majuscules : pas « bluegreen-17 »
// en prod à t (rejouable : une mise en prod d'après t n'est pas encore partie), la plus récente d'abord
const depFlights=t=>depRows().filter(r=>r.prd&&r.prd.ref&&!(ms(r.prd.end)>t)).sort((a,b)=>(ms(b.prd.end)||0)-(ms(a.prd.end)||0));
// l'heure si c'est le jour même, sinon le jour (JJ/MM), à l'heure du bureau
const depWhen=(end,t)=>{if(!end)return '';const d=parisDay(ms(end));return d===parisDay(t)?hm(ms(end)):d.slice(8,10)+'/'+d.slice(5,7);};
function depPal(){
  if(DEP_PAL&&DEP_SKIN===UI_SKIN)return DEP_PAL;
  const s=typeof getComputedStyle==='function'?getComputedStyle(document.documentElement):null;DEP_SKIN=UI_SKIN;DEP_PAL={};
  for(const k of ['frame','bg','row','row2','band','band-ink','name','prd','when'])DEP_PAL[k]=s?s.getPropertyValue('--dep-'+k).trim():'#888';
  return DEP_PAL;
}
const DEPARTS_BOARD={y:-1,draw:now=>{
  if(!DEPR)return;
  const {x,y,w,h}=DEPR, P=depPal(), L=depFlights(T), c2=x+Math.round(w*.46), c3=x+w-30, txt=(s,c,a,b)=>{ctx.fillStyle=c;ctx.fillText(s,a,b);};
  R(ctx,x-2,y-2,w+4,h+4,P.frame);R(ctx,x,y,w,h,P.bg);R(ctx,x,y,w,11,P.band);
  ctx.font='bold 8px ui-monospace,Menlo,monospace';
  txt('✈ DÉPARTS',P['band-ink'],x+4,y+9);txt('PRD',P['band-ink'],c2,y+9);txt('LE',P['band-ink'],c3,y+9);
  const n=Math.max(1,Math.ceil(L.length/DEP_ROWS)), pg=DEP_PIN!=null?DEP_PIN%n:Math.floor(now/DEP_PAGE_MS)%n, into=now%DEP_PAGE_MS, flip=DEP_PIN==null&&n>1&&into<DEP_FLIP_MS;
  for(let i=0;i<DEP_ROWS;i++){
    const r=L[pg*DEP_ROWS+i], ry=y+22+i*11;
    R(ctx,x+2,ry-8,w-4,10,P[i%2?'row2':'row']);
    if(r)[[depName(r).toUpperCase().slice(0,10),P.name,x+4],[String(r.prd.ref).slice(0,8),P.prd,c2],[depWhen(r.prd.end,T),P.when,c3]].forEach(([s,c,cx],j)=>
      txt(flip?s.replace(/./g,(ch,k)=>(k+i+j)/12<into/DEP_FLIP_MS?ch:(Math.random()*36|0).toString(36).toUpperCase()):s,c,cx,ry));
  }
  if(!L.length)txt('AUCUN DÉPART',P.when,x+4,y+22);
  for(let p=0;n>1&&p<n;p++)R(ctx,x+w/2-n*3+p*6,y+h-3,3,2,p===pg?P.band:P.row);
}};
// ---------- la fenêtre : un dépôt par ligne, DEV, STG et PRD ----------
const depA=(cls,url,t,tip='')=>`<a class="${cls}" ${hrefOf(url)} target="_blank" rel="noopener" title="${esc(tip)}">${esc(t)}</a>`;
const depWho=o=>{const c=o.by?byChar(o.by):null;return {c,n:c?c.name:o.by||''};};
function depCell(r,env){
  const o=r[env];if(!o||!o.ref)return '<td><span class="dep-none">—</span></td>';
  const gh='https://github.com/'+r.repo, k=!o.tag&&depKey(o.ref), t=k&&ticketOf(k), w=depWho(o),
    pr=!o.tag&&TEAM&&[...TEAM.people.flatMap(p=>p.prs||[]),...(TEAM.other_prs||[])].find(x=>x.head===o.ref&&prRepo(x)===r.repo);
  const v=o.tag?depA(env==='prd'?'dep-prd':'',gh+'/releases/tag/'+encodeURIComponent(o.ref),o.ref)
    :k&&JIRA_BROWSE!=='/browse/'?depA('dep-br',JIRA_BROWSE+k,k,t?t.summary:o.ref):depA('dep-br',gh+'/tree/'+o.ref,o.ref);
  return `<td><div class="dep-l">${v}${pr?depA('dep-pr',pr.url,'PR #'+pr.n,pr.title):''}</div><div class="dep-who">${w.c?`<span data-pt="${esc(w.c.key)}"></span>`:''}${esc(w.n)}</div></td>`;
}
function departsFill(box){
  const L=depRows();
  if(!L.length){box.innerHTML='<div class="empty">Pas encore de déploiement relu.</div>';return;}
  box.innerHTML=`<div class="dep"><table><tr><th>PROJET</th><th>🧪 DEV</th><th>🎭 STG</th><th>🚀 PRD</th></tr>`+
    L.map(r=>`<tr><td class="dep-n">${esc(depName(r))}</td>${depCell(r,'dev')}${depCell(r,'stg')}${depCell(r,'prd')}</tr>`).join('')+
    `</table><p class="dep-key"><b class="dep-br">■</b> ticket (Jira, PR) · <b>■</b> version (release GitHub) · <b class="dep-prd">■</b> en prod</p></div>`;
  for(const e of box.querySelectorAll('[data-pt]'))if(byKey[e.dataset.pt])e.replaceWith(portrait(byKey[e.dataset.pt],24));
}
const openDeparts=()=>openWide('departs','Tableau des départs',departsFill);
// ---------- mode TV : « Les envs », au bout de la colonne qui défile ----------
function tvDeparts(){
  const L=depRows(), line=(r,env)=>{const o=r[env]||{}, w=o.ref?depWho(o):{}, img=w.c?portraitUrl(w.c):'';
    return `<div class="tve-l"><i>${env.toUpperCase()}</i><em class="${!o.ref?'dep-none':env==='prd'?'dep-prd':o.tag?'':'dep-br'}">${esc(!o.ref?'—':o.tag?o.ref:depKey(o.ref)||o.ref)}</em>`+
      `<span>${img?`<img src="${img}" alt="">`:''}${esc(w.n||'')}</span></div>`;};
  return L.length?'<h2>Les envs</h2>'+L.map(r=>`<div class="tve"><b>${esc(depName(r))}</b>${line(r,'dev')}${line(r,'stg')}${line(r,'prd')}</div>`).join(''):'';
}
