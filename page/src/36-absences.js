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
