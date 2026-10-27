import en from './locales/en.json' with { type: 'json' };
export const languages = [{ id: 'system', name: 'System / 跟随系统' }, { id: 'zh-CN', name: '简体中文' }, { id: 'en', name: 'English' }];
export function resolveLanguage(preference = 'system', systemLanguage = 'en') {
  const requested = preference === 'system' ? (Array.isArray(systemLanguage) ? systemLanguage[0] : systemLanguage) : preference;
  const locale = String(requested || '').replaceAll('_', '-').toLowerCase();
  if (/^zh(?:$|-cn$|-sg$|-hans(?:-|$))/.test(locale)) return 'zh-CN';
  return 'en';
}
let locale = resolveLanguage('system', typeof navigator !== 'undefined' ? navigator.languages?.[0] || navigator.language : 'en');
const listeners = new Set();
export function setLanguage(preference = 'system', systemLanguage = 'en') {
  const next = resolveLanguage(preference, systemLanguage); if (next !== locale) { locale = next; for (const listener of listeners) listener(); } return locale;
}
export const getLanguage = () => locale;
export const subscribeLanguage = callback => { listeners.add(callback); return () => listeners.delete(callback); };
const sorted = Object.keys(en).sort((a,b) => b.length - a.length);
export function t(value) {
  if (typeof value !== 'string' || locale === 'zh-CN' || !/[\u3400-\u9fff]/.test(value)) return value;
  const leading = /^\s*/.exec(value)[0], trailing = /\s*$/.exec(value)[0], clean = value.trim();
  if (Object.hasOwn(en, clean)) return leading + en[clean] + trailing;
  // Dynamic UI messages may surround a user-provided path/name. Translate only
  // the known surrounding text; never scan and replace inside the user's value.
  const prefix = sorted.find(key => key.length > 1 && clean.startsWith(key));
  const rest = prefix ? clean.slice(prefix.length) : clean;
  const suffix = sorted.find(key => key.length > 1 && rest.endsWith(key));
  if (prefix || suffix) return leading + (prefix ? en[prefix] : '') + (suffix ? rest.slice(0, -suffix.length) + en[suffix] : rest) + trailing;
  return value;
}
export const brandName = () => getLanguage() === 'zh-CN' ? '风车笔记' : 'pinwheel';
export const validLanguagePreference = value => ['system','zh-CN','en'].includes(value);
