/**
 * Copier ce fichier vers supabase-config.js et renseigner vos identifiants.
 * Tableau de bord Supabase → Settings → API :
 *   - Project URL → url
 *   - anon public → anonKey
 *
 * Ne commitez pas supabase-config.js (voir .gitignore).
 */
window.LD_SUPABASE = {
  url: 'https://VOTRE_PROJECT.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.VOTRE_CLE_ANON_PUBLIQUE'
};

// Alternative sans fichier : sur admin/index.html, collez URL + anon dans la bannière
// jaune — la config est stockée en sessionStorage (LD_SUPABASE_SESSION).

