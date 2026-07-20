-- Defense-in-depth: the mobile app validates/sanitizes full_name client-side, but anyone
-- holding a valid auth token can call the Supabase REST API directly and bypass that. This
-- constraint blocks HTML tags and SQL-comment/quote metacharacters at the database level so
-- data like "<b>Alyster</b>" can never land in the table no matter which client sends it.
--
-- Apostrophe (') is deliberately allowed — it's a legitimate name character (O'Brien,
-- D'Souza) and isn't exploitable through Supabase's parameterized client regardless.
--
-- NOT VALID: skips checking existing rows, so this can't fail the migration on legacy data.
-- Only new inserts/updates are enforced from this point on. Once existing rows are confirmed
-- clean, you can run: ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_full_name_safe;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_safe
  CHECK (
    full_name !~ '[<>";`]'
    AND full_name !~ '--'
    AND length(full_name) <= 80
  ) NOT VALID;
