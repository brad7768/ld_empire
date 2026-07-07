# LD Empire — État actuel du Frontend

**Task 1 — Analyse vitrine**

---

## 1. Architecture hybride

| Couche | Technologie | Rôle |
|--------|-------------|------|
| **SPA principale** | `index/index.html` (~3 101 lignes) | Boutique interactive |
| **Pages SEO statiques** | `produit/{slug}/`, `collection/{slug}/` | Référencement, partage social |
| **Pages légales** | `pages/*.html` (4 fichiers) | CGV, contact, etc. |
| **Modules JS** | `js/*.js` (772 lignes total) | Catalogue, panier, auth, CMS |
| **Build** | `scripts/generate-pages.js`, `apply-site-theme.js` | Génération + injection contenu |

**Redirection racine :** `/index.html` → `/index/index.html`

---

## 2. Navigation SPA

### Pages virtuelles (6)

Toutes sont des `<div class="page">` dans le même fichier, togglées via `.active` :

| ID | `navigate()` | Contenu |
|----|--------------|---------|
| `#page-home` | `home` | Hero, manifeste, collections, best sellers, Instagram, avis, FAQ |
| `#page-catalog` | `catalog` | Grille filtrable |
| `#page-lastChance` | `lastChance` | Produits `lastChance` |
| `#page-product` | `product` | PDP dynamique |
| `#page-cart` | `cart` | Panier complet |
| `#page-checkout` | `checkout` | Checkout 2 étapes |

### Fonction `navigate(page, productSlug?, preserveCheckout?)`

- Masque toutes les `.page`, active `#page-{page}`
- Met à jour `state.currentPage`
- Appelle `renderCurrentPage()`
- **Pas d'History API** — l'URL ne change pas en navigation interne

### Deep-links au boot

| Paramètre URL | Effet |
|---------------|-------|
| `?p={slug}` | Ouvre PDP SPA |
| `?category={key}` | Catalogue filtré |
| `?page=lastChance` | Page dernière chance |
| `#faq` | Scroll FAQ sur accueil |
| `?checkout=cancel` | Restaure checkout après annulation Stripe |
| `?editor=1` | Mode Theme Studio |
| `?preview=1` | Charge `site_settings` draft |

### Navigation hybride (point de friction)

- Header : liens vers URLs réelles (`/collection/nouveautes`)
- Cartes produit SPA : liens vers `/produit/{slug}` (SEO statique)
- PDP SPA : accessible via `?p=` depuis pages statiques ou boot
- `navigate('product', slug)` rarement appelé hors boot

---

## 3. Rendu des produits

### Chargement données

```javascript
// index/index.html ~3017
const loaded = await LD_CATALOG.loadCatalog(sb);
products = loaded.products;
catalogSource = loaded.source; // "supabase" | "fallback"
```

### Composants de rendu (fonctions globales)

| Fonction | Cible DOM | Logique |
|----------|-----------|---------|
| `renderCatalog()` | `#catalog-grid` | Filtres catégorie/taille/couleur/recherche |
| `renderBestSellers()` | `#best-sellers-grid` | `bestseller === true`, max 4 |
| `renderLastChance()` | `#last-chance-grid` | `lastChance === true` |
| `renderProductDetail()` | `#product-detail-content` | Galerie, variantes, avis, related |
| `productCardHTML()` | templates string | Carte catalogue complète |
| `minimalProductCardHTML()` | templates string | Carte best sellers simplifiée |

**Pattern dominant :** `element.innerHTML = \`...\`` (~28 occurrences) — pas de templates externalisés.

### Pages SEO statiques

Générées par `generate-pages.js` depuis `catalog.json` :

- Schema.org Product JSON-LD
- Open Graph meta
- CTA « Acheter en boutique » → `/index/index.html?p={slug}`
- Images : placeholder si pas de champ `image`

---

## 4. Checkout & Stripe

### Parcours

```
Mini-cart / Cart page
    → navigate('checkout')
    → Étape 1 : formulaire livraison (state.checkoutDraft)
    → nextCheckoutStep()
    → Étape 2 : récapitulatif
    → startStripeCheckout()
        → sb.functions.invoke('create-checkout-session')
        → window.location = data.url (Stripe Hosted Checkout)
```

### Retour paiement

| Scénario | URL | Handler |
|----------|-----|---------|
| Succès | `/success/index.html?session_id=…` | Vide panier via `LD_CART` |
| Annulation | `/index/index.html?checkout=cancel` | `handleStripeCheckoutReturn()` |

### Payload panier

Envoie `productId` (`_legacyId` ou `slug`) + `variantId` + `quantity` + `size` + `color`.

---

## 5. Internationalisation (i18n)

| Mécanisme | Détail |
|-----------|--------|
| Dictionnaire | `const dict = { fr: {...}, en: {...} }` inline (~290 lignes) |
| Lookup | `t('catalog.title')` — dot-path dans `dict[state.locale]` |
| DOM statique | `data-i18n`, `data-aria-i18n`, `data-i18n-placeholder` |
| Application | `applyI18n()` au boot et après `toggleLocale()` |
| Persistance | `localStorage['atelier-locale']` |
| Pages légales | `legal-page.js` — blocs `data-lang-show="fr|en"` |
| Overrides CMS | `site_settings.sections` → `LD_SECTION_OVERRIDES` écrase clés `dict` |

