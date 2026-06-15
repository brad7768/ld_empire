/**
 * Jamstack build step — « bake » site_settings.theme + data/copywriting.json dans les pages HTML.
 *
 * Lit la ligne publiée (id = 'published') et injecte un bloc <style id="ld-theme-build">
 * dans <head>, aligné sur applyThemeFromSettings() de la vitrine.
 * Patche les attributs data-copy / marqueurs BUILD:* depuis data/copywriting.json.
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_ANON_KEY — requis pour fetch theme
 *   THEME_LOCALE — locale site_settings (défaut : fr)
 *
 * Usage :
 *   node scripts/apply-site-theme.js
 *   npm run theme:apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const root = path.join(__dirname, '..');
const COPYWRITING_PATH = path.join(root, 'data', 'copywriting.json');
const STYLE_ID = 'ld-theme-build';

const PATCH_TARGETS = [
  path.join(root, 'index', 'index.html'),
  path.join(root, 'success', 'index.html'),
];

const COLLECTION_LINKS = {
  silhouettes: '/collection/pret-a-porter',
  signatures: '/collection/parfums',
  finitions: '/collection/accessoires',
};

const COLLECTION_IMAGES = {
  silhouettes: '../assets/products/imported/new-001.png',
  signatures: '../assets/products/imported/new-009.png',
  finitions: '../assets/products/imported/new-014.png',
};

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const locale = process.env.THEME_LOCALE || 'fr';

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {Record<string, unknown>|null|undefined} obj
 * @param {string} dotPath
 * @returns {unknown}
 */
function getByPath(obj, dotPath) {
  if (!obj || !dotPath) return undefined;
  return dotPath.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

/**
 * Génère le CSS à partir du JSON theme (site_settings.theme / site_theme).
 * @param {Record<string, unknown>|null|undefined} theme
 * @returns {string}
 */
function buildThemeCss(theme) {
  if (!theme || typeof theme !== 'object') return '';

  const colors = theme.colors && typeof theme.colors === 'object' ? theme.colors : {};
  const typo = theme.typography && typeof theme.typography === 'object' ? theme.typography : {};

  let css = ':root {\n';
  if (colors.ink900) css += `  --ld-ink-900: ${colors.ink900};\n`;
  if (colors.gold700) css += `  --ld-gold-700: ${colors.gold700};\n`;
  if (colors.cream50) css += `  --ld-cream-50: ${colors.cream50};\n`;
  if (colors.cream100) css += `  --ld-cream-100: ${colors.cream100};\n`;
  css += '}\n';

  if (colors.cream50) {
    css += `body { background-color: ${colors.cream50} !important; }\n`;
  }

  const headingFont = typo.headingFont || typo.heading;
  const bodyFont = typo.bodyFont || typo.body;
  if (headingFont) {
    css += `.serif { font-family: '${String(headingFont).replace(/'/g, "\\'")}', serif !important; }\n`;
  }
  if (bodyFont) {
    css += `body { font-family: '${String(bodyFont).replace(/'/g, "\\'")}', sans-serif !important; }\n`;
  }

  return css.trim();
}

/**
 * Insère ou remplace le bloc style dans le <head>.
 * @param {string} html
 * @param {string} css
 * @returns {string}
 */
function injectThemeIntoHead(html, css) {
  if (!css) return html;

  const block = `<style id="${STYLE_ID}">\n/* Généré au build — site_settings.theme (published) */\n${css}\n</style>`;
  const existingRe = new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, 'i');

  if (existingRe.test(html)) {
    return html.replace(existingRe, `${block}\n`);
  }

  const headClose = html.indexOf('</head>');
  if (headClose === -1) {
    throw new Error('Balise </head> introuvable.');
  }

  return `${html.slice(0, headClose)}${block}\n${html.slice(headClose)}`;
}

/**
 * @param {Record<string, unknown>} copy
 * @returns {string}
 */
function buildCollectionsGridHtml(copy) {
  const collections = copy.collections;
  if (!collections || typeof collections !== 'object') return '';

  const items = Array.isArray(collections.items) ? collections.items : [];
  const cards = items
    .map((item) => {
      const id = String(item.id || '');
      const href = COLLECTION_LINKS[id] || '/collection/pret-a-porter';
      const img = COLLECTION_IMAGES[id] || '../assets/products/imported/new-001.png';

      return `<a href="${href}" class="ld-collection-card group relative block overflow-hidden aspect-[3/4] bg-cream-200" data-collection-id="${escapeHtml(id)}">
        <img src="${img}" alt="" class="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105" loading="lazy" decoding="async">
        <div class="absolute inset-0 bg-ink-900/5 group-hover:bg-ink-900/25 transition-colors duration-500"></div>
        <div class="absolute inset-0 flex items-end justify-center pb-8 px-4 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 ease-out">
          <span class="text-[10px] tracking-ultra uppercase font-light text-cream-50 drop-shadow-sm">${escapeHtml(item.title || '')}</span>
        </div>
      </a>`;
    })
    .join('\n        ');

  return `<div class="mx-auto max-w-[1600px]">
      <p class="reveal text-[11px] tracking-ultra uppercase text-ink-500 mb-8 lg:mb-10" data-copy="collections.title">${escapeHtml(collections.title || '')}</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4">
        ${cards}
      </div>
    </div>`;
}

