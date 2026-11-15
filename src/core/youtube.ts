/**
 * Background music through the official YouTube player (IFrame API).
 * Songs stream from YouTube; nothing is bundled with the game.
 * Set DEFAULT_PLAYLIST in src/config.ts, or the player can paste a link.
 */
interface YTPlayer { playVideo(): void; pauseVideo(): void; nextVideo(): void; previousVideo(): void; setVolume(v: number): void; destroy(): void; getVideoData?(): { title?: string } }
declare global { interface Window { YT?: { Player: new (el: HTMLElement, o: unknown) => YTPlayer }; onYouTubeIframeAPIReady?: () => void } }

let api: Promise<void> | null = null;
function loadApi(): Promise<void> {
  api ??= new Promise((res, rej) => {
    if (window.YT?.Player) return res();
    window.onYouTubeIframeAPIReady = () => res();
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { api = null; rej(new Error('YouTube unavailable')); };
    document.head.append(s);
  });
  return api;
}

/** Accepts a playlist/video URL or a bare id. */
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

export interface Music { play(): void; pause(): void; next(): void; prev(): void; volume(v: number): void; destroy(): void }

export async function createMusic(host: HTMLElement, src: { list?: string; video?: string }, onState: (playing: boolean, title: string) => void): Promise<Music> {
  await loadApi();
  const el = document.createElement('div');
  host.replaceChildren(el);
  return new Promise((res) => {
    const p: YTPlayer = new window.YT!.Player(el, {
      width: '100%', height: '100%',
      videoId: src.list ? undefined : src.video,
      playerVars: { listType: src.list ? 'playlist' : undefined, list: src.list, autoplay: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, fs: 0 },
      events: {
        onReady: () => res({ play: () => p.playVideo(), pause: () => p.pauseVideo(), next: () => p.nextVideo(), prev: () => p.previousVideo(), volume: (v) => p.setVolume(v * 100), destroy: () => p.destroy() }),
        onStateChange: (e: { data: number }) => onState(e.data === 1, p.getVideoData?.().title ?? ''),
      },
    });
  });
}
