# LD Empire — État actuel de l'Admin

**Task 1 — Analyse back-office**

**Emplacement :** `L&D ecom store/admin/`  
**Accès production :** `/admin/` (auth Supabase + table `admin_users`)

---

## 1. Architecture technique

| Aspect | Choix |
|--------|-------|
| Type | SPA vanilla ES modules (pas de bundler) |
| Styles | Tailwind CDN + `css/theme-studio.css` |
| Graphiques | Chart.js |
| Routing | Hash router (`#/analytics`, `#/products`, …) |
| Backend | Supabase JS v2 (esm.sh) |
| Langue UI | Français |
| Config | `../js/supabase-config.js` ou `sessionStorage` (`LD_SUPABASE_SESSION`) |

---

## 2. Modules fonctionnels

| Module | Route | Fichier(s) | Statut |
|--------|-------|------------|--------|
| **Accueil / Analytics** | `#/analytics` | `analytics.js` | ✅ MVP complet |
| **Commandes** | `#/orders`, `#/orders/{ref}` | `orders.js` | ✅ MVP complet |
| **Produits** | `#/products`, `#/products/new`, `#/products/{id}` | `products.js`, `theme-editor.js` | ⚠️ Partiel |
| **Stock** | `#/stock` | `stock.js`, `main.js` | ✅ MVP complet |
| **Contenu / Theme Studio** | `#/cms/editor` | `cms.js`, `theme-editor.js` | ✅ Avancé |
| **Ops** | `#/notes` | `index.html` (statique) | ℹ️ Notes techniques |
| **Palette commandes** | Ctrl+K / `/` | `palette.js` | ✅ |
| **Mot de passe oublié** | pages dédiées | `forgot-password.html`, `reset-password.html` | ✅ |

### Non présent (vs Shopify)

Clients, remises, collections (entité), expédition, remboursements, rapports export, rôles multi-admin, import/export CSV, métadonnées, blog, marketing email, paniers abandonnés, apps/extensions, configuration paiement/taxes.

---

## 3. Routes hash complètes

| Hash | Vue |
|------|-----|
| `#/analytics` | Dashboard KPIs + graphiques |
| `#/products` | Liste produits |
| `#/products/new` | Formulaire création |
| `#/products/{uuid}` | Fiche édition |
| `#/orders` | Liste commandes |
| `#/orders/{order_number}` | Détail commande |
| `#/stock` | Table inventaire |
| `#/cms` | Redirige → `#/cms/editor` |
| `#/cms/editor` | Theme Studio plein écran |
| `#/notes` | Notes ops |

Défaut si hash vide : `#/analytics`.

---

## 4. Connexion Supabase par module

### Tables

| Table | Module(s) | Opérations |
|-------|-----------|------------|
| `admin_users` | auth | SELECT — gate accès |
| `products` | products, analytics, theme-editor | SELECT, INSERT, UPDATE (soft delete `active=false`) |
| `product_variants` | products, stock, theme-editor | SELECT, INSERT |
| `inventory` | stock, main.js, theme-editor | SELECT, INSERT, UPDATE, upsert |
| `inventory_movements` | main.js (ajustements) | INSERT |
| `orders` | orders, analytics | SELECT, UPDATE status |
| `order_items` | analytics | SELECT (agrégation top SKU) |
| `site_settings` | theme-editor | SELECT, upsert (`draft` / `published`) |
| `cms_content` | theme-editor | SELECT, upsert, delete |

### Storage

| Bucket | Chemin | Module |
|--------|--------|--------|
| `product-media` | `products/{uuid}-{filename}` | `media.js` |
| `product-media` | `site/hero/{uuid}-{filename}` | `theme-editor.js` |

Limite : 5 Mo, images uniquement, URL publique.

### Non utilisé dans l'admin JS

- Realtime subscriptions (mentionné dans Ops, non implémenté)
- Edge Functions (`commit_stock` documenté, non appelé)
- API Stripe directe

---

## 5. Détail par module

### Analytics (`analytics.js`)

- KPIs : produits actifs, SKUs, revenu payé, commandes en attente
- Graphiques : statuts commandes (doughnut), revenu cumulé (line), top SKU (bar)
- Liste stock bas
- Checklist « Premiers pas » onboarding
- Limite : agrégation client-side, max ~4000 commandes

### Produits (`products.js`)

**Liste :**
- Pagination, recherche, filtres actif/inactif
- Badges statut

**Création :** déléguée à `theme-editor.js` → `insertProductWithInventory`

**Édition :**
- Métadonnées produit (nom, description, catégorie, images URLs)
- Upload image → Storage
- Ajout variante (SKU, taille, couleur, prix)
- Désactivation avec confirmation

**⚠️ Gap :** `saveProduct` sur fiche existante met à jour `products` uniquement — **prix/stock variantes affichés ne sont pas persistés** à l'enregistrement.

**⚠️ Gap :** pas d'édition/suppression variante existante.

### Commandes (`orders.js`)

- Liste 150 dernières, filtres statut, recherche
- Détail : lignes, client, montants, adresse
- Changement statut (6 statuts FR) + enregistrer

