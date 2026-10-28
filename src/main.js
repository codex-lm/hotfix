import {createWorld,worldFromTicket} from './core/world.js';
import {runCycle} from './core/sim.js';
import {preview,summarizeTrace} from './core/trace.js';
import {KEY_TO_OP} from './core/opcodes.js';
import {dailySeed,cachedTicket,dailyTickets} from './tickets/daily.js';
import {t,getLanguage,setLanguage,ticketTitle} from './ui/i18n.js';
import {escapeHTML as e,icon,opIcon,starsHTML} from './ui/dom.js';
import {titleHTML} from './ui/title.js';
import {drawArena,describeArena} from './ui/arena.js';
import {programHTML} from './ui/program.js';
import {logHTML,logText} from './ui/log.js';
import {rulesHTML} from './ui/rules.js';
import {postmortemHTML,makePostmortemCard} from './ui/postmortem.js';
import {readSave,writeSave,validateSave,recordBest,checkpoint} from './ui/storage.js';
import {loadAssets} from './ui/assets.js';
import {createAudio} from './ui/audio.js';

const app=document.querySelector('#app');
let save=readSave(),screen='title',session=null,tier=1,selected=0,pending=null,hoverPatch=null,busy=false,activeTick=-1,replayIndex=0,replayTimer=null,loadToken=0,lastSlot=-1;
const audio=createAudio();
if(save.settings.lang)setLanguage(save.settings.lang);else save.settings.lang=getLanguage();
if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)save.settings.reduceMotion=true;
setLanguage(getLanguage());audio.setVolumes(save.settings.music,save.settings.sfx);
const reduced=()=>save.settings.reduceMotion;
let baseForecast=null,patchForecast=null,forecastKey='';
let warmingDaily=false;
function warmDaily(){if(warmingDaily||screen!=='title')return;warmingDaily=true;dailyTickets(new Date(),{onProgress(){if(screen!=='title')throw new Error('Background triage paused');}}).catch(()=>{}).finally(()=>{warmingDaily=false;});}

