# LD Empire — État actuel Supabase

**Task 1 — Analyse backend**

**Emplacement :** `L&D ecom store/supabase/`  
**Projet référencé :** `liwswmcofxlvlyokkazm` (voir DEPLOY.md)

---

## 1. Vue d'ensemble

Supabase fournit :

- **PostgreSQL** — catalogue, commandes, paniers, CMS, avis
- **Auth** — admins (`admin_users`) et clients (`customer_profiles`)
- **Storage** — bucket `product-media` (images produits + hero)
- **Edge Functions** — checkout Stripe + webhook

**10 migrations** appliquées dans l'ordre `001` → `010`.

---

## 2. Tables et relations

### Catalogue

```
products (1) ──< product_variants (N) ──< inventory (1:1)
                      │
                      └──< inventory_movements (N)
```

| Table | Colonnes clés |
|-------|---------------|
| `products` | `id`, `slug` (unique), `name`, `description`, `category`, `active`, `image_urls` (jsonb), timestamps |
| `product_variants` | `id`, `product_id`, `sku` (unique), `color`, `size`, `price_cents`, `low_stock_threshold`, `active` |
| `inventory` | `variant_id` (PK), `on_hand` |
| `inventory_movements` | audit : `movement_type`, `qty`, `reason`, `reference_type/id`, `created_by` |

**Types de mouvement définis :** `in`, `out`, `adjustment`, `sale`, `return`, `reserve`, `release`, `commit` — seuls `in/out/adjustment` utilisés par l'admin.

### Commandes

```
orders (1) ──< order_items (N) ──> product_variants (nullable)
```

| Table | Colonnes clés |
|-------|---------------|
| `orders` | `order_number` (unique), `email`, `status`, montants (subtotal/shipping/tax/total cents), `currency`, `notes` (JSON), adresse livraison (010), `paid_at` |
| `order_items` | `product_name`, `sku`, `qty`, `unit_price_cents`, `line_total_cents`, `variant_id` |

**Statuts :** `pending`, `paid`, `processing`, `shipped`, `cancelled`, `refunded`

**Pas de `orders.user_id`** — commandes liées à l'email uniquement.

### Paniers & clients

```
auth.users (1) ──< carts (N) ──< cart_items (N) ──> product_variants
              └── customer_profiles (1:1)
```

| Table | Rôle |
|-------|------|
| `carts` | Panier utilisateur (`user_id`) ou invité (`guest_token`, 30 jours) |
| `cart_items` | Lignes panier (`cart_id`, `variant_id`, `quantity`) |
| `customer_profiles` | `first_name`, `last_name` uniquement |

**Invités :** pas d'accès direct aux tables — RPC `security definer` :
`ensure_guest_cart`, `fetch_guest_cart`, `upsert_guest_cart_item`, `set_guest_cart_item_qty`, `clear_guest_cart`, `merge_guest_cart`

### CMS & contenu

| Table | Rôle |
|-------|------|
| `site_settings` | `sections` (jsonb), `theme` (jsonb), clé composite `(id, locale)` — ids : `published`, `draft`, `default` |
| `cms_content` | Clé/valeur texte par locale (`key`, `locale`, `value`, `is_published`) |

### Avis

| Table | Rôle |
|-------|------|
| `site_reviews` | Avis globaux boutique |
| `product_reviews` | Avis par `product_slug` (pas de FK vers `products`) |

### Admin

| Table | Rôle |
|-------|------|
| `admin_users` | `user_id` → `auth.users` — liste blanche admins |

### Storage

| Bucket | Config |
|--------|--------|
| `product-media` | Public, 5 Mo max, jpeg/png/webp/gif |

Chemins : `products/{uuid}-{filename}`, `site/hero/{uuid}-{filename}`

---

## 3. RLS (Row Level Security) — résumé

| Table | Public (anon) | Client auth | Admin |
|-------|---------------|-------------|-------|
| `products` | SELECT actifs | SELECT actifs | ALL |
| `product_variants` | SELECT actifs | SELECT actifs | ALL |
| `inventory` | SELECT (stock visible) | SELECT | ALL |
| `orders` | — | — | ALL |
| `carts` / `cart_items` | RPC guest | Own cart | — |
| `customer_profiles` | — | Own profile | — |
| `site_settings` | SELECT `published` | SELECT `published` | ALL |
| `cms_content` | SELECT published | SELECT published | ALL |
| `site_reviews` | INSERT + SELECT | INSERT + SELECT | — |
| `admin_users` | — | SELECT self | — |
| `storage.product-media` | SELECT | INSERT/DELETE ⚠️ | — |

**Migration 010 :** suppression des policies `orders_insert_anon` — création commande **uniquement via Edge Function** (service_role).

**⚠️ Gap sécurité :** tout utilisateur authentifié peut upload/delete dans `product-media` (pas limité aux admins).

---

## 4. Edge Functions

### `create-checkout-session`

| Attribut | Valeur |
|----------|--------|
| `verify_jwt` | `false` (endpoint public) |
| Méthode | POST |
| Secrets | `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` |

