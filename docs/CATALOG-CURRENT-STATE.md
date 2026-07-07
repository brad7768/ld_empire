# LD Empire — État actuel du système catalogue

**Task 1 — Analyse catalogue**

---

## 1. Question centrale : quelle est la source de vérité ?

**Réponse : il n'y en a pas une seule aujourd'hui.**

| Couche | Source effective | Notes |
|--------|------------------|-------|
| Boutique interactive (`index/index.html`) | **Supabase** | Si produits actifs avec variantes |
| Fallback vitrine (dev / DB vide) | **`data/catalog.json`** | 19 produits |
| Pages SEO, sitemap, feeds | **`data/catalog.json` au build** | Ignore Supabase |
| Checkout legacy (sans variantId) | **`supabase/functions/_shared/catalog.ts`** | 19 entrées manuelles |
| Admin CRUD | **Supabase** | Pas de write-back vers Git |

Le commentaire dans `catalog.json` affirme une « source unique » — **c'est l'intention documentée, pas le comportement runtime.**

---

## 2. Combien de sources de données existent ?

**3 sources de données produit** + **1 couche statique dérivée** :

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  catalog.json   │     │   catalog.ts    │     │    Supabase     │
│  (19 produits)  │     │  (19 entrées)   │     │ products +      │
│                 │     │  sync MANUELLE  │     │ product_variants│
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ build                 │ checkout legacy       │ runtime + admin
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ produit/*       │     │ Stripe session  │     │ Vitrine SPA     │
│ collection/*    │     │ (sans stock)    │     │ Panier          │
│ feeds/          │     └─────────────────┘     └─────────────────┘
│ sitemap.xml     │
└─────────────────┘
```

---

## 3. Structure de `data/catalog.json`

**Emplacement :** `L&D ecom store/data/catalog.json`  
**Nombre de produits :** 19 (`p01`–`p19`)

### Champs par produit

| Champ | Présent | Description |
|-------|---------|-------------|
| `id` | ✅ | Identifiant legacy (`p01`, …) |
| `slug` | ✅ | URL `/produit/{slug}/` |
| `nameFr`, `nameEn` | ✅ | Noms bilingues |
| `descriptionFr`, `descriptionEn` | ✅ | Descriptions |
| `category` | ✅ | Texte libre (`ready-to-wear`, `footwear`, …) |
| `priceCents`, `price` | ✅ | Prix CAD |
| `inStock` | ✅ | Booléen simplifié |
| `bestseller`, `lastChance` | ✅ | Flags merchandising |
| `googleProductCategory` | ✅ | Catégorie Google Shopping |
| `image` | ❌ | **Aucun produit n'a ce champ actuellement** |

### Catégories utilisées

- `ready-to-wear`
- `footwear`
- `leather-goods`
- `accessories`

### Anomalie connue

Plusieurs slugs ne correspondent plus aux noms affichés (héritage imports) :

| Slug | Nom actuel |
|------|------------|
| `sac-box-espresso` | Robe oversize à carreaux Mia |
| `sneaker-studio` | Sac à main Tom & Eva |
| `blazer-lin` | Escarpins élégants à bout pointu |

---

## 4. Comment un produit arrive jusqu'au frontend ?

### Chemin A — Build statique (SEO)

```
catalog.json
    → generate-pages.js (netlify-build.js)
    → produit/{slug}/index.html
    → collection/{slug}/index.html (grilles filtrées)
    → feeds/google-shopping.xml (si image présente)
    → feeds/meta-catalog.csv
```

Les visiteurs sur `/produit/manteau-laine/` voient une **page HTML statique** sans JavaScript catalogue.

### Chemin B — Runtime vitrine (SPA)

```
1. Chargement index/index.html
2. initSupabase() → js/supabase-config.js
3. LD_CATALOG.loadCatalog(sb)
       │
       ├─ Supabase: SELECT products + product_variants + inventory
       │  (si ≥1 produit actif avec variante active)
       │  → source: "supabase"
       │
       └─ Sinon: fetch data/catalog.json
          → source: "fallback"
4. products[] alimente renderCatalog(), renderBestSellers(), renderProductDetail()
```

**Priorité Supabase** (code dans `js/storefront-catalog.js`) :

```javascript
async function loadCatalog(sb) {
  if (sb) {
    const dbProducts = await fetchFromSupabase(sb);
    if (dbProducts.length) {
      return { products: dbProducts, source: "supabase" };
    }
  }
  const fallback = await fetchFallbackCatalog();
  return { products: fallback, source: "fallback" };
}
```

### Chemin C — Admin → Supabase (sans SEO)

```
admin/products.js ou theme-editor.js
    → INSERT/UPDATE products, product_variants, inventory
    → Visible immédiatement en vitrine SPA
    → PAS de mise à jour produit/*, sitemap, feeds
```

### Chemin D — Seed manuel Git → Supabase

```
npm run seed:catalog
    → seed-supabase-catalog.js
    → Upsert products par slug depuis catalog.json
    → Crée variante SEED-{id}, stock 50
```

**Non exécuté au build Netlify** — opération manuelle.

### Chemin E — Checkout

```
Panier → startStripeCheckout()
    → sb.functions.invoke('create-checkout-session')
    → Pour chaque ligne :
         1. variantId → DB + vérif stock ✅
         2. productId → PRODUCT_CATALOG (catalog.ts) ⚠️ sans stock
         3. productId comme slug → DB
    → INSERT orders + order_items (pending)
    → Redirect Stripe
```

---

## 5. `supabase/functions/_shared/catalog.ts`

- **19 entrées** (`p01`–`p19`) : `slug`, `priceCents`, `nameFr`, `nameEn` uniquement
- Commentaire : *« keep in sync at build »* — **faux** : `npm run build` ne le régénère pas
- Utilisé uniquement par `create-checkout-session` comme fallback pricing
- **Pas de vérification de stock** sur ce chemin

---

## 6. Mapping Supabase vs JSON (différences)

| Aspect | Supabase (`mapSupabaseRow`) | JSON (`mapCatalogJsonRow`) |
|--------|----------------------------|---------------------------|
| `id` | `slug` | `p01`, `p02`, … |
| Noms | Un seul `name` → fr/en | `nameFr` / `nameEn` |
| `bestseller` | **Toujours `false`** | Depuis JSON |
| `lastChance` | **Toujours `false`** | Depuis JSON |
| Images | `image_urls[]` | `row.image` (vide) |
| Variantes | Complètes + stock | Aucune (stock fictif 99) |
| `_legacyId` | Non | `p01`, etc. (utilisé checkout fallback) |

**Conséquence :** quand Supabase est actif, les sections « Best sellers » et « Dernière chance » ne fonctionnent pas correctement.

---

## 7. `generate-pages.js` — comportement important

### Ce qu'il génère

- `produit/{slug}/index.html` pour chaque entrée `catalog.json`
- 7 pages `collection/` (filtres hardcodés dans `COLLECTIONS`)
- `promo-bienvenue/index.html`
- `feeds/google-shopping.xml` et `feeds/meta-catalog.csv` (**uniquement produits avec `image`**)

### Ce qu'il ne fait PAS

- **Ne supprime pas** les dossiers `produit/{ancien-slug}/` retirés du JSON
- **Ne lit pas** Supabase
- **Ne régénère pas** `catalog.ts`

Seule suppression automatique : dossier legacy `faq/`.

---

## 8. Problèmes identifiés

| Sévérité | Problème |
|----------|----------|
| 🔴 Critique | 3 catalogues peuvent diverger (JSON / TS / DB) |
| 🔴 Critique | Produits créés en admin → pas de page SEO, sitemap, feed |
| 🔴 Critique | `bestseller` / `lastChance` perdus quand Supabase actif |
| 🟠 Majeur | `catalog.ts` jamais synchronisé automatiquement |
| 🟠 Majeur | Checkout legacy (`catalog.ts`) sans contrôle stock |
| 🟠 Majeur | Dossiers `produit/` orphelins après suppression slug |
| 🟠 Majeur | Feeds marchands vides (pas de champ `image`) |
| 🟡 Mineur | Un seul `name` en DB vs bilingue JSON |
| 🟡 Mineur | Slugs incohérents avec noms produits |

---

## 9. Workflows actuels

### Workflow Git-first (`CONTENT-VIA-GIT.md`)

```
Éditer catalog.json + assets/
    → git push
    → Netlify rebuild (SEO)
    → (optionnel) npm run seed:catalog → Supabase
```

### Workflow Admin-first (non documenté)

```
Admin → créer produit → Supabase
    → Vitrine SPA mise à jour
    → SEO / sitemap / feeds INCHANGÉS
```

---

## 10. Fichiers à modifier pour migration Supabase-only (Task 2+)

| Fichier | Modification |
|---------|--------------|
| `scripts/generate-pages.js` | Lire catalogue depuis Supabase au build |
| `scripts/netlify-build.js` | Intégrer fetch Supabase, retirer dépendance JSON |
| `data/catalog.json` | Déprécier ou réduire à config non-produit |
| `js/storefront-catalog.js` | Retirer fallback JSON (ou dev-only) |
| `index/index.html` | Checkout : toujours `slug` + `variantId` |
| `supabase/functions/_shared/catalog.ts` | Supprimer ou générer au déploiement |
| `supabase/functions/create-checkout-session/index.ts` | Retirer chemin `PRODUCT_CATALOG` |
| `scripts/seed-supabase-catalog.js` | Inverser ou supprimer |
| `admin/js/products.js` | Ajouter champs merchandising + i18n |
| `supabase/migrations/011_*.sql` | `bestseller`, `last_chance`, `name_en`, etc. |
| `produit/**`, `feeds/*`, `sitemap.xml` | Régénérer depuis Supabase |
| `CONTENT-VIA-GIT.md` | Réécrire workflow admin-first |
| `netlify.toml` / env Netlify | `SUPABASE_SERVICE_ROLE_KEY` pour build |

---

## 11. Recommandation Task 2

**Objectif :** Supabase = seule source de vérité produit.

1. Migration schéma (flags merchandising, i18n)
2. Build lit Supabase pour pages SEO + feeds
3. Suppression fallback `catalog.ts` au checkout
4. Script de purge `produit/` orphelins au build
5. `catalog.json` → métadonnées boutique uniquement (brand, currency)
