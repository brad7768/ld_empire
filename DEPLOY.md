# Netlify — liaison GitHub (checklist)

Site actuel : **ld-store.netlify.app** (déployé manuellement depuis le disque).  
Dépôt : **https://github.com/brad7768/ld_empire** (privé).

## Étape A — Pousser le code sur GitHub (une fois)

Le commit initial est prêt localement (`5510c1c`). Il reste à **pousser** avec vos identifiants GitHub :

```bash
cd /Volumes/.xyz/ld_empire
git push -u origin main
```

Si Git demande un login, utilisez l’une de ces options :

1. **GitHub CLI** (recommandé) : `brew install gh` puis `gh auth login`, puis `git push`
2. **Personal Access Token** : GitHub → Settings → Developer settings → Tokens → utiliser le token comme mot de passe HTTPS
3. **GitHub Desktop** : Add Local Repository → `/Volumes/.xyz/ld_empire` → Push origin

## Étape B — Lier Netlify au dépôt Git

1. Ouvrir [app.netlify.com](https://app.netlify.com) → site **ld-store**
2. **Site configuration** → **Build & deploy** → **Continuous deployment**
3. Cliquer **Link repository** (ou **Manage repository** si déjà lié ailleurs)
4. Choisir **GitHub** → autoriser Netlify → repo **`brad7768/ld_empire`**
5. Vérifier les réglages (le fichier racine `netlify.toml` définit la base) :

   | Réglage | Valeur |
   |---------|--------|
   | Production branch | `main` |
   | Base directory | `L&D ecom store` |
   | Build command | `node scripts/netlify-build.js` |
   | Publish directory | `.` |

6. **Deploy site** — le build Git remplace les uploads manuels.

## Étape C — Variables d’environnement Netlify

**Site configuration → Environment variables** (scope : Production + Deploy previews si besoin) :

| Variable | Exemple / note |
|----------|----------------|
| `SUPABASE_URL` | `https://liwswmcofxlvlyokkazm.supabase.co` |
| `SUPABASE_ANON_KEY` | Clé anon du dashboard Supabase |
| `SITE_URL` | `https://ld-empire.ca` (ou `https://ld-store.netlify.app`) |

Au build, `scripts/netlify-build.js` génère `js/supabase-config.js` depuis ces variables.

> `js/supabase-config.js` n’est **pas** dans Git (`.gitignore`) — c’est voulu.

## Étape E — Supabase : mot de passe oublié (admin)

L’admin envoie un email de réinitialisation via Supabase Auth. Si **Site URL** ou **Redirect URLs** sont mal configurés, le lien dans l’email pointe vers `localhost:3000` (ou une autre URL locale) au lieu de votre site en production → **ERR_CONNECTION_REFUSED**.

### Configuration obligatoire

Supabase Dashboard → **Authentication** → **URL Configuration** :

| Réglage | Valeur |
|---------|--------|
| **Site URL** | `https://ld-empire.ca` (domaine public principal) |
| **Redirect URLs** | `https://ld-empire.ca/admin/reset-password.html` |
| | `https://ld-store.netlify.app/admin/reset-password.html` |
| | `http://localhost:8081/admin/reset-password.html` (dev : `npm run dev`) |

> Ne pas laisser **Site URL** sur `http://localhost:3000` sauf si vous développez réellement sur ce port. Ce projet sert en local sur le port **8081**.

### Flux attendu

1. `/admin/forgot-password.html` → saisir l’email admin → **Envoyer le lien**
2. Email Supabase → lien vers `https://ld-empire.ca/admin/reset-password.html#access_token=…&type=recovery`
3. Nouveau mot de passe → redirection `/admin/` (connexion)

### Contournement si le lien pointe encore vers localhost

Si l’email contient `localhost:3000/#access_token=…`, remplacez **uniquement** l’origine dans la barre d’adresse :

```
https://ld-empire.ca/admin/reset-password.html#access_token=…&type=recovery&…
```

(gardez tout le fragment `#…` inchangé). Le lien expire en ~1 h ; demandez-en un nouveau après avoir corrigé Supabase.

## Étape D — Vérifier le premier déploiement Git

1. Netlify → **Deploys** → le build doit afficher :
   - `netlify-build: js/supabase-config.js écrit depuis les variables d'environnement`
   - `netlify-build: … fiches produit, … collections`
2. Ouvrir https://ld-store.netlify.app — la vitrine et `/admin/` doivent répondre.

## Workflow quotidien (après liaison)

```bash
# 1. Modifier le code
# 2. Committer
git add -A
git commit -m "Description du changement"
git push origin main
# 3. Netlify rebuild automatiquement (1–3 min)
```

## Supabase (inchangé)

Les Edge Functions Stripe ne passent pas par Netlify :

```bash
cd "L&D ecom store"
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

Secrets Supabase : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`.

## Dépannage

| Problème | Piste |
|----------|--------|
| Build échoue « node: command not found » | Netlify utilise Node 18+ par défaut ; vérifier **Build image** |
| Admin : « Supabase config missing » | Ajouter `SUPABASE_URL` + `SUPABASE_ANON_KEY` dans Netlify |
| 404 sur `/produit/...` | Le build régénère les pages ; vérifier les logs `generate-pages` |
| Ancien site encore visible | **Deploys** → **Publish deploy** sur le dernier build Git réussi |
| Email reset → `localhost:3000` | Corriger **Site URL** + **Redirect URLs** dans Supabase (voir Étape E) |
| Reset : « Lien invalide ou expiré » | Lien expiré (~1 h) ou compte absent de `admin_users` — renvoyer un email |
| Reset : page blanche / refus connexion | Vérifier que `SUPABASE_URL` + `SUPABASE_ANON_KEY` sont dans Netlify |
