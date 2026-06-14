-- Admin MVP schema hardening
-- Objectif:
-- 1) Champs obligatoires produit/variant
-- 2) Soft delete via colonne active
-- 3) Tables minimales pour dashboard Auth + Produits + Stock + CMS

create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  color text,
  size text,
  price_cents integer not null check (price_cents >= 0),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color, size)
);

create table if not exists public.inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  on_hand integer not null default 0 check (on_hand >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id bigserial primary key,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  movement_type text not null check (movement_type in ('in','out','adjustment','sale','return','reserve','release','commit')),
  qty integer not null check (qty > 0),
  reason text,
  reference_type text,
  reference_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.cms_content (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  locale text not null default 'fr',
  value text not null,
  is_published boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (key, locale)
);

create index if not exists idx_products_active on public.products(active);
create index if not exists idx_variants_product_id on public.product_variants(product_id);
create index if not exists idx_variants_active on public.product_variants(active);
create index if not exists idx_inventory_movements_variant_date on public.inventory_movements(variant_id, created_at desc);
create index if not exists idx_cms_locale_key on public.cms_content(locale, key);

-- Hardening existing schema (idempotent)
alter table public.products alter column slug set not null;
alter table public.products alter column name set not null;
alter table public.products alter column category set not null;
alter table public.products add column if not exists active boolean not null default true;

alter table public.product_variants alter column product_id set not null;
alter table public.product_variants alter column sku set not null;
alter table public.product_variants alter column price_cents set not null;
alter table public.product_variants add column if not exists low_stock_threshold integer not null default 3;
alter table public.product_variants add column if not exists active boolean not null default true;

-- RLS
alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cms_content enable row level security;

create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists(select 1 from public.admin_users a where a.user_id = p_uid);
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='admin_users' and policyname='admin_users_select_self'
  ) then
    create policy admin_users_select_self
      on public.admin_users for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='products' and policyname='products_select_public_active'
  ) then
    create policy products_select_public_active
      on public.products for select
      to anon, authenticated
      using (active = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_variants' and policyname='variants_select_public_active'
  ) then
    create policy variants_select_public_active
      on public.product_variants for select
      to anon, authenticated
      using (active = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='inventory' and policyname='inventory_select_public'
  ) then
    create policy inventory_select_public
      on public.inventory for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='cms_content' and policyname='cms_select_published'
  ) then
    create policy cms_select_published
      on public.cms_content for select
      to anon, authenticated
      using (is_published = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='products' and policyname='products_admin_all'
  ) then
    create policy products_admin_all
      on public.products for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_variants' and policyname='variants_admin_all'
  ) then
    create policy variants_admin_all
      on public.product_variants for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='inventory' and policyname='inventory_admin_all'
  ) then
    create policy inventory_admin_all
      on public.inventory for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='inventory_movements' and policyname='inventory_movements_admin_all'
  ) then
    create policy inventory_movements_admin_all
      on public.inventory_movements for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='cms_content' and policyname='cms_admin_all'
  ) then
    create policy cms_admin_all
      on public.cms_content for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  -- Admin login: allow authenticated users to read their own admin_users row (ensureAdmin + is_admin).
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='admin_users' and policyname='admin_users_select_self'
  ) then
    create policy admin_users_select_self
      on public.admin_users for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end$$;
