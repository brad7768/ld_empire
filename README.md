# L&D Empire — L&D ecom store

Boutique en ligne **L&D** (mode féminine, accessoires, parfums). Déployée sur Netlify, backend Supabase, paiements Stripe.

## Structure

```
ld_empire/
├── netlify.toml              ← base directory pour Netlify (racine du dépôt)
├── L&D ecom store/           ← application (site + admin + scripts)
│   ├── index/                ← vitrine interactive
│   ├── admin/                ← back-office + Theme Studio
│   ├── supabase/             ← migrations + Edge Functions
│   └── data/catalog.json     ← catalogue source
```

## Développement local

```bash
cd "L&D ecom store"
npm install
cp js/supabase-config.example.js js/supabase-config.js
# Éditer js/supabase-config.js (URL + clé anon Supabase)
npm run dev
# → http://localhost:8081
```

## Workflow Git → Netlify (production)

1. Modifier le code dans ce dépôt.
2. Committer et pousser sur `main` :

   ```bash
   git add -A
   git commit -m "Description du changement"
   git push origin main
   ```

3. Netlify rebuild automatiquement le site (si le site est lié à ce dépôt Git).

### Lier Netlify à GitHub (migration depuis déploiement manuel)

Dans [Netlify](https://app.netlify.com) → site **ld-store** :

1. **Site configuration → Build & deploy → Continuous deployment**
2. **Link repository** → GitHub → `brad7768/ld_empire`
3. Vérifier les réglages de build (le `netlify.toml` à la racine définit déjà `base = "L&D ecom store"`) :
   - **Branch:** `main`
   - **Base directory:** `L&D ecom store` (auto via racine `netlify.toml`)
   - **Build command:** `node scripts/netlify-build.js`
   - **Publish directory:** `.`
4. **Environment variables** (Site configuration → Environment variables) :

   | Variable | Description |
   |----------|-------------|
   | `SUPABASE_URL` | URL du projet Supabase |
   | `SUPABASE_ANON_KEY` | Clé anon publique Supabase |
   | `SITE_URL` | `https://ld-store.netlify.app` (sans slash final) |

5. **Deploy** — le premier build Git remplace le déploiement manuel. Le domaine `ld-store.netlify.app` reste inchangé.

> **Note :** Les secrets Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) restent dans **Supabase → Edge Functions → Secrets**, pas dans Netlify.

### Supabase (hors Netlify)

Après changement de schéma ou de fonctions :

```bash
cd "L&D ecom store"
supabase db push          # migrations
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

## Scripts utiles

| Commande | Rôle |
|----------|------|
| `npm run build` | Build Netlify local (SEO, sitemap, config Supabase) |
| `npm run dev` | Build + serveur statique port 8081 |
| `npm run seed:catalog` | Seed catalogue Supabase |
