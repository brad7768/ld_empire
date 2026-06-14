-- Site settings (homepage sections) for admin CMS + storefront overrides

create table if not exists public.site_settings (
  id text not null default 'default',
  locale text not null default 'fr',
  sections jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (id, locale)
);

comment on table public.site_settings is 'JSON sections for vitrine overrides (hero, manifesto, promo, etc.)';

alter table public.site_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_published'
  ) then
    create policy site_settings_select_published
      on public.site_settings for select
      to anon, authenticated
      using (is_published = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_admin_all'
  ) then
    create policy site_settings_admin_all
      on public.site_settings for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end$$;
