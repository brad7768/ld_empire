# LD Empire — Architecture cible

**Task 1 — Vision plateforme e-commerce scalable**

Document de design pour la transformation progressive de LD Empire vers une plateforme inspirée de Shopify, **sans changement de framework imposé à court terme** (évolution depuis vanilla JS).

---

## 1. Principes directeurs

| Principe | Description |
|----------|-------------|
| **Single source of truth** | Supabase = catalogue, commandes, clients, contenu structuré |
| **Séparation des couches** | Présentation / Services / Données / Paiements |
| **Build dérivé** | SEO, feeds, sitemap générés depuis Supabase au deploy |
| **Thème déclaratif** | Sections configurables (schéma déjà amorcé dans `theme-manifest.js`) |
| **Évolution incrémentale** | Pas de big-bang rewrite — extraire depuis le monolithe |
| **API-first interne** | Services JS testables avant tout framework |

---

## 2. Architecture cible (couches)

```
┌─────────────────────────────────────────────────────────────┐
│                    STOREFRONT (Theme Layer)                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │   Layout    │ │  Sections   │ │   Pages / Router        ││
│  │ header/     │ │ hero, grid, │ │ /, /products/:handle,   ││
│  │ footer/     │ │ pdp, cart…  │ │ /collections/:handle    ││
│  │ drawers     │ │ (registry)  │ │ /cart, /checkout        ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    SERVICES LAYER (JS modules)               │
│  CatalogService    CartService       CheckoutService         │
│  ContentService    CustomerService   MediaService            │
│  ThemeService      OrderService      AnalyticsService        │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    SUPABASE                                  │
│  PostgreSQL          Auth              Storage               │
│  ├ products          ├ customers       └ product-media      │
│  ├ variants          ├ admin_users                            │
│  ├ inventory         └ sessions                               │
│  ├ orders                                                     │
│  ├ carts              Edge Functions                          │
│  ├ collections        ├ create-checkout-session               │
│  ├ site_settings      ├ stripe-webhook                        │
│  ├ cms_content        └ (futures: inventory-commit, email)    │
│  └ discounts (future)                                         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    STRIPE                                    │
│  Checkout Sessions · Webhooks · (futur: Customer Portal)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Structure de dossiers recommandée (évolution progressive)

Migration par étapes depuis la structure actuelle — **ne pas tout déplacer d'un coup**.

```
L&D ecom store/
│
├── storefront/                    # NOUVEAU — extrait progressif de index/
│   ├── index.html                 # Shell minimal (remplace index/index.html)
│   ├── layout/
│   │   ├── header.js
│   │   ├── footer.js
│   │   └── drawers.js
│   ├── sections/                  # Registry sections Theme Studio
│   │   ├── hero.js
│   │   ├── product-grid.js
│   │   ├── product-detail.js
│   │   ├── manifesto.js
│   │   └── registry.js            # Map sectionId → render()
│   ├── pages/
│   │   ├── home.js
│   │   ├── catalog.js
│   │   ├── cart.js
│   │   └── checkout.js
│   ├── router.js                  # History API, routes propres
│   └── bootstrap.js               # Init app
│
├── services/                      # NOUVEAU — logique métier partagée
│   ├── catalog.js                 # Extrait de storefront-catalog.js
│   ├── cart.js
│   ├── checkout.js
│   ├── content.js                 # site_settings + cms
│   ├── customer.js
│   ├── media.js
│   └── supabase-client.js         # Factory client
│
├── theme/                         # NOUVEAU — contrat partagé admin ↔ storefront
│   ├── manifest.js                # Déplacé depuis admin/js/theme-manifest.js
│   ├── tokens.css                 # Variables design system
│   └── defaults.json
│
├── admin/                         # INCHANGÉ puis aligné sur services/
│   └── …
│
├── scripts/
│   ├── build/
│   │   ├── netlify-build.js
│   │   ├── generate-pages.js      # Lit Supabase
│   │   ├── generate-catalog-ts.js # Optionnel : sync Edge Functions
│   │   └── prune-stale-pages.js   # Supprime produit/ orphelins
│   └── …
│
├── data/
│   ├── shop.json                  # Config boutique (brand, currency) — pas produits
│   ├── copywriting.json           # Fallback textes si Supabase down
│   └── home-media.json            # Optionnel si tout dans Storage
│
├── supabase/                      # Schéma enrichi
│   └── migrations/
│       ├── 011_product_merchandising.sql
│       ├── 012_collections.sql
│       ├── 013_customer_addresses.sql
│       └── …
│
├── assets/                        # Médias statiques + CDN Supabase Storage
├── pages/                         # Légal (ou migré vers cms_content)
└── docs/                          # Documentation architecture
```

---

## 4. Gestion catalogue (cible)

### Source unique : Supabase

```
Admin CRUD ──► products + product_variants + inventory
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Storefront   Build SEO    Edge Functions
   (runtime)    (SSG)        (checkout)
