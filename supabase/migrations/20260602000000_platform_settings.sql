create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Default settings
insert into platform_settings (key, value) values
  ('pricing', '{"student_monthly": 7, "tutor_plans": [{"name": "Starter", "price": 29, "students": 10}, {"name": "Pro", "price": 59, "students": 25}, {"name": "Agency", "price": 99, "students": 999}], "annual_discount": 0.15}'::jsonb),
  ('free_tier', '{"is_beta": true, "beta_label": "Free during Beta", "daily_question_limit": null, "subjects_limit": null}'::jsonb),
  ('access_message', '"Free during Beta"'::jsonb)
on conflict (key) do nothing;

alter table platform_settings enable row level security;
create policy "Admins can manage settings" on platform_settings for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "Anyone can read settings" on platform_settings for select using (true);
