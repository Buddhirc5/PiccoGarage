import { fx, ui as sfx } from '../core/audio';
import { TYPE_INFO, EVENTS } from '../game/career';
import { city } from '../game/data';
import type { Summary } from '../game/drive';
import { challengeLabel, eventUnlocked, levelInfo } from '../game/progress';
import { setBackdrop, fmtNum, fmtTime, h, mount } from './dom';
import { setStage } from '../core/renderer';
import { icon } from './icons';
import { nav } from './nav';
import { shareCard } from './share';

export function showResults(s: Summary): void {
  setStage(null); setBackdrop(null);
  document.body.className = 'menu';
  const e = s.spec, ti = TYPE_INFO[e.type];
  const won = s.result.position === 1;
  const failed = e.type !== 'free' && !s.result.finished;
  const big = e.type === 'free' ? `${s.stats.km.toFixed(1)}KM` : s.result.position ? `P${s.result.position}` : failed ? 'FAIL' : `${s.stars}★`;
  const headline = e.type === 'free' ? 'Drive complete' : failed ? 'Not this time' : won ? 'You won!' : s.stars === 3 ? 'Perfect run' : s.stars ? 'Event complete' : 'Finished';
  const starsRow = e.type === 'free' ? null : h('div.bigstars', {}, ...[0, 1, 2].map((i) => h('i', { class: i < s.stars ? 'on' : '', style: `--i:${i}` }, icon('star', 34))));
  const li = levelInfo();
  const stat = (k: string, v: string) => h('div', {}, h('span', {}, k), h('b.num', {}, v));
  const rows: [string, string][] = [['Distance', `${s.stats.km.toFixed(2)} km`], ['Time', fmtTime(s.stats.time)], ['Top speed', `${Math.round(s.stats.topKmh)} km/h`]];
  const rows2: [string, string][] = [['Best drift', fmtNum(s.stats.driftBest)], ['Near misses', String(s.stats.nearMisses)], ['Overtakes', String(s.stats.overtakes)]];
  if (s.stats.passengers) rows2[2] = ['Passengers', String(s.stats.passengers)];
  if (s.stats.escaped || s.stats.caught) rows2[1] = ['Police', s.stats.caught ? `Caught ${s.stats.caught}` : `Escaped ${s.stats.escaped}`];
  const next = s.stars > 0 ? EVENTS.find((x) => x.chapter === e.chapter && x.idx === e.idx + 1) ?? EVENTS.find((x) => x.chapter === e.chapter + 1 && x.idx === 0) : undefined;
  const fill = h('i');

  mount(h('div.screen.results', {},
    h('div.giant', { class: `giant${big.length > 3 ? ' t' : ''}` }, big),
    h('div.body', {},
      h('div.a', { style: '--i:0' }, h('span.tag', {}, icon(ti.icon, 14), `${ti.name} · ${city(e.city).name}`)),
      h('h1.title.a', { style: 'text-align:left;--i:1' }, headline),
      starsRow,
      s.newBest ? h('div.a.newbest', { style: '--i:2' }, icon('trophy', 15), 'New personal best') : null,
      h('div.rw.a', { style: '--i:3' }, h('span', {}, icon('coin', 18), h('b.num', {}, `+${fmtNum(s.coins)}`)), h('span', {}, icon('star', 18), h('b.num', {}, `+${fmtNum(s.xp)} XP`)), s.gems ? h('span', {}, icon('gem', 18), h('b.num', {}, `+${s.gems}`)) : null),
      h('div.stats.a', { style: '--i:4' }, ...rows.map(([k, v]) => stat(k, v))),
      h('div.stats.a', { style: '--i:5' }, ...rows2.map(([k, v]) => stat(k, v))),
      ...s.challenges.map((c) => h('div.chdone.a', { style: '--i:6' }, icon('check', 15), `Challenge done: ${challengeLabel(c)} · +${fmtNum(c.reward)}`)),
      h('div.xp.a', { style: '--i:6' }, h('div.lb', {}, h('span', {}, `Level ${li.level}`), h('span.num', {}, `${fmtNum(li.into)} / ${fmtNum(li.next)} XP`)), h('div.t', {}, fill)),
      next && eventUnlocked(next) ? h('button.cta.a', { style: '--i:7', onclick: () => nav.prerace(next.id) }, h('span', {}, `Next: ${next.title.replace(/^\S+ /, '')}`), h('i', {}, icon('right', 20)))
        : h('button.cta.a', { style: '--i:7', onclick: () => nav.prerace(e.id) }, h('span', {}, e.type === 'free' ? 'Drive again' : 'Try again'), h('i', {}, icon('rotate', 20))),
      h('div.acts.a', { style: '--i:8' },
        h('button.pbtn', { onclick: () => nav.tab('home') }, icon('home', 17), 'Home'),
        next ? h('button.pbtn', { onclick: () => nav.prerace(e.id) }, icon('rotate', 17), 'Retry') : null,
        h('button.pbtn', { onclick: () => shareCard(s) }, icon('share', 17), 'Share')),
    )));
  setTimeout(() => (fill.style.width = `${li.pct * 100}%`), 50);
  if (failed) sfx.deny(); else { sfx.buy(); for (let i = 0; i < s.stars; i++) setTimeout(() => fx.star(i), 500 + i * 260); }
  if (s.levelUp) setTimeout(() => levelUp(s.levelUp!), 1300);
}

function levelUp(l: { level: number; coins: number; gems: number }) {
  fx.levelUp();
  const scrim = h('div.scrim.lvup', { onclick: () => scrim.remove() },
    h('div.sheet', {}, h('div.lvbig', {}, h('span', {}, 'LEVEL UP'), h('b', {}, String(l.level))),
      h('div.rw', {}, h('span', {}, icon('coin', 18), h('b', {}, `+${fmtNum(l.coins)}`)), h('span', {}, icon('gem', 18), h('b', {}, `+${l.gems}`))),
      h('button.cta', { onclick: () => scrim.remove() }, h('span', {}, 'Nice!'), h('i', {}, icon('check', 20)))));
  document.getElementById('app')!.append(scrim);
}
