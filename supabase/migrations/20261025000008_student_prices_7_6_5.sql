-- Student prices go up to $7/week for the first paid subject, $6 for the
-- second and $5 for each one after.
--
-- New plans use these prices (the API makes a new Stripe price for them on
-- the first checkout). A plan that's already running stays on the price it
-- started on, and the app shows each student the price their own plan charges.

update public.platform_settings
  set value = jsonb_set(value, '{student_tiers}', '[7, 6, 5]'::jsonb)
  where key = 'pricing';
