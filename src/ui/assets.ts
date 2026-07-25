// Asset loader with graceful degradation: every consumer works whether an
// image exists, is still loading, or was never generated — the game falls
// back to its vector/DOM look per element. Assets land under
// public/assets/... and light up automatically once present.

const cache = new Map<string, HTMLImageElement>();

/**
 * Lanes the build re-encodes to WebP, because they are photographic and a
 * 256-colour palette bands them badly. Keep in sync with LANES in
 * scripts/optimizeAssets.mjs. Dev serves the untouched .png masters, so the
 * swap only applies to production builds.
 */
const WEBP_LANES = ['cars/', 'portraits/', 'tracks/props/', 'tracks/tiles/', 'tracks/backdrops/', 'cinematic/'];

export function assetUrl(rel: string): string {
  const name =
    import.meta.env.PROD && rel.endsWith('.png') && WEBP_LANES.some((l) => rel.startsWith(l))
      ? rel.replace(/\.png$/, '.webp')
      : rel;
  return `${import.meta.env.BASE_URL}assets/${name}`;
}

/** returns the image element (may still be loading); null once known-missing */
export function getImage(rel: string): HTMLImageElement | null {
  let img = cache.get(rel);
  if (!img) {
    img = new Image();
    img.src = assetUrl(rel);
    cache.set(rel, img);
  }
  if (img.dataset.missing) return null;
  img.addEventListener('error', () => (img!.dataset.missing = '1'), { once: true });
  return img;
}

/** true when the image is fully loaded and drawable */
export function ready(img: HTMLImageElement | null): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

/** <img> HTML with automatic hide-on-missing (for DOM screens) */
export function imgTag(rel: string, className: string, alt = ''): string {
  return `<img src="${assetUrl(rel)}" class="${className}" alt="${alt}" onerror="this.style.display='none'" draggable="false" />`;
}

/** medal image with emoji fallback when the asset is missing */
export function medalIcon(medal: 'gold' | 'silver' | 'bronze'): string {
  const emoji = { gold: '🥇', silver: '🥈', bronze: '🥉' }[medal];
  return `<span class="medal-wrap"><img src="${assetUrl(`ui/medal-${medal}.png`)}" class="medal-img" alt="${medal}" draggable="false" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" /><span style="display:none">${emoji}</span></span>`;
}

/** kick off background loading for a list of assets */
export function preload(rels: string[]): void {
  for (const rel of rels) getImage(rel);
}
