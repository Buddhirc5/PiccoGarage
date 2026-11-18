import { ui as sfx } from '../core/audio';
import { canPrompt, isInstalled, isIOS, promptInstall } from '../core/pwa';
import { EVENTS } from '../game/career';
import { VEHICLES } from '../game/data';
import { levelInfo, progress, totalStars } from '../game/progress';
import { fmtNum, h, toast } from './dom';
import { icon } from './icons';
import { openSettings } from './settings';
import { shell } from './nav';

/** Profile: level, career stats, achievements, install app, share, settings. */
const BADGES: { id: string; name: string; desc: string; ic: string; ok: () => boolean }[] = [
  { id: 'first', name: 'First Drive', desc: 'Finish your first drive', ic: 'road', ok: () => progress.drives >= 1 },
  { id: 'win', name: 'Winner', desc: 'Win a race', ic: 'trophy', ok: () => progress.wins >= 1 },
  { id: 'drift', name: 'Drift King', desc: '10,000 points in one drift', ic: 'drift', ok: () => progress.driftBest >= 10000 },
  { id: 'gap', name: 'Gap Hunter', desc: '100 near misses', ic: 'speed', ok: () => progress.nearMisses >= 100 },
  { id: 'cond', name: 'Conductor', desc: 'Carry 100 passengers', ic: 'bus', ok: () => progress.passengers >= 100 },
  { id: 'esc', name: 'Escape Artist', desc: 'Lose the police 5 times', ic: 'police', ok: () => progress.escapes >= 5 },
  { id: 'fleet', name: 'Fleet Owner', desc: 'Own 5 vehicles', ic: 'wrench', ok: () => progress.owned.length >= 5 },
  { id: 'star', name: 'Superstar', desc: 'Collect 60 stars', ic: 'star', ok: () => totalStars() >= 60 },
];

export function showProfile(): void {
  const li = levelInfo();
  const tile = (label: string, value: string) => h('div.tile', {}, h('span', {}, label), h('b.num', {}, value));
  const got = BADGES.filter((b) => b.ok()).length;
  const install = isInstalled() ? null : h('button.rowb', { onclick: async () => {
    sfx.tap();
    const r = await promptInstall();
    if (r === 'ios') toast('On iPhone: tap Share, then “Add to Home Screen”.', 5000);
    else if (r === 'unavailable') toast('Open the browser menu and choose “Install app” or “Add to Home screen”.', 5000);
  } }, icon('install', 20), h('div', {}, h('b', {}, 'Install the app'), h('span', {}, isIOS() ? 'Share → Add to Home Screen' : canPrompt() ? 'One tap, full screen, faster loading' : 'Add it to your home screen')), icon('chevR', 18));

  shell('profile', h('div.profile2', {},
    h('div.ph', {},
      h('div.lvl2', { style: `--p:${Math.round(li.pct * 100)}%` }, h('b', {}, String(li.level)), h('span', {}, 'LEVEL')),
      h('div', {}, h('h1', {}, 'Driver'), h('p', {}, `${fmtNum(li.into)} / ${fmtNum(li.next)} XP to level ${li.level + 1}`))),
    h('div.grid2', {},
      tile('Stars', `${totalStars()} / ${EVENTS.length * 3}`), tile('Races won', fmtNum(progress.wins)),
      tile('Distance', `${progress.km.toFixed(1)} km`), tile('Drives', fmtNum(progress.drives)),
      tile('Best drift', fmtNum(progress.driftBest)), tile('Near misses', fmtNum(progress.nearMisses)),
      tile('Passengers', fmtNum(progress.passengers)), tile('Police escapes', fmtNum(progress.escapes)),
      tile('Vehicles', `${progress.owned.length} / ${VEHICLES.length}`), tile('Overtakes', fmtNum(progress.overtakes))),
    h('div.sec-t', {}, `Achievements · ${got} of ${BADGES.length}`),
    h('div.badges2', {}, ...BADGES.map((b) => h('div', { class: `bdg${b.ok() ? ' got' : ''}` }, h('i', {}, icon(b.ok() ? b.ic : 'lock', 20)), h('b', {}, b.name), h('span', {}, b.desc)))),
    h('div.rows2', {},
      install,
      h('button.rowb', { onclick: async () => {
        sfx.tap();
        const data = { title: 'Picco Garage', text: 'Drive Sri Lankan buses and three-wheelers. Free in your browser!', url: location.origin };
        try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); toast('Link copied'); } } catch { /* cancelled */ }
      } }, icon('share', 20), h('div', {}, h('b', {}, 'Share the game'), h('span', {}, 'Send it to friends on WhatsApp')), icon('chevR', 18)),
      h('button.rowb', { onclick: () => openSettings() }, icon('gear', 20), h('div', {}, h('b', {}, 'Settings'), h('span', {}, 'Controls, sound, graphics')), icon('chevR', 18)),
      h('div.signin', {}, icon('user', 18), h('span', {}, 'Sign-in, cloud saves and leaderboards are coming soon. Your progress is saved on this device.'))),
  ));
}
