// _media.mjs — media pane shared by the triage and tag views.
// Responsibilities:
// - read an item's `img`, `video` and `audio` fields (comma lists of paths or URLs) as one clip list
// - draw one clip at a time: an image (zoom to natural size) or an audio/video player
// - step clips, step speed through SPEEDS, play/pause, autoplay and mute from meta, preload an image
// - define and bind the shared keys: space, `,` `.` (clip), `[` `]` (speed)
//
// Item fields:
//   img:: a.png, b.png      video:: a.mp4      audio:: a.wav
// Meta: autoplay (default true for video, false for audio), muted (default true for video).

import { el, css, mediaUrl } from '../web/ui.mjs';
import { fieldList } from '../web/format.mjs';

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2];
export const MEDIA_KEYS = { ' ': 'media-toggle', ',': 'clip-prev', '.': 'clip-next', '[': 'speed-down', ']': 'speed-up' };

/** Clips of an item in order: images, video, audio. [{ kind, src }] */
export function clipsOf(item) {
  return [['img', 'img'], ['video', 'video'], ['audio', 'audio']]
    .flatMap(([field, kind]) => fieldList(item, field).map((src) => ({ kind, src })));
}

const baseName = (src) => decodeURIComponent(String(src).split(/[?#]/)[0].split('/').pop() || src);

export function createMedia(meta = {}) {
  css('jig-media', `
    .jig-media { margin: 8px 0; }
    .jig-media[hidden] { display: none; }
    .jig-media-box { background: var(--bg); border: 1px solid var(--edge); border-radius: var(--r); max-height: 55vh; overflow: auto; display: flex; justify-content: center; }
    .jig-media-box img { max-width: 100%; max-height: 55vh; object-fit: contain; cursor: zoom-in; }
    .jig-media-box img.zoomed { max-width: none; max-height: none; object-fit: none; cursor: zoom-out; }
    .jig-media-box video { max-width: 100%; max-height: 55vh; }
    .jig-media-box audio { width: 100%; }
    .jig-media-bar { display: flex; gap: 12px; font: 12px var(--mono); color: var(--dim); margin-top: 4px; }
    .jig-media-bar .jig-speed { margin-left: auto; color: var(--accent); }
  `);
  const node = el('div', 'jig-media');
  const box = el('div', 'jig-media-box');
  const name = el('span', 'jig-clip');
  const speedOut = el('span', 'jig-speed');
  const bar = el('div', 'jig-media-bar');
  bar.append(name, speedOut);
  node.append(box, bar);
  node.hidden = true;

  let item = null, clips = [], index = 0, speed = 3, player = null, zoomed = false;
  const rate = () => SPEEDS[speed];

  function stop() { if (player?.pause) player.pause(); }

  function draw() {
    stop();
    player = null;
    const clip = clips[index];
    node.hidden = !clip;
    box.replaceChildren();
    if (!clip) return;
    const url = mediaUrl(clip.src);
    name.textContent = `${clips.length > 1 ? `${index + 1}/${clips.length} ` : ''}${baseName(clip.src)}`;
    speedOut.textContent = `${rate()}x`;
    if (clip.kind === 'img') {
      const img = el('img', zoomed ? 'zoomed' : '');
      img.src = url;
      img.alt = baseName(clip.src);
      img.addEventListener('click', toggle);
      box.append(img);
      player = img;
      return;
    }
    const m = el(clip.kind === 'video' ? 'video' : 'audio');
    m.controls = true;
    m.preload = 'auto';
    m.muted = meta.muted ?? clip.kind === 'video';
    m.loop = clips.length === 1 && clip.kind === 'video';
    m.src = url;
    m.playbackRate = rate();
    m.addEventListener('ended', () => { if (clips.length > 1) step(1, true); });
    box.append(m);
    player = m;
    if (meta.autoplay ?? clip.kind === 'video') m.play?.().catch(() => {});
  }

  function toggle() {
    if (!player) return;
    if (player.tagName === 'IMG') {
      zoomed = !zoomed;
      player.classList.toggle('zoomed', zoomed);
      return;
    }
    if (player.paused) player.play().catch(() => {}); else player.pause();
  }

  function step(d, play = false) {
    if (clips.length < 2) return;
    index = (index + d + clips.length) % clips.length;
    zoomed = false;
    draw();
    if (play && player?.play) player.play().catch(() => {});
  }

  function stepSpeed(d) {
    speed = Math.min(Math.max(speed + d, 0), SPEEDS.length - 1);
    speedOut.textContent = `${rate()}x`;
    if (player && 'playbackRate' in player) player.playbackRate = rate();
  }

  return {
    node,
    /** Show an item's clips. The same item keeps its clip and playback. */
    show(next) {
      if (next === item) return;
      item = next;
      clips = next ? clipsOf(next) : [];
      index = 0;
      zoomed = false;
      draw();
    },
    /** Warm the cache for an item's images. */
    preload(next) {
      if (!next) return;
      for (const c of clipsOf(next)) if (c.kind === 'img') { const i = new Image(); i.src = mediaUrl(c.src); }
    },
    toggle,
    step,
    stepSpeed,
    stop,
    /** Forget the shown item so the next show() redraws. */
    reset() { item = null; },
  };
}

/** Define the media actions on `actions` and return the key map to bind. */
export function defineMedia(actions, media) {
  actions.define('media-toggle', () => media.toggle(), 'play / zoom');
  actions.define('clip-prev', () => media.step(-1, true), 'prev clip');
  actions.define('clip-next', () => media.step(1, true), 'next clip');
  actions.define('speed-down', () => media.stepSpeed(-1), 'slower');
  actions.define('speed-up', () => media.stepSpeed(1), 'faster');
  return MEDIA_KEYS;
}
