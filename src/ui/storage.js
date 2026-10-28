const KEY='hotfix.v1';
const defaults=()=>{const mobile=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;return{schemaVersion:1,progress:{best:{},stars:[0,0,0,0],tickets:0},session:null,sprint:null,daily:null,settings:{lang:null,speed:1,reduceMotion:false,music:mobile?0:0.18,sfx:mobile?0:0.45}};};
export function validateSave(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schemaVersion!==1)throw new Error('Invalid save version');
  const clean=defaults();
  if(value.progress?.best&&typeof value.progress.best==='object')for(const[key,item]of Object.entries(value.progress.best).slice(0,10000)){
    if(key.length<=240&&item&&Number.isInteger(item.stars)&&item.stars>=0&&item.stars<=3&&Number.isInteger(item.tier)&&item.tier>=1&&item.tier<=4)clean.progress.best[key]={stars:item.stars,tier:item.tier};
  }
  for(const item of Object.values(clean.progress.best))clean.progress.stars[item.tier-1]+=item.stars;
  clean.progress.tickets=Object.values(clean.progress.best).filter(item=>item.stars>0).length;
  const settings=value.settings||{};
  clean.settings={lang:['fr','en'].includes(settings.lang)?settings.lang:null,speed:[1,2,4].includes(settings.speed)?settings.speed:1,reduceMotion:settings.reduceMotion===true,music:Math.max(0,Math.min(1,Number(settings.music??clean.settings.music)||0)),sfx:Math.max(0,Math.min(1,Number(settings.sfx??clean.settings.sfx)||0))};
  if(value.daily&&/^daily-\d{4}-\d{2}-\d{2}$/.test(value.daily.seed)&&Array.isArray(value.daily.results)&&value.daily.results.length<=5){
    clean.daily={seed:value.daily.seed,results:value.daily.results.map(validResult),complete:value.daily.complete===true,session:validateSession(value.daily.session)};
  }
  clean.session=validateSession(value.session);
  clean.sprint=validateSession(value.sprint);
  return clean;
}
function validateSession(session){
  if(session&&typeof session.seed==='string'&&session.seed.length<=200&&Number.isInteger(session.tier)&&session.tier>=1&&session.tier<=4&&Array.isArray(session.history)&&session.history.length<=6){
    const ops=['FWD','BACK','LEFT','RIGHT','WAIT','JUMP','PUSH'];
    if(session.history.every(p=>p===null||(p&&Number.isInteger(p.slot)&&p.slot>=0&&p.slot<6&&ops.includes(p.op)))){
      let run=null;
      if(session.run&&['sprint','daily','backlog'].includes(session.run.kind)&&Array.isArray(session.run.tiers)&&session.run.tiers.length<=8&&session.run.tiers.every(n=>Number.isInteger(n)&&n>=1&&n<=4)&&Number.isInteger(session.run.index)&&session.run.index>=0&&session.run.index<session.run.tiers.length&&typeof session.run.seed==='string'&&session.run.seed.length<=200){
        run={kind:session.run.kind,tiers:session.run.tiers,index:session.run.index,seed:session.run.seed,results:(session.run.results||[]).slice(0,8).map(validResult),practice:session.run.practice===true};
      }
      const phase=session.phase==='result'?'result':'play';
      if(run&&run.results.length===run.index+(phase==='result'?1:0))return{seed:session.seed,tier:session.tier,history:session.history.map(p=>p?{slot:p.slot,op:p.op}:null),run,elapsed:Math.max(0,Math.min(Number(session.elapsed)||0,1e9)),phase,result:phase==='result'?{...validResult(session.result),elapsed:Math.max(0,Math.min(Number(session.result?.elapsed)||0,1e9))}:null};
    }
  }
  return null;
}
function validResult(result){return{stars:Math.max(0,Math.min(3,Math.floor(Number(result?.stars)||0))),patches:Math.max(0,Math.min(6,Math.floor(Number(result?.patches)||0))),cycles:Math.max(0,Math.min(6,Math.floor(Number(result?.cycles)||0))),falls:Math.max(0,Math.min(100,Math.floor(Number(result?.falls)||0))),seed:String(result?.seed||'').slice(0,200),tier:Math.max(1,Math.min(4,Math.floor(Number(result?.tier)||1)))};}
export function checkpoint(save,snapshot){
  // Independent series checkpoints survive opening an unrelated Backlog ticket.
  const stored=JSON.parse(JSON.stringify(snapshot));
  save.session=stored;
  const run=stored.run,complete=stored.phase==='result'&&run.index===run.tiers.length-1;
  if(run.kind==='sprint')save.sprint=complete?null:stored;
  if(run.kind==='daily'&&!run.practice){save.daily={seed:run.seed,results:run.results,complete,session:complete?null:stored};}
  if(stored.phase==='result'&&(run.kind==='backlog'||complete))save.session=null;
  return save;
}
export function readSave(){try{const text=localStorage.getItem(KEY);return text?validateSave(JSON.parse(text)):defaults();}catch{return defaults();}}
export function writeSave(save){try{localStorage.setItem(KEY,JSON.stringify(save));return true;}catch{return false;}}
export function recordBest(save,seed,tier,stars){const key=`${tier}:${seed}`,old=save.progress.best[key];if(!old||stars>old.stars)save.progress.best[key]={stars,tier};save.progress.stars=[0,0,0,0];for(const item of Object.values(save.progress.best))save.progress.stars[item.tier-1]+=item.stars;save.progress.tickets=Object.values(save.progress.best).filter(v=>v.stars>0).length;}
export const SAVE_KEY=KEY;
