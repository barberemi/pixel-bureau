// ---------- le marchand de sable (invité on « memoire ») : la mémoire du soir attend ta validation ----------
// Le cron « Le Bureau · mémoire du soir » (workflows/memoire.py) propose chaque soir des leçons pour les agents ; tant qu'une
// de ses gates attend, le marchand de sable fait le tour des îlots de l'open space sur son nuage, son ours à côté, et sème
// du sable. Deux gates à la suite dans le même run : « boss » (la mémoire) puis « boss_rejeu » (les leçons du rejeu de
// Palpatine pour la fiche impl). Il porte un parchemin par gate qui attend encore (cachet violet : la sienne ; cachet rouge
// et petit éclair : celle du rejeu, annoncée dans la gate boss par sa ligne ⚡) ; celui d'une gate décidée disparaît. Sa
// bulle compte les deux (« 🧠 3 · ⚡ 2 à valider », ou une seule partie), en rouge. Ses gates sont les siennes, comme celle
// du facteur : sa fiche les montre, le boss les compte une fois. Plus rien : il repart par la porte, sur son nuage.
// L'ours, le nuage et les parchemins ne sont pas des planches : dessinés ici, case par case (1 case = 1 px de toile). Il ne
// marche pas : de face, au repos, c'est le nuage qui le porte d'un îlot à l'autre (frameFor, 20-sprites.js).
const SAND_WF='Le Bureau · mémoire du soir', SAND_STOP=90e3, SAND_LIFT=12;
const sandmanOwns=g=>g.wf_name===SAND_WF&&!!byKey.g_marchand;
// « 🧠 **Mémoire du soir** · 3 leçons à valider, 1 retirée : … » (workflows/memoire.py, propose) -> 3 ; absent : null
const sandLessons=g=>{const m=/(\d+) leçons? à valider/.exec(String((g&&g.message)||''));return m?+m[1]:null;};
const sandText=n=>n==null?'leçons à valider':n+(n>1?' leçons':' leçon');
// la gate des leçons du rejeu (« ⚡ **Mémoire du soir · rejeu de Palpatine** · 2 leçons à valider : … », propose_rejeu)
const sandIsRejeu=g=>!!g&&(g.gate==='boss_rejeu'||/^⚡/.test(String(g.message||'')));
// ce qui attend dans une gate du marchand : mem (leçons de la mémoire, null si illisible ; absent dans la gate du rejeu)
// et rejeu (leçons du rejeu : le compte de sa gate, ou celui annoncé par la ligne « ⚡ **Rejeu de Palpatine** · 2 leçons
// à valider ensuite » de la gate boss)
function sandCounts(g){
  if(!g)return {mem:false,rejeu:0};
  if(sandIsRejeu(g))return {mem:false,rejeu:sandLessons(g)||0};
  const r=/⚡ \*\*Rejeu de Palpatine\*\* · (\d+) leçons? à valider/.exec(String(g.message||''));
  return {mem:sandLessons(g),rejeu:r?+r[1]:0};
}
const sandGate=t=>(GATES||[]).find(x=>x.wf_name===SAND_WF&&(t==null||!x.since||ms(x.since)<=t));
// les leçons du rejeu à valider, lues en direct dans la gate ouverte du marchand (0 sinon) : la fiche de Palpatine
// (49-palpatine.js) les montre en priorité, avant REJEU_SUM.lecons.a_valider (relevé du bilan du rejeu)
function sandRejeuLessons(){return sandCounts(sandGate()).rejeu;}
// la bulle : « 🧠 3 · ⚡ 2 à valider », « 🧠 3 leçons à valider » ou « ⚡ 2 leçons à valider » ; hot : le morceau en rouge
function sandBubble(k){
  if(k.mem!==false&&k.rejeu)return {hot:(k.mem==null?'?':k.mem)+' · ⚡ '+k.rejeu,bubble:'🧠 '+(k.mem==null?'?':k.mem)+' · ⚡ '+k.rejeu+' à valider'};
  if(k.mem===false)return {hot:sandText(k.rejeu),bubble:'⚡ '+sandText(k.rejeu)+' à valider'};
  return {hot:k.mem==null?null:sandText(k.mem),bubble:'🧠 '+sandText(k.mem)+(k.mem==null?'':' à valider')};
}
// une halte par îlot : en haut de l'îlot, au bout de sa table (la case au-dessus du premier rang), sinon à côté de sa place
// du milieu. Il est dessiné devant tout (41-render.js) : son nuage passe par-dessus les bureaux. La tournée commence par
// l'îlot du bout le plus proche de la porte (EXIT, par où entrent les invités) : sinon il traversait tout l'étage avant sa
// première halte, et la loupe, qui attend qu'il soit arrivé, figeait la lecture d'une scène le temps de la traversée.
function sandStops(){
  const out=[], top=Math.min(...(IROWS||[0]));
  for(const cx of ISLANDS||[]){
    if(walkable(cx,top-1)){out.push([cx,top-1,'down']);continue;}
    const ss=SEATS.filter(s=>s.cx===cx&&s.dir==='right');if(ss.length)out.push(besideSeat([ss[Math.floor(ss.length/2)].x,ss[Math.floor(ss.length/2)].y]));
  }
  const d=p=>Math.abs(p[0]-EXIT[0])+Math.abs(p[1]-EXIT[1]);
  return out.length>1&&d(out[out.length-1])<d(out[0])?out.reverse():out;
}
function sandmanState(c,t){
  const demo=SCENE_DEMO&&SCENE_DEMO.flag==='memoire'&&t>=SCENE_DEMO.s; // 46-gallery.js : la scène jouée maintenant
  const g=demo?null:sandGate(t);
  if(!g&&!demo)return {st:'off',cloud:true,label:'Passe le soir, quand la mémoire a des leçons à te proposer'}; // il repart sur son nuage, l'ours avec lui
  const s0=demo?SCENE_DEMO.s:ms(g.since)||t, stops=sandStops(), k=demo?{mem:3,rejeu:2}:sandCounts(g), b=sandBubble(k);
  const i=stops.length?Math.floor(Math.max(0,t-s0)/SAND_STOP)%stops.length:0;
  const quoi=[k.mem!==false?sandText(k.mem)+' pour les agents':'',k.rejeu?sandText(k.rejeu)+' du rejeu de Palpatine':''].filter(Boolean).join(' et ');
  const o={st:'gate',zone:stops.length?'visit':'gate',visit:stops[i],cloud:true,hot:b.hot,scrolls:{mem:k.mem!==false,rejeu:!!k.rejeu},
    label:'Te propose '+quoi+' (mémoire du soir) : attend ta validation',bubble:b.bubble};
  if(g){c.wf=[String(g.wf).slice(0,8)];o.run={run:g.run,wf_name:g.wf_name,_s:ms(g.since)};} // ses gates sont les siennes : leur carte dans sa fiche
  return o;
}
const SAND_PAL={"a": "#2a1c14", "b": "#7a4a2a", "c": "#d9b088", "d": "#ffffff", "e": "#a07850", "f": "#956039", "g": "#7d7aa6", "h": "#e6e4f4", "i": "#fbfaff", "j": "#c3c0dc",
  "k": "#f3e6bf", "l": "#c9a86a", "m": "#7a3fb0", "n": "#b3122e", "o": "#ffd23f"};