**Manquant :** fulfillment, tracking, remboursement, notes éditables, commande manuelle, impression bon de livraison.

### Stock (`stock.js` + `main.js`)

- Table variantes avec `on_hand`
- Panneau ajustement : entrée / sortie / correction
- Écrit `inventory_movements` avec audit (`created_by`, `reason`)
- Badge sidebar si stock critique

### Theme Studio (`theme-editor.js`)

**Capacités :**
- Mode plein écran, iframe preview storefront (`postMessage`)
- Draft vs Published (`site_settings`)
- Arbre sections : accueil, global, thème
- Inspecteur champs : texte, textarea, couleur, toggle, imageList
- Upload hero carousel → Storage
- Drag-and-drop réordonnancement sections accueil
- Undo/redo (20 états)
- Desktop / Mobile preview
- Locales FR / EN
- Pages statiques légales via `cms_content`
- Clés CMS personnalisées

**Schéma déclaratif :** `theme-manifest.js` — sections, champs, mapping i18n.

**Bridge :** `editor-bridge.js` ↔ `index/js/editor-mode.js` (`?editor=1`).

**⚠️ Gap :** catalogue storefront toujours décrit comme hardcodé dans README roadmap — sync admin → vitrine SEO non faite.

### Palette (`palette.js`)

Recherche rapide produits, commandes, clés CMS — données en cache (page courante produits, pas catalogue complet).

---

## 6. Authentification

```
Chargement admin/index.html
    → supabase-config.js (ou sessionStorage)
    → getSession()
    → Si session + admin_users row → dashboard
    → Sinon → formulaire login

Login
    → signInWithPassword
    → ensureAdmin(user_id) via admin_users
    → Si non admin → signOut + erreur

Mot de passe oublié
    → forgot-password.html → resetPasswordForEmail
    → reset-password.html → vérif admin + updateUser

Logout → signOut()
```

**Modèle :** Supabase Auth (identité) + `admin_users` (autorisation binaire, pas de rôles).

---

## 7. Matrice complétude vs Shopify

### ✅ Terminé (niveau MVP)

- Auth admin + recovery
- CRUD produits (soft delete)
- Liste/filtre/recherche produits
- Création variantes
- Gestion stock + audit mouvements
- Commandes liste/détail/statut
- Dashboard analytics
- Theme Studio draft/publish
- CMS textes + pages légales
- Upload images Storage
- UX : toasts, skeletons, palette, badges, sidebar responsive

### ⚠️ Partiel

| Zone | Manque |
|------|--------|
| Édition variantes | Prix/stock non sauvés sur fiche edit |
| Variantes | Pas de delete/deactivate UI |
| Commandes | Statut seulement |
| Analytics | Pas d'export, cap 4000 |
| Theme Studio | Catalogue page minimal |
| Collections | Titre section seulement |
| Sync storefront | Produits admin ≠ SEO statique |
| Recherche palette | Cache partiel |

### ❌ Absent

Clients, segments, remises, expédition, retours RMA, multi-emplacement, import CSV, métadonnées, SEO champs produit, staff/roles, audit log, webhooks UI, marketing.

---

## 8. Fichiers clés

| Fichier | Rôle |
|---------|------|
| `index.html` | Shell : auth, sidebar, panels, Theme Studio mount |
| `js/main.js` | Bootstrap, state, auth, adjustStock, wiring modules |
| `js/router.js` | Hash parse, breadcrumbs, navigation |
| `js/products.js` | Liste + fiche produit |
| `js/orders.js` | Commandes |
| `js/stock.js` | Inventaire |
| `js/theme-editor.js` | Theme Studio core (~1000 lignes) |
| `js/theme-manifest.js` | Schéma sections/champs |
| `js/theme-studio-ui.js` | Rendu inspecteur, accordéons |
| `js/editor-bridge.js` | iframe postMessage |
| `js/analytics.js` | Dashboard |
| `js/media.js` | Upload Storage |
| `js/ui.js` | Toasts, dialogs, badges |
| `README.md` | Checklist tests manuels + roadmap |

---

## 9. Connexion avec la vitrine

| Donnée admin | Effet vitrine | Délai |
|--------------|---------------|-------|
| Produit Supabase | SPA catalogue | Immédiat |
| site_settings published | Textes, thème, hero | Immédiat (fetch runtime) |
| site_settings draft | Preview `?preview=1` | Immédiat |
| cms_content | Pages légales | Immédiat |
| Produit nouveau | Pages SEO `/produit/` | **Jamais** (sans rebuild JSON) |
| catalog.json | SEO, feeds | Build Netlify uniquement |

---

## 10. Recommandations Task 2+

1. Unifier création/édition produit dans `products.js` (variantes incluses)
2. Exposer `bestseller` / `last_chance` en admin après migration DB
3. Bouton « Régénérer SEO » ou build auto post-save
4. Restreindre Storage upload aux admins (policy RLS)
5. Module clients (lecture `customer_profiles` + commandes par email)
6. Partager `theme-manifest.js` avec renderer storefront futur
