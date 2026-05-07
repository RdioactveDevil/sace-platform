-- Tutor signup profile fields + one-time app tutorial tracking
-- Run in Supabase SQL after supabase-migration-roles.sql

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_organization TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_subjects_offered TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_qualifications TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_experience_years INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_tutorial_completed_at TIMESTAMPTZ;

-- Existing users should not be forced through the new tutorial
UPDATE profiles
SET app_tutorial_completed_at = COALESCE(app_tutorial_completed_at, NOW())
WHERE onboarding_completed = true
  AND app_tutorial_completed_at IS NULL;
