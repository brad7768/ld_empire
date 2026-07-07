/**
 * Génère pages SEO statiques, sitemap, flux Google Shopping et Meta Catalog.
 */
const fs = require('fs');
const path = require('path');

const COLLECTIONS = [
  {
    slug: 'pret-a-porter',
    titleFr: 'Prêt-à-porter',
    titleEn: 'Ready-to-wear',
    descriptionFr: 'Vêtements féminins sélectionnés pour allier élégance du quotidien et qualité durable.',
    category: 'ready-to-wear',
  },
  {
    slug: 'chaussures',
    titleFr: 'Chaussures',
    titleEn: 'Footwear',
    descriptionFr: 'Mules, escarpins et silhouettes signature — confort et finitions premium.',
    category: 'footwear',
  },
  {
    slug: 'maroquinerie',
    titleFr: 'Maroquinerie',
    titleEn: 'Leather goods',
    descriptionFr: 'Sacs et pièces structurées en cuir, pensées pour accompagner votre quotidien.',
    category: 'leather-goods',
  },
  {
    slug: 'accessoires',
    titleFr: 'Accessoires',
    titleEn: 'Accessories',
    descriptionFr: 'Bijoux et accessoires de caractère, en éditions limitées.',
    filter: 'accessoires-non-parfum',
  },
  {
    slug: 'nouveautes',
    titleFr: 'Nouveautés',
    titleEn: 'New arrivals',
    descriptionFr: 'Les dernières pièces ajoutées à la boutique L&D.',
    filter: 'nouveautes',
  },
  {
    slug: 'derniere-chance',
    titleFr: 'Dernière chance',
    titleEn: 'Last chance',
    descriptionFr: 'Fin de stock — pièces disponibles en quantité limitée.',
    filter: 'lastChance',
  },
  {
    slug: 'parfums',
    titleFr: 'Parfums',
    titleEn: 'Fragrances',
    descriptionFr: 'Eaux de parfum Collection Privée — signatures olfactives sophistiquées.',
    filter: 'parfums',
  },
];

const CATEGORY_BOOT = {
  'pret-a-porter': 'ready-to-wear',
  chaussures: 'footwear',
  maroquinerie: 'leather-goods',
  accessoires: 'accessories',
};

