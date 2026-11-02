// ---------- galerie des scènes (« Comment lire le plan ») : ce que ce bureau sait jouer, et « ▶ voir » pour le montrer ----------
// Une scène = ce que la loupe sait zoomer : un déclencheur précis, un début et une fin, quelqu'un qui fait quelque chose
// de reconnaissable (pas les états qui durent : travailler, l'hologramme du soir). La liste se tire de l'installation :
// hérauts et invités du pack, passions du roster, canard, courrier et console Support s'ils sont branchés.
// « ▶ voir » joue la scène à l'heure affichée : SCENE_DEMO (00-config.js) que lisent les fonctions de scène, faux événement
// dans une copie des données d'équipe, lecture accélérée ; à la fin (ou « ✕ Revenir »), la journée revient telle quelle.
const galIso=t=>new Date(t).toISOString();
const galDev=()=>chars.find(c=>c.person&&!c.boss&&c.roleKind!=='qa'&&c.seat&&c.team&&(c.team.tickets||[]).length)||null;
const galQa=()=>chars.find(c=>c.person&&c.roleKind==='qa'&&c.team)||null;
const galTk=c=>c&&c.team&&(c.team.tickets||[])[0]?c.team.tickets[0].key:'SCENE_DEMO-1';
const galTeam=(ev,mp)=>{TEAM=Object.assign({},TEAM,{events:[...((TEAM&&TEAM.events)||[]),...(ev||[])],meps:[...((TEAM&&TEAM.meps)||[]),...(mp||[])]});};
const galFx=(kind,extra)=>()=>{FX.cur.set('demo',{id:'demo',kind,t0:performance.now(),...extra});};
// {fam, ico, n (nom), d (ce qu'on voit), w (quand en vrai), c (portrait), ok (jouable maintenant), why, play: {len, speed, setup(s)}}
function galleryScenes(){
  if(FLOOR===1)return atGalleryScenes(); // 68-atelier.js : au 1er étage, seulement ses scènes
  if(FLOOR===-1)return csGalleryScenes(); // 68-caserne.js : au sous-sol, celles de la caserne
  const out=[], add=x=>out.push(x), dev=galDev(), qa=galQa(), sm=chars.find(c=>c.roleKind==='sm');
  const team=(x,need)=>add({fam:'Équipe et cérémonies',ok:need!==false,why:'Il manque quelqu\'un dans l\'équipe pour la jouer',...x});
  team({ico:'🛸',n:'Soucoupe-mère',d:'Un ticket entre dans le sprint : elle va chercher '+(sm?sm.name:'la facilitatrice'),w:'Ajout au sprint après le planning',
    play:{len:20e3,speed:1,setup:s=>galTeam([{t:galIso(s),kind:'sprint_in',key:galTk(dev),summary:'Démonstration',points:5,who:dev&&dev.team.id,who_name:dev&&dev.person}])}},!REDUCED_MOTION);
  const h=chars.find(c=>c.guest&&c.on==='reopen');
  if(h)team({ico:'⛔',n:h.name,c:h,d:'Ticket réouvert : face-à-face en salle de réunion',w:'Passage en Reopen dans Jira',
    play:{len:HERALD_MS+60e3,speed:10,setup:s=>galTeam([{t:galIso(s),kind:'move',key:galTk(dev),summary:'Démonstration',from:FLOW.test,to:FLOW.reopened,cat:'doing',who:qa&&qa.team.id,who_name:qa&&qa.person}])}},!!(dev&&qa&&dev!==qa&&standoff()));
  const y=chars.find(c=>c.guest&&c.on==='prod');
  team({ico:'🎉',n:(y?y.name+' et la ':'La ')+'fête de mise en prod',c:y,d:'L\'auteur sur la scène du plateau TV, le boss au sax',w:'Fin d\'une mise en prod réussie',
    play:{len:90e3+HERALD_MS,speed:10,setup:s=>galTeam(null,[{tag:'démo',name:'Démonstration',ticket:galTk(dev),summary:'Démonstration',who:dev&&dev.team.id,who_name:dev&&dev.person,
      released:galIso(s-60e3),staging:null,prod:{start:galIso(s),end:galIso(s+90e3),status:'completed',conclusion:'success'}}])}},!!dev);
  team({ico:'📁',n:'Ticket livré au testeur',d:'Le dev porte le dossier jusqu\'au testeur',w:'Passage en test',
    play:{len:SCENE_TELL+30e3,speed:10,setup:s=>galTeam([{t:galIso(s),kind:'move',key:galTk(dev),summary:'Démonstration',from:'En cours',to:FLOW.test,cat:'test',who:dev&&dev.team.id,who_name:dev&&dev.person}])}},!!(dev&&qa&&dev!==qa));
  team({ico:'☀️',n:'Daily',d:'Toute l\'équipe en cafétéria',w:RHYTHM.daily,play:{len:3*60e3,speed:10,setup:s=>{SCENE_DEMO.flag='daily';}}});
  team({ico:'🏁',n:'Lancement du sprint',d:'L\'équipe devant le mur Kanban',w:'Premier jour du sprint',play:{len:2*60e3,speed:10,setup:s=>{SCENE_DEMO.flag='kickoff';}}},!!(TEAM&&TEAM.sprint));
  team({ico:'🔄',n:'Rétrospective',d:'L\'équipe en salle de réunion, l\'animateur en bout de table',w:'Selon le rythme de l\'équipe',play:{len:3*60e3,speed:10,setup:s=>{SCENE_DEMO.flag='retro';}}});
  team({ico:'🍕',n:'Pizzas de fin de sprint',d:'À la table de la cafétéria',w:'Dernier jour du sprint, midi',play:{len:2*60e3,speed:10,setup:s=>{SCENE_DEMO.flag='pizza';}}});
  for(const c of chars.filter(c=>c.guest&&!['reopen','prod','mep'].includes(c.on))){
    const g={fam:'Invités',c,ok:true};
    const visit=len=>s=>{SCENE_DEMO.visit={c,v:{s,e:s+len,r:rng(keySeed(c.key)*7919+daySeed(s))}};};
    if(c.on==='coffee'){const n=chars.filter(p=>p.person&&p.seat).length+1;
      add({...g,ico:'☕',n:c.name+' · tournée de café',d:c.role||'Un café pour chaque présent',w:'Vers 16 h, jours ouvrés',play:{len:n*120e3+COFFEE_BREW,speed:30,setup:visit(n*120e3+COFFEE_BREW)}});}
    else if(c.on==='cleaning')add({...g,ico:'🧹',n:c.name+' · ménage du soir',d:c.role||'Le tour du bureau vide, avec son chariot',w:'Le soir des jours ouvrés, une heure',
      play:{len:CLEAN_DUR,speed:60,setup:visit(CLEAN_DUR)}});
    else if(c.on==='mail'){const acc=typeof mailAccounts==='function'?mailAccounts().filter(a=>a.ok):[];
      if(acc.length)add({...g,ico:'📮',n:c.name+' · le courrier',d:c.role||'Dépose le courrier aux boîtes',w:'À l\'arrivée d\'un courrier',
        play:{len:POST_STAY+60e3,speed:10,setup:s=>{SCENE_DEMO.flag='post';}}});}
    else add({...g,ico:'👋',n:c.name+' · visite',d:c.role||'De passage',w:c.tour?'Sa tournée, la nuit':'Une fois dans la journée',play:{len:3*60e3,speed:10,setup:visit(3*60e3)}});
  }
  for(const c of chars.filter(c=>c.person&&c.seat&&passionOf(c)&&PASSION_MOMENTS[passionOf(c).moment])){
    const m=PASSION_MOMENTS[passionOf(c).moment];
    add({fam:'Passions',c,ok:true,ico:m.bubble,n:c.name+' · '+passionOf(c).moment,d:m.label,w:'Une fois par jour ouvré',
      play:{len:m.min*60e3,speed:4,setup:s=>{SCENE_DEMO.passion={c,sl:{s,e:s+m.min*60e3}};}}});
  }
  if(DUCKGAME){add({fam:'Petits moments',ok:true,ico:'🏆',n:'Le canard : un succès',d:'L\'insigne qui se pose sur le canard',w:'Un succès débloqué',play:{len:8e3,speed:1,setup:galFx('trophy',{tr:DUCK_TROPHIES[0]})}});
    add({fam:'Petits moments',ok:true,ico:'🐣',n:'Le canard : éclosion',d:'L\'œuf se fend',w:'Les points du sprint',play:{len:8e3,speed:1,setup:galFx('hatch',{from:'oeuf',to:'caneton'})}});}
  const ag=chars.find(c=>!c.person&&!c.visitor&&!c.guest&&c.present);
  if(ag)add({fam:'Petits moments',ok:true,c:ag,ico:'✅',n:'Un agent rétabli',d:'Les agents au travail l\'applaudissent',w:'Un succès après une panne',play:{len:8e3,speed:1,setup:galFx('recover',{c:ag})}});
  const sp=typeof spAgent==='function'&&SUPPORT&&spAgent();
  if(sp)add({fam:'Petits moments',ok:true,c:sp,ico:'🧯',n:sp.name+' : feu éteint',d:'Réponse postée dans le fil Support',w:'3 min après la réponse',
    play:{len:3*60e3,speed:10,setup:s=>{SUPPORT=Object.assign({},SUPPORT,{threads:[...(SUPPORT.threads||[]),{id:'demo',from:'Démonstration',at:galIso(s-120e3),text:'Démonstration',url:'',state:'done',replies:1,mine:{at:galIso(s),text:'Démonstration'}}]});}}});
  return out;
}
function renderGallery(){
  const box=document.getElementById('gallery'); if(!box||!DATA)return;
  const L=galleryScenes(); GAL_LIST=L; const fams=[...new Set(L.map(x=>x.fam))];
  box.innerHTML=`<h3>🎬 Les scènes ${FLOOR===1?'du 1er étage':FLOOR===-1?'de la caserne':'du bureau'}</h3><p class="gal-s">${FLOOR===1?'Ce que l\'atelier d\'implémentation sait jouer.':FLOOR===-1?'Ce que la caserne Support sait jouer.':'Ce que ton bureau sait jouer, tiré de ton équipe, de tes invités et de ce qui est branché.'} « ▶ voir » la joue tout de suite sur le plan${FLOOR===-1?'':', avec la loupe'} ; ta journée reprend ensuite.${FLOOR?' Les scènes du rez-de-chaussée sont sur le RDC.':[atelierOn()&&'du 1er étage sont sur le 1er',caserneOn()&&'de la caserne sont au -1'].filter(Boolean).map(x=>' Celles '+x+'.').join('')}</p>`+
    fams.map(f=>`<h4>${esc(f)}</h4><div class="gal-grid">${L.map((x,i)=>x.fam!==f?'':`<div class="gal-c">${x.c&&portraitUrl(x.c)?`<img class="gal-pt" src="${portraitUrl(x.c)}" alt="">`:`<span class="gal-i" aria-hidden="true">${x.ico}</span>`}`+
      `<span><b>${esc(x.n)}</b><small>${esc(x.d)}<br><i>${esc(x.w)}</i></small></span><button data-gal="${i}"${x.ok?'':` disabled title="${esc(x.why)}"`}>▶ voir</button></div>`).join('')}</div>`).join('');
}
let GAL_LIST=[];
// heure de la démonstration : celle affichée aux heures de bureau, sinon 11 h du dernier jour ouvré (le soir, la nuit, le
// week-end, tout le monde est rentré) ; la journée revient ensuite à l'heure d'avant
function demoTime(t){
  if(officeOpen(t))return t;
  let d=parisMidnight(t);
  for(let i=0;i<7&&RHYTHM.weekend.includes(parisHM(d+12*36e5).wd);i++)d=parisMidnight(d-12*36e5);
  return d+11*36e5;
}
function demoStart(x){
  if(SCENE_DEMO)demoEnd();
  const saved={T,mode,SPEED,TEAM,SUPPORT:typeof SUPPORT!=='undefined'?SUPPORT:null,ATELIER}; // ATELIER : 68-atelier.js
  const t0=demoTime(T); if(t0!==T){T=t0;needTeleport=true;}
  const s=T+4e3;
  SCENE_DEMO={n:x.n,s,e:s+x.play.len,hard:performance.now()+Math.max(30e3,x.play.len/x.play.speed+60e3),saved};
  x.play.setup(s);
  MOVES_MEMO={team:null,list:[]};UFO_M={};
  setSpeed(x.play.speed);setMode('play');
  const wrap=cv.parentElement;
  const b=document.createElement('div');b.className='demo-ban';b.id='demoban';
  b.innerHTML=`<span>🎬 Démonstration · <b>${esc(x.n)}</b></span><button type="button">✕ Revenir</button>`;
  b.querySelector('button').onclick=()=>demoEnd();
  wrap.appendChild(b);
  const st=document.querySelector('.stage');if(st)st.scrollIntoView({behavior:SCROLL_BEHAVIOR,block:'start'});
}
function demoEnd(){
  if(!SCENE_DEMO)return;
  const v=SCENE_DEMO.saved; SCENE_DEMO=null;
  TEAM=v.TEAM; if(v.SUPPORT!==null)SUPPORT=v.SUPPORT;
  if(typeof csReset==='function'&&FLOOR===-1)csReset(); // 68-caserne.js : la caserne revient telle quelle, sans faire partir de camion
  if(ATELIER!==v.ATELIER){ATELIER=v.ATELIER;AT_MEM.fresh=true;AT_MEM.src=null;AT_MEM.scenes=[];AT_MEM.leaving=[null,null,null,null];} // l'atelier revient tel quel, sans rejouer
  MOVES_MEMO={team:null,list:[]};UFO_M={};FX.cur.clear();
  LOUPE.queue=[];LOUPE.resume=false;if(LOUPE.cur)loupeHide();
  T=v.T;setSpeed(v.SPEED);setMode(v.mode);needTeleport=true;
  const b=document.getElementById('demoban');if(b)b.remove();
}
// à chaque image : la démonstration finit quand sa scène est passée et que la loupe et les petites scènes sont terminées
function galleryFrame(now){
  if(!SCENE_DEMO)return;
  if(now>SCENE_DEMO.hard||T>=SCENE_DEMO.e&&!LOUPE.cur&&!LOUPE.queue.length&&!FX.cur.size)demoEnd();
}
{
  const det=document.querySelector('.legend-help');
  if(det){
    const g=document.createElement('div');g.id='gallery';g.className='gal';det.appendChild(g);
    det.addEventListener('toggle',()=>{if(det.open)renderGallery();});
    g.addEventListener('click',e=>{const b=e.target.closest('[data-gal]');if(!b)return;const x=GAL_LIST[+b.dataset.gal];if(x&&x.ok)demoStart(x);});
  }
}
