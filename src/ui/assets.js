// The manifest contains received files only. Empty maps mean procedural art
// and silence; the delivery catalogue is deliberately never fetched here.
const assetBase = new URL('../../assets/', import.meta.url);
const emptyManifest = () => ({ schemaVersion: 1, images: {}, audio: { music: {}, sfx: {} } });
let current = { manifest: emptyManifest(), images: new Map(), audio: { music: {}, sfx: {} } };
let pending;

export function localAssetUrl(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/')) return null;
  try {
    const url = new URL(path, assetBase);
    if (url.origin !== assetBase.origin || !url.pathname.startsWith(assetBase.pathname)) return null;
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function getImage(key) {
  return current.images.get(key) || null;
}

export function getAssetManifest() {
  return current.manifest;
}

export function loadAssets() {
  if (pending) return pending;
  pending = (async () => {
    let manifest = emptyManifest();
    try {
      const response = await fetch(new URL('manifest.json', assetBase));
      if (response.ok) {
        const value = await response.json();
        if (value?.schemaVersion === 1 && value.images && value.audio) manifest = value;
      }
    } catch {
      // A blocked local storage/network context must not make the game fail.
    }
    const images = new Map();
    if (typeof Image !== 'undefined') {
      await Promise.all(Object.entries(manifest.images).map(async ([key, entry]) => {
        const url = localAssetUrl(typeof entry === 'string' ? entry : entry?.src);
        if (!url) return;
        const image = new Image();
        const loaded = new Promise(resolve => {
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
        });
        image.src = url;
        if (await loaded) images.set(key, image);
      }));
    }
    current = { manifest, images, audio: manifest.audio };
    return current;
  })();
  return pending;
}