const FAQ_HOME_LINK = '/index/index.html#faq';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(price) {
  return price.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPriceCents(cents) {
  return (cents / 100).toFixed(2);
}

function resolveImageUrl(image, siteUrl) {
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  const normalized = image.startsWith('/') ? image : `/${image}`;
  return `${siteUrl}${normalized}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePage(filePath, html) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, html, 'utf8');
}

function isParfum(product) {
  return product.collection === 'parfums' || product.category === 'parfums' || product.slug.startsWith('parfum-');
}

function isNouveaute(product) {
  return Boolean(product.isNew) || product.slug.startsWith('nouveautes-');
}

function productsForCollection(collection, products) {
  if (collection.filter === 'parfums') return products.filter(isParfum);
  if (collection.filter === 'nouveautes') return products.filter(isNouveaute);
  if (collection.filter === 'lastChance') return products.filter((p) => p.lastChance);
  if (collection.filter === 'accessoires-non-parfum') {
    return products.filter((p) => p.category === 'accessories' && !isParfum(p));
  }
  if (collection.category) return products.filter((p) => p.category === collection.category);
  return products;
}

function shopUrl(params) {
  const qs = new URLSearchParams(params).toString();
  return `/index/index.html${qs ? `?${qs}` : ''}`;
}

function reassuranceBar() {
  return `
    <div class="mt-10 grid gap-4 sm:grid-cols-3 border border-ink-100 bg-cream-100/50 p-6 text-center text-xs tracking-wide uppercase text-ink-600">
      <div>Livraison soignée</div>
      <div><a href="${FAQ_HOME_LINK}" class="link-underline hover:text-gold-700">Retours faciles</a></div>
      <div>Paiement sécurisé Stripe</div>
    </div>`;
}

function pageShell({ title, description, canonical, ogType, jsonLd, body, siteUrl }) {
  const ldScript = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="L&amp;D">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:type" content="${escapeHtml(ogType || 'website')}">
  <meta property="og:locale" content="fr_CA">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            cream: { 50: '#FDFAF5', 100: '#FAF5EC', 200: '#F2EBDD' },
            ink: { 400: '#A8A29E', 500: '#78716C', 600: '#57534E', 700: '#44403C', 900: '#1C1917' },
            gold: { 500: '#B8924A', 700: '#7E6028' },
          },
          fontFamily: {
            display: ['Cormorant Garamond', 'serif'],
            sans: ['DM Sans', 'system-ui', 'sans-serif'],
          },
          letterSpacing: { widest: '0.25em', ultra: '0.35em' },
        }
      }
    }
  </script>
  <style>
    body { background: #FDFAF5; color: #1C1917; font-family: 'DM Sans', sans-serif; }
    .serif { font-family: 'Cormorant Garamond', serif; font-weight: 400; }
    .link-underline { position: relative; display: inline-block; }
    .link-underline::after {
      content: ""; position: absolute; bottom: -2px; left: 0; width: 100%; height: 1px;
      background: currentColor; transform: scaleX(0); transform-origin: right; transition: transform .4s;
    }
    .link-underline:hover::after { transform: scaleX(1); transform-origin: left; }
    .prose h2 { font-family: 'Cormorant Garamond', serif; font-size: 1.35rem; margin: 1.75rem 0 .75rem; }
    .prose p, .prose li { font-size: .875rem; line-height: 1.65; color: #57534E; }
    .prose ul { list-style: disc; padding-left: 1.25rem; margin: .75rem 0; }
  </style>
  ${ldScript}
</head>
<body>
  <header class="sticky top-0 z-50 border-b border-ink-100 bg-cream-50/95 backdrop-blur-md">
    <div class="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
      <a href="/" class="serif text-xl text-ink-900 hover:text-gold-700">L&amp;D</a>
      <nav class="flex items-center gap-6 text-[11px] tracking-widest uppercase">
        <a href="${shopUrl({})}" class="text-ink-600 hover:text-ink-900 link-underline">Boutique</a>
        <a href="${FAQ_HOME_LINK}" class="text-ink-600 hover:text-ink-900 link-underline">FAQ</a>
        <a href="/pages/contact.html" class="text-ink-600 hover:text-ink-900 link-underline">Contact</a>
      </nav>
    </div>
  </header>
  <main class="mx-auto max-w-[1200px] px-6 py-12 lg:py-16">
    ${body}
  </main>
  <footer class="border-t border-ink-100 bg-cream-50 py-10 text-center text-[11px] tracking-widest uppercase text-ink-500">
    <div class="flex flex-wrap justify-center gap-4 mb-4">
      <a href="${FAQ_HOME_LINK}" class="hover:text-gold-700">FAQ</a>
      <a href="/pages/livraison-retours.html" class="hover:text-gold-700">Livraison &amp; retours</a>
      <a href="/pages/politique-confidentialite.html" class="hover:text-gold-700">Confidentialité</a>
    </div>
    <p>&copy; ${new Date().getFullYear()} L&amp;D — ${escapeHtml(siteUrl.replace('https://', ''))}</p>
  </footer>
</body>
</html>`;
}

function productCard(product, siteUrl) {
  const url = `${siteUrl}/produit/${product.slug}/`;
  const imageUrl = resolveImageUrl(product.image, siteUrl);
  const media = product.image
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.nameFr)}" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" width="400" height="500">`
    : `<span class="block h-full w-full bg-cream-200" aria-hidden="true"></span>`;
  return `
    <article class="group">
      <a href="${url}" class="block aspect-[4/5] overflow-hidden bg-cream-100 mb-4">
        ${media}
      </a>
      <h3 class="serif text-lg"><a href="${url}" class="hover:text-gold-700">${escapeHtml(product.nameFr)}</a></h3>
      <p class="mt-1 text-sm text-ink-600">${formatPrice(product.price)}&nbsp;$ CAD</p>
      <a href="${shopUrl({ p: product.slug })}" class="mt-3 inline-block text-[11px] tracking-widest uppercase link-underline text-gold-700">Acheter en boutique</a>
    </article>`;
}

function renderProductPage(product, siteUrl) {
  const canonical = `${siteUrl}/produit/${product.slug}/`;
  const imageUrl = resolveImageUrl(product.image, siteUrl);
  const priceStr = formatPrice(product.price);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.nameFr,
    ...(imageUrl ? { image: [imageUrl] } : {}),
    description: product.descriptionFr,
    sku: product.id,
    brand: { '@type': 'Brand', name: 'L&D' },
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'CAD',
      price: formatPriceCents(product.priceCents),
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  const body = `
    <nav class="mb-8 text-[10px] tracking-widest uppercase text-ink-500">
      <a href="/" class="hover:text-ink-900">Accueil</a> /
      <a href="${shopUrl({})}" class="hover:text-ink-900">Boutique</a> /
      <span class="text-ink-900">${escapeHtml(product.nameFr)}</span>
    </nav>
    <div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div class="aspect-[4/5] overflow-hidden bg-cream-200">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.nameFr)} — L&amp;D" class="h-full w-full object-cover" width="800" height="1000">` : '<span class="block h-full w-full bg-cream-200" aria-hidden="true"></span>'}
      </div>
      <div>
        <p class="text-[11px] tracking-ultra uppercase text-gold-700 mb-3">L&amp;D · Collection</p>
        <h1 class="serif text-4xl lg:text-5xl font-light text-ink-900">${escapeHtml(product.nameFr)}</h1>
        <p class="mt-4 text-xl text-ink-700">${priceStr}&nbsp;$ CAD</p>
        <p class="mt-6 text-sm leading-relaxed text-ink-600">${escapeHtml(product.descriptionFr)}</p>
        <a href="${shopUrl({ p: product.slug })}" class="mt-8 inline-flex h-14 items-center justify-center bg-ink-900 px-10 text-[11px] tracking-ultra uppercase text-cream-50 hover:bg-gold-700 transition-colors">
          Voir en boutique &amp; ajouter au panier
        </a>
        ${reassuranceBar()}
      </div>
    </div>`;

  return pageShell({
    title: product.seoTitle || `${product.nameFr} — L&D`,
    description: (product.seoDescription || product.descriptionFr || '').slice(0, 155),
    canonical,
    ogType: 'product',
    jsonLd,
    body,
    siteUrl,
  });
}

function renderCollectionPage(collection, items, siteUrl) {
  const canonical = `${siteUrl}/collection/${collection.slug}/`;
  const bootParam = CATEGORY_BOOT[collection.slug]
    ? { category: CATEGORY_BOOT[collection.slug] }
    : collection.filter === 'lastChance'
      ? { page: 'lastChance' }
      : {};

  const grid =
    items.length > 0
      ? `<div class="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">${items.map((p) => productCard(p, siteUrl)).join('')}</div>`
      : `<p class="mt-8 text-sm text-ink-600">Aucun produit disponible pour le moment.</p>`;

  const body = `
    <nav class="mb-8 text-[10px] tracking-widest uppercase text-ink-500">
      <a href="/" class="hover:text-ink-900">Accueil</a> /
      <span class="text-ink-900">${escapeHtml(collection.titleFr)}</span>
    </nav>
    <h1 class="serif text-4xl lg:text-5xl font-light text-ink-900">${escapeHtml(collection.titleFr)}</h1>
    <p class="mt-4 max-w-2xl text-sm leading-relaxed text-ink-600">${escapeHtml(collection.descriptionFr)}</p>
    <a href="${shopUrl(bootParam)}" class="mt-6 inline-block text-[11px] tracking-widest uppercase link-underline text-gold-700">Parcourir en boutique interactive</a>
    ${grid}
    ${reassuranceBar()}`;

  return pageShell({
    title: `${collection.titleFr} — L&D`,
    description: collection.descriptionFr,
    canonical,
    body,
    siteUrl,
  });
}

function renderPromoPage(products, siteUrl) {
  const canonical = `${siteUrl}/promo-bienvenue/`;
  const bestsellers = products.filter((p) => p.bestseller).slice(0, 6);
  const grid = `<div class="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">${bestsellers.map((p) => productCard(p, siteUrl)).join('')}</div>`;

  const body = `
    <p class="text-[11px] tracking-ultra uppercase text-gold-700">Offre de bienvenue</p>
    <h1 class="serif mt-3 text-4xl lg:text-5xl font-light text-ink-900">−5&nbsp;% sur votre première commande</h1>
    <p class="mt-4 max-w-2xl text-sm leading-relaxed text-ink-600">Utilisez le code <strong class="text-ink-900">BIENVENUE05</strong> au checkout Stripe. Sélection de nos pièces les plus appréciées :</p>
    ${grid}
    <div class="mt-10 text-center">
      <a href="${shopUrl({})}" class="inline-flex h-14 items-center justify-center bg-ink-900 px-10 text-[11px] tracking-ultra uppercase text-cream-50 hover:bg-gold-700">Découvrir toute la boutique</a>
    </div>
    ${reassuranceBar()}`;

  return pageShell({
    title: '−5 % bienvenue — L&D',
    description: 'Profitez de −5 % sur votre première commande L&D avec le code BIENVENUE05. Mode féminine et parfums sélectionnés.',
    canonical,
    body,
    siteUrl,
  });
}

function renderGoogleShoppingFeed(products, siteUrl) {
  const items = products
    .filter((p) => p.image)
    .map((p) => {
      const link = `${siteUrl}/produit/${p.slug}/`;
      const image = resolveImageUrl(p.image, siteUrl);
      return `  <item>
    <g:id>${escapeHtml(p.id)}</g:id>
    <g:title>${escapeHtml(p.nameFr)}</g:title>
    <g:description>${escapeHtml(p.descriptionFr)}</g:description>
    <g:link>${escapeHtml(link)}</g:link>
    <g:image_link>${escapeHtml(image)}</g:image_link>
    <g:price>${formatPriceCents(p.priceCents)} CAD</g:price>
    <g:availability>${p.inStock ? 'in_stock' : 'out_of_stock'}</g:availability>
    <g:brand>L&amp;D</g:brand>
    <g:condition>new</g:condition>
    <g:google_product_category>${escapeHtml(p.googleProductCategory)}</g:google_product_category>
  </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>L&amp;D — Google Shopping</title>
    <link>${siteUrl}/</link>
    <description>Flux produits L&amp;D pour Google Merchant Center</description>
