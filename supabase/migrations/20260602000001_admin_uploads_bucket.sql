-- Storage bucket for admin PDF uploads (used by extract-pdf route)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-uploads',
  'admin-uploads',
  false,
  52428800,  -- 50 MB
  array['application/pdf']
)
on conflict (id) do nothing;

-- Only admins can upload; service role cleans up after processing
create policy "Admins can upload PDFs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'admin-uploads'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

create policy "Admins can read their uploads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'admin-uploads'
    and exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
