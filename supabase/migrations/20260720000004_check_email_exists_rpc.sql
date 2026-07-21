-- Lets the login screen distinguish "wrong password" from "no account with that email"
-- (team decision: the clearer UX is worth the low-severity enumeration tradeoff — see
-- app/(auth)/login.tsx handlePasswordStep). Supabase's signInWithPassword deliberately
-- returns the same generic error for both cases, so this fills that gap.
--
-- SECURITY DEFINER so it can read auth.users despite anon having no direct grant on that
-- schema; scoped tightly to return a bare boolean, never any account data.
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  ) INTO found;
  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon, authenticated;