```

### Schéma produit enrichi (proposition migration 011)

```sql
-- Colonnes additionnelles sur products
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bestseller boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_chance boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS google_product_category text;
```

### Collections (proposition migration 012)

```sql
collections (id, slug, title_fr, title_en, description, sort_order)
collection_products (collection_id, product_id, position)
```

### Build SEO

```javascript
// scripts/build/generate-pages.js (cible)
const products = await fetchProductsFromSupabase(serviceRole);
products.forEach(p => writeProductPage(p));
pruneStaleProductDirs(products.map(p => p.slug));
writeSitemap(products);
writeFeeds(products.filter(p => p.image_urls.length));
```

### Dépréciations

| Fichier actuel | Sort |
|----------------|------|
| `data/catalog.json` (produits) | Remplacé par Supabase |
| `supabase/functions/_shared/catalog.ts` | Supprimé ou généré |
| `npm run seed:catalog` | Remplacé par admin-only |

---

## 5. Gestion commandes (cible)

### Flux checkout amélioré

```
1. Client valide panier (CartService)
2. CheckoutService lit cart_items (DB) — pas payload ad-hoc
3. create-checkout-session :
   - Valide stock + réserve (movement_type: reserve) [futur]
   - Crée order pending
4. Stripe payment
5. stripe-webhook :
   - status → paid
   - commit stock (movement_type: sale)
   - clear cart
   - [futur] send confirmation email
6. Admin fulfillment → status shipped + tracking
```

### Enrichissements table `orders`

```sql
-- Proposition
ALTER TABLE orders ADD COLUMN user_id uuid REFERENCES auth.users;
ALTER TABLE orders ADD COLUMN stripe_session_id text;
ALTER TABLE orders ADD COLUMN tracking_number text;
ALTER TABLE orders ADD COLUMN tracking_url text;
```

### RLS client (futur)

```sql
-- Client peut lire ses propres commandes
CREATE POLICY orders_customer_select ON orders
  FOR SELECT TO authenticated
  USING (email = auth.jwt()->>'email' OR user_id = auth.uid());
```

---

## 6. Gestion utilisateurs (cible)

### Rôles

| Rôle | Table | Accès |
|------|-------|-------|
| Visiteur | — | Catalogue, panier guest, checkout |
| Client | `auth.users` + `customer_profiles` | Panier persisté, historique commandes |
| Admin | `admin_users` | Back-office complet |
| [Futur] Staff | `staff_users` + permissions | Sous-ensemble admin |

### Profil client enrichi

```
customer_profiles
customer_addresses (id, user_id, label, line1, city, postal, country, is_default)
```

### Auth storefront (existant à étendre)

- `storefront-auth.js` → migrer vers `services/customer.js`
- Merge panier guest déjà implémenté (`merge_guest_cart`)

---

## 7. Organisation des composants (Theme Layer)

### Section Registry (pattern cible)

```javascript
// storefront/sections/registry.js
import { renderHero } from './hero.js';
import { renderProductGrid } from './product-grid.js';

export const SECTION_REGISTRY = {
  hero: { render: renderHero, schema: HERO_SCHEMA },
  bestSellers: { render: renderProductGrid, schema: BESTSELLERS_SCHEMA },
  // … aligné sur theme-manifest.js
};

