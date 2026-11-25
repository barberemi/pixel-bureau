// ---------- le marchand de sable (invité on « memoire ») : la mémoire du soir attend ta validation ----------
// Le cron « Le Bureau · mémoire du soir » (workflows/memoire.py) propose chaque soir des leçons pour les agents ; tant que sa
// gate attend, le marchand de sable fait le tour des îlots de l'open space sur son nuage, son ours à côté, et sème du
// sable. Sa bulle : « 🧠 N leçons à valider » (le nombre, lu dans la première ligne de la gate, en rouge). La gate est la
// sienne, comme celle du facteur : sa fiche la montre, le boss la compte une fois. Gate décidée : il repart par la porte.
// L'ours et le nuage ne sont pas des planches : dessinés ici, case par case (1 case = 1 px de toile).
const SAND_WF='Le Bureau · mémoire du soir', SAND_STOP=90e3, SAND_LIFT=12;
const sandmanOwns=g=>g.wf_name===SAND_WF&&!!byKey.g_marchand;
// « 🧠 **Mémoire du soir** · 3 leçons à valider, 1 retirée : … » (workflows/memoire.py, propose) -> 3 ; absent : null
const sandLessons=g=>{const m=/(\d+) leçons? à valider/.exec(String((g&&g.message)||''));return m?+m[1]:null;};
const sandText=n=>n==null?'leçons à valider':n+(n>1?' leçons':' leçon');
// une halte par îlot, de gauche à droite : en haut de l'îlot, au bout de sa table (la case au-dessus du premier rang),
// sinon à côté de sa place du milieu. Il est dessiné devant tout (41-render.js) : son nuage passe par-dessus les bureaux.
function sandStops(){
  const out=[], top=Math.min(...(IROWS||[0]));
  for(const cx of ISLANDS||[]){
    if(walkable(cx,top-1)){out.push([cx,top-1,'down']);continue;}
    const ss=SEATS.filter(s=>s.cx===cx&&s.dir==='right');if(ss.length)out.push(besideSeat([ss[Math.floor(ss.length/2)].x,ss[Math.floor(ss.length/2)].y]));
  }
  return out;
}
function sandmanState(c,t){
  const demo=SCENE_DEMO&&SCENE_DEMO.flag==='memoire'&&t>=SCENE_DEMO.s; // 46-gallery.js : la scène jouée maintenant
  const g=demo?null:(GATES||[]).find(x=>x.wf_name===SAND_WF&&(!x.since||ms(x.since)<=t));
  if(!g&&!demo)return {st:'off',label:'Passe le soir, quand la mémoire a des leçons à te proposer'};
  const s0=demo?SCENE_DEMO.s:ms(g.since)||t, stops=sandStops(), n=demo?3:sandLessons(g);
  const i=stops.length?Math.floor(Math.max(0,t-s0)/SAND_STOP)%stops.length:0;
  const o={st:'gate',zone:stops.length?'visit':'gate',visit:stops[i],cloud:true,hot:n==null?null:sandText(n),
    label:'Te propose '+sandText(n)+' pour les agents (mémoire du soir) : attend ta validation',bubble:'🧠 '+sandText(n)+(n==null?'':' à valider')};
  if(g){c.wf=[String(g.wf).slice(0,8)];o.run={run:g.run,wf_name:g.wf_name,_s:ms(g.since)};} // sa gate est la sienne : sa carte dans sa fiche
  return o;
}
const SAND_PAL={"a": "#2a1c14", "b": "#7a4a2a", "c": "#d9b088", "d": "#ffffff", "e": "#a07850", "f": "#956039", "g": "#7d7aa6", "h": "#e6e4f4", "i": "#fbfaff", "j": "#c3c0dc"};
const SAND_BEAR=[[
    '....aaaa.............aaaa....',
    '...abbbba...........abbbba...',
    '..abbccbba.aaaaaaa.abbccbba..',
    '..abccccbaabbbbbbbaabccccba..',
    '..abccccbabbbbbbbbbabccccba..',
    '..abbccbbabbbbbbbbbabbccbba..',
    '...abbbbabbbbbbbbbbbabbbba...',
    '....aaaabbbbbbbbbbbbbaaaa....',
    '....abbbdabbbbbbbbbdabbba....',
    '....abbbaabbbbbbbbbaabbba....',
    '...abbbbbbbbbbbbbbbbbbbbba...',
    '...abbbbbbbbeaaaebbbbbbbba...',
    '...abbbbbbeeaaaaaeebbbbbba...',
    '...abbbbbeccaaaaaccebbbbba...',
    '...abbbbeccccaaaccccebbbba...',
    '....abbbecccccacccccebbba....',
    '....abbbecccccacccccebbba....',
    '....abbbecccaaaaacccebbba....',
    '.....abbbecccccccccebbba.....',
    '......abbbeeccccceebbba......',
    '.......aabbbeeeeebbbaa.......',
    '...aa..abaabbbbbbbaaba..aa...',
    '..affaabbbbaaaaaaabbbbaaffa..',
    '.affffabbbbbbcccbbbbbbaffffa.',
    'affffffabbbcccccccbbbaffffffa',
    'affffffabbcccccccccbbaffffffa',
    'affffffabbcccccccccbbaffffffa',
    'affffffabcccccccccccbaffffffa',
    'affffffabcccccccccccbaffffffa',
    'affffffabcccccccccccbaffffffa',
    '.affffabbcccccccccccbbaffffa.',
    '..affabbbcccccccccccbbbaffa..',
    '...aaabbbbcccccccccbbbbaaa...',
    '......abbbcccccccccbbba......',
    '......aabbbcccccccbbbaa......',
    '......ababbbbcccbbbbaba......',
    '......accaabbbbbbbaacca......',
    '......accccaaaaaaacccca......',
    '.......cccccc...cccccc.......',
    '........cccc.....cccc........'],[
    '.............................',
    '....aaaa.............aaaa....',
    '...abbbba...........abbbba...',
    '..abbccbba.aaaaaaa.abbccbba..',
    '..abccccbaabbbbbbbaabccccba..',
    '..abccccbabbbbbbbbbabccccba..',
    '..abbccbbabbbbbbbbbabbccbba..',
    '...abbbbabbbbbbbbbbbabbbba...',
    '....aaaabbbbbbbbbbbbbaaaa....',
    '....abbbdabbbbbbbbbdabbba....',
    '....abbbaabbbbbbbbbaabbba....',
    '...abbbbbbbbbbbbbbbbbbbbba...',
    '...abbbbbbbbeaaaebbbbbbbba...',
    '...abbbbbbeeaaaaaeebbbbbba...',
    '...abbbbbeccaaaaaccebbbbba...',
    '...abbbbeccccaaaccccebbbba...',
    '....abbbecccccacccccebbba....',
    '....abbbecccccacccccebbba....',
    '....abbbecccaaaaacccebbba....',
    '.....abbbecccccccccebbba.....',
    '......abbbeeccccceebbba......',
    '.......aabbbeeeeebbbaa.......',
    '...aa..abaabbbbbbbaaba..aa...',
    '..affaabbbbaaaaaaabbbbaaffa..',
    '.affffabbbbbcccccbbbbbaffffa.',
    'affffffabbbcccccccbbbaffffffa',
    'affffffabbcccccccccbbaffffffa',
    'affffffabbcccccccccbbaffffffa',
    'affffffabcccccccccccbaffffffa',
    'affffffabcccccccccccbaffffffa',
    'affffffabcccccccccccbaffffffa',
    '.affffabbcccccccccccbbaffffa.',
    '..affabbbbcccccccccbbbbaffa..',
    '...aa.abbbcccccccccbbba.aa...',
    '......aabbbcccccccbbbaa......',
    '......ababbbcccccbbbaba......',
    '......accaabbbbbbbaacca......',
    '......accccaaaaaaacccca......',
    '.......cccccc...cccccc.......',
    '........cccc.....cccc........']];
