-- Official data booklets and formula sheets (the SACE / VCAA PDFs students get
-- in the exam), one per subject, uploaded in Admin → Curricula → (subject) →
-- Student features and shown from the quiz's Tools menu. The subject points at
-- its file in curricula.features.data_booklet = { url, path, title, name }.
-- Public read (students open the PDF); only admins write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('data-booklets', 'data-booklets', true, 20971520, array['application/pdf'])  -- 20 MB
on conflict (id) do nothing;

drop policy if exists "Public can read data booklets" on storage.objects;
create policy "Public can read data booklets" on storage.objects
  for select to public
  using (bucket_id = 'data-booklets');

drop policy if exists "Admins can upload data booklets" on storage.objects;
create policy "Admins can upload data booklets" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'data-booklets'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can replace data booklets" on storage.objects;
create policy "Admins can replace data booklets" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'data-booklets'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can delete data booklets" on storage.objects;
create policy "Admins can delete data booklets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'data-booklets'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
