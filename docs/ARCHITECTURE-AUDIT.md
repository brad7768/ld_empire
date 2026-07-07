# LD Empire — Architecture Audit

**Date :** Task 1 — Audit initial  
**Périmètre :** Dépôt `ld_empire` (boutique `L&D ecom store/`)  
**Objectif :** Cartographier l'existant avant migration vers une plateforme e-commerce scalable (inspirée Shopify).

---

## 1. Vue d'ensemble

LD Empire est une boutique e-commerce **Jamstack** : site statique sur Netlify, backend **Supabase**, paiements **Stripe**, frontend **vanilla HTML/CSS/JavaScript** (pas de framework, pas de bundler).

```
GitHub (brad7768/ld_empire)
        │
        │ push main
        ▼
Netlify (build: node scripts/netlify-build.js)
        │
        ├── Site statique publié (HTML, JS, assets/)
        │
        ▼ runtime navigateur
Supabase (PostgreSQL, Auth, Storage, Edge Functions)
        │
        ▼
Stripe (Checkout hébergé + Webhooks)
```

**Domaines connus :** `ld-store.netlify.app`, `ld-empire.ca`

---

## 2. Structure des dossiers

```
ld_empire/
├── netlify.toml                 # Base directory → "L&D ecom store"
├── README.md                    # Doc dépôt + workflow Git → Netlify
├── DEPLOY.md                    # Checklist liaison Netlify, Stripe, Supabase Auth
├── docs/                        # Documentation d'architecture (ce dossier)
│
└── L&D ecom store/              # Application déployée
    ├── index.html               # Redirection → /index/index.html
    ├── index/                   # Vitrine SPA principale (~3 100 lignes)
    ├── admin/                   # Back-office SPA séparé
    ├── js/                      # Modules vitrine partagés
    ├── data/                    # JSON source (catalogue, copywriting, médias)
    ├── scripts/                 # Build Netlify + maintenance
    ├── produit/                 # 19 fiches SEO (générées)
    ├── collection/              # 7 pages collections SEO (générées)
    ├── pages/                   # Pages légales statiques (4)
    ├── assets/                  # Images versionnées Git (~143 fichiers)
    ├── feeds/                   # Google Shopping + Meta Catalog (générés)
    ├── supabase/                # Migrations SQL + Edge Functions
    ├── promo-bienvenue/         # Landing promo (générée)
    ├── success/                 # Confirmation commande Stripe
    ├── package.json             # 2 devDependencies npm
    └── CONTENT-VIA-GIT.md         # Guide contenu via Git
```

---

## 3. Responsabilités par dossier

| Dossier | Responsabilité |
|---------|----------------|
| **`index/`** | Boutique interactive : accueil, catalogue, PDP, panier, checkout, compte client, wishlist, FAQ |
| **`admin/`** | Gestion produits, commandes, stock, analytics, Theme Studio (CMS visuel) |
| **`js/`** | Catalogue, panier, auth client, overrides CMS, config Supabase |
| **`data/`** | Sources JSON : `catalog.json`, `copywriting.json`, `home-media.json` |
| **`scripts/`** | Pipeline build (`netlify-build.js`), génération SEO, seed Supabase, thème, médias |
| **`produit/`**, **`collection/`** | Pages HTML statiques pour SEO et partage social |
| **`pages/`** | CGV, confidentialité, livraison, contact |
| **`assets/`** | Médias servis directement (hero, produits, lookbook) |
| **`feeds/`** | Flux marchands régénérés au build |
| **`supabase/`** | Schéma DB, RLS, fonctions Edge Stripe |
| **`Telegram Desktop/`** | ⚠️ Photos brutes non intégrées au workflow (hors pipeline documenté) |

---

## 4. Flux de données

### Build (Netlify)

```
SUPABASE_URL + SUPABASE_ANON_KEY
        → js/supabase-config.js

data/catalog.json
        → generate-pages.js
        → produit/*, collection/*, promo-bienvenue, feeds/, (sitemap via netlify-build)

data/home-media.json
        → apply-home-media.js
        → injection images dans index/index.html

data/copywriting.json + site_settings (Supabase published)
        → apply-site-theme.js
        → textes + CSS thème dans HTML
```

### Runtime (navigateur)

```
Supabase (products actifs)
        → storefront-catalog.js (prioritaire)
        → index/index.html (grille, PDP, best sellers)

catalog.json (fallback)
        → si Supabase absent ou vide

site_settings (published)
        → loadSiteSettingsOverrides()
        → textes hero, thème, ordre sections

Panier
        → storefront-cart.js (RPC guest ou table carts si auth)
        → create-checkout-session (Edge Function)
        → Stripe Checkout
        → stripe-webhook → orders.status = paid
```