**Input :** `{ cart[], shippingDraft, shippingMethod, locale }`

**Logique par ligne panier :**
1. `variantId` → variante DB + vérif `on_hand` ✅
2. `productId` → `PRODUCT_CATALOG` (catalog.ts) ⚠️ sans stock
3. `productId` comme slug → produit DB + match variante

**Output :** `{ url, orderNumber }` → redirect Stripe Checkout

**Taxe :** 8,25 % hardcodée. Livraison express : 2500¢.

**Ne fait pas :** décrément stock, vider panier, envoyer email.

### `stripe-webhook`

| Attribut | Valeur |
|----------|--------|
| `verify_jwt` | `false` (auth via signature Stripe) |
| Événement géré | `checkout.session.completed` (si `payment_status === 'paid'`) |
| Secrets | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_*` |

**Actions :** `status → paid`, `paid_at`, colonnes shipping, enrichit `notes` JSON.

**Ne fait pas :** inventaire, panier, email, remboursements.

---

## 5. `_shared/catalog.ts`

Miroir statique de 19 produits (`p01`–`p19`). Utilisé uniquement par checkout comme fallback legacy. **Non synchronisé au build.**

---

## 6. Ordre des migrations

```
001_reviews.sql          → site_reviews, product_reviews
002_admin_mvp.sql        → products*, variants, inventory, cms, is_admin()
003_orders_admin_rls.sql → orders, order_items
004_product_images.sql   → image_urls, anon order insert (retiré en 010)
005_storage.sql          → bucket product-media
006_admin_users_fix.sql  → policy SELECT self (idempotent)
007_site_settings.sql    → site_settings
008_site_settings_draft  → theme, published/draft rows
009_carts_auth.sql       → carts, cart_items, customer_profiles, guest RPCs
010_orders_hardening.sql → shipping cols, drop anon insert, products RLS
```

**Chaîne critique checkout :** `002` → `003` → `010` + Edge Functions déployées.

---

## 7. Flux checkout actuel

```
Client → create-checkout-session
           → INSERT orders (pending) + order_items
           → Stripe Checkout Session
Client → paie sur Stripe
Stripe → stripe-webhook
           → UPDATE orders (paid)
           ⚠ inventory inchangé
           ⚠ cart inchangé
```

---

## 8. Lacunes pour un e-commerce « production »

### Clients

| Lacune | Détail |
|--------|--------|
| Pas de lien commande ↔ user | Client ne peut pas voir son historique |
| Profil minimal | Pas d'adresses, téléphone, préférences |
| Pas de trigger signup | `customer_profiles` non auto-créé |

### Inventaire

| Lacune | Détail |
|--------|--------|
| Pas de réservation stock | Race condition entre checkouts concurrents |
| Pas de décrément post-paiement | `sale`/`commit` jamais déclenchés |
| Stock public | `on_hand` visible par tous (anon) |

### Commandes & paiements

| Lacune | Détail |
|--------|--------|
| Pas de `stripe_session_id` en colonne | Stocké dans `notes` JSON |
| Pas de webhook refund/cancel | Statuts `refunded`/`cancelled` manuels |
| Commandes `pending` abandonnées | Jamais nettoyées |
| Taxe/livraison hardcodées | Pas configurables en DB |

### Catalogue

| Lacune | Détail |
|--------|--------|
| Pas de table `categories` | `category` = texte libre |
| Pas de `bestseller` / `last_chance` | Flags merchandising absents |
| Pas de noms bilingues | Un seul champ `name` |
| `product_reviews.product_slug` | Pas de FK |

### Ops

| Lacune | Détail |
|--------|--------|
| Pas d'emails transactionnels | Confirmation, expédition |
| Pas d'audit log admin | Actions non tracées |
| Reviews ouverts | Spam possible, pas de modération |
| Panier déconnecté du checkout | Edge Function ignore `carts` table |

---

## 9. Données manquantes pour cible Shopify-like

| Domaine | État | Besoin |
|---------|------|--------|
| Produits multi-variantes | ✅ Partiel | Édition variantes admin incomplète |
| Collections | ❌ | Table + relation produits |
| Clients & adresses | ❌ | `customer_addresses`, order history RLS |
| Remises / codes promo | ❌ | Table `discounts` |
| Taxes configurables | ❌ | Règles par région |
| Expédition | ❌ | Zones, tarifs, transporteurs |
| Remboursements | ❌ | Webhook + workflow admin |
| Métadonnées produit | ❌ | Metafields JSON |
| Webhooks sortants | ❌ | Events pour apps tierces |
| Multi-boutique | ❌ | Tenant isolation |

---

## 10. CLI & déploiement

```bash
cd "L&D ecom store"
supabase link --project-ref liwswmcofxlvlyokkazm
supabase db push                    # migrations
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
npm run deploy:stripe               # script helper secrets
```

Secrets Supabase (Edge Functions) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`

Variables Netlify (build) : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`
