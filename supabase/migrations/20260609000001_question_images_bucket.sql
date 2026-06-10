-- Public storage bucket for question images (diagrams, exam figures, maps).
-- Public read so students can see the image attached to a question; only admins
-- (or the service role used by the vision generator) can upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  true,
  10485760,  -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "Public can read question images" on storage.objects;
create policy "Public can read question images" on storage.objects
  for select to public
  using (bucket_id = 'question-images');

drop policy if exists "Admins can upload question images" on storage.objects;
create policy "Admins can upload question images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
