# LD Empire — Catalogue Specification (Task 2)

## Purpose

Define the progressive catalog unification where **Supabase becomes the primary source of truth** while keeping a temporary fallback for non-production workflows.

## Sources of Data

- **Primary (target + runtime):** Supabase tables
  - `products`
  - `product_variants`
  - `inventory`
- **Temporary fallback (dev/build fallback only):** `L&D ecom store/data/catalog.json`
- **Legacy checkout mirror (to remove):** `L&D ecom store/supabase/functions/_shared/catalog.ts`

## Current Rule Set After Task 2

1. **Checkout (`create-checkout-session`) validates from Supabase only.**
2. **Storefront catalog loads Supabase first.**
3. `catalog.json` stays in repository as temporary fallback, mainly for local/dev fallback paths.
4. SEO static generation (`generate-pages.js`) pulls from Supabase when:
   - `SUPABASE_URL` is set
   - `SUPABASE_SERVICE_ROLE_KEY` is set
   Otherwise it falls back to `catalog.json`.

## Product Model (Supabase)

Core product fields used by storefront/admin/SEO:

- `products.slug`
- `products.name`
- `products.name_en`
- `products.short_description`
- `products.description`
- `products.category`
- `products.collection`
- `products.active`
- `products.featured`
- `products.is_new`
- `products.best_seller`
- `products.last_chance`
- `products.seo_title`
- `products.seo_description`
- `products.image_urls`

Variant and stock fields:

- `product_variants.active`
- `product_variants.price_cents`
- `product_variants.sku`
- `product_variants.size`
- `product_variants.color`
- `inventory.on_hand`

## Storefront Workflow

1. Frontend calls `LD_CATALOG.loadCatalog(sb)`.
2. Supabase query returns active products + active variants + inventory.
3. Frontend maps rows into storefront product cards/PDP models.
4. Only if Supabase is unavailable and environment is local dev, fallback can use `catalog.json`.

## Admin Product Workflow

1. Admin creates/updates product in `products`.
2. Admin manages:
   - name, name_en
   - description, short_description
   - category, collection
   - image URLs
   - active/inactive
   - featured, new, best seller, last chance
   - SEO title/description
3. Admin creates/updates variants in `product_variants`.
4. Stock is managed via `inventory` + stock movement logs.

## Checkout Stripe Workflow

1. Cart line arrives with `variantId` and/or `productId` (slug).
2. Edge Function validates against Supabase:
   - `product_variants` (active, price)
   - joined `products` (active)
   - joined `inventory` (stock availability)
3. If no `variantId`, function loads product by slug and resolves first matching active variant.
4. Order + order_items are persisted, then Stripe Checkout Session is created.

## SEO Generation Workflow

1. Build script calls `generateAllPages`.
2. If service-role Supabase env vars exist, product data is fetched from Supabase.
3. Product pages, collections, promo page, feeds, and sitemap are generated from that dataset.
4. If Supabase fetch fails/unavailable, fallback uses `catalog.json`.

## Deprecation Plan

### `catalog.ts` (legacy)

- Status: still present for compatibility history.
- New checkout logic no longer depends on it.
- Remove in a later cleanup task after production validation window.

### `catalog.json` (temporary fallback)

- Keep while migration stabilizes and until all environments guarantee Supabase availability.
- Final target: optional seed/export artifact, not a runtime source.

## Operational Commands

```bash
cd "L&D ecom store"

# Apply schema updates
supabase db push

# Optional: sync fallback catalog to Supabase during transition
npm run seed:catalog

# Build static pages/feeds locally
npm run build
```

## Acceptance Criteria

- Checkout does not require `_shared/catalog.ts`.
- Storefront can list products from Supabase without relying on hardcoded catalog sources.
- SEO pages can be generated from Supabase with service-role credentials.
- Admin can manage product merchandising and SEO metadata directly from Supabase-backed forms.
