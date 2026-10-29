import { loadAssets, localAssetUrl } from './assets.js';

const cueForEvent = {
  moved: 'move', turned: 'turn', pushed: 'push', cratePushed: 'crate-push',
  filled: 'hole-filled', holeFilled: 'hole-filled', fell: 'fall',
  respawned: 'respawn', conveyed: 'conveyor', claimed: 'beacon', exited: 'exit',
  patch: 'patch-select', patchSelected: 'patch-select', deploy: 'deploy',
  cycleEnd: 'cycle-end', countdown: 'countdown', victory: 'victory', failure: 'failure',
};
const clampVolume = value => Math.min(1, Math.max(0, Number(value) || 0));

// HTMLAudio is sufficient for optional short cues. No AudioContext exists
// before or after a gesture, and absent recordings always produce silence.
export function createAudio(options = {}) {
  const mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const settings = {
    music: clampVolume(options.music ?? (mobile ? 0 : 0.25)),
    sfx: clampVolume(options.sfx ?? (mobile ? 0 : 0.5)),
  };
  let unlocked = false;
  let disposed = false;
  let manifest = { music: {}, sfx: {} };
  let music = null;
  let musicName = null;
  const active = new Set();
  const ready = loadAssets().then(assets => { manifest = assets.audio || manifest; });

  function makeAudio(entry) {
    if (typeof Audio === 'undefined') return null;
    const paths = Array.isArray(entry) ? entry : typeof entry === 'string' ? [entry] : [];
    if (!paths.length) return null;
    const element = new Audio();
    const source = paths.find(path => {
      const type = /\.ogg(?:$|\?)/i.test(path) ? 'audio/ogg; codecs="vorbis"'
        : /\.mp3(?:$|\?)/i.test(path) ? 'audio/mpeg' : '';
      return element.canPlayType(type) && localAssetUrl(path);
    }) || paths.find(path => localAssetUrl(path));
    if (!source) return null;
    element.preload = 'none';
    element.src = localAssetUrl(source);
    return element;
  }

  function play(name) {
    if (!unlocked || disposed) return;
    if (Object.hasOwn(manifest.music || {}, name)) {
      if (musicName === name && music && !music.paused) return;
      music?.pause();
      music = makeAudio(manifest.music[name]);
      musicName = name;
      if (!music || !settings.music) return;
      music.volume = settings.music;
      music.loop = name === 'title' || name === 'gameplay';
      music.play().catch(() => {});
      return;
    }
    const cue = cueForEvent[name] || name;
    if (!settings.sfx || !Object.hasOwn(manifest.sfx || {}, cue)) return;
    const element = makeAudio(manifest.sfx[cue]);
    if (!element) return;
    if (active.size >= 6) {
      const oldest = active.values().next().value;
      oldest.pause();
      active.delete(oldest);
    }
    element.volume = settings.sfx;
    active.add(element);
    const cleanup = () => active.delete(element);
    element.addEventListener('ended', cleanup, { once: true });
    element.addEventListener('error', cleanup, { once: true });
    element.play().catch(cleanup);
  }

  return {
    settings,
    // Call directly from the game's first pointer/keyboard handler. The
    // optional media itself remains subject to normal browser playback rules.
    unlock() {
      unlocked = true;
      return ready;
    },
    play,
    setVolumes(musicVolume, sfxVolume) {
      settings.music = clampVolume(musicVolume);
      settings.sfx = clampVolume(sfxVolume);
      if (music) {
        music.volume = settings.music;
        if (!settings.music) music.pause();
        else if (unlocked) music.play().catch(() => {});
      }
      for (const element of active) element.volume = settings.sfx;
    },
    stopMusic() {
      music?.pause();
      music = null;
      musicName = null;
    },
    dispose() {
      disposed = true;
      music?.pause();
      for (const element of active) element.pause();
      active.clear();
    },
  };
}