---

## 5. Dépendances entre fichiers critiques

```
netlify-build.js
├── generate-pages.js          ← catalog.json
├── apply-home-media.js        ← home-media.json
├── apply-site-theme.js        ← copywriting.json + Supabase site_settings
└── supabase-config.js         ← env Netlify

index/index.html
├── js/storefront-catalog.js
├── js/storefront-cart.js
├── js/storefront-auth.js
├── js/site-section-overrides.js
└── js/supabase-config.js

create-checkout-session/index.ts
├── _shared/catalog.ts         ← miroir manuel catalog.json
└── Supabase service_role

admin/index.html
├── js/main.js                 ← bootstrap Supabase + modules
├── js/products.js, orders.js, stock.js, theme-editor.js, …
└── js/theme-manifest.js       ← schéma sections éditables
```

---

## 6. Points critiques

| # | Point | Impact |
|---|-------|--------|
| 1 | **Triple source catalogue** (JSON, Supabase, catalog.ts) | Données incohérentes shop / SEO / checkout |
| 2 | **SPA monolithique** (`index/index.html` ~3 100 lignes) | Refactor risqué, pas de tests unitaires |
| 3 | **Pas de bundler** | Pas de tree-shaking, dépendances CDN (Tailwind) |
| 4 | **Build ≠ runtime** pour le catalogue | Admin peut créer des produits absents du SEO |
| 5 | **Stock non décrémenté** au paiement | Risque de survente |
| 6 | **Secrets** : service_role jamais côté client (OK), mais checkout public (`verify_jwt = false`) |
| 7 | **Dossier `Telegram Desktop/`** dans le repo | Bruit, risque de commit massif d'images |

---

## 7. Duplication de logique

| Domaine | Occurrences |
|---------|-------------|
| Catalogue produits | `data/catalog.json`, `supabase/functions/_shared/catalog.ts`, tables `products` |
| CMS contenu | `cms_content`, `site_settings.sections`, `data/copywriting.json` |
| Thème | Runtime `#ld-theme-overrides` + build `#ld-theme-build` |
| Création produit admin | `theme-editor.js` (nouveau) vs `products.js` (édition) |
| i18n | `dict` inline dans index.html, copywriting, site_settings |
| Images hero | `home-media.json` (Git/build), `site_settings.hero.images` (Supabase) |

---

## 8. Fichiers obsolètes ou à surveiller

| Fichier / zone | Statut |
|----------------|--------|
| `scripts/clear-supabase-product-images.js` | Déprécié → `clear-supabase-storefront-media.js` |
| `supabase/functions/_shared/catalog.ts` | Commentaire « sync au build » **inexact** — jamais auto-généré |
| `Telegram Desktop/` | Non structuré, hors `assets/` |
| `faq/` | Supprimé par generate-pages si présent |
| Slugs produits vs noms | Incohérences legacy (ex. `sac-box-espresso` = robe) |

---

## 9. Stack technique

| Couche | Technologie |
|--------|-------------|
| Hébergement | Netlify (static) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions Deno) |
| Paiements | Stripe Checkout + Webhooks |
| Frontend | Vanilla JS, Tailwind CDN, Google Fonts |
| Admin | ES modules, Chart.js, hash router |
| Build | Node.js (scripts custom, pas de Webpack/Vite) |
| npm | `@supabase/supabase-js`, `serve` (dev local) |

---

## 10. Métriques du dépôt

| Métrique | Valeur |
|----------|--------|
| Fichiers totaux (hors node_modules, .git) | ~352 |
| Fichiers code/config principaux | ~87 |
| Produits dans catalog.json | 19 |
| Pages produit SEO | 19 |
| Collections SEO | 7 |
| Migrations Supabase | 10 |
| Edge Functions | 2 |
| Lignes index/index.html | ~3 100 |

---

## 11. Conclusion

L'architecture actuelle est un **MVP e-commerce fonctionnel** avec un admin avancé (Theme Studio) et une vitrine riche, mais construite autour d'un **monolithe frontend** et d'un **catalogue multi-sources** non synchronisé. La migration vers une plateforme scalable passe par l'unification Supabase comme source unique et l'extraction progressive des responsabilités du fichier `index/index.html`.

Voir aussi : `CATALOG-CURRENT-STATE.md`, `TARGET-ARCHITECTURE.md`, `REFACTORING-RISKS.md`.
