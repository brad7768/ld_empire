-- Bucket public pour images produit : upload admin (JWT authenticated), lecture publique pour la boutique.
-- À appliquer après les migrations précédentes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_media_select_public" on storage.objects;
create policy "product_media_select_public"
  on storage.objects for select
  using (bucket_id = 'product-media');

drop policy if exists "product_media_authenticated_insert" on storage.objects;
create policy "product_media_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-media');

drop policy if exists "product_media_authenticated_delete" on storage.objects;
create policy "product_media_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-media');
