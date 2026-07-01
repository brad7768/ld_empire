# Contenu vitrine via Git (Cursor → GitHub → Netlify)

Ce guide décrit comment **remplacer les anciennes images Supabase** et gérer le site public **depuis Cursor**, avec déploiement automatique sur Netlify.

## Où vivent les images aujourd’hui

| Zone | Git (fichiers) | Supabase (cloud) |
|------|----------------|------------------|
| Carousel hero accueil | `data/home-media.json` + `assets/home/` | `site_settings.sections.hero.images` |
| Photo manifeste | `data/home-media.json` | — |
| Cartes collections | `data/home-media.json` | — |
| Photos produits | `data/catalog.json` + `assets/products/` | `products.image_urls` |
| Textes accueil | `data/copywriting.json` | `site_settings` (textes hero, etc.) |

> **Important :** tant que Supabase contient des images hero ou produits, elles peuvent **écraser** ou **coexister** avec Git. L’étape 1 ci-dessous supprime ce stock cloud.

---

## Étape 1 — Vider les anciennes images Supabase (une fois)

Depuis Supabase Dashboard → **Settings → API** :

- **Project URL** → `SUPABASE_URL`
- **service_role** (secret, jamais dans Git) → `SUPABASE_SERVICE_ROLE_KEY`

```bash
cd "L&D ecom store"

export SUPABASE_URL="https://VOTRE_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."

npm run clear:supabase-media
```

Le script :

- vide `products.image_urls` sur tous les produits ;
- vide `hero.images` dans `site_settings` (published, draft, default).

**Vérification manuelle (optionnelle)** : Supabase → Table Editor → `site_settings` → colonne `sections` → `hero.images` doit être `[]`.

---

## Étape 2 — Ajouter vos fichiers image dans Git

Structure recommandée :

```
L&D ecom store/
├── assets/
│   ├── home/           ← bannière, manifeste, collections
│   │   ├── hero-01.jpg
│   │   ├── hero-02.jpg
│   │   └── manifesto.jpg
│   └── products/       ← une photo par produit (ou sous-dossiers)
│       ├── manteau-laine.jpg
│       └── ...
├── data/
│   ├── home-media.json ← chemins des images accueil
│   └── catalog.json    ← catalogue + champ "image" par produit
```

**Formats :** JPG ou WebP, fond neutre, ratio portrait pour produits (4:5).

---

## Étape 3 — Configurer `data/home-media.json`

Exemple :

```json
{
  "hero": {
    "images": [
      "/assets/home/hero-01.jpg",
      "/assets/home/hero-02.jpg",
      "/assets/home/hero-03.jpg"
    ]
  },
  "manifesto": {
    "image": "/assets/home/manifesto.jpg"
  },
  "collections": {
    "silhouettes": "/assets/home/collection-pret-a-porter.jpg",
    "signatures": "/assets/home/collection-parfums.jpg",
    "finitions": "/assets/home/collection-accessoires.jpg"
  }
}
```

Au build Netlify, `scripts/apply-home-media.js` injecte ces images dans `index/index.html`.

---

## Étape 4 — Configurer les produits dans `data/catalog.json`

Pour chaque produit, ajouter le champ **`image`** (chemin depuis la racine du site) :

```json
{
  "id": "p20",
  "slug": "robe-ete-linen",
  "nameFr": "Robe lin été",
  "nameEn": "Summer linen dress",
  "descriptionFr": "...",
  "descriptionEn": "...",
  "category": "ready-to-wear",
  "priceCents": 18900,
  "price": 189,
  "image": "/assets/products/robe-ete-linen.jpg",
  "inStock": true,
  "bestseller": false,
  "lastChance": false
}
```

**Nouveau produit :** choisir un `slug` unique (URL `/produit/robe-ete-linen/`). Le build génère la page SEO automatiquement.

---

## Étape 5 — Synchroniser le catalogue vers Supabase (panier / checkout)

La vitrine lit Supabase **en priorité** si des produits actifs existent. Après avoir mis à jour `catalog.json` :

```bash
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."

npm run seed:catalog
```

Cela met à jour noms, prix, descriptions et **`image_urls`** depuis Git.

---

## Étape 6 — Textes (optionnel)

Éditer `data/copywriting.json` pour les textes statiques (hero, manifeste, collections, etc.).

Les textes hero peuvent aussi venir de Supabase (`site_settings`) si vous les aviez modifiés dans l’admin Theme Studio. Pour tout piloter depuis Git, alignez `copywriting.json` et laissez les champs hero vides côté Supabase après l’étape 1.

---

## Étape 7 — Commit, push, déploiement

```bash
cd /chemin/vers/ld_empire

git add "L&D ecom store/assets/" "L&D ecom store/data/"
git add "L&D ecom store/index/index.html"   # si modifié manuellement
git commit -m "Mettre à jour les images vitrine et le catalogue depuis Git."
git push origin main
```

Netlify rebuild (~1–3 min). Vérifier :

1. **Deploys** → build réussi, log `apply-home-media: N slide(s) hero injecté(s)`.
2. Site en navigation privée (`Cmd+Shift+R`) → nouvelles images visibles.
3. Inspecter une image → URL doit pointer vers `/assets/...` sur votre domaine, **pas** `supabase.co/storage`.

---

## Prévisualisation locale

```bash
cd "L&D ecom store"
npm install
cp js/supabase-config.example.js js/supabase-config.js
# Renseigner Supabase (optionnel en local)
npm run dev
# → http://localhost:8081/index/index.html
```

`npm run dev` exécute le build (dont `apply-home-media`) avant de servir le site.

---

## Checklist rapide

- [ ] `npm run clear:supabase-media` exécuté
- [ ] Images copiées dans `assets/home/` et `assets/products/`
- [ ] `data/home-media.json` renseigné
- [ ] `data/catalog.json` mis à jour (`image` + nouveaux produits)
- [ ] `npm run seed:catalog` (si checkout / admin Supabase utilisés)
- [ ] `git push origin main`
- [ ] Netlify deploy OK, hard refresh navigateur

---

## Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Anciennes photos hero encore visibles | Cache ou Supabase non vidé | `clear:supabase-media` + hard refresh |
| Hero vide (fond sombre seulement) | `home-media.json` vide ou build non passé | Remplir JSON + revérifier logs Netlify |
| Produits sans photo en boutique | `image\` sans `image` ou seed non lancé | Ajouter `image` + `npm run seed:catalog` |
| Photo OK en Git, pas en live | Supabase a encore d’autres URLs | Re-lancer seed ou vider `image_urls` |
| Theme Studio réaffiche anciennes images | Brouillon admin | Vider hero dans admin ou republier depuis Git |

---

## Scripts utiles

| Commande | Rôle |
|----------|------|
| `npm run clear:supabase-media` | Vide images Supabase (produits + hero) |
| `npm run media:apply` | Injecte `home-media.json` dans la vitrine (local) |
| `npm run seed:catalog` | Sync `catalog.json` → Supabase |
| `npm run build` | Build Netlify complet en local |

---

## Workflow quotidien (résumé)

```
Cursor : éditer JSON + déposer images dans assets/
    ↓
git commit + push main
    ↓
Netlify build (generate-pages + apply-home-media + apply-site-theme)
    ↓
Site live mis à jour
    ↓
(optionnel) npm run seed:catalog si panier/stock Supabase
```
