import en from './en.json';
import si from './si.json';

export type Lang = 'en' | 'si';
type Dict = Record<string, string>;
const dicts: Record<Lang, Dict> = { en, si };

const LS_KEY = 'picco.lang';
let current: Lang = (() => {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'en' || v === 'si') return v;
  } catch { /* storage blocked */ }
  return navigator.language?.startsWith('si') ? 'si' : 'en';
})();

const listeners = new Set<(l: Lang) => void>();

export function lang(): Lang {
  return current;
}

/** Translate a key. Missing Sinhala strings fall back to English, then to the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? dicts.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
  applyI18n(document.body);
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fill every element carrying data-i18n / data-i18n-placeholder under root. */
export function applyI18n(root: ParentNode): void {
  document.documentElement.lang = current;
  document.documentElement.dataset.lang = current;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder!);
  });
}

/** Translation keys present in English but missing in Sinhala (used by the QA check). */
export function missingSinhala(): string[] {
  return Object.keys(dicts.en).filter((k) => !(k in dicts.si));
}
