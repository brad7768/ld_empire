-- Images catalogue + autoriser le checkout public (clé anon) à créer commandes + lignes.
-- À appliquer après 003_orders_admin_rls.sql

alter table public.products add column if not exists image_urls jsonb not null default '[]'::jsonb;

comment on column public.products.image_urls is 'Liste JSON d''URLs d''images (Storage Supabase, CDN, etc.), ex: ["https://.../a.jpg","https://.../b.jpg"]';

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_insert_anon'
  ) then
    create policy orders_insert_anon
      on public.orders for insert
      to anon
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_items' and policyname = 'order_items_insert_anon'
  ) then
    create policy order_items_insert_anon
      on public.order_items for insert
      to anon
      with check (true);
  end if;
end$$;

-- Sécurité MVP : n''importe qui peut insérer une ligne commande avec la clé anon.
-- En production : retirer ces policies et passer par une Edge Function (service_role) + webhook paiement (Stripe, etc.).
