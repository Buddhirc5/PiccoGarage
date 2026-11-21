import { setDuck, ui as sfx } from '../core/audio';
import { live } from '../core/live';
import { track } from '../core/track';
import { YouTubePlayer, parseYouTube } from '../core/youtube';
import { progress, save } from '../game/progress';
import { h, toast } from './dom';
import { icon } from './icons';

/**
 * Global music: a small bar that stays on screen across menus and drives.
 * Tap it for the station sheet (genres from /admin + your own playlists).
 * The YouTube video shows only until it starts playing, then hides.
 */
let player: YouTubePlayer | null = null;
let current = '';           // station id or 'my:<index>'
let root: HTMLElement;
let bar: HTMLElement, titleEl: HTMLElement, nameEl: HTMLElement, ppBtn: HTMLButtonElement, vidBox: HTMLElement, sheet: HTMLElement | null = null;

export function initMusic(): void {
  root = document.getElementById('music')!;
  vidBox = h('div.mvid');
  nameEl = h('b', {}, 'Music');
  titleEl = h('span', {}, 'Tap to pick a station');
  ppBtn = h<HTMLButtonElement>('button.mbtn', { 'aria-label': 'Play or pause', onclick: (e: Event) => { e.stopPropagation(); toggle(); } }, icon('play', 16));
  const next = h('button.mbtn', { 'aria-label': 'Next song', onclick: (e: Event) => { e.stopPropagation(); player?.next(); } }, icon('next', 16));
  bar = h('div.mbar', { role: 'button', 'aria-label': 'Music', onclick: openSheet },
    h('i.eq', {}, h('i'), h('i'), h('i')), h('div.mtx', {}, nameEl, titleEl), ppBtn, next);
  // lets players back out of the one-time iPhone "tap play in the video" step
  const skip = h('div.mskip', {},
    h('span', {}, 'Tap ▶ in the video once to start your music'),
    h('button', { onclick: () => { sfx.tap(); stopMusic(); } }, 'Cancel'));
  root.replaceChildren(vidBox, skip, bar);
  render();
}

function render() {
  const playing = !!player?.state.playing;
  root.classList.toggle('on', !!player);
  bar.classList.toggle('playing', playing);
  ppBtn.replaceChildren(icon(playing ? 'pause' : 'play', 16));
  if (player?.state.title) titleEl.textContent = player.state.title;
  // show the video only while it still needs a first tap
  vidBox.classList.toggle('show', !!player && !player.state.playing && !started);
  setDuck(playing);
  flushWaiters();
}

/** Callbacks waiting for the music UI to be out of the way (sheet closed, no video prompt). */
let waiters: (() => void)[] = [];
function flushWaiters() {
  if (sheet || vidBox.classList.contains('show') || !waiters.length) return;
  const w = waiters; waiters = []; w.forEach((f) => f());
}

/** Open the station picker. onDone runs once the sheet is closed and any video prompt is done. */
export function openMusic(onDone?: () => void): void {
  if (onDone) waiters.push(onDone);
  openSheet();
}
let started = false;

function toggle() {
  sfx.tap();
  if (!player) { openSheet(); return; }
  if (player.state.playing) player.pause(); else player.play();
}

export function playStation(id: string): void {
  let url = '', name = '';
  if (id.startsWith('my:')) { const p = progress.playlists[+id.slice(3)]; url = p?.url ?? ''; name = p?.name ?? 'My playlist'; }
  else { const s = live.stations.find((x) => x.id === id); url = s?.url ?? ''; name = s?.name ?? ''; }
  const src = parseYouTube(url);
  if (!src) { toast('This station has no playlist yet. Add your own below.'); return; }
  player?.destroy();
  started = false;
  current = id;
  nameEl.textContent = name; titleEl.textContent = 'Tap ▶ in the video to start';
  player = new YouTubePlayer(vidBox, src);
  player.onChange = (s) => { if (s.playing) started = true; render(); };
  track('music', { station: id });
  render();
  closeSheet();
}

export function stopMusic(): void {
  player?.destroy(); player = null; current = ''; started = false;
  nameEl.textContent = 'Music'; titleEl.textContent = 'Tap to pick a station';
  render();
}

function closeSheet() { sheet?.remove(); sheet = null; flushWaiters(); }

function openSheet() {
  sfx.tap();
  sheet?.remove(); sheet = null; // replace without firing waiters
  const list = h('div.stations');
  const row = (id: string, name: string, desc: string, has: boolean, onDelete?: () => void) => h('div', { class: `station${current === id ? ' on' : ''}${has ? '' : ' empty'}` },
    h('button.st-main', { onclick: () => playStation(id) }, h('i.st-ic', {}, icon(current === id && player?.state.playing ? 'pause' : 'music', 18)), h('div', {}, h('b', {}, name), h('span', {}, has ? desc : 'No playlist set yet'))),
    onDelete ? h('button.st-x', { 'aria-label': `Remove ${name}`, onclick: onDelete }, icon('close', 14)) : null);
  const fill = () => {
    list.replaceChildren(
      h('div.st-h', {}, 'Stations'),
      ...live.stations.map((s) => row(s.id, s.name, s.desc, !!parseYouTube(s.url))),
      h('div.st-h', {}, 'My playlists'),
      ...progress.playlists.map((p, i) => row(`my:${i}`, p.name, 'Your YouTube playlist', true, () => { progress.playlists.splice(i, 1); save(); fill(); })),
    );
  };
  fill();
  const name = h<HTMLInputElement>('input.input', { placeholder: 'Name (e.g. My bus songs)', maxlength: 30 });
  const url = h<HTMLInputElement>('input.input', { placeholder: 'YouTube playlist or video link', inputmode: 'url' });
  const add = h('button.pbtn.w', { onclick: () => {
    if (!parseYouTube(url.value)) { toast('Paste a YouTube playlist or video link.'); return; }
    progress.playlists.push({ name: name.value.trim() || `Playlist ${progress.playlists.length + 1}`, url: url.value.trim() }); save();
    playStation(`my:${progress.playlists.length - 1}`);
  } }, 'Add');
  sheet = h('div.scrim.msheet', { onclick: (e: Event) => { if (e.target === sheet) closeSheet(); } },
    h('div.sheet', {},
      h('div.sh-head', {}, h('h2', {}, 'Music'), player ? h('button.pbtn', { onclick: () => { stopMusic(); closeSheet(); } }, icon('close', 15), 'Stop') : null, h('button.cbtn', { 'aria-label': 'Close', onclick: closeSheet }, icon('close', 18))),
      list,
      h('div.st-add', {}, name, h('div.field', {}, url, add)),
      h('p.hintt', {}, 'Songs stream from YouTube. On iPhone, tap play in the video once; after that use the music bar.'),
    ));
  document.getElementById('app')!.append(sheet);
}
