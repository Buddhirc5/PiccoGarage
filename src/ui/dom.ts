import { applyI18n } from '../i18n';
import { ui as sfx } from '../core/audio';

/** Tiny element builder: h('div.card', {onclick}, children) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: string,
  attrs: Record<string, unknown> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div') as HTMLElementTagNameMap[K];
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'i18n') el.dataset.i18n = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const ui = () => document.getElementById('ui')!;

/** Replace the current screen. */
export function mount(screen: HTMLElement): void {
  const root = ui();
  root.replaceChildren(screen);
  applyI18n(screen);
}

export function toast(msg: string, ms = 2600): void {
  const el = h('div.toast', {}, msg);
  document.getElementById('toasts')!.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Button with a click sound. */
export function btn(cls: string, i18nKey: string | null, onClick: (e: Event) => void, icon?: string): HTMLButtonElement {
  const b = h<'button'>(`button.btn.${cls.split(' ').join('.')}`, {
    onclick: (e: Event) => { sfx.click(); onClick(e); },
  });
  if (icon) b.append(h('span.i', { 'aria-hidden': 'true' }, icon));
  if (i18nKey) b.append(h('span', { i18n: i18nKey }));
  return b;
}

export const GOOGLE_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
