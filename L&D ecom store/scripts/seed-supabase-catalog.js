/**
 * Importe data/catalog.json vers Supabase (produits + variantes par défaut).
 * Usage : SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase-catalog.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const catalogPath = path.join(root, "data", "catalog.json");

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key);

  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const rows = catalog.products || [];

  for (const row of rows) {
    const imageUrls = row.image ? [row.image.startsWith("http") ? row.image : row.image] : [];

    const { data: product, error: pErr } = await sb
      .from("products")
      .upsert(
        {
          slug: row.slug,
          name: row.nameFr,
          description: row.descriptionFr || "",
          category: row.category,
          active: row.inStock !== false,
          image_urls: imageUrls,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" }
      )
      .select("id,slug")
      .single();

    if (pErr) {
      console.error("product", row.slug, pErr.message);
      continue;
    }

    const sku = `SEED-${row.id || row.slug}`;
    const { data: variant, error: vErr } = await sb
      .from("product_variants")
      .upsert(
        {
          product_id: product.id,
          sku,
          size: "Unique",
          color: "Standard",
          price_cents: row.priceCents,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sku" }
      )
      .select("id")
      .single();

    if (vErr) {
      console.error("variant", row.slug, vErr.message);
      continue;
    }

    await sb.from("inventory").upsert({
      variant_id: variant.id,
      on_hand: row.inStock === false ? 0 : 50,
      updated_at: new Date().toISOString(),
    });

    console.log("OK", row.slug);
  }

  console.log(`Seed terminé : ${rows.length} produits traités.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