**Limite :** HTML dynamique (grille, PDP) re-rendu via `renderCurrentPage()` au changement de locale.

---

## 6. CMS & thème (`site_settings`)

### Runtime

`loadSiteSettingsOverrides()` fetch Supabase :

| ID chargé | Condition |
|-----------|-----------|
| `published` | Site live |
| `draft` | `?preview=1` ou `?editor=1` |

**Applique :**
- `theme` → CSS variables, fonts (`#ld-theme-overrides`)
- `sections` → textes via mapping i18n
- `sections.hero.images` → `[data-hero-slide].src`
- `sections._meta` → ordre et visibilité sections accueil

### Build

`apply-site-theme.js` :
- Injecte `#ld-theme-build` (CSS depuis theme publié)
- Patche `data-copy` depuis `copywriting.json`
- Réordonne sections selon `_meta.order`

### Marqueurs éditables

18 attributs `data-editor-section` sur accueil, catalogue, footer, nav, top bar.

### Mode éditeur

`index/js/editor-mode.js` (`?editor=1`) : bridge postMessage avec admin Theme Studio.

---

## 7. Modules extraits (`js/`)

| Fichier | Lignes | Responsabilité |
|---------|--------|----------------|
| `storefront-catalog.js` | 182 | Load Supabase/JSON, variants, pricing |
| `storefront-cart.js` | 285 | Panier guest RPC + user DB + localStorage fallback |
| `storefront-auth.js` | 99 | Auth client, merge panier guest |
| `site-section-overrides.js` | 162 | Mapping sections → clés i18n |
| `legal-page.js` | 28 | Toggle langue pages légales |
| `editor-mode.js` | 224 | Bridge Theme Studio |

---

## 8. Monolithique vs modulaire

### Monolithique (dans `index/index.html`)

- ~2 314 lignes JavaScript inline
- ~100 fonctions globales
- État global : `state`, `products`, `sb`, `dict`
- UI complète : header, drawers, mini-cart, wishlist, compte, promo popup
- Reviews, carousels, checkout, recherche
- Tailwind CDN + ~170 lignes CSS custom

### Modulaire

Données et persistance seulement — **toute la présentation est monolithique**.

### Indicateurs de complexité

| Métrique | Valeur |
|----------|--------|
| `index/index.html` total | ~3 101 lignes |
| JS inline | ~2 314 lignes |
| `innerHTML` assignments | ~28 |
| `data-i18n` attributs | ~72 |
| `data-editor-section` | 18 |
| Pages HTML statiques | 30 (19+7+4) |
| Pas de bundler | — |
| Pas de tests automatisés | — |

---

## 9. Sections page d'accueil

Ordre par défaut (`theme-manifest.js`) :

1. `hero` — Carousel images + CTA
2. `manifesto` — Texte + image
3. `collections` — 3 cartes piliers
4. `bestSellers` — Grille 4 produits
5. `instagram` — Carrousel placeholder
6. `reviews` — Avis clients (Supabase `site_reviews` ou localStorage)
7. `faq` — Accordéon

Réordonnable / masquable via `site_settings.sections._meta`.

---

## 10. Ce qui doit devenir des « composants » (cible Shopify)

### À extraire en priorité

| Composant | Contenu actuel |
|-----------|----------------|
| `LayoutShell` | Header, footer, drawers, top bar |
| `HeroSection` | Carousel + overlay texte |
| `ProductCard` | 2 variantes (full / minimal) |
| `ProductGrid` | Catalogue + filtres |
| `ProductDetail` | PDP complet |
| `CartDrawer` | Mini-cart + wishlist |
| `CheckoutFlow` | 2 étapes + Stripe |
| `SectionRenderer` | Registry sections home |

### Transformations architecturales

1. **Router URL réel** — `/products/:handle`, `/collections/:handle`
2. **Unifier URLs produit** — fin du split SPA vs statique
3. **Services découplés** — `CatalogService`, `CartService`, etc.
4. **i18n externalisé** — fichiers JSON par locale/market
5. **Theme contract partagé** — `theme-manifest.js` → renderer storefront
6. **SSG depuis Supabase** — remplacer double génération
7. **Extension points** — hooks avis, analytics, shipping, discounts

---

## 11. Fichiers frontend clés

```
index/index.html              # SPA monolithe
index/js/editor-mode.js       # Bridge admin
js/storefront-catalog.js      # Catalogue
js/storefront-cart.js         # Panier
js/storefront-auth.js         # Auth client
js/site-section-overrides.js  # CMS mapping
js/supabase-config.js         # Config (généré, gitignored)
pages/*.html                  # Légal
produit/*/index.html          # SEO produit
collection/*/index.html       # SEO collection
scripts/generate-pages.js     # Générateur SEO
scripts/apply-site-theme.js   # Bake thème + copywriting
scripts/apply-home-media.js   # Bake images hero Git
data/copywriting.json         # Textes build
data/home-media.json          # Images accueil Git
```

---

## 12. Conclusion

Le frontend est **riche fonctionnellement** mais **architecturalement monolithique**. La vitrine SPA et les pages SEO coexistent sans URL unifiée. La migration progressive passe par l'extraction de services puis de composants/sections, en s'appuyant sur le schéma `theme-manifest.js` déjà amorcé côté admin.
