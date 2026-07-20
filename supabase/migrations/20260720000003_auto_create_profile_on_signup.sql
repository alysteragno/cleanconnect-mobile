-- Once "Confirm email" is turned on (Authentication -> Sign In / Providers -> Email in the
-- Supabase Dashboard), supabase.auth.signUp() no longer returns a session immediately — the
-- user isn't authenticated until they click the confirmation link. That breaks the mobile
-- app's previous flow of inserting into public.profiles as the just-signed-up user right
-- after signUp(), because there's no JWT yet for the INSERT ... WITH CHECK (auth.uid() = id)
-- policy (see 20260720000001) to pass.
--
-- A SECURITY DEFINER trigger on auth.users sidesteps this entirely: it runs at the database
-- level in the same transaction as the auth.users insert, independent of whether the new
-- user's email/session exists yet. Mobile only ever self-registers customers, so role is
-- hardcoded to 'customer' here (cleaner/admin accounts are still only created by the web
-- app's service-role adminClient, which bypasses triggers/RLS the same way it always has).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    'customer',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
