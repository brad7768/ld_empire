/**

 * Netlify build hook : injecte Supabase depuis les env, génère le SEO (pages, sitemap, robots, flux).

 */

const fs = require('fs');

const path = require('path');

const { spawnSync } = require('child_process');

const { generateAllPages } = require('./generate-pages');
const { applyHomeMedia } = require('./apply-home-media');
const root = path.join(__dirname, '..');

const outPath = path.join(root, 'js', 'supabase-config.js');

const examplePath = path.join(root, 'js', 'supabase-config.example.js');



const DEFAULT_SITE_URL = 'https://ld-store.netlify.app';

const siteUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');



const url = process.env.SUPABASE_URL;

const key = process.env.SUPABASE_ANON_KEY;



if (url && key) {

  const body =

    '/**\n * Généré au build Netlify (SUPABASE_URL / SUPABASE_ANON_KEY).\n */\n' +

    'window.LD_SUPABASE = {\n' +

    `  url: ${JSON.stringify(url)},\n` +

    `  anonKey: ${JSON.stringify(key)}\n` +

    '};\n';

  fs.writeFileSync(outPath, body, 'utf8');

  console.log('netlify-build: js/supabase-config.js écrit depuis les variables d’environnement.');

} else if (!fs.existsSync(outPath) && fs.existsSync(examplePath)) {

  fs.copyFileSync(examplePath, outPath);

  console.warn(

    'netlify-build: js/supabase-config.js absent — copie depuis supabase-config.example.js (à configurer).'

  );

} else {

  console.log('netlify-build: conservation de js/supabase-config.js existant.');

}



function replaceSiteUrl(filePath) {

  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes(DEFAULT_SITE_URL)) return;

  fs.writeFileSync(filePath, content.split(DEFAULT_SITE_URL).join(siteUrl), 'utf8');

  console.log(`netlify-build: SITE_URL appliqué dans ${path.relative(root, filePath)}.`);

}



replaceSiteUrl(path.join(root, 'index.html'));

replaceSiteUrl(path.join(root, 'index', 'index.html'));

async function main() {
  applyHomeMedia();
  const { urls, counts } = await generateAllPages({ root, siteUrl });

  console.log(
    `netlify-build: ${counts.products} fiches produit, ${counts.collections} collections, ${counts.static} page statique générée.`
  );

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>

<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urls
    .map(
      (u) => `  <url>

    <loc>${u.loc}</loc>

    <changefreq>${u.changefreq || 'weekly'}</changefreq>

    <priority>${u.priority ?? 0.5}</priority>

  </url>`
    )
    .join('\n')}

</urlset>

`;

  const robots = `User-agent: *

Allow: /



Disallow: /admin/



Sitemap: ${siteUrl}/sitemap.xml

`;

  fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap, 'utf8');
  fs.writeFileSync(path.join(root, 'robots.txt'), robots, 'utf8');

  console.log(`netlify-build: sitemap.xml (${urls.length} URLs) et robots.txt générés pour ${siteUrl}.`);
  console.log('netlify-build: feeds/google-shopping.xml et feeds/meta-catalog.csv générés.');

  const themeResult = spawnSync(process.execPath, [path.join(__dirname, 'apply-site-theme.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  if (themeResult.status !== 0 && themeResult.status != null) {
    console.warn('netlify-build: apply-site-theme a échoué (build poursuivi).');
  }
}

main().catch((err) => {
  console.error('netlify-build:', err?.message || err);
  process.exit(1);
});