${items}
  </channel>
</rss>`;
}

function csvEscape(value) {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function renderMetaCatalogFeed(products, siteUrl) {
  const header = 'id,title,description,availability,condition,price,link,image_link,brand';
  const rows = products.filter((p) => p.image).map((p) =>
    [
      p.id,
      p.nameFr,
      p.descriptionFr,
      p.inStock ? 'in stock' : 'out of stock',
      'new',
      `${formatPriceCents(p.priceCents)} CAD`,
      `${siteUrl}/produit/${p.slug}/`,
      resolveImageUrl(p.image, siteUrl),
      'L&D',
    ]
      .map(csvEscape)
      .join(',')
  );
  return [header, ...rows].join('\n');
}

function renderSitemap(urls) {
  const entries = urls
    .map(
      (u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    <changefreq>${u.changefreq || 'weekly'}</changefreq>
    <priority>${u.priority ?? 0.5}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

function safeOnHand(inv) {
  if (Array.isArray(inv)) return Number(inv[0]?.on_hand ?? 0);
  if (inv && typeof inv === 'object') return Number(inv.on_hand ?? 0);
  return 0;
}

function mapDbProduct(row) {
  const variants = (row.product_variants || []).filter((v) => v.active !== false);
  const minPriceCents = variants.length ? Math.min(...variants.map((v) => Number(v.price_cents || 0))) : 0;
  const hasStock = variants.some((v) => safeOnHand(v.inventory) > 0);
  const firstImage = Array.isArray(row.image_urls) ? String(row.image_urls[0] || '') : '';
  const image = firstImage ? (firstImage.startsWith('/') || /^https?:\/\//i.test(firstImage) ? firstImage : `/${firstImage}`) : '';
  return {
    id: row.id,
    slug: row.slug,
    nameFr: row.name,
    nameEn: row.name_en || row.name,
    descriptionFr: row.description || row.short_description || '',
    descriptionEn: row.description || row.short_description || '',
    category: row.category || '',
    collection: row.collection || '',
    priceCents: minPriceCents,
    price: minPriceCents / 100,
    image,
    inStock: hasStock,
    bestseller: !!row.best_seller,
    isNew: !!row.is_new,
    lastChance: !!row.last_chance,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    googleProductCategory: 'Apparel & Accessories',
  };
}

async function loadProductsFromSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from('products')
    .select(`
      id, slug, name, name_en, short_description, description,
      featured, is_new, best_seller, last_chance,
      seo_title, seo_description,
      active, category, collection, image_urls,
      product_variants (
        id, price_cents, active,
        inventory ( on_hand )
      )
    `)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Supabase catalog query failed: ${error.message}`);
  return (data || []).map(mapDbProduct);
}

