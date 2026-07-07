# LD Empire — Risques de refactoring

**Task 1 — Analyse des risques**

Ce document liste ce qu'il ne faut **pas casser**, les dépendances critiques, les fonctionnalités opérationnelles, et l'ordre recommandé des modifications.

---

## 1. Ce qu'il ne faut pas casser

### Paiements (critique business)

| Élément | Risque si cassé |
|---------|-----------------|
| `create-checkout-session` Edge Function | Impossible de payer |
| `stripe-webhook` Edge Function | Commandes restent `pending` après paiement |
| Secrets Supabase (`STRIPE_*`, `SITE_URL`) | Checkout down |
| URL success `/success/index.html` | Panier non vidé, confusion client |
| Metadata Stripe (`order_id`, `order_number`) | Webhook ne trouve pas la commande |

### Authentification admin

| Élément | Risque |
|---------|--------|
| Table `admin_users` | Lockout total admin |
| `js/supabase-config.js` généré au build | Admin + vitrine sans données |
| Redirect URLs reset password (Supabase Auth) | Recovery impossible |
| RLS `is_admin()` | Escalade ou blocage opérations |

### Vitrine live

| Élément | Risque |
|---------|--------|
| Redirects Netlify (`/produit/:slug`, `/collection/:slug`) | 404 massives |
| `site_settings` published | Textes/thème hero régressent |
| Panier guest RPC (`009` migrations) | Perte panier invités |
| `merge_guest_cart` à la connexion | Perte lignes panier |

### SEO existant

| Élément | Risque |
|---------|--------|
| URLs `/produit/{slug}/` indexées | 404 Google si slugs supprimés sans redirect |
| `sitemap.xml` | Désindexation si mal régénéré |
| Canonical URLs dans pages statiques | Duplicate content |

### Build Netlify