function header(){return `<header class="site-header"><button class="brand" data-action="home" aria-label="Hotfix · ${t('home')}"><span class="brand-icon">${icon('code',23)}</span><span>hotfix<span class="brand-period">.</span></span></button><span class="brand-tagline">${t('tagline')}</span><nav><span class="system-status"><i></i>${t('live')}</span><button class="header-link" data-action="rules">${t('rules')}</button><button class="icon-button" data-action="settings" aria-label="${t('settings')}">${icon('settings',20)}</button><button class="language-button" data-action="language" aria-label="${t('language')}">${getLanguage().toUpperCase()}<span>↔</span></button></nav></header>`;}
function footer(){return `<footer class="site-footer"><span>${t('footer')}</span><button data-action="about">${t('about')}</button><code>${t('build')}</code></footer><div id="toast" role="status" aria-live="polite"></div><input type="file" id="import-file" accept="application/json,.json" hidden>`;}
function render(){
  clearReplay();
  if(screen==='title'){
    const today=dailySeed();
    app.innerHTML=header()+titleHTML({tier,totalStars:save.progress.stars.reduce((a,b)=>a+b,0),resume:!!save.session,date:today.replace('daily-',''),dailyScore:save.daily?.seed===today&&save.daily.complete?save.daily.results.reduce((s,r)=>s+r.stars,0):null})+footer();drawTitle();warmDaily();
  }else if(screen==='play')renderPlay();
  else if(screen==='result'){
    const done=session.run.kind!=='backlog'&&session.run.index===session.run.tiers.length-1;
    app.innerHTML=header()+postmortemHTML(session,{seriesDone:done})+footer();replayIndex=0;drawReplay();
  }else app.innerHTML=header()+`<main class="loading-page"><div class="triage-spinner">${icon('loop',36)}</div><p class="eyebrow">${t('triage')}</p><h1>${t('titleRuleB')}</h1><p>${t('triageDetail')}</p><div class="triage-line"></div></main>`+footer();
  document.body.classList.toggle('motion-reduced',reduced());
  audio.play(screen==='title'?'title':'gameplay');
}
function titleWorld(){
  const w=9,h=7,tiles=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x===0||y===0||x===w-1||y===h-1)tiles[y*w+x]=1;
  tiles[2*w+4]=1;tiles[3*w+4]=1;tiles[4*w+6]=2;tiles[2*w+6]=2;
  return createWorld({w,h,tiles,conveyors:new Map([[4*w+2,1],[4*w+3,1]]),crates:[{x:6,y:3}],exit:{x:7,y:1},robots:[{id:'r0',x:2,y:3,dir:0,program:['FWD','RIGHT','FWD','FWD','LEFT','FWD']}],maxCycles:6});
}
function drawTitle(){const world=titleWorld();const next=preview(world,'r0',{slot:2,op:'JUMP'});drawArena(document.querySelector('#hero-arena'),world,{patchTrace:next.trace});}
function forecasts(){const key=session.history.length+':'+JSON.stringify(hoverPatch||pending);if(key===forecastKey)return;forecastKey=key;baseForecast=preview(session.world,'r0');patchForecast=hoverPatch||pending?preview(session.world,'r0',hoverPatch||pending):null;}
function renderPlay(){
  const{ticket,world,run}=session,robot=world.robots[0];
  app.innerHTML=header()+`<main class="play-page"><div class="play-breadcrumb"><button data-action="home">${icon('back',15)}${t(run.kind)}</button><span>/</span><code>${e(ticket.id)}</code>${run.kind!=='backlog'?`<span class="series-label">${t('series',{n:run.index+1,total:run.tiers.length})}</span>`:''}${run.practice?`<span class="practice-note">${t('practice')}</span>`:''}</div>
  <section class="incident-heading"><div class="incident-name"><span class="severity sev-${ticket.tier}">${t('tier'+ticket.tier)}</span><h1>${e(ticketTitle(ticket))}</h1><p>${t('reporter',{name:e(ticket.reporter)})} <span>·</span> <code>${e(ticket.id)}</code></p></div><div class="incident-metrics"><div><span>${t('cycle')}</span><strong>${Math.min(world.cycle+(busy?0:1),ticket.cycles)}<small> / ${ticket.cycles}</small></strong></div><div><span>${t('patches')}</span><strong>${session.history.filter(Boolean).length}<small> / ${ticket.par}</small></strong></div><div class="metric-stars">${starsHTML(starsAvailable())}<span>${t('par')} ${ticket.par}</span></div></div></section>
  <div class="game-layout"><section class="arena-panel"><div class="panel-topline"><div><span class="eyebrow">${t('board')}</span><h2>${t('warehouse')}</h2></div><span class="arena-dimensions">${world.w} × ${world.h}</span></div><div class="arena-frame"><canvas id="game-arena" aria-label="${e(describeArena(session.displayWorld||world))}" role="img"></canvas></div><p class="sr-only" id="arena-description">${e(describeArena(session.displayWorld||world))}</p><div class="arena-footer"><div class="trace-legend"><span><i></i>${t('currentPath')}</span><span><i class="orange"></i>${t('patchedPath')}</span></div><button class="speed-button" data-action="speed" aria-label="${t('speed')}">×${save.settings.speed}</button></div><div class="forecast-note"><span class="status-square"></span>${busy?t('running'):ticket.requiredClaims?t(robot.claims?'requirementDone':'requirement'):t('exact')}<span class="forecast-ticks">${busy?`${activeTick+1} / 6`:'01—06'}</span></div></section>
  <div id="program-container">${programHTML(robot,{selected,pending,tick:activeTick,busy,lastSlot})}</div></div>
  <div class="below-board"><p>${t('keyboard')}</p><button data-action="abandon" ${busy?'disabled':''}>${t('abandon')}</button></div>${logHTML(session.log)}<p id="cycle-announcement" class="sr-only" aria-live="polite">${e(session.announcement||'')}</p></main>`+footer();
  drawGame();document.body.classList.toggle('motion-reduced',reduced());
}
function starsAvailable(){const patches=session.history.filter(Boolean).length+(pending?1:0);return patches<=session.ticket.par?3:patches===session.ticket.par+1?2:1;}
function drawGame(options={}){if(!session)return;const canvas=document.querySelector('#game-arena');if(!canvas)return;if(!busy)forecasts();drawArena(canvas,session.displayWorld||session.world,busy?options:{baseTrace:baseForecast?.trace,patchTrace:patchForecast?.trace});}
function refreshProgram(){const container=document.querySelector('#program-container');if(!container)return;container.innerHTML=programHTML(session.world.robots[0],{selected,pending,tick:activeTick,busy,lastSlot});forecastKey='';drawGame();}
function persist(){save.settings.lang=getLanguage();if(session&&(screen==='play'||screen==='result'))checkpoint(save,{seed:session.ticket.seed,tier:session.ticket.tier,history:session.history,run:session.run,elapsed:session.elapsed+Date.now()-session.startedAt,phase:screen==='result'?'result':'play',result:session.result});return writeSave(save);}
function freshSeed(kind){return `${kind}-${Date.now().toString(36)}`;}
function newRun(kind,seed=null){
  if(kind==='sprint'&&save.sprint)return restoreSession(save.sprint);
  const isDaily=kind==='daily',seedValue=seed|| (isDaily?dailySeed():freshSeed(kind));
  const tiers=kind==='sprint'?[1,1,2,2,3,3,4,4]:isDaily?[1,2,2,3,4]:[tier];
  const practice=isDaily&&save.daily?.seed===seedValue&&save.daily.complete;
  if(isDaily&&!practice){if(save.daily?.seed===seedValue&&save.daily.session)return restoreSession(save.daily.session);save.daily={seed:seedValue,results:[],complete:false,session:null};}
  const run={kind,seed:seedValue,index:0,tiers,results:[],practice};
  const ticketSeed=kind==='backlog'?(seed||(!save.progress.best['1:onboarding']&&tier===1?'onboarding':seedValue)):`${seedValue}:0`;
  return loadTicket(ticketSeed,tiers[0],run);
}
async function loadTicket(seed,priority,run,restore=null){
  const token=++loadToken;busy=false;pending=null;hoverPatch=null;selected=0;lastSlot=-1;forecastKey='';screen='loading';render();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
    const generationStart=performance.now();const ticket=await cachedTicket(seed,priority);if(token!==loadToken)return;
    app.dataset.generationMs=String(Math.round(performance.now()-generationStart));app.dataset.ticketSeed=seed;app.dataset.generatorVersion=String(ticket.generatorVersion);
    let world=worldFromTicket(ticket),history=[],frames=[],log=[];
    for(const patch of restore?.history||[]){const before=world,result=runCycle(world,patch?[{robotId:'r0',...patch}]:[]);world=result.world;history.push(patch);frames.push(...result.trace);appendLog(log,before,result,patch);}
    session={ticket,world,history,frames,log,run,startedAt:Date.now(),elapsed:restore?.elapsed||0,displayWorld:null,result:null,announcement:''};
    screen=restore?.phase==='result'?'result':'play';session.result=restore?.result||null;activeTick=-1;persist();render();window.scrollTo({top:0,behavior:'instant'});
    if(screen==='play'&&(world.status==='success'||world.cycle>=ticket.cycles))finish(world.status==='success');
  }catch(error){if(token!==loadToken)return;console.error('Ticket generation failed',error);screen='title';render();toast(t('generationError'));}
}
function restoreSession(saved){return loadTicket(saved.seed,saved.tier,saved.run,saved);}
function resume(){if(save.session)return restoreSession(save.session);}
function appendLog(log,before,result,patch){if(patch)log.push({kind:'patch',version:result.world.robots[0].version,slot:patch.slot,from:before.robots[0].program[patch.slot],to:patch.op});log.push({kind:'cycle',n:result.world.cycle,...summarizeTrace(result.trace,'r0')});}
async function deploy(ship=false){
  if(busy||screen!=='play')return;audio.unlock();audio.play('deploy');
  busy=true;hoverPatch=null;const patch=ship?null:pending?{...pending}:null,before=session.world;
  let result;try{result=runCycle(before,patch?[{robotId:'r0',...patch}]:[]);}catch(error){busy=false;console.error(error);return;}
  session.history.push(patch);session.frames.push(...result.trace);session.world=result.world;appendLog(session.log,before,result,patch);lastSlot=patch?.slot??-1;pending=null;persist();
  for(const frame of result.trace){
    activeTick=frame.tick;session.displayWorld=frame.world;renderPlay();
    const op=frame.world.robots[0].program[frame.tick],duration=reduced()?0:450/save.settings.speed;
    if(duration)await animate(duration,progress=>drawGame({from:frame.before,progress,op}));else drawGame({op});
    for(const event of frame.events)audio.play(event.type);
  }
  session.displayWorld=null;activeTick=-1;busy=false;forecastKey='';session.announcement=t('logCycle',session.log.at(-1));
  if(session.world.status==='success')finish(true);else if(session.world.cycle>=session.ticket.cycles)finish(false);else{persist();renderPlay();document.querySelector(`[data-slot="${selected}"]`)?.focus({preventScroll:true});}
}
function animate(duration,draw){return new Promise(resolve=>{let start=null;function frame(now){start??=now;const p=Math.min(1,(now-start)/duration);draw(p);if(p<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});}
function finish(success){
  if(session.result)return;
  const patches=session.history.filter(Boolean).length,stars=success?(patches<=session.ticket.par?3:patches===session.ticket.par+1?2:1):0;
  session.result={stars,patches,cycles:session.world.cycle,falls:session.world.robots[0].falls,elapsed:session.elapsed+Date.now()-session.startedAt,seed:session.ticket.seed,tier:session.ticket.tier};
  const{run}=session;run.results.push(session.result);recordBest(save,session.ticket.seed,session.ticket.tier,stars);
  screen='result';persist();audio.play(success?'victory':'failure');render();window.scrollTo({top:0,behavior:'instant'});
}
function next(){const run=session.run;if(run.kind!=='backlog'&&run.index<run.tiers.length-1){const nextRun={...run,index:run.index+1};loadTicket(`${run.seed}:${nextRun.index}`,run.tiers[nextRun.index],nextRun);}else{tier=session.ticket.tier;newRun('backlog',freshSeed('backlog'));}}
function chooseOp(op){if(screen!=='play'||busy)return;const current=session.world.robots[0].program[selected];pending=op===current?null:{slot:selected,op};hoverPatch=null;audio.unlock();audio.play('patch');refreshProgram();}
function home(){if(busy)return;++loadToken;if(screen==='play')persist();screen='title';render();}
function clearReplay(){if(replayTimer){clearInterval(replayTimer);replayTimer=null;}}
function drawReplay(){
  const canvas=document.querySelector('#replay-arena');if(!canvas)return;
  replayIndex=Math.max(0,Math.min(session.frames.length,replayIndex));const world=replayIndex?session.frames[replayIndex-1].world:worldFromTicket(session.ticket);drawArena(canvas,world);
  document.querySelector('.replay-panel .mono').textContent=t('tick',{n:replayIndex});document.querySelector('#replay-range').value=replayIndex;
  document.querySelector('#replay-program').innerHTML=world.robots[0].program.map((op,i)=>`<span class="${replayIndex&&session.frames[replayIndex-1].tick===i?'active':''}"><small>${i+1}</small>${opIcon(op,15)}<code>${op}</code></span>`).join('');
}
function modal(content){
  document.querySelector('dialog')?.close();document.querySelector('dialog')?.remove();
  const dialog=document.createElement('dialog');dialog.className='info-dialog';dialog.innerHTML=`<button class="dialog-close icon-button" aria-label="${t('close')}">${icon('close',24)}</button>${content}`;document.body.append(dialog);dialog.querySelector('.dialog-close').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}
function settings(){modal(`<div class="modal-intro"><p class="eyebrow">Hotfix</p><h2>${t('settings')}</h2></div><div class="settings-list"><label><span>${t('reduceMotion')}</span><input type="checkbox" id="setting-motion" ${reduced()?'checked':''}></label><label><span>${t('speed')}</span><select id="setting-speed">${[1,2,4].map(n=>`<option value="${n}" ${save.settings.speed===n?'selected':''}>×${n}</option>`).join('')}</select></label><label><span>${t('music')}</span><input type="range" id="setting-music" min="0" max="1" step="0.05" value="${save.settings.music}"></label><label><span>${t('sound')}</span><input type="range" id="setting-sfx" min="0" max="1" step="0.05" value="${save.settings.sfx}"></label></div><p class="settings-note">${t('silentMedia')}</p>`);document.querySelector('dialog').addEventListener('change',event=>{if(event.target.id==='setting-motion')save.settings.reduceMotion=event.target.checked;if(event.target.id==='setting-speed')save.settings.speed=Number(event.target.value);if(event.target.id==='setting-music')save.settings.music=Number(event.target.value);if(event.target.id==='setting-sfx')save.settings.sfx=Number(event.target.value);audio.unlock();audio.setVolumes(save.settings.music,save.settings.sfx);persist();document.body.classList.toggle('motion-reduced',reduced());});}
let toastTimer;
function toast(message){const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast(t('copied'));}catch{toast(t('clipboardError'));}}
async function card(copyImage=false){const canvas=makePostmortemCard(session);canvas.toBlob(async blob=>{if(!blob)return;if(copyImage){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast(t('copied'));}catch{toast(t('clipboardError'));}}else{download(blob,`hotfix-${session.ticket.id}.png`);toast(t('downloaded'));}},'image/png');}
const actions={
  home,backlog:()=>newRun('backlog'),sprint:()=>newRun('sprint'),daily:()=>newRun('daily'),resume,
  prod:()=>modal(`<div class="modal-intro"><p class="eyebrow">${t('prod')}</p><h2>${t('prodDesc')}</h2><p>${t('aboutEdition')}</p></div>`),
  rules:()=>modal(rulesHTML()),settings,about:()=>modal(`<div class="modal-intro"><p class="eyebrow">Hotfix / v0.1.0</p><h2>${t('titleCaption')}</h2><p>${t('aboutText')}</p><p>${t('aboutEdition')}</p><p>${t('aboutPrivacy')}</p></div>`),
  language:()=>{setLanguage(getLanguage()==='fr'?'en':'fr');persist();render();},
  deploy:()=>deploy(),ship:()=>deploy(true),cancel:()=>{pending=null;hoverPatch=null;refreshProgram();},speed:()=>{save.settings.speed=save.settings.speed===4?1:save.settings.speed*2;persist();document.querySelector('.speed-button').textContent='×'+save.settings.speed;},
  abandon:()=>{if(!busy&&screen==='play')finish(false);},next,
  'replay-ticket':()=>{if(session.run.kind!=='backlog'&&session.run.index<session.run.tiers.length-1)return;const run={kind:'backlog',seed:session.ticket.seed,index:0,tiers:[session.ticket.tier],results:[],practice:session.run.kind==='daily'||session.run.practice};loadTicket(session.ticket.seed,session.ticket.tier,run);},
  'copy-seed':()=>copy(session.ticket.seed),'copy-log':()=>copy(`${session.ticket.id}\n${t('seed')}: ${session.ticket.seed}\n${logText(session.log)}`),
  'download-card':()=>card(),'copy-card':()=>card(true),
  'prev-tick':()=>{clearReplay();replayIndex=Math.max(0,replayIndex-1);drawReplay();},'next-tick':()=>{clearReplay();replayIndex=Math.min(session.frames.length,replayIndex+1);drawReplay();},
  'play-replay':()=>{if(!session.frames.length)return;if(replayTimer){clearReplay();return;}if(replayIndex===session.frames.length)replayIndex=0;replayTimer=setInterval(()=>{replayIndex++;drawReplay();if(replayIndex>=session.frames.length)clearReplay();},450/save.settings.speed);},
  export:()=>{persist();download(new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),'hotfix-save.json');},import:()=>document.querySelector('#import-file').click(),
};
app.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target||target.disabled)return;
  if(target.dataset.action){actions[target.dataset.action]?.();return;}
  if(target.dataset.tier){tier=Number(target.dataset.tier);render();return;}
  if(target.dataset.slot!==undefined&&!busy){selected=Number(target.dataset.slot);hoverPatch=null;refreshProgram();document.querySelector(`[data-slot="${selected}"]`)?.focus({preventScroll:true});return;}
  if(target.dataset.op)chooseOp(target.dataset.op);
});
app.addEventListener('pointerover',event=>{const button=event.target.closest('[data-op]');if(!button||button.disabled||busy||screen!=='play')return;hoverPatch={slot:selected,op:button.dataset.op};forecastKey='';drawGame();});
app.addEventListener('pointerout',event=>{const button=event.target.closest('[data-op]');if(button&&!button.contains(event.relatedTarget)&&hoverPatch){hoverPatch=null;forecastKey='';drawGame();}});
app.addEventListener('submit',event=>{if(event.target.id!=='seed-form')return;event.preventDefault();const seed=new FormData(event.target).get('seed').trim();if(!seed)return toast(t('seedRequired'));newRun('backlog',seed);});
app.addEventListener('input',event=>{if(event.target.id==='replay-range'){clearReplay();replayIndex=Number(event.target.value);drawReplay();}});
app.addEventListener('change',async event=>{
  if(event.target.id!=='import-file'||!event.target.files[0])return;
  try{const file=event.target.files[0];if(file.size>2e6)throw new Error('Too large');save=validateSave(JSON.parse(await file.text()));if(save.settings.lang)setLanguage(save.settings.lang);audio.setVolumes(save.settings.music,save.settings.sfx);writeSave(save);screen='title';session=null;render();toast(t('importOk'));}catch{toast(t('importError'));}
});
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.ctrlKey||event.altKey||event.metaKey)return;
  if(screen==='title'){
    const buttons=['backlog','sprint','daily','prod','rules','about'].map(action=>document.querySelector(`[data-action="${action}"]`)).filter(el=>el&&!el.disabled);
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const index=Math.max(0,buttons.indexOf(document.activeElement));buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.focus();}
    if(event.code==='Space'&&!event.repeat){event.preventDefault();if(document.activeElement?.tagName==='BUTTON')document.activeElement.click();else actions.backlog();}return;
  }
  if(screen!=='play'||busy)return;
  if((event.key==='Enter'||event.code==='Space')&&event.target.closest('button,a,summary'))return;
  if(/^[1-6]$/.test(event.key)){event.preventDefault();selected=Number(event.key)-1;refreshProgram();}
  else if(KEY_TO_OP[event.key.toLowerCase()]){event.preventDefault();chooseOp(KEY_TO_OP[event.key.toLowerCase()]);}
  else if(event.key==='Enter'||event.code==='Space'){event.preventDefault();if(!event.repeat)deploy();}
  else if(event.key==='Escape'){pending=null;hoverPatch=null;refreshProgram();}
  else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){event.preventDefault();selected=(selected+(['ArrowRight','ArrowDown'].includes(event.key)?1:5))%6;refreshProgram();document.querySelector(`[data-slot="${selected}"]`)?.focus();}
  else if(event.key==='+'||event.key==='='){save.settings.speed=Math.min(4,save.settings.speed*2);persist();renderPlay();}
  else if(event.key==='-'){save.settings.speed=Math.max(1,save.settings.speed/2);persist();renderPlay();}
});
window.addEventListener('resize',()=>{if(screen==='title')drawTitle();else if(screen==='play')drawGame();else if(screen==='result')drawReplay();});
window.addEventListener('pagehide',()=>{persist();audio.dispose();});
const unlockAudio=()=>{audio.unlock().then(()=>audio.play(screen==='title'?'title':'gameplay'));};
document.addEventListener('pointerdown',unlockAudio,{once:true});
document.addEventListener('keydown',unlockAudio,{once:true});
render();
loadAssets().then(()=>{if(screen==='title')drawTitle();else if(screen==='play')drawGame();}).catch(error=>console.warn('Optional assets unavailable',error));
document.fonts?.ready.then(()=>{if(screen==='title')drawTitle();else if(screen==='play')drawGame();});
