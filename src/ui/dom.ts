import { ui as sfx } from '../core/audio';
import { icon } from './icons';

/** Tiny element builder: h('div.card', {onclick}, children) */
export function h<T extends HTMLElement = HTMLElement>(tag: string, attrs: Record<string, unknown> = {}, ...children: (Node | string | null | undefined | false)[]): T {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div') as T;
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function mount(screen: HTMLElement): void {
  document.getElementById('ui')!.replaceChildren(screen);
}

/** Layer behind the 3D canvas (gradients, giant type). */
export function setBackdrop(el: HTMLElement | null): void {
  const b = document.getElementById('backdrop')!;
  if (el) b.replaceChildren(el); else b.replaceChildren();
}

export function toast(msg: string, ms = 2400): void {
  const box = document.getElementById('toasts')!;
  if (box.lastElementChild?.textContent === msg) return; // no stacking of the same message
  const el = h('div.toast', {}, msg);
  box.replaceChildren(el);
  setTimeout(() => el.remove(), ms);
}

/** Button. kind: 'primary' | 'ghost' | 'glass' plus size modifiers ('lg', 'sm', 'icon'). */
export function btn(kind: string, label: string | null, onClick: (e: Event) => void, ic?: string, trailing = false): HTMLButtonElement {
  const b = h<HTMLButtonElement>('button', { class: `btn ${kind}`, type: 'button', onclick: (e: Event) => { sfx.tap(); onClick(e); } });
  if (ic && !trailing) b.append(icon(ic));
  if (label) b.append(h('span', {}, label));
  if (ic && trailing) b.append(h('i.trail', {}, icon(ic, 18)));
  if (!label && ic) b.setAttribute('aria-label', ic);
  return b;
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