| Élément | Risque |
|---------|--------|
| `netlify.toml` base directory | Build fail |
| Env `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Site sans backend |
| `node scripts/netlify-build.js` | Pas de déploiement |

---

## 2. Dépendances critiques

### Graphe build

```
netlify-build.js
├── generate-pages.js ──────► catalog.json (aujourd'hui)
├── apply-home-media.js ────► home-media.json
├── apply-site-theme.js ────► copywriting.json + Supabase site_settings
└── supabase-config.js ─────► env Netlify
```

**Tout changement catalogue impacte :** sitemap, feeds, pages produit, collections, promo.

### Graphe runtime vitrine

```
index/index.html
├── supabase-config.js
├── storefront-catalog.js ──► products[] ──► tous les render*()
├── storefront-cart.js ─────► checkout payload
├── storefront-auth.js
├── site-section-overrides.js ◄── site_settings
└── create-checkout-session (Edge)
```

### Graphe admin

```
admin/main.js
├── admin_users (gate)
├── products.js ◄──► products, product_variants, inventory
├── orders.js ◄──► orders, order_items
├── theme-editor.js ◄──► site_settings, cms_content, storage
└── editor-bridge.js ◄──► index/editor-mode.js
```

### Point de couplage le plus dangereux

**`index/index.html`** — toute modification catalogue, checkout, i18n, ou UI touche un fichier de 3 100 lignes sans tests.

---

## 3. Fonctionnalités déjà opérationnelles (à préserver)

| Fonctionnalité | Composants | Statut |
|----------------|------------|--------|
| Navigation boutique SPA | `index/index.html` | ✅ |
| Catalogue avec filtres | `renderCatalog` | ✅ |
| Fiche produit SPA | `renderProductDetail` | ✅ |
| Panier invité + utilisateur | `storefront-cart.js` + RPC | ✅ |
| Wishlist localStorage | `index/index.html` | ✅ |
| Checkout Stripe | Edge Functions | ✅ |
| Confirmation commande | `success/index.html` | ✅ |
| Admin produits CRUD | `admin/products.js` | ✅ |
| Admin stock | `admin/stock.js` | ✅ |
| Admin commandes | `admin/orders.js` | ✅ |
| Theme Studio draft/publish | `theme-editor.js` | ✅ |
| Pages SEO produit/collection | `generate-pages.js` | ✅ |
| i18n FR/EN | `dict` + toggle | ✅ |
| Avis clients | `site_reviews` + localStorage fallback | ✅ |
| Build Git → Netlify auto | `netlify.toml` | ✅ |

---

## 4. Risques par type de changement

### Vider / migrer le catalogue

| Risque | Mitigation |
|--------|------------|
| 404 sur URLs indexées | Redirects 301 ou conserver slugs |
| Checkout legacy `catalog.ts` casse | Migrer avant suppression |
| Feeds Google vides | Attendre images avant republication |
| Supabase seed désynchronisé | Script migration one-shot |

### Unifier source Supabase

| Risque | Mitigation |
|--------|------------|
| Build nécessite service_role | Env Netlify sécurisé, jamais exposé client |
| Build fail si Supabase down | Cache build ou retry |
| bestseller/lastChance absents en DB | Migration 011 avant switch |

### Refactor `index/index.html`

| Risque | Mitigation |
|--------|------------|
| Régression checkout | Tests manuels checklist admin/README |
| Régression i18n | Comparer FR/EN sur chaque page |
| Casser editor-mode | Tester Theme Studio après chaque extrait |
| Global state implicite | Documenter dépendances avant extraction |

### Modifier RLS / migrations

| Risque | Mitigation |
|--------|------------|
| Lockout admin | Tester sur branche Supabase preview |
| Casser guest cart RPC | Tests anon après migration |
| Réouvrir anon order insert | Ne pas restaurer policies 004 |

### Modifier Edge Functions

| Risque | Mitigation |
|--------|------------|
| Webhook signature invalide | Tester avec Stripe CLI |
| Prix incorrect | Comparer DB vs Stripe line items |
| Commandes dupliquées | Garder filtre `status = pending` |

---

## 5. Ordre recommandé des modifications

### Phase 0 — Prérequis (sans code fonctionnel)

- ✅ Task 1 : Audit (ce dossier `docs/`)
- Documenter env Netlify / Supabase secrets
- Backup Supabase + export `catalog.json`

### Phase 1 — Catalogue unifié (Task 2)

1. Migration DB : `bestseller`, `last_chance`, champs i18n
2. `generate-pages.js` lit Supabase au build
3. Purge `produit/` orphelins au build
4. Retirer fallback `catalog.ts` checkout
5. Mapper flags en `storefront-catalog.js`
6. Déprécier `catalog.json` produits

**Risque : faible-moyen** — pas de changement UI.

### Phase 2 — Inventaire & commandes

1. Webhook : décrément stock + `inventory_movements`
2. Lier `orders` ↔ `user_id` (optionnel)
3. RLS lecture commandes client
4. Restreindre Storage upload aux admins

**Risque : moyen** — toucher webhook production.

### Phase 3 — Admin complétude

1. Fix save variantes sur fiche edit
2. CRUD variantes complet
3. Module clients (lecture)
4. Sync indicator SEO après save produit

**Risque : faible** — admin isolé.

### Phase 4 — Extraction frontend

1. Extraire services (`CatalogService`, etc.)
2. Extraire sections home en modules
3. Router URL (History API)
4. Unifier PDP (une seule URL)

**Risque : élevé** — vitrine monolithique.

### Phase 5 — Plateforme

1. Table collections
2. Remises / taxes configurables
3. Webhooks sortants
4. Multi-market

**Risque : élevé** — nouvelles features.

---

## 6. Matrice risque / impact

| Changement | Probabilité régression | Impact business | Priorité |
|------------|------------------------|-----------------|----------|
| Unifier catalogue Supabase | Moyenne | Élevé (SEO) | P1 |
| Fix stock webhook | Faible | Élevé (survente) | P1 |
| Retirer catalog.ts | Faible | Moyen | P1 |
| Refactor index.html | Élevée | Élevé | P4 |
| Nouvelles tables | Moyenne | Faible court terme | P5 |
| Changer framework | Très élevée | Très élevé | Éviter court terme |

---

## 7. Stratégie de mitigation globale

1. **Branches courtes** + preview Netlify par PR
2. **Checklist manuelle** (`admin/README.md`) après chaque déploiement
3. **Ne pas force-push `main`**
4. **Migrations Supabase** testées sur projet staging si possible
5. **Conserver slugs** lors des migrations produit (redirects)
6. **Feature flags** via `site_settings` ou env pour activer nouveau catalogue build
7. **Stripe test mode** pour valider checkout avant live

---

## 8. Signaux d'alerte post-déploiement

| Symptôme | Cause probable |
|----------|----------------|
| Catalogue vide | Supabase env manquant ou RLS |
| Checkout « Supabase missing » | `supabase-config.js` non généré |
| Commandes stuck pending | Webhook Stripe |
| Best sellers vides | Flags non migrés en DB |
| 404 produit SEO | Build pas passé ou slug orphelin |
| Admin lockout | `admin_users` ou Auth redirect |
| Hero sans images | `home-media.json` vide + Supabase hero vidé |

---

## 9. Conclusion

Le refactoring le plus sûr commence par **l'unification du catalogue côté build et backend**, sans toucher au monolithe frontend. Les changements à **plus haut risque** (extraction composants, changement framework) doivent attendre que la couche données soit stable et unique.
