-- Panier persistant (invité + client connecté) + fusion à la connexion
-- Invités : accès via fonctions RPC (guest_token), pas de lecture directe des tables.

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_token text unique,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_owner_check check (user_id is not null or guest_token is not null)
);

create unique index if not exists idx_carts_user_id on public.carts(user_id) where user_id is not null;
create index if not exists idx_carts_guest_token on public.carts(guest_token);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create index if not exists idx_cart_items_cart_id on public.cart_items(cart_id);

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.customer_profiles enable row level security;

-- Client connecté : accès direct à son panier
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'carts' and policyname = 'carts_user_all'
  ) then
    create policy carts_user_all on public.carts for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end$$;

create or replace function public.cart_owned_by_user(p_cart_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.carts c
    where c.id = p_cart_id and c.user_id = auth.uid()
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'cart_items' and policyname = 'cart_items_user_all'
  ) then
    create policy cart_items_user_all on public.cart_items for all to authenticated
      using (public.cart_owned_by_user(cart_id))
      with check (public.cart_owned_by_user(cart_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_profiles' and policyname = 'customer_profiles_self'
  ) then
    create policy customer_profiles_self on public.customer_profiles for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end$$;

-- RPC invité : panier via guest_token
create or replace function public.ensure_guest_cart(p_guest_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
  v_token text := nullif(trim(p_guest_token), '');
begin
  if v_token is null or length(v_token) < 8 then
    raise exception 'Invalid guest token';
  end if;

  select id into v_cart_id from public.carts
  where guest_token = v_token and user_id is null
  limit 1;

  if v_cart_id is null then
    insert into public.carts (guest_token, expires_at)
    values (v_token, now() + interval '30 days')
    returning id into v_cart_id;
  else
    update public.carts set expires_at = now() + interval '30 days', updated_at = now()
    where id = v_cart_id;
  end if;

  return v_cart_id;
end;
$$;

create or replace function public.fetch_guest_cart(p_guest_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
  v_items jsonb;
begin
  v_cart_id := public.ensure_guest_cart(p_guest_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'variant_id', ci.variant_id,
    'quantity', ci.quantity,
    'sku', pv.sku,
    'size', pv.size,
    'color', pv.color,
    'price_cents', pv.price_cents,
    'product_id', pv.product_id,
    'product_slug', p.slug,
    'product_name', p.name
  ) order by ci.created_at), '[]'::jsonb)
  into v_items
  from public.cart_items ci
  join public.product_variants pv on pv.id = ci.variant_id
  join public.products p on p.id = pv.product_id
  where ci.cart_id = v_cart_id;

  return jsonb_build_object('cart_id', v_cart_id, 'items', v_items);
end;
$$;

create or replace function public.upsert_guest_cart_item(
  p_guest_token text,
  p_variant_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
  v_qty integer := coalesce(p_quantity, 0);
begin
  if v_qty <= 0 or v_qty > 999 then
    raise exception 'Invalid quantity';
  end if;

  if not exists (
    select 1 from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = p_variant_id and pv.active and p.active
  ) then
    raise exception 'Variant not available';
  end if;

  v_cart_id := public.ensure_guest_cart(p_guest_token);

  insert into public.cart_items (cart_id, variant_id, quantity)
  values (v_cart_id, p_variant_id, v_qty)
  on conflict (cart_id, variant_id)
  do update set quantity = least(public.cart_items.quantity + excluded.quantity, 999),
                updated_at = now();

  update public.carts set updated_at = now() where id = v_cart_id;
end;
$$;

create or replace function public.set_guest_cart_item_qty(
  p_guest_token text,
  p_variant_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
begin
  v_cart_id := public.ensure_guest_cart(p_guest_token);

  if p_quantity is null or p_quantity <= 0 then
    delete from public.cart_items where cart_id = v_cart_id and variant_id = p_variant_id;
  else
    insert into public.cart_items (cart_id, variant_id, quantity)
    values (v_cart_id, p_variant_id, least(p_quantity, 999))
    on conflict (cart_id, variant_id)
    do update set quantity = least(excluded.quantity, 999), updated_at = now();
  end if;

  update public.carts set updated_at = now() where id = v_cart_id;
end;
$$;

create or replace function public.clear_guest_cart(p_guest_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
begin
  select id into v_cart_id from public.carts
  where guest_token = nullif(trim(p_guest_token), '') and user_id is null
  limit 1;

  if v_cart_id is not null then
    delete from public.cart_items where cart_id = v_cart_id;
    update public.carts set updated_at = now() where id = v_cart_id;
  end if;
end;
$$;

-- Fusion panier invité → compte client
create or replace function public.merge_guest_cart(p_guest_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_guest_cart_id uuid;
  v_user_cart_id uuid;
  v_item record;
  v_existing_qty integer;
  v_token text := nullif(trim(p_guest_token), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_token is not null then
    select id into v_guest_cart_id
    from public.carts
    where guest_token = v_token and user_id is null
    limit 1;
  end if;

  select id into v_user_cart_id
  from public.carts
  where user_id = v_user_id
  limit 1;

  if v_user_cart_id is null then
    insert into public.carts (user_id, expires_at)
    values (v_user_id, now() + interval '90 days')
    returning id into v_user_cart_id;
  end if;

  if v_guest_cart_id is not null then
    for v_item in
      select variant_id, quantity from public.cart_items where cart_id = v_guest_cart_id
    loop
      select quantity into v_existing_qty
      from public.cart_items
      where cart_id = v_user_cart_id and variant_id = v_item.variant_id;

      if found then
        update public.cart_items
        set quantity = least(v_existing_qty + v_item.quantity, 999),
            updated_at = now()
        where cart_id = v_user_cart_id and variant_id = v_item.variant_id;
      else
        insert into public.cart_items (cart_id, variant_id, quantity)
        values (v_user_cart_id, v_item.variant_id, v_item.quantity);
      end if;
    end loop;

    delete from public.carts where id = v_guest_cart_id;
  end if;

  update public.carts set updated_at = now() where id = v_user_cart_id;
  return v_user_cart_id;
end;
$$;

grant execute on function public.ensure_guest_cart(text) to anon, authenticated;
grant execute on function public.fetch_guest_cart(text) to anon, authenticated;
grant execute on function public.upsert_guest_cart_item(text, uuid, integer) to anon, authenticated;
grant execute on function public.set_guest_cart_item_qty(text, uuid, integer) to anon, authenticated;
grant execute on function public.clear_guest_cart(text) to anon, authenticated;
grant execute on function public.merge_guest_cart(text) to authenticated;
