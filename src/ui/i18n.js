import fr from '../i18n/fr.js';
import en from '../i18n/en.js';
export const dictionaries = {fr,en};
let lang = typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr' : 'en';
export function setLanguage(value) { lang = value === 'fr' ? 'fr' : 'en'; if (typeof document !== 'undefined') document.documentElement.lang = lang; }
export function getLanguage() { return lang; }
export function t(key, params = {}) {
  const text = dictionaries[lang][key] ?? en[key] ?? key;
  return String(text).replace(/\{(\w+)\}/g, (_,name) => String(params[name] ?? `{${name}}`));
}
export function ticketTitle(ticket) {
  // Generator templates are mapped here so incident descriptions stay translated.
  const aliases = {fall:'ticket.fall',wall:'ticket.wall',loop:'ticket.loop',miss:'ticket.miss',onboarding:'ticket.onboarding'};
  const key = aliases[ticket.titleKey] || ticket.titleKey || 'ticket.miss';
  return dictionaries[lang][key] ? t(key,ticket.titleParams || {}) : t('ticket.miss');
}