const SAND_CLOUD=[
    '....................................................ggggggggg........................................',
    '.................................................ggghhhhhhhhhggg.....................................',
    '...............................................gghhhhhhhhhhhhhhhgg...................................',
    '.............................................gghhhhiiiiiiiiihhhhhhgg.................................',
    '............................................ghhhhiiiiiiiiiiiiihhhhhhg................................',
    '.............................ggggggggg.....ghhhiiiiiiiiiiiiiiiiihhhhhg...............................',
    '..........................ggghhhhhhhhhggg.ghhiiiiiiiiiiiiiiiiiiiiihhhhg.ggggggggg....................',
    '........................gghhhhhhhhhhhhhhhghhiiiiiiiiiiiiiiiiiiiiiiihhhhghhhhhhhhhggg.................',
    '......................gghhhhiiiiiiiiihhhhhhhiiiiiiiiiiiiiiiiiiiiiiihhhhhhhhhhhhhhhhhgg...............',
    '.....................gghhhiiiiiiiiiiiiihhhhiiiiiiiiiiiiiiiiiiiiiiiiihhhhiiiiiiihhhhhhgg..............',
    '....................ghhhiiiiiiiiiiiiiiiiihiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhhg.............',
    '...................ghhhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhg............',
    '..................gghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhg...........',
    '..................ghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhg..........',
    '.................ghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhgg.........',
    '...........ggggggghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhggg.......',
    '........ggghhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhhhhgg.....',
    '......gghhhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhhgg....',
    '.....ghhhhiiiiiiiiihiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhgg...',
    '...gghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhgg..',
    '..gghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhiiiiiiiiiiiiiiiiihiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhg..',
    '..ghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhhhhiiiiiiiiiiiiihhhhiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhg.',
    '.ghhiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhhhhhhhiiiiiiiiihhhhhhhiiiiiiiiiiiiiiiiiiiiiiiiiiiihhhhg.',
    '.ghhiiiiiiiiiiiiiiiiiiiiihiiiiiiiiiiiiihhhhhhhhhhhhhhhhhhhhhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiiiiihhhhhg',
    'ghhhiiiiiiiiiiiiiiiiiiiiihhhiiiiiiiiihhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiihhhhhg',
    'ghhhhiiiiiiiiiiiiiiiiiiihhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhiiiiiiiiiiiiiiihhhhhhg',
    'ghhhhhiiiiiiiiiiiiiiiiihhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhiiiiiiiiiiiiihhhhhhhg',
    'ghhhhhhiiiiiiiiiiiiiiihhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhiiiiiiiiiiihhhhhhhhg',
    'ghhhhhhhhhiiiiiiiiihhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhiiiiiiihhhhhhhhhhg',
    '.ghhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhg.',
    '.ghhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhg.',
    '..ghhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhg..',
    '..gghhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhgg..',
    '...gghhhhhhhhhhhhjjjjjjjjjjjjjhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhjjjjjjjjjjjjjjjhhhhhhhhhhhhhhhhhgg...',
    '.....ghhhhhhhjjjjjjjjjjjjjjjjjjjjjhhhhhhjjjjjjjjjjjjjhhhhhhhjjjjjjjjjjjjjjjjjjjjjjjhhhhhhhhhhhhgg....',
    '......gghhhhjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjhhhhhhhhhgg.....',
    '........gggjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjhhhhhggg.......',
    '...........gjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjgggggg..........',
    '............gjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjgjjjjjjjjjjjjjjjjjjjjjjjg.................',
    '..............gghjjjjjjjjjjjjjhgg..jjjjjjjjjjjjjjjjjjjjjjj..ggghjjjjjjjjjjjjjjjhggg..................',
    '................ggghhhhhhhhhggg.....gghhjjjjjjjjjjjjjhhgg......ggghhhhhhhhhhhggg.....................',
    '...................ggggggggg..........gggghhhhhhhhhgggg...........ggggggggggg........................',
    '..........................................ggggggggg..................................................'];