function loadProductsFromCatalogJson(root) {
  const catalogPath = path.join(root, 'data', 'catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  return catalog.products || [];
}

/**
 * @param {{ root: string, siteUrl: string }} opts
 * @returns {Promise<{ urls: Array<{loc:string,priority?:number,changefreq?:string}>, counts: Record<string,number>, products: unknown[] }>}
 */
async function generateAllPages(opts) {
  const { root, siteUrl } = opts;
  let products = [];
  let source = 'catalog.json';

  try {
    const dbProducts = await loadProductsFromSupabase();
    if (dbProducts && dbProducts.length) {
      products = dbProducts;
      source = 'supabase';
    }
  } catch (err) {
    console.warn(`generate-pages: Supabase unavailable, fallback catalog.json (${err.message || err})`);
  }

  if (!products.length) {
    products = loadProductsFromCatalogJson(root);
  }

  const counts = { products: 0, collections: 0, static: 0 };

  products.forEach((product) => {
    const out = path.join(root, 'produit', product.slug, 'index.html');
    writePage(out, renderProductPage(product, siteUrl));
    counts.products++;
  });

  COLLECTIONS.forEach((collection) => {
    const items = productsForCollection(collection, products);
    const out = path.join(root, 'collection', collection.slug, 'index.html');
    writePage(out, renderCollectionPage(collection, items, siteUrl));
    counts.collections++;
  });

  writePage(path.join(root, 'promo-bienvenue', 'index.html'), renderPromoPage(products, siteUrl));
  counts.static = 1;

  const faqDir = path.join(root, 'faq');
  const faqFile = path.join(faqDir, 'index.html');
  if (fs.existsSync(faqFile)) fs.unlinkSync(faqFile);
  if (fs.existsSync(faqDir)) {
    try { fs.rmdirSync(faqDir); } catch { /* dossier non vide ou absent */ }
  }

  ensureDir(path.join(root, 'feeds'));
  fs.writeFileSync(
    path.join(root, 'feeds', 'google-shopping.xml'),
    renderGoogleShoppingFeed(products, siteUrl),
    'utf8'
  );
  fs.writeFileSync(
    path.join(root, 'feeds', 'meta-catalog.csv'),
    renderMetaCatalogFeed(products, siteUrl),
    'utf8'
  );

  const urls = [
    { loc: `${siteUrl}/`, priority: 1.0, changefreq: 'weekly' },
    { loc: `${siteUrl}/index/index.html`, priority: 0.9, changefreq: 'weekly' },
    { loc: `${siteUrl}/promo-bienvenue/`, priority: 0.8, changefreq: 'weekly' },
    { loc: `${siteUrl}/feeds/google-shopping.xml`, priority: 0.2, changefreq: 'daily' },
    { loc: `${siteUrl}/pages/contact.html`, priority: 0.6, changefreq: 'monthly' },
    { loc: `${siteUrl}/pages/livraison-retours.html`, priority: 0.6, changefreq: 'monthly' },
    { loc: `${siteUrl}/pages/conditions-utilisation.html`, priority: 0.3, changefreq: 'yearly' },
    { loc: `${siteUrl}/pages/politique-confidentialite.html`, priority: 0.3, changefreq: 'yearly' },
  ];

  products.forEach((p) => {
    urls.push({ loc: `${siteUrl}/produit/${p.slug}/`, priority: 0.9, changefreq: 'weekly' });
  });

  COLLECTIONS.forEach((c) => {
    urls.push({ loc: `${siteUrl}/collection/${c.slug}/`, priority: 0.8, changefreq: 'weekly' });
  });

  console.log(`generate-pages: source=${source}, products=${products.length}`);
  return { urls, counts, products };
}

module.exports = { generateAllPages, COLLECTIONS };
