// ---------- absences et télétravail (KT-1) : dataset absences, tiré du planning de l'équipe ----------
// Le cron « Le Bureau · absences » (absences_snapshot.py) publie, par personne et par jour ouvré, deux lettres : le matin
// puis l'après-midi, b au bureau, t en télétravail, a absent (jamais la raison), et les jours fériés. Tout se lit à
// l'instant affiché (rejeu) : absent le matin = arrive vers 13h30, absent l'après-midi = part vers 12h30.
let ABSENCES=null;
function readAbsences(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.absences;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&d.people&&Array.isArray(d.days)?d:null;
  }catch(e){return null;}
}
const ABS_AM_END=13.5, ABS_PM_START=12.5, TT_ALPHA=.45;
const ABS_LABEL={journee:'Absence toute la journée',matin:'Absence ce matin · arrive vers 13h30',aprem:'Absence cet après-midi',ferie:'Jour férié'};
const ABS_SHORT={journee:'absence',matin:'absence ce matin',aprem:'absence cet après-midi',ferie:'férié'};
// deux lettres du jour de t pour ce personnage ('ff' : férié), ou null (rien dans le planning)
function dayCode(c,t){
  if(!ABSENCES)return null;
  const day=parisDay(t);
  if((ABSENCES.ferie||[]).includes(day))return 'ff';
  const p=(ABSENCES.people||{})[c.key];
  return p&&p[day]||null;
}
// à l'instant t : {abs: journee | matin | aprem | ferie | null, tt}
function presenceAt(c,t){
  const v=dayCode(c,t); if(!v)return {abs:null,tt:false};
  if(v==='ff')return {abs:'ferie',tt:false};
  const p=parisHM(t), h=p.h+p.m/60;
  const abs=v==='aa'?'journee':v[0]==='a'&&h<ABS_AM_END?'matin':v[1]==='a'&&h>=ABS_PM_START?'aprem':null;
  return {abs,tt:!abs&&v[h<13?0:1]==='t'};
}
const absentAt=(c,t)=>!!presenceAt(c,t).abs;
// démo : le jeudi 1er octobre, Clark absent, Darryl absent le matin puis en télétravail, Holly en télétravail (les autres au
// bureau ce jour-là : les scènes de la démo restent les mêmes) ; deux semaines tirées au sort autour, Pam absente deux jours
function absencesDemo(){
  const mon=DAY0-((new Date(DAY0+12*36e5).getUTCDay()+6)%7)*864e5, days=[0,1,2,3,4,7,8,9,10,11].map(i=>parisDay(mon+i*864e5)), today=parisDay(DAY0+12*36e5);
  const people={};
  for(const c of chars.filter(x=>x.person&&x.sprite!=='temp')){
    people[c.key]={};
    days.forEach((d,i)=>{const r=hash(keySeed(c.key)%9973,i+3);people[c.key][d]=d===today?'bb':r<.05?'ba':r<.3?'tt':'bb';});
  }
  const set=(k,v)=>{if(people[k])people[k][today]=v;};
  set('p_clark','aa');set('p_darryl','at');set('p_holly','tt');
  if(people.p_pam)for(const d of days.slice(5,7))people.p_pam[d]='aa';
  return {generated_at:new Date(DAY0+9.5*36e5).toISOString(),days,ferie:[days[7]],people,demo:true};
}
// ---------- fiche « Calendrier de l'équipe » : cette semaine et la suivante ----------
const CAL_ICON={b:'●',t:'🏠',a:'—'}, CAL_TXT={b:'au bureau',t:'télétravail',a:'absence'};
function calCell(c,day){
  const today=day===parisDay(T)?' today':'';
  if((ABSENCES.ferie||[]).includes(day))return `<td class="calc ferie${today}" title="Férié">férié</td>`;
  const v=((ABSENCES.people||{})[c.key]||{})[day];
  if(!v)return `<td class="calc none${today}" title="Pas dans le planning"></td>`;
  const [am,pm]=v;
  if(am===pm)return `<td class="calc ${am}${today}" title="${CAL_TXT[am]||''}">${CAL_ICON[am]||''}</td>`;
  return `<td class="calc split${today}" title="matin : ${CAL_TXT[am]||'?'} · après-midi : ${CAL_TXT[pm]||'?'}"><i class="${am}">${CAL_ICON[am]||''}</i><i class="${pm}">${CAL_ICON[pm]||''}</i></td>`;
}
// le calendrier : une fenêtre large, les deux semaines côte à côte ; un nom ferme la fenêtre et ouvre sa fiche
function openCalendar(){openWide('calendar',"📅 Calendrier de l'équipe",box=>{box.innerHTML='';renderCalendar(box);});}
function renderCalendar(side){
  if(!ABSENCES){const p=document.createElement('p');p.className='muted';p.textContent='Pas encore de planning : il arrive avec le cron « absences ».';side.appendChild(p);return;}
  const ppl=chars.filter(c=>c.person&&c.sprite!=='temp'&&(ABSENCES.people||{})[c.key]);
  const fmt=d=>dtf('fr-FR',{weekday:'short',day:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')).replace('.','');
  const table=days=>`<table class="cal"><thead><tr><th></th>${days.map(d=>`<th class="${d===parisDay(T)?'today':''}">${esc(fmt(d))}</th>`).join('')}</tr></thead><tbody>`+
    ppl.map(c=>`<tr><th><a href="#" class="lk lk-who" data-who="${esc(c.key)}">${esc(c.name)}</a></th>${days.map(d=>calCell(c,d)).join('')}</tr>`).join('')+'</tbody></table>';
  const d=ABSENCES.days||[], box=document.createElement('div');box.className='calbox';
  box.innerHTML=`<p class="sub">Qui est là, d'après le planning de l'équipe · ${ABSENCES.demo?'démo':'mis à jour à '+hm(ms(ABSENCES.generated_at))}</p>`+
    `<div class="calweeks"><div><h3>Cette semaine</h3>${table(d.slice(0,5))}</div><div><h3>Semaine prochaine</h3>${table(d.slice(5,10))}</div></div>`+
    `<p class="sub"><span class="calk">●</span> au bureau · 🏠 télétravail · — absence · une case coupée = demi-journée (matin | après-midi)</p>`+
    `<p class="sub">Jamais la raison d'une absence. Un nom ouvre sa fiche.</p>`;
  box.addEventListener('click',e=>{const a=e.target.closest('[data-who]');if(a){e.preventDefault();winGo(a.dataset.who);}});
  side.appendChild(box);
}
// le petit calendrier au mur du bureau du boss (layout objects.calendar), seulement avec un planning
let CALR=null;
const WALL_CAL={y:-1,draw:()=>{
  if(!CALR||!ABSENCES)return;
  const {x,y,w,h}=CALR, top=Math.round(h*.24);
  R(ctx,x,y,w,h,'#5a4630');R(ctx,x+1,y+1,w-2,h-2,'#fdfaf2');R(ctx,x+1,y+1,w-2,top,'#c0392b');
  R(ctx,x+Math.round(w*.3),y-2,2,4,'#333');R(ctx,x+Math.round(w*.7),y-2,2,4,'#333');
  const cw=(w-4)/5, ch=(h-top-4)/2, td=(new Date(T).getDay()+6)%7;
  for(let r=0;r<2;r++)for(let i=0;i<5;i++)R(ctx,Math.round(x+2+i*cw)+1,Math.round(y+top+2+r*ch)+1,Math.max(1,Math.round(cw)-2),Math.max(1,Math.round(ch)-2),r===0&&i===td?'#2f6fd6':'#d9d2c2');
}};
