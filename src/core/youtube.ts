/**
 * Background music through a plain YouTube embed (no scripting API, which
 * iPhone Safari often blocks). Songs stream from YouTube; nothing is bundled.
 * The embed shows YouTube's own play/next controls.
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

export interface Music { destroy(): void }

export function createMusic(host: HTMLElement, src: { list?: string; video?: string }): Music {
  const q = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1', controls: '1' });
  if (src.list) q.set('list', src.list);
  const path = src.list && !src.video ? 'videoseries' : src.video!;
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${path}?${q}`;
  f.allow = 'autoplay; encrypted-media; picture-in-picture';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.title = 'Music';
  host.replaceChildren(f);
  return { destroy: () => f.remove() };
}