// les parchemins sur son nuage : cachet violet (la mémoire), cachet rouge et petit éclair (les leçons du rejeu)
const SAND_SCROLL=[
    '.aaaaaaaa..',
    'akkkkkkkka.',
    '.allllllla.',
    '.akkkkkkka.',
    '.akllllkka.',
    '.akkkkkkka.',
    '.akllkmmm..',
    '.akkkmmmmm.',
    '.akkkmmmmm.',
    '.akkkmmmmm.',
    '.alllkmmm..',
    'akkkkkkkka.',
    '.aaaaaaaa..'];
const SAND_SCROLL_R=SAND_SCROLL.map((r,y)=>y===7?'.akkknnnon.':y===8?'.akkknnoon.':y===9?'.akkknonnn.':r.replace(/m/g,'n'));
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
// l'ours à sa droite, les parchemins à sa gauche, puis le nuage par-dessus leurs pieds ; le sable tombe sous le nuage
// (rien d'animé avec les animations réduites). Appelé après le personnage (41-people.js, drawChar), qui est lui-même
// dessiné SAND_LIFT plus haut.
function drawSandman(c,now){
  if(!c.pos||!c._st||!c._st.cloud||typeof document==='undefined')return;
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y)-SAND_LIFT, f=REDUCED_MOTION?0:Math.floor(now/700)%2, b=REDUCED_MOTION?0:Math.floor(now/900)%2;
  ctx.drawImage(sandImg('ours'+f,SAND_BEAR[f]),x+13,y-40+b);
  const sc=c._st.scrolls||{};
  if(sc.mem)ctx.drawImage(sandImg('parchemin',SAND_SCROLL),x-34,y-3+b);
  if(sc.rejeu)ctx.drawImage(sandImg('parchemin_r',SAND_SCROLL_R),sc.mem?x-22:x-30,y-2+b);
  ctx.drawImage(sandImg('nuage',SAND_CLOUD),x-38,y-8+b);
  if(REDUCED_MOTION)return;
  for(let k=0;k<7;k++){const p=((now/1600)+k*.37)%1, gx=x-26+((k*37)%64);
    ctx.fillStyle=k%3?'#e8c25a':'#fff2b0';ctx.globalAlpha=1-p;ctx.fillRect(gx,y+32+b+Math.round(p*36),2,2);}
  ctx.globalAlpha=1;
}
