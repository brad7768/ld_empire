/**
 * Vide image_urls sur tous les produits Supabase.
 * Usage : SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/clear-supabase-product-images.js
 */
async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key);

  const { data, error } = await sb
    .from("products")
    .update({ image_urls: [], updated_at: new Date().toISOString() })
    .not("id", "is", null)
    .select("slug");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Images supprimées sur ${data?.length ?? 0} produit(s) Supabase.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
