# L&D Admin — tests manuels

## Prérequis

- `js/supabase-config.js` renseigné
- Migrations Supabase appliquées : `007_site_settings.sql`, **`008_site_settings_draft.sql`**
- Utilisateur dans `admin_users`

## Navigation (Phase 1–2)

- [ ] Sidebar visible sur desktop ; menu hamburger sur mobile
- [ ] `#/analytics`, `#/products`, `#/orders`, `#/stock`, `#/cms` changent l’écran
- [ ] Bouton Retour navigateur fonctionne entre les hash
- [ ] Badges Commandes / Stock se mettent à jour

## Produits

- [ ] Liste : filtres Tous / Actifs / Inactifs, recherche, pagination
- [ ] « Ajouter un produit » → `#/products/new` → création → redirection fiche
- [ ] Fiche : cartes 2 colonnes, barre sticky Enregistrer / Annuler
- [ ] Upload image + URLs ; ajout variante sur fiche existante
- [ ] Désactivation produit avec confirmation

## Commandes

- [ ] Liste avec pills statut et filtres
- [ ] Clic ligne → fiche pleine page `#/orders/REF`
- [ ] Changement statut (libellés FR) + Enregistrer

## Stock

- [ ] Panneau « Mouvement de stock » ; ajustement entrée/sortie
- [ ] Bouton Ajuster sur une ligne préremplit la variante

## Contenu — Theme Studio (`#/cms/editor`)

- [ ] **Contenu** → « Ouvrir l'éditeur visuel » → mode plein écran (pas de sidebar / topbar / barre sticky admin)
- [ ] Barre studio : statut Brouillon/Publié, indicateur « Non enregistré », **Enregistrer** / **Publier**
- [ ] Canvas : fond gris `#F6F6F7`, iframe centrée avec ombre ; **Desktop / Mobile** (segmented)
- [ ] Panneaux **Structure** et **Réglages** repliables ; état persisté (`localStorage`)
- [ ] Arbre : en-têtes PAGE / GLOBAL / THÈME, icônes, recherche, visibilité (œil SVG)
- [ ] Navigation 2 niveaux : clic section → blocs ; clic bloc → focus champ dans l’inspecteur
- [ ] Inspecteur : groupes en accordéons ; champs couleur (swatch + hex), toggle, imageList
- [ ] Modifier un titre hero → changement **immédiat** dans l’iframe (postMessage)
- [ ] **Enregistrer** : brouillon `site_settings` id `draft` ; visiteurs sans `?preview` inchangés
- [ ] **Publier** : vitrine `id=published`
- [ ] Upload images hero ; drag-and-drop réordonnancement sections (accueil)
- [ ] Menu **⋯** : recharger aperçu, lien textes CMS ; **Annuler** / undo ↶ redo ↷
- [ ] Toasts en haut à droite en mode studio
- [ ] Textes avancés (`cms_content`) : vue Contenu classique `#/cms`

## UX (Phase 3–5)

- [ ] `Ctrl+K` ou `/` : palette de recherche
- [ ] `?` : aide raccourcis
- [ ] Toasts après sauvegarde (pas d’`alert` sauf config)
- [ ] Checklist « Premiers pas » sur l’accueil admin
- [ ] Skeletons pendant chargement des tableaux

---

## Roadmap éditeur (Étape E — hors MVP)

| Fonctionnalité | Statut | Piste |
|----------------|--------|--------|
| Sync produits Supabase → vitrine | Backlog | Script build / API ; catalogue actuellement hardcodé dans `index/index.html` |
| Drag-and-drop sections (Shopify) | Partiel | HTML5 DnD sur arbre accueil (Theme Studio) |
| Édition checkout / panier | Backlog | Thème checkout séparé (Stripe) |
| Pages statiques `/pages/*.html` | Backlog | `cms_content` ou migration SPA |
| Undo / Redo | Fait (studio) | Pile 20 états en mémoire dans l’éditeur |
| Édition multi-utilisateur temps réel | Backlog | Supabase Realtime |
| Variantes A/B | Non prévu | — |

### Critères d’acceptation MVP éditeur

1. Preview live sans rechargement à chaque frappe (postMessage).
2. Brouillon / publié séparés (`draft` / `published`).
3. Accueil + catalogue + nav + footer + thème éditables.
4. Au moins une image hero uploadable.
5. Clés CMS réservées au juridique / pages hors éditeur visuel.
