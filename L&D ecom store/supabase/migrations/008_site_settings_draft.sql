-- Draft / published rows + theme JSON for visual editor

alter table public.site_settings
  add column if not exists theme jsonb not null default '{}'::jsonb;

comment on column public.site_settings.theme is 'Global theme overrides (colors, typography)';

-- Migrate legacy single row to published + draft
insert into public.site_settings (id, locale, sections, theme, is_published, updated_at)
select 'published', locale, sections, coalesce(theme, '{}'::jsonb), true, updated_at
from public.site_settings
where id = 'default'
on conflict (id, locale) do update set
  sections = excluded.sections,
  theme = excluded.theme,
  is_published = true,
  updated_at = excluded.updated_at;

insert into public.site_settings (id, locale, sections, theme, is_published, updated_at)
select 'draft', locale, sections, coalesce(theme, '{}'::jsonb), false, updated_at
from public.site_settings
where id = 'default'
on conflict (id, locale) do nothing;

-- Public storefront: only published row
drop policy if exists site_settings_select_published on public.site_settings;

create policy site_settings_select_published
  on public.site_settings for select
  to anon, authenticated
  using (id = 'published' and is_published = true);
