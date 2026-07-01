/** @deprecated Utilisez npm run clear:supabase-media */
const { clearSupabaseStorefrontMedia } = require('./clear-supabase-storefront-media.js');

clearSupabaseStorefrontMedia().catch((e) => {
  console.error(e);
  process.exit(1);
});
