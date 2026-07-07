-- Catalog unification (Task 2)
-- Goal: make Supabase the primary source of truth for products.
-- Safe/idempotent migration: only adds missing columns and constraints.

alter table public.products
  add column if not exists name_en text,
  add column if not exists short_description text,
  add column if not exists featured boolean not null default false,
  add column if not exists is_new boolean not null default false,
  add column if not exists best_seller boolean not null default false,
  add column if not exists last_chance boolean not null default false,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists collection text;

-- Keep existing "description" but ensure it exists in legacy environments.
alter table public.products
  add column if not exists description text;

-- Existing core fields in most environments (idempotent hardening).
alter table public.products
  add column if not exists active boolean not null default true,
  add column if not exists category text;

alter table public.product_variants
  add column if not exists active boolean not null default true;

alter table public.product_variants
  add column if not exists price_cents integer;

alter table public.product_variants
  alter column price_cents set not null;

alter table public.product_variants
  drop constraint if exists product_variants_price_cents_check;

alter table public.product_variants
  add constraint product_variants_price_cents_check
  check (price_cents >= 0);

alter table public.inventory
  add column if not exists on_hand integer not null default 0;

alter table public.inventory
  drop constraint if exists inventory_on_hand_check;

alter table public.inventory
  add constraint inventory_on_hand_check
  check (on_hand >= 0);

comment on column public.products.name_en is 'English product name for storefront and Stripe metadata.';
comment on column public.products.short_description is 'Short marketing copy for product cards.';
comment on column public.products.featured is 'Featured flag for highlighted merchandising.';
comment on column public.products.is_new is 'New arrival merchandising flag.';
comment on column public.products.best_seller is 'Best seller merchandising flag.';
comment on column public.products.last_chance is 'Last chance / end-of-stock merchandising flag.';
comment on column public.products.seo_title is 'SEO title override for generated product pages.';
comment on column public.products.seo_description is 'SEO description override for generated product pages.';
comment on column public.products.collection is 'Collection merchandising key (optional).';