export function renderPage(sections, context) {
  const order = sections._meta?.order ?? DEFAULT_ORDER;
  return order
    .filter(id => !sections._meta?.hidden?.includes(id))
    .map(id => SECTION_REGISTRY[id]?.render(sections[id], context))
    .join('');
}
```

### Contrat section (partagé admin ↔ storefront)

```typescript
// theme/section-schema.ts (futur)
interface SectionSchema {
  id: string;
  label: string;
  fields: FieldSchema[];
  defaultProps: Record<string, unknown>;
}
```

Le `theme-manifest.js` admin devient la **source du schéma** — le storefront implémente les renderers.

---

## 8. Services Layer (API interne)

### CatalogService

```javascript
export class CatalogService {
  constructor(supabase) { this.sb = supabase; }

  async list({ category, filters }) { /* … */ }
  async getBySlug(slug) { /* … */ }
  async resolveVariant(product, { size, color }) { /* … */ }
}
```

### CartService

```javascript
export class CartService {
  async load() { /* guest RPC ou user cart */ }
  async addItem(variantId, qty) { /* … */ }
  async mergeGuest(token) { /* … */ }
}
```

### CheckoutService

```javascript
export class CheckoutService {
  async start({ shippingDraft, shippingMethod, locale }) {
    // Toujours variantId depuis DB — pas de catalog.ts
    return this.sb.functions.invoke('create-checkout-session', { … });
  }
}
```

### ContentService

```javascript
export class ContentService {
  async getPublishedSettings(locale) { /* site_settings published */ }
  async getCmsKey(key, locale) { /* cms_content */ }
}
```

**Avantage :** admin et storefront importent les mêmes services — fin de la duplication.

---

## 9. Admin cible (évolution)

L'admin actuel reste la base. Évolutions :

| Module | Évolution |
|--------|-----------|
| Produits | Variantes éditables, flags merchandising, SEO fields, collections |
| Clients | Nouveau module — profils, commandes, adresses |
| Commandes | Fulfillment, tracking, remboursement |
| Collections | CRUD + assignation produits |
| Remises | Codes promo (futur) |
| Theme Studio | Utilise `theme/manifest.js` partagé |
| Settings | Taxes, shipping zones, paiements |

---

## 10. Comparaison actuel → cible

| Aspect | Actuel | Cible |
|--------|--------|-------|
| Source catalogue | 3 sources | Supabase seul |
| Frontend | Monolithe 3100 lignes | Modules + sections |
| Routing | `navigate()` sans URL | History API + URLs propres |
| SEO | JSON au build | Supabase au build |
| Checkout | Payload ad-hoc + catalog.ts | DB cart + variantId only |
| Stock | Pas de commit paiement | Webhook décrément |
| Clients | Email seulement | Comptes + historique |
| Collections | Filtres hardcodés | Table + admin |
| Thème | Dual runtime/build | Service unifié |
| Tests | Aucun | Services testables |

---

## 11. Roadmap technique (Tasks 2–6)

| Task | Objectif | Durée estimée |
|------|----------|---------------|
| **Task 2** | Catalogue Supabase-only + build SEO | 1–2 semaines |
| **Task 3** | Stock commit + webhook hardening | 1 semaine |
| **Task 4** | Services layer extraction | 2 semaines |
| **Task 5** | Section registry + router URL | 2–3 semaines |
| **Task 6** | Collections, clients, remises | 3+ semaines |

---

## 12. Ce qu'on ne fait PAS (court terme)

- ❌ Migration React/Vue/Svelte (sauf décision explicite ultérieure)
- ❌ Remplacement Supabase
- ❌ Remplacement Stripe
- ❌ Multi-tenant / multi-boutique
- ❌ Headless CMS externe (Sanity, Contentful)
- ❌ Big-bang rewrite de `index/index.html`

---

## 13. Critères de succès plateforme

| Critère | Mesure |
|---------|--------|
| Source unique | 0 duplication catalogue JSON/TS |
| Admin → live | Produit visible SEO < 3 min (build Netlify) |
| Checkout fiable | 0 commande paid sans décrément stock |
| Maintenabilité | Aucun fichier > 500 lignes (hors migration transitoire) |
| Theme | Section ajoutable sans modifier le monolithe |
| Client | Compte peut voir ses commandes |

---

## 14. Références internes

- État actuel : `ARCHITECTURE-AUDIT.md`, `CATALOG-CURRENT-STATE.md`
- Risques : `REFACTORING-RISKS.md`
- Admin : `ADMIN-CURRENT-STATE.md`
- Frontend : `FRONTEND-CURRENT-STATE.md`
- Supabase : `SUPABASE-CURRENT-STATE.md`
