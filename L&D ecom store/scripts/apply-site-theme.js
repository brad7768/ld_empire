/**
 * Jamstack build step — « bake » le site_theme (site_settings.theme) dans index/index.html.
 *
 * Lit la ligne publiée (id = 'published') et injecte un bloc <style id="ld-theme-build">
 * dans <head>, aligné sur applyThemeFromSettings() de la vitrine.
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_ANON_KEY — requis pour fetch
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
const htmlPath = path.join(root, 'index', 'index.html');
const STYLE_ID = 'ld-theme-build';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const locale = process.env.THEME_LOCALE || 'fr';

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
 * Insère ou remplace le bloc style dans le <head> de index/index.html.
 * @param {string} html
 * @param {string} css
 * @returns {string}
 */
function injectThemeIntoHead(html, css) {
  const block = `<style id="${STYLE_ID}">\n/* Généré au build — site_settings.theme (published) */\n${css}\n</style>`;
  const existingRe = new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, 'i');

  if (existingRe.test(html)) {
    return html.replace(existingRe, `${block}\n`);
  }

  const headClose = html.indexOf('</head>');
  if (headClose === -1) {
    throw new Error(`${htmlPath} : balise </head> introuvable.`);
  }

  return `${html.slice(0, headClose)}${block}\n${html.slice(headClose)}`;
}

async function applySiteTheme() {
  if (!url || !key) {
    console.warn(
      'apply-site-theme: SUPABASE_URL / SUPABASE_ANON_KEY absents — index/index.html inchangé.'
    );
    return;
  }

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Fichier vitrine introuvable : ${htmlPath}`);
  }

  const sb = createClient(url, key);

  const { data, error } = await sb
    .from('site_settings')
    .select('theme, is_published')
    .eq('id', 'published')
    .eq('locale', locale)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase site_settings : ${error.message}`);
  }

  if (!data?.theme || typeof data.theme !== 'object' || !Object.keys(data.theme).length) {
    console.warn(
      `apply-site-theme: aucun theme publié pour locale="${locale}" — index/index.html inchangé.`
    );
    return;
  }

  const css = buildThemeCss(data.theme);
  if (!css) {
    console.warn('apply-site-theme: theme JSON vide ou invalide — index/index.html inchangé.');
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const next = injectThemeIntoHead(html, css);
  fs.writeFileSync(htmlPath, next, 'utf8');

  console.log(
    `apply-site-theme: theme publié (${locale}) injecté dans index/index.html (#${STYLE_ID}).`
  );
}

module.exports = { applySiteTheme, buildThemeCss, injectThemeIntoHead };

if (require.main === module) {
  applySiteTheme().catch((err) => {
    console.error('apply-site-theme:', err.message || err);
    process.exit(1);
  });
}
