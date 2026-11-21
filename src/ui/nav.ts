import type { EventSpec } from '../game/career';
import type { Summary } from '../game/drive';
import { classOf, levelInfo, progress, prOf } from '../game/progress';
import { setStage } from '../core/renderer';
import { ui as sfx } from '../core/audio';
import { fmtNum, h, mount, setBackdrop } from './dom';
import { icon } from './icons';
import { openMusic } from './music';
import { openSettings } from './settings';

/** Navigation targets; main.ts fills these in (avoids import cycles). */
export type Tab = 'home' | 'career' | 'garage' | 'events' | 'profile';
export const nav = {
  landing: () => {},
  tab: (_t: Tab, _arg?: string) => {},
  prerace: (_id: string) => {},
  free: (_city?: string) => {},
  drive: (_spec: EventSpec, _vehicle: string) => {},
  results: (_s: Summary) => {},
};

const TABS: { id: Tab; label: string; ic: string }[] = [
  { id: 'home', label: 'Home', ic: 'home' },
  { id: 'career', label: 'Career', ic: 'flag' },
  { id: 'garage', label: 'Garage', ic: 'wrench' },
  { id: 'events', label: 'Events', ic: 'star' },
  { id: 'profile', label: 'Profile', ic: 'user' },
];

export function topBar(): HTMLElement {
  const li = levelInfo();
  return h('div.tbar', {},
    h('button.lvl', { 'aria-label': `Level ${li.level}`, style: `--p:${Math.round(li.pct * 100)}%`, onclick: () => { sfx.tap(); nav.tab('profile'); } }, h('b', {}, String(li.level))),
    h('div.res', {}, h('span.coin-pill', {}, icon('coin', 16), h('b.num', { id: 'coins' }, fmtNum(progress.coins))), h('span.gem-pill', {}, icon('gem', 15), h('b.num', {}, fmtNum(progress.gems)))),
    h('div.spacer'),
    h('button.cbtn.sm', { 'aria-label': 'Music', onclick: () => openMusic() }, icon('music', 18)),
    h('button.cbtn.sm', { 'aria-label': 'Settings', onclick: () => openSettings() }, icon('gear', 18)),
  );
}

export function vehicleBadge(id = progress.vehicle): HTMLElement {
  const pr = prOf(id);
  return h('span.pr', {}, h('i', { class: `cls ${classOf(pr)}` }, classOf(pr)), h('b.num', {}, String(pr)), ' PR');
}

/** Standard tab screen: top bar, scrolling content, bottom tab bar. */
export function shell(tab: Tab, content: HTMLElement, opts: { stage?: boolean; backdrop?: HTMLElement | null; cls?: string } = {}): HTMLElement {
  if (!opts.stage) setStage(null);
  setBackdrop(opts.backdrop ?? null);
  document.body.className = `menu${opts.stage ? ' stage3d' : ''}`;
  const bar = h('nav.tabs', {}, ...TABS.map((t) => h('button', { class: t.id === tab ? 'on' : '', 'aria-label': t.label, onclick: () => { if (t.id !== tab) { sfx.tap(); nav.tab(t.id); } } }, icon(t.ic, 21), h('span', {}, t.label))));
  const screen = h('div', { class: `screen tabbed ${opts.cls ?? ''}`.trim() }, topBar(), h('div.tcontent', {}, content), bar);
  mount(screen);
  return screen;
}
