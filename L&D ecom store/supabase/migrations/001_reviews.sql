-- L&D e-com — avis (accueil + produits)
-- Exécuter dans Supabase → SQL Editor, ou via CLI : supabase db push

create extension if not exists "pgcrypto";

-- Avis page d'accueil / boutique
create table if not exists public.site_reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) <= 2000),
  locale text default 'fr',
  created_at timestamptz not null default now()
);

create index if not exists site_reviews_created_at_idx on public.site_reviews (created_at desc);

-- Avis par produit (slug aligné sur le catalogue JS)
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) <= 2000),
  locale text default 'fr',
  created_at timestamptz not null default now()
);

create index if not exists product_reviews_slug_created_idx on public.product_reviews (product_slug, created_at desc);

alter table public.site_reviews enable row level security;
alter table public.product_reviews enable row level security;

-- Lecture publique (anon) — idempotent (DB may already have these from SQL Editor)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_reviews' and policyname = 'site_reviews_select_anon'
  ) then
    create policy "site_reviews_select_anon"
      on public.site_reviews for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_reviews' and policyname = 'site_reviews_insert_anon'
  ) then
    create policy "site_reviews_insert_anon"
      on public.site_reviews for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_reviews' and policyname = 'product_reviews_select_anon'
  ) then
    create policy "product_reviews_select_anon"
      on public.product_reviews for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_reviews' and policyname = 'product_reviews_insert_anon'
  ) then
    create policy "product_reviews_insert_anon"
      on public.product_reviews for insert
      to anon, authenticated
      with check (true);
  end if;
end$$;

-- Note : en production, remplacez les politiques insert par une Edge Function + modération,
-- ou ajoutez une colonne approved + trigger, pour limiter le spam.
