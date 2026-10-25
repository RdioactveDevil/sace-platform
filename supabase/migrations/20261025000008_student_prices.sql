-- Student prices.
--
-- Weekly prices go up to $7/week for the first paid subject, $6 for the
-- second and $5 for each one after.
--
-- New plans use these prices (the API makes the Stripe price for them on
-- first checkout). A plan that's already running stays on the price it
-- started on, and the app shows each student the price their own plan charges.

update public.platform_settings
  set value = jsonb_set(value, '{student_tiers}', '[7, 6, 5]'::jsonb)
  where key = 'pricing';

-- Monthly billing: $27 a month for the first paid subject, $23 for the
-- second and $19 for each one after, a bit over 10% less than paying weekly.
-- Students pick weekly or monthly at checkout and can switch in My Account.
update public.platform_settings
  set value = jsonb_set(value, '{student_monthly_tiers}', '[27, 23, 19]'::jsonb)
  where key = 'pricing';
