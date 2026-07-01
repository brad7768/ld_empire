/**
 * Injecte data/home-media.json dans index/index.html au build Netlify.
 * Les chemins Git priment sur les placeholders Supabase une fois le carousel généré ici.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const MEDIA_PATH = path.join(root, 'data', 'home-media.json');
const INDEX_PATH = path.join(root, 'index', 'index.html');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {string} url */
function toStorefrontPath(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return `..${s}`;
  return `../${s.replace(/^\//, '')}`;
}

function loadHomeMedia() {
  if (!fs.existsSync(MEDIA_PATH)) {
    console.warn('apply-home-media: data/home-media.json absent — ignoré.');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
  } catch (e) {
    console.warn(`apply-home-media: JSON invalide — ${e.message}`);
    return null;
  }
}

/** @param {string[]} urls */
function buildHeroCarouselHtml(urls) {
  const list = (urls || []).map((u) => String(u).trim()).filter(Boolean);
  if (!list.length) return '';
  return list
    .map((url, i) => {
      const src = escapeHtml(toStorefrontPath(url));
      const active =
        i === 0
          ? 'hero-carousel-slide is-active absolute inset-0 h-full w-full object-cover opacity-70 z-[1]'
          : 'hero-carousel-slide absolute inset-0 h-full w-full object-cover opacity-0 z-0';
      const attrs =
        i === 0
          ? 'fetchpriority="high" decoding="async"'
          : 'loading="lazy" decoding="async"';
      return `      <img data-hero-slide src="${src}" alt="" class="${active}" ${attrs}>`;
    })
    .join('\n');
}

/** @param {string} url */
function buildManifestoImageHtml(url) {
  const src = toStorefrontPath(url);
  if (!src) return '';
  return `          <img src="${escapeHtml(src)}" alt="" class="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async">`;
}

/** @param {string} url */
function buildCollectionImageHtml(url) {
  const src = toStorefrontPath(url);
  if (!src) return '';
  return `          <img src="${escapeHtml(src)}" alt="" class="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105" loading="lazy" decoding="async">`;
}

/**
 * @param {string} html
 * @param {ReturnType<typeof loadHomeMedia>} media
 */
function applyHomeMediaPatches(html, media) {
  if (!media) return html;
  let next = html;

  const heroHtml = buildHeroCarouselHtml(media.hero?.images);
  if (heroHtml) {
    if (next.includes('<!-- BUILD:HERO_CAROUSEL -->')) {
      next = next.replace('<!-- BUILD:HERO_CAROUSEL -->', heroHtml);
    } else {
      next = next.replace(
        /(<div id="hero-carousel"[^>]*>)[\s\S]*?(<\/div>)/,
        `$1\n${heroHtml}\n    $2`
      );
    }
  }

  const manifestoHtml = buildManifestoImageHtml(media.manifesto?.image);
  if (manifestoHtml) {
    if (next.includes('<!-- BUILD:MANIFESTO_IMAGE -->')) {
      next = next.replace('<!-- BUILD:MANIFESTO_IMAGE -->', manifestoHtml);
    } else {
      next = next.replace(
        /(<div class="ld-manifesto-media[^"]*"[^>]*>)[\s\S]*?(<\/div>)/,
        `$1\n${manifestoHtml}\n        $2`
      );
    }
  }

  const collectionIds = {
    silhouettes: media.collections?.silhouettes,
    signatures: media.collections?.signatures,
    finitions: media.collections?.finitions
  };

  for (const [id, url] of Object.entries(collectionIds)) {
    const imgHtml = buildCollectionImageHtml(url);
    if (!imgHtml) continue;
    const marker = `<!-- BUILD:COLLECTION_IMAGE:${id} -->`;
    if (next.includes(marker)) {
      next = next.replace(marker, imgHtml);
      continue;
    }
    const re = new RegExp(
      `(<a[^>]*data-collection-id="${id}"[^>]*>\\s*)(?:<!-- BUILD:COLLECTION_IMAGE:${id} -->\\s*)?(?:<img[\\s\\S]*?>[\\s\\S]*?)?(<div class="absolute inset-0 bg-cream-200)`,
      'm'
    );
    next = next.replace(re, `$1${imgHtml}\n          $2`);
  }

  return next;
}

function applyHomeMedia() {
  const media = loadHomeMedia();
  if (!media) return false;
  if (!fs.existsSync(INDEX_PATH)) {
    console.warn('apply-home-media: index/index.html introuvable.');
    return false;
  }

  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const patched = applyHomeMediaPatches(html, media);
  if (patched === html) {
    console.log('apply-home-media: aucune image configurée dans home-media.json.');
    return false;
  }

  fs.writeFileSync(INDEX_PATH, patched, 'utf8');
  const heroCount = (media.hero?.images || []).filter(Boolean).length;
  console.log(`apply-home-media: ${heroCount} slide(s) hero injecté(s) dans index/index.html.`);
  return true;
}

module.exports = { applyHomeMedia, applyHomeMediaPatches, loadHomeMedia };

if (require.main === module) {
  applyHomeMedia();
}
