/**
 * YouTube music through a plain embed driven by postMessage (no external API
 * script, which some iPhone setups block). We can play, pause, skip and read
 * the current title and state. iPhone needs one tap on the video the first
 * time; after that the bar controls it.
 */
export function parseYouTube(input: string): { list?: string; video?: string } | null {
  const s = input.trim();
  if (!s) return null;
  const list = s.match(/[?&]list=([\w-]+)/)?.[1];
  const video = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
  if (list || video) return { list, video };
  if (/^(PL|OL|UU|RD|FL)[\w-]{10,}$/.test(s)) return { list: s };
  if (/^[\w-]{11}$/.test(s)) return { video: s };
  return null;
}

export interface PlayerState { playing: boolean; title: string; ready: boolean }

export class YouTubePlayer {
  frame: HTMLIFrameElement;
  state: PlayerState = { playing: false, title: '', ready: false };
  onChange: (s: PlayerState) => void = () => {};
  private timer = 0;

  constructor(host: HTMLElement, src: { list?: string; video?: string }, shuffle = true) {
    const q = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1', controls: '1', enablejsapi: '1', origin: location.origin });
    if (src.list) q.set('list', src.list);
    const path = src.list && !src.video ? 'videoseries' : src.video!;
    const f = document.createElement('iframe');
    f.src = `https://www.youtube.com/embed/${path}?${q}`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'Music';
    host.replaceChildren(f);
    this.frame = f;
    window.addEventListener('message', this.onMessage);
    f.addEventListener('load', () => {
      // ask the player to report its state, then keep listening
      this.post({ event: 'listening', id: 1, channel: 'widget' });
      this.timer = window.setInterval(() => this.post({ event: 'listening', id: 1, channel: 'widget' }), 1500);
      if (shuffle && src.list) setTimeout(() => this.command('setShuffle', [true]), 800);
    });
  }
  private post(msg: object) { this.frame.contentWindow?.postMessage(JSON.stringify(msg), '*'); }
  command(func: string, args: unknown[] = []) { this.post({ event: 'command', func, args, id: 1, channel: 'widget' }); }
  play() { this.command('playVideo'); }
  pause() { this.command('pauseVideo'); }
  next() { this.command('nextVideo'); }
  prev() { this.command('previousVideo'); }
  volume(v: number) { this.command('setVolume', [Math.round(v * 100)]); }
  private onMessage = (e: MessageEvent) => {
    if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname) || e.source !== this.frame.contentWindow) return;
    let d: { event?: string; info?: { playerState?: number; videoData?: { title?: string } } };
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (d.event === 'onReady' || d.event === 'initialDelivery') this.state.ready = true;
    if (d.info) {
      if (typeof d.info.playerState === 'number') this.state.playing = d.info.playerState === 1;
      if (d.info.videoData?.title) this.state.title = d.info.videoData.title;
      this.state.ready = true;
      this.onChange(this.state);
    }
  };
  destroy() { clearInterval(this.timer); window.removeEventListener('message', this.onMessage); this.frame.remove(); }
}
