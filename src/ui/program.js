import { OPS } from '../core/opcodes.js';
import { t } from './i18n.js';
import { escapeHTML as e, opIcon, icon } from './dom.js';

export function programHTML(robot,{selected=0,pending=null,tick=-1,busy=false,lastSlot=-1}={}){
  return `<aside class="program-panel"><div class="program-heading"><div><span class="eyebrow">${t('program')}</span><h2>${t('programSub')}</h2></div><span class="version">v${robot.version}</span></div>
    <div class="slots" role="group" aria-label="${t('program')}">${robot.program.map((op,i)=>{
      const patched=pending?.slot===i;
      return `<button class="slot ${selected===i?'selected':''} ${tick===i?'executing':''} ${patched?'patched':''}" data-slot="${i}" ${busy?'disabled':''} aria-pressed="${selected===i}" aria-label="${e(t('selectSlot',{n:i+1,op}))}"><span class="slot-number">0${i+1}</span><span class="op-glyph">${opIcon(patched?pending.op:op,22)}</span><span class="slot-code">${patched?`<del>${op}</del> ${pending.op}`:op}</span>${patched?'<span class="patch-dot">●</span>':lastSlot===i?`<span class="slot-version">v${robot.version}</span>`:''}</button>`;
    }).join('')}</div>
    <div class="patch-picker"><div class="picker-label"><span>${t('patchSlot',{n:selected+1})}</span><span class="key-hint">1–6</span></div><div class="op-options">${OPS.map(op=>`<button class="op-option ${pending?.slot===selected&&pending.op===op?'chosen':''}" data-op="${op}" ${busy||robot.program[selected]===op?'disabled':''} aria-label="${e(t('selectOp',{op}))}" title="${e(t('op'+op))}">${opIcon(op,20)}<span>${op}</span><kbd>${op[0]==='W'?'W':op==='BACK'?'B':op==='JUMP'?'J':op==='PUSH'?'P':op[0]}</kbd></button>`).join('')}</div></div>
    <div class="patch-status ${pending?'ready':''}"><span>${pending?icon('code',16):icon('info',16)}</span><p>${pending?t('pending'):t('noPatch')}</p>${pending?`<button class="icon-button" data-action="cancel" title="${t('cancel')}">${icon('close',14)}</button>`:''}</div>
    <button class="button deploy" data-action="deploy" ${busy?'disabled':''}>${icon(busy?'loop':'arrow',21)}${busy?t('running'):t('deploy')}<kbd aria-hidden="true">↵</kbd></button>
    <button class="ship-button" data-action="ship" ${busy?'disabled':''}>${t('ship')} ${icon('arrow',16)}</button>
  </aside>`;
}
