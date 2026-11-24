import { track } from '../core/track';
import { horn, setCustomHorn, hasCustomHorn, ui as sfx, unlockAudio, fx } from '../core/audio';
import { setStage } from '../core/renderer';
import { FINISHES, GLOWS, HORNS, MAX_LEVEL, TINTS, UPGRADES, VEHICLES } from '../game/data';
import { buyUpgrade, buyVehicle, canBuyVehicle, classOf, nextUpgradeCost, progress, save, saveBlob, stats, totalStars, unlockGems, unlockWithGems } from '../game/progress';
import { fmtNum, h, toast } from './dom';
import { icon } from './icons';
import { shell, vehicleBadge } from './nav';
import { showroom } from './showroom';

type GTab = 'tune' | 'paint' | 'glow' | 'horn' | 'plate';
let tab: GTab = 'tune';

export function showGarage(): void {
  const stage = showroom();
  let idx = Math.max(0, VEHICLES.findIndex((v) => v.id === progress.vehicle));
  const cur = () => VEHICLES[idx];

  const giant = h('div.giant', { 'aria-hidden': 'true' });
  const backdrop = h('div.gbg', {}, giant, h('div.halo'));
  const head = h('div.vname');
  const statRow = h('div.stats');
  const dots = h('div.dots');
  const chips = h('div.chips');
  const opts = h('div.opts');
  const action = h('div.gact');
  const file = h<HTMLInputElement>('input', { type: 'file', accept: 'audio/*', style: 'display:none' });

  const renderHead = () => {
    const v = cur(), s = stats(v.id), owned = progress.owned.includes(v.id);
    giant.textContent = v.big;
    giant.style.fontSize = `${Math.min(40, 92 / (v.big.length * 0.46))}cqw`;
    giant.style.animation = 'none'; void giant.offsetWidth; giant.style.animation = '';
    head.replaceChildren(h('div', {}, h('h2', {}, v.name), h('div.vmeta', {}, vehicleBadge(v.id), h('span.kind', {}, v.kind === 'bus' ? 'Bus' : 'Three-wheeler'))), h('span.idx', {}, `${idx + 1} / ${VEHICLES.length}`));
    statRow.replaceChildren(
      h('div', {}, h('span', {}, 'Top speed'), h('b.num', {}, `${Math.round(s.top)} km/h`)),
      h('div', {}, h('span', {}, '0-60'), h('b.num', {}, `${(60 / 3.6 / s.accel).toFixed(1)} s`)),
      h('div', {}, h('span', {}, 'Drift'), h('b.num', {}, `${Math.round(s.drift * 100)}`)));
    dots.replaceChildren(...VEHICLES.map((_, i) => h('i', { class: i === idx ? 'on' : '' })));
    const st = canBuyVehicle(v.id);
    action.replaceChildren(owned
      ? (progress.vehicle === v.id ? h('div.inuse', {}, icon('check', 16), 'Your current ride') : h('button.cta', { onclick: () => { progress.vehicle = v.id; save(); fx.fare(); renderHead(); } }, h('span', {}, 'Drive this'), h('i', {}, icon('check', 20))))
      : st === 'locked' ? h('div.lockrow', {},
        h('div.inuse.lock', {}, icon('lock', 16), `${v.stars} stars to unlock · you have ${totalStars()}`),
        h('button', { class: `pbtn gembtn${progress.gems >= unlockGems(v.id) ? '' : ' off'}`, onclick: () => {
          if (unlockWithGems(v.id)) { fx.levelUp(); toast(`${v.name} unlocked early. Buy it when you have the coins.`); renderHead(); updCoins(); }
          else { sfx.deny(); toast(`You need ${unlockGems(v.id)} gems. Earn them from boss races, 3-star finishes and daily rewards.`); }
        } }, icon('gem', 15), `Unlock now · ${unlockGems(v.id)}`))
      : h('button', { class: `cta${st === 'ok' ? '' : ' off'}`, onclick: () => {
        if (buyVehicle(v.id)) { fx.levelUp(); toast(`${v.name} is yours!`); track('upgrade', { vehicle: v.id, part: 'buy', level: 1 }); renderHead(); renderOpts(); updCoins(); }
        else { sfx.deny(); toast('Not enough coins yet. Win events to earn more.'); }
      } }, h('span', {}, `Buy for ${fmtNum(v.price)}`), h('i', {}, icon('coin', 20))));
    chips.style.display = owned ? '' : 'none';
    opts.style.display = owned ? '' : 'none';
  };
  const updCoins = () => {
    const c = document.getElementById('coins'); if (c) c.textContent = fmtNum(progress.coins);
    const g = document.getElementById('gems'); if (g) g.textContent = fmtNum(progress.gems);
  };

  const renderOpts = () => {
    const v = cur(), g = progress.garage[v.id];
    chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === tab));
    const st = (i: number) => `--i:${i}`;
    if (tab === 'paint') {
      if (!v.tintable) { opts.replaceChildren(h('p.note', {}, `${v.name} keeps its signature livery.`)); return; }
      const fin = h('div.finrow', {}, ...FINISHES.map((f) => {
        const own = progress.finishes.includes(f.id);
        return h('button', { class: `fin${g.finish === f.id ? ' on' : ''}`, onclick: () => {
          if (!own) { if (progress.coins < f.cost) { sfx.deny(); toast('Not enough coins.'); return; } progress.coins -= f.cost; progress.finishes.push(f.id); updCoins(); fx.fare(); }
          g.finish = f.id; save(); stage.paint(v.id); renderOpts();
        } }, h('b', {}, f.name), h('span', {}, own ? 'Owned' : `${fmtNum(f.cost)}`));
      }));
      opts.replaceChildren(h('div.paintwrap', {}, fin, h('div.swrow', {}, ...TINTS.map((c, i) => h('button', { class: `sw${g.tint === c ? ' on' : ''}`, style: `background:${c};${st(i)}`, 'aria-label': `Paint ${c}`,
        onclick: () => { g.tint = c; save(); sfx.select(); stage.paint(v.id); renderOpts(); } })))));
    } else if (tab === 'glow') {
      opts.replaceChildren(...GLOWS.map((c, i) => h('button', { class: `sw${c ? '' : ' none'}${g.glow === c ? ' on' : ''}`, style: `${c ? `background:${c};box-shadow:0 0 22px ${c}${g.glow === c ? ',0 0 0 3px #fff' : ''}` : ''};${st(i)}`, 'aria-label': c ? `Underglow ${c}` : 'No underglow',
        onclick: () => { g.glow = c; save(); sfx.select(); stage.paint(v.id); renderOpts(); } }, c ? null : icon('close', 18))));
    } else if (tab === 'tune') {
      opts.replaceChildren(...UPGRADES.map((u, i) => {
        const lv = g.up[u.id], cost = nextUpgradeCost(v.id, u.id);
        const card = h('button', { class: `ocard${cost !== null && progress.coins < cost ? ' cant' : ''}`, style: st(i) },
          h('b', {}, icon(u.id === 'engine' ? 'bolt' : u.id === 'brakes' ? 'disc' : u.id === 'tyres' ? 'tyre' : u.id === 'turbo' ? 'nitro' : 'gear', 17), u.name),
          h('div.lv', {}, ...Array.from({ length: MAX_LEVEL }, (_, k) => h('i', { class: k < lv ? 'on' : '' }))),
          h('span.price', {}, cost === null ? 'Maxed' : `${fmtNum(cost)}`));
        card.addEventListener('click', () => {
          if (cost === null) return;
          const before = stats(v.id).pr;
          if (buyUpgrade(v.id, u.id)) { fx.levelUp(); toast(`${u.name} level ${lv + 1} · PR ${before} → ${stats(v.id).pr}`); track('upgrade', { vehicle: v.id, part: u.id, level: lv + 1 }); renderHead(); renderOpts(); updCoins(); }
          else { sfx.deny(); toast('Not enough coins yet. Drive to earn more.'); }
        });
        return card;
      }));
    } else if (tab === 'horn') {
      opts.replaceChildren(...HORNS.map((hn, i) => {
        const owned = progress.horns.includes(hn.id);
        const sub = hn.id === 'custom' ? (hasCustomHorn() ? 'Tap to use. Hold to replace' : 'Load a sound file') : owned ? 'Tap to play' : `${fmtNum(hn.cost)} coins`;
        const card = h('button', { class: `ocard${g.horn === hn.id ? ' on' : ''}`, style: st(i) },
          h('b', {}, icon(hn.id === 'custom' ? 'upload' : owned ? 'horn' : 'lock', 16), hn.name), h('span', {}, sub));
        let held = 0;
        card.addEventListener('pointerdown', () => { held = Date.now(); });
        card.addEventListener('click', async () => {
          await unlockAudio();
          if (hn.id === 'custom' && (!hasCustomHorn() || Date.now() - held > 500)) { file.click(); return; }
          if (!owned) {
            if (progress.coins < hn.cost) { sfx.deny(); toast('Not enough coins yet.'); return; }
            progress.coins -= hn.cost; progress.horns.push(hn.id); sfx.buy(); updCoins();
          }
          g.horn = hn.id; save(); renderOpts();
          const off = horn(hn.id); setTimeout(off, 700);
        });
        return card;
      }));
    } else {
      const inp = h<HTMLInputElement>('input.input', { maxlength: 18, placeholder: v.kind === 'bus' ? 'e.g. සුපිරි ගමන or Super Star' : 'e.g. Amma’s Blessing', value: g.plate });
      inp.addEventListener('change', () => { g.plate = inp.value.trim(); save(); toast('Name board saved'); });
      opts.replaceChildren(h('div.platewrap', {}, h('span', {}, v.kind === 'bus' ? 'Front name board (Sinhala or English)' : 'Windscreen visor sticker'), inp));
    }
  };
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    if (f.size > 3_000_000) { toast('Please choose a sound under 3 MB.'); return; }
    const data = await f.arrayBuffer();
    if (!(await setCustomHorn(data))) { toast('That file could not be read as audio.'); return; }
    await saveBlob('horn', data).catch(() => {});
    progress.garage[cur().id].horn = 'custom'; save(); renderOpts();
    toast('Your horn is ready.'); horn('custom');
  });

  const go = (d: number) => { idx = (idx + d + VEHICLES.length) % VEHICLES.length; sfx.select(); stage.show(cur().id); renderHead(); renderOpts(); track('vehicle', { vehicle: cur().id }); };
  for (const [t, label, ic] of [['tune', 'Performance', 'bolt'], ['paint', 'Paint', 'paint'], ['glow', 'Underglow', 'glow'], ['horn', 'Horn', 'horn'], ['plate', 'Name', 'pin']] as const)
    chips.append(h('button', { class: 'chip', 'data-t': t, onclick: () => { tab = t; sfx.tap(); renderOpts(); } }, icon(ic, 16), label));

  const stageEl = h('div.stagez', {},
    h('button.cbtn.arrow.l', { 'aria-label': 'Previous vehicle', onclick: () => go(-1) }, icon('chevL', 22)),
    h('button.cbtn.arrow.r', { 'aria-label': 'Next vehicle', onclick: () => go(1) }, icon('chevR', 22)),
    dots);
  let drag: { x: number; x0: number; t: number } | null = null;
  stageEl.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('button')) return; drag = { x: e.clientX, x0: e.clientX, t: Date.now() }; stage.spin = 0; });
  stageEl.addEventListener('pointermove', (e) => { if (drag) { stage.yaw += (e.clientX - drag.x) * 0.01; drag.x = e.clientX; } });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, fast = Date.now() - drag.t < 300;
    if (fast && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    drag = null; stage.spin = 0.3;
  };
  stageEl.addEventListener('pointerup', end); stageEl.addEventListener('pointercancel', end);

  shell('garage', h('div.garage', {}, stageEl, h('div.info', {}, head, statRow, action, chips, opts), file), { stage: true, backdrop });
  setStage(stage);
  stage.show(cur().id); renderHead(); renderOpts();
  void classOf;
}
