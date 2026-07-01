/**
 * Vide les médias vitrine stockés dans Supabase (hors Git).
 *
 * - products.image_urls → []
 * - site_settings.sections.hero.images → [] (published, draft, default)
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/clear-supabase-storefront-media.js
 *
 * Options :
 *   CLEAR_PRODUCTS=0   — ne pas toucher aux produits
 *   CLEAR_HERO=0       — ne pas toucher au hero site_settings
 */
async function clearSupabaseStorefrontMedia() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const clearProducts = process.env.CLEAR_PRODUCTS !== '0';
  const clearHero = process.env.CLEAR_HERO !== '0';

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key);

  if (clearProducts) {
    const { data, error } = await sb
      .from('products')
      .update({ image_urls: [], updated_at: new Date().toISOString() })
      .not('id', 'is', null)
      .select('slug');

    if (error) {
      console.error('products:', error.message);
      process.exit(1);
    }
    console.log(`Produits : image_urls vidé sur ${data?.length ?? 0} fiche(s).`);
  }

  if (clearHero) {
    const { data: rows, error: fetchErr } = await sb
      .from('site_settings')
      .select('id, locale, sections');

    if (fetchErr) {
      console.error('site_settings:', fetchErr.message);
      process.exit(1);
    }

    let updated = 0;
    for (const row of rows || []) {
      const sections = row.sections && typeof row.sections === 'object' ? { ...row.sections } : {};
      if (!sections.hero?.images?.length) continue;

      sections.hero = { ...sections.hero, images: [] };
      const { error } = await sb
        .from('site_settings')
        .update({ sections, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('locale', row.locale);

      if (error) {
        console.error(`site_settings ${row.id}/${row.locale}:`, error.message);
        continue;
      }
      updated += 1;
      console.log(`site_settings ${row.id}/${row.locale} : hero.images vidé.`);
    }

    if (!updated) {
      console.log('site_settings : aucune image hero à supprimer.');
    }
  }

  console.log('Terminé. Les visiteurs ne verront plus les anciennes images Supabase.');
  console.log('Étape suivante : ajouter vos fichiers dans assets/ + data/home-media.json + catalog.json, puis git push.');
}

module.exports = { clearSupabaseStorefrontMedia };

if (require.main === module) {
  clearSupabaseStorefrontMedia().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
