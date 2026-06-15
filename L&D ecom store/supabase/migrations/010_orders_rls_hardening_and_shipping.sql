-- Durcissement RLS commandes + colonnes livraison (Stripe shipping_details via webhook)
-- Le checkout passe par create-checkout-session (service_role) — plus d'insert anon.

-- site_settings.theme = couche design « site_theme » (couleurs, typographie)
comment on column public.site_settings.theme is
  'site_theme JSON: colors, typography — design layer (Shopify-like), distinct from sections CMS';

-- Adresses structurées remplies par stripe-webhook à checkout.session.completed
alter table public.orders
  add column if not exists shipping_name text,
  add column if not exists shipping_line1 text,
  add column if not exists shipping_line2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_postal text,
  add column if not exists shipping_country text,
  add column if not exists shipping_method text;

comment on column public.orders.shipping_name is 'Nom complet — source Stripe shipping_details.name';
comment on column public.orders.shipping_line1 is 'Adresse ligne 1 — Stripe shipping_details.address.line1';
comment on column public.orders.shipping_city is 'Ville — Stripe shipping_details.address.city';
comment on column public.orders.shipping_postal is 'Code postal — Stripe shipping_details.address.postal_code';
comment on column public.orders.shipping_country is 'Code pays ISO — Stripe shipping_details.address.country (CA, FR, …)';

-- Retirer insert anon (MVP 004) : seule l''Edge Function crée les commandes
drop policy if exists orders_insert_anon on public.orders;
drop policy if exists order_items_insert_anon on public.order_items;

-- Catalogue : lecture publique des actifs ; admins voient aussi les inactifs
drop policy if exists products_select_public_active on public.products;

create policy products_select_public_active
  on public.products for select
  to anon, authenticated
  using (active = true or public.is_admin());
