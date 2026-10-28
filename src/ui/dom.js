export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon = (name, size=20) => {
  const paths = {
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', play:'<path d="m9 5 11 7-11 7Z"/>', check:'<path d="m5 12 5 5L20 7"/>',
    code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>', grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    calendar:'<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3v6m8-6v6M4 11h16m-10 5h4"/>',
    bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>', book:'<path d="M12 6v15M3 4c5-1 7 0 9 2 2-2 4-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',
    settings:'<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>', back:'<path d="m10 5-7 7 7 7m-7-7h18"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    loop:'<path d="M20 7H9a6 6 0 0 0 0 12h9M16 3l4 4-4 4"/>', chevron:'<path d="m8 4 8 8-8 8"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    star:'<path d="m12 2 3 6.5 7 .9-5 5 1.2 7-6.2-3.4-6.2 3.4 1.2-7-5-5 7-.9Z"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};
export function opIcon(op,size=24) {
  const paths = {FWD:'<path d="M12 21V3m-6 6 6-6 6 6"/>',BACK:'<path d="M12 3v18m-6-6 6 6 6-6"/>',LEFT:'<path d="M19 21V12a6 6 0 0 0-6-6H4m6-5L4 6l6 5"/>',RIGHT:'<path d="M5 21V12a6 6 0 0 1 6-6h9m-6-5 6 5-6 5"/>',WAIT:'<path d="M6 3h12M6 21h12M8 3v5l8 8v5m0-18v5l-8 8v5"/>',JUMP:'<path d="M4 20V11a8 8 0 0 1 16 0v9m-5-5 5 5 3-5"/>',PUSH:'<rect x="14" y="5" width="7" height="14" rx="1"/><path d="M2 12h10m-4-4 4 4-4 4"/>'};
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[op] || paths.WAIT}</svg>`;
}
export const starsHTML = (count,max=3) => `<span class="stars" aria-label="${count} / ${max}">${Array.from({length:max},(_,i)=>`<span class="${i<count?'earned':''}">${icon('star',20)}</span>`).join('')}</span>`;