const SAND_IMG={};
function sandImg(k,rows){
  if(SAND_IMG[k])return SAND_IMG[k];
  const cv=document.createElement('canvas');cv.width=rows[0].length;cv.height=rows.length;const g=cv.getContext('2d');
  rows.forEach((r,y)=>{for(let x=0;x<r.length;x++)if(r[x]!=='.'){g.fillStyle=SAND_PAL[r[x]];g.fillRect(x,y,1,1);}});
  return SAND_IMG[k]=cv;
}
// l'ours à sa droite, puis le nuage par-dessus leurs pieds ; le sable tombe sous le nuage (rien d'animé avec les
// animations réduites). Appelé après le personnage (41-people.js, drawChar), qui est lui-même dessiné SAND_LIFT plus haut.
function drawSandman(c,now){
  if(!c.pos||!c._st||!c._st.cloud||typeof document==='undefined')return;
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y)-SAND_LIFT, f=REDUCED_MOTION?0:Math.floor(now/700)%2, b=REDUCED_MOTION?0:Math.floor(now/900)%2;
  ctx.drawImage(sandImg('ours'+f,SAND_BEAR[f]),x+13,y-40+b);
  ctx.drawImage(sandImg('nuage',SAND_CLOUD),x-38,y-8+b);
  if(REDUCED_MOTION)return;
  for(let k=0;k<7;k++){const p=((now/1600)+k*.37)%1, gx=x-26+((k*37)%64);
    ctx.fillStyle=k%3?'#e8c25a':'#fff2b0';ctx.globalAlpha=1-p;ctx.fillRect(gx,y+32+b+Math.round(p*36),2,2);}
  ctx.globalAlpha=1;
}
