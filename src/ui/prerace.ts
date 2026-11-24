import { ui as sfx, unlockAudio } from '../core/audio';
import { live } from '../core/live';
import { TYPE_INFO, eventById, freeRoam, type EventSpec } from '../game/career';
import { city, vehicle, VEHICLES } from '../game/data';
import { classOf, progress, prOf, save, armPayday, PAYDAY_GEMS } from '../game/progress';
import { fmtNum, fmtTime, h, mount, setBackdrop, toast } from './dom';
import { setStage } from '../core/renderer';
import { freeTime, freeWeather } from './events';
import { stars } from './home';
import { icon } from './icons';
import { nav } from './nav';
import { enableTilt } from './settings';

/** Event briefing: rules, rewards, recommended PR and vehicle choice. */
export function showPrerace(id: string): void {
  const e: EventSpec = id.startsWith('free-') ? freeRoam(id.slice(5), freeTime, freeWeather) : eventById(id)!;
  const c = city(e.city), ti = TYPE_INFO[e.type];
  const eligible = VEHICLES.filter((v) => progress.owned.includes(v.id) && (e.kind === 'any' || v.kind === e.kind));
  if (!eligible.find((v) => v.id === progress.vehicle) && eligible[0]) { progress.vehicle = eligible[0].id; save(); }
  const weekly = e.id === live.weeklyEvent;
  setStage(null); setBackdrop(null);
  document.body.className = 'menu';

  const vpick = h('div.vpick');
  const prRow = h('div.prrow');
  const draw = () => {
    vpick.replaceChildren(...eligible.map((v) => h('button', { class: `vp${progress.vehicle === v.id ? ' on' : ''}`, onclick: () => { progress.vehicle = v.id; save(); sfx.select(); draw(); } },
      h('img', { src: v.cutout, alt: '' }), h('b', {}, v.name), h('span', {}, h('i', { class: `cls ${classOf(prOf(v.id))}` }, classOf(prOf(v.id))), ` ${prOf(v.id)} PR`))));
    const pr = prOf(progress.vehicle);
    prRow.replaceChildren(e.type === 'free' ? '' : h('div', { class: `prcheck${pr < e.minPR ? ' low' : ''}` }, icon(pr < e.minPR ? 'info' : 'check', 16),
      pr < e.minPR ? `Recommended PR ${e.minPR}. Yours is ${pr}: upgrade in the garage for a better chance.` : `Your PR ${pr} meets the recommended ${e.minPR}.`));
  };
  draw();
  const best = progress.best[e.id];
  const isScore = e.type === 'drift' || e.type === 'nearmiss' || e.type === 'route';
  const targets = e.type === 'free' ? null : h('div.targets', {}, ...[0, 1, 2].map((i) => h('div', {}, stars(i + 1),
    h('span', {}, isScore ? fmtNum(e.targets[i]) : e.type === 'checkpoint' ? (i === 0 ? 'Finish, not caught' : `Under ${fmtTime(e.targets[i])}`) : i === 2 ? '1st place' : i === 1 ? 'Top 2' : 'Top 3'))));

  // gem sink: double this event's coins
  const payday = (): HTMLElement => {
    const row = h('button', { class: `payday${progress.paydayArmed ? ' on' : ''}`, onclick: () => {
      if (progress.paydayArmed) return;
      if (armPayday()) { sfx.select(); row.replaceWith(payday()); }
      else { sfx.deny(); toast(`Payday costs ${PAYDAY_GEMS} gems.`); }
    } },
      h('i', {}, icon(progress.paydayArmed ? 'check' : 'gem', 18)),
      h('div', {}, h('b', {}, progress.paydayArmed ? 'Payday is on' : 'Payday · double coins'),
        h('span', {}, progress.paydayArmed ? 'This event pays 2× coins' : `${PAYDAY_GEMS} gems · you have ${progress.gems}`)));
    return row;
  };
  const start = async () => {
    if (!eligible.length) { toast(e.kind === 'bus' ? 'You need a bus for this event. Get one in the garage.' : 'You need a three-wheeler for this event.'); return; }
    await unlockAudio();
    if (progress.controls === 'tilt') await enableTilt();
    sfx.select();
    nav.drive(e, progress.vehicle);
  };
  mount(h('div.screen.prerace', {},
    h('div.pr-hero', { style: `background-image:url(${c.image})` },
      h('div.bar', {}, h('button.cbtn', { 'aria-label': 'Back', onclick: () => { sfx.back(); nav.tab(e.type === 'free' ? 'events' : 'career', e.type === 'free' ? undefined : String(e.chapter)); } }, icon('chevL', 22)), h('div.spacer'), weekly ? h('span.tag.boss', {}, '2× rewards') : null),
      h('div.pr-title', {}, h('span.tag', {}, icon(ti.icon, 14), ti.name), h('h1', {}, e.boss ? `Boss race: ${e.boss}` : e.title), h('p', {}, `${c.name} · ${e.time === 'night' ? 'Night' : e.time === 'dusk' ? 'Dusk' : 'Day'} · ${e.weather === 'rain' ? 'Rain' : 'Clear'}${e.laps > 1 ? ` · ${e.laps} laps` : ''}${e.timeLimit ? ` · ${fmtTime(e.timeLimit)}` : ''}`))),
    h('div.pr-body', {},
      h('p.rules', {}, ti.rules),
      targets,
      e.type !== 'free' ? h('div.rewards', {}, h('span', {}, icon('coin', 15), fmtNum(e.reward.coins * (weekly ? 2 : 1))), h('span', {}, icon('star', 15), `${e.reward.xp} XP`), e.reward.gems ? h('span', {}, icon('gem', 15), String(e.reward.gems)) : null,
        best !== undefined ? h('span.best', {}, 'Best ', isScore ? fmtNum(best) : fmtTime(best)) : null) : null,
      h('div.sec-t', {}, e.kind === 'any' ? 'Choose your ride' : `Choose your ${e.kind === 'bus' ? 'bus' : 'three-wheeler'}`),
      vpick, prRow,
      e.type !== 'free' ? payday() : null,
      h('button.cta', { onclick: start }, h('span', {}, e.type === 'free' ? 'Start driving' : 'Start event'), h('i', {}, icon('play', 20))),
    ),
  ));
  void vehicle;
}