/**
 * @param {Record<string, unknown>} copy
 * @returns {string}
 */
function buildReassuranceHtml(copy) {
  const items = Array.isArray(copy.reassurance) ? copy.reassurance : [];
  const icons = [
    `<svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.25" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>`,
    `<svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.25" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/></svg>`,
    `<svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.25" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"/></svg>`,
  ];

  const cols = items
    .map((item, i) => {
      const icon = icons[i % icons.length];
      return `<div class="flex flex-col items-center text-center px-4 lg:px-8">
          <div class="mb-4 text-ink-700">${icon}</div>
          <h3 class="text-[11px] tracking-ultra uppercase text-ink-900 mb-2">${escapeHtml(item.title || '')}</h3>
          <p class="text-sm text-ink-600 leading-relaxed max-w-xs mt-2">${escapeHtml(item.desc || '')}</p>
        </div>`;
    })
    .join('\n        ');

  return `<div class="mx-auto max-w-[1200px] px-6 lg:px-12">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-12">
        ${cols}
      </div>
    </div>`;
}

/**
 * Patche data-copy (texte) et data-copy-attr (attributs) dans le HTML.
 * @param {string} html
 * @param {Record<string, unknown>} copy
 * @returns {string}
 */
function applyCopywritingPatches(html, copy) {
  let next = html;

  next = next.replace(
    /(<([a-zA-Z][\w:-]*)([^>]*)\sdata-copy="([^"]+)"([^>]*)>)([^<]*)(<\/\2>)/g,
    (match, open, tag, before, copyPath, after, _content, close) => {
      const val = getByPath(copy, copyPath);
      if (val === undefined || val === null) return match;
      return `${open}${escapeHtml(String(val))}${close}`;
    }
  );

  next = next.replace(
    /(<([a-zA-Z][\w:-]*)([^>]*)\sdata-copy-attr="([^"]+)"([^>]*)>)/g,
    (match, open, tag, before, attrSpec, after) => {
      const [attrName, copyPath] = attrSpec.split(':');
      if (!attrName || !copyPath) return match;
      const val = getByPath(copy, copyPath);
      if (val === undefined || val === null) return match;
      const withoutAttr = open.replace(new RegExp(`\\s${attrName}="[^"]*"`, 'i'), '');
      return `${withoutAttr.slice(0, -1)} ${attrName}="${escapeHtml(String(val))}">`;
    }
  );

  if (next.includes('<!-- BUILD:COLLECTIONS -->')) {
    next = next.replace('<!-- BUILD:COLLECTIONS -->', buildCollectionsGridHtml(copy));
  } else {
    next = next.replace(
      /(<section[^>]*data-editor-section="collections"[^>]*>\s*)[\s\S]*?(\s*<\/section>)/,
      `$1${buildCollectionsGridHtml(copy)}$2`
    );
  }

  if (next.includes('<!-- BUILD:REASSURANCE -->')) {
    next = next.replace('<!-- BUILD:REASSURANCE -->', buildReassuranceHtml(copy));
  } else {
    next = next.replace(
      /(<section[^>]*data-editor-section="reassurance"[^>]*>\s*)[\s\S]*?(\s*<\/section>)/,
      `$1${buildReassuranceHtml(copy)}$2`
    );
  }

  return next;
}

/** Ordre par défaut des blocs page d'accueil (aligné theme-manifest). */
const DEFAULT_HOME_SECTION_ORDER = [
  'hero',
  'manifesto',
  'collections',
  'bestSellers',
  'instagram',
  'reviews',
  'faq',
];

/**
 * Réordonne les sections data-editor-section dans #page-home selon site_settings.sections._meta.order.
 * @param {string} html
 * @param {string[]} order
 * @returns {string}
 */
function reorderHomeSectionsInHtml(html, order) {
  if (!Array.isArray(order) || !order.length) return html;

  const homeOpen = html.indexOf('<div id="page-home"');
  if (homeOpen === -1) return html;

  const homeContentStart = html.indexOf('>', homeOpen) + 1;
  const catalogMarker = html.indexOf('<div id="page-catalog"', homeContentStart);
  if (catalogMarker === -1) return html;

  const before = html.slice(0, homeContentStart);
  const homeInner = html.slice(homeContentStart, catalogMarker);
  const after = html.slice(catalogMarker);

  const sectionRe = /<section[^>]*data-editor-section="([^"]+)"[^>]*>[\s\S]*?<\/section>/g;
  const sections = new Map();
  let match;
  while ((match = sectionRe.exec(homeInner)) !== null) {
    sections.set(match[1], match[0]);
  }

  if (!sections.size) return html;

  const reordered = [];
  const used = new Set();

  for (const id of order) {
    if (sections.has(id)) {
      reordered.push(sections.get(id));
      used.add(id);
    }
  }

  for (const [id, block] of sections) {
    if (!used.has(id)) reordered.push(block);
  }

  return `${before}${reordered.join('\n\n  ')}\n\n${after}`;
}

/**
 * @param {string} html
 * @param {Record<string, unknown>|null|undefined} sections
 * @returns {string}
 */
function applyLayoutOrder(html, sections) {
  if (!sections || typeof sections !== 'object') return html;
  const meta = sections._meta || sections.layout;
  const order = meta && typeof meta === 'object' ? meta.order : null;
  if (!Array.isArray(order) || !order.length) {
    return reorderHomeSectionsInHtml(html, DEFAULT_HOME_SECTION_ORDER);
  }
  return reorderHomeSectionsInHtml(html, order);
}

/**
 * @returns {Record<string, unknown>|null}
 */
function loadCopywriting() {
  if (!fs.existsSync(COPYWRITING_PATH)) {
    console.warn(`apply-site-theme: ${COPYWRITING_PATH} introuvable — copywriting ignoré.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(COPYWRITING_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`copywriting.json invalide : ${err.message}`);
  }
}

/**
 * @param {string} filePath
 * @param {string|null} css
 * @param {Record<string, unknown>|null} copy
 * @param {Record<string, unknown>|null|undefined} sections
 */
function patchHtmlFile(filePath, css, copy, sections) {
  if (!fs.existsSync(filePath)) {
    console.warn(`apply-site-theme: fichier introuvable — ${filePath}`);
    return;
  }

  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (css) {
    const themed = injectThemeIntoHead(html, css);
    if (themed !== html) {
      html = themed;
      changed = true;
    }
  }

  if (copy) {
    const patched = applyCopywritingPatches(html, copy);
    if (patched !== html) {
      html = patched;
      changed = true;
    }
  }

  if (sections && filePath.includes(`${path.sep}index${path.sep}index.html`)) {
    const laidOut = applyLayoutOrder(html, sections);
    if (laidOut !== html) {
      html = laidOut;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`apply-site-theme: patch appliqué → ${path.relative(root, filePath)}`);
  }
}

async function applySiteTheme() {
  const copy = loadCopywriting();
  let css = '';
  let sections = null;

  if (url && key) {
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from('site_settings')
      .select('theme, sections, is_published')
      .eq('id', 'published')
      .eq('locale', locale)
      .eq('is_published', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase site_settings : ${error.message}`);
    }

    if (data?.sections && typeof data.sections === 'object') {
      sections = data.sections;
    }

    if (data?.theme && typeof data.theme === 'object' && Object.keys(data.theme).length) {
      css = buildThemeCss(data.theme);
      if (!css) {
        console.warn('apply-site-theme: theme JSON vide ou invalide.');
      }
    } else {
      console.warn(`apply-site-theme: aucun theme publié pour locale="${locale}".`);
    }
  } else {
    console.warn(
      'apply-site-theme: SUPABASE_URL / SUPABASE_ANON_KEY absents — theme Supabase ignoré.'
    );
  }

  if (!css && !copy && !sections) {
    console.warn('apply-site-theme: rien à appliquer.');
    return;
  }

  for (const filePath of PATCH_TARGETS) {
    patchHtmlFile(filePath, css, copy, sections);
  }

  if (css) {
    console.log(`apply-site-theme: theme publié (${locale}) injecté (#${STYLE_ID}).`);
  }
  if (copy) {
    console.log('apply-site-theme: copywriting.json appliqué aux pages vitrine.');
  }
  if (sections?._meta?.order) {
    console.log('apply-site-theme: ordre des sections accueil appliqué (sections._meta.order).');
  }
}

module.exports = {
  applySiteTheme,
  buildThemeCss,
  injectThemeIntoHead,
  applyCopywritingPatches,
  loadCopywriting,
  reorderHomeSectionsInHtml,
  applyLayoutOrder,
};

if (require.main === module) {
  applySiteTheme().catch((err) => {
    console.error('apply-site-theme:', err.message || err);
    process.exit(1);
  });
}
