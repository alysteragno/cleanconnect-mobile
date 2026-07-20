-- profiles had RLS enabled with SELECT/UPDATE policies only (see cleanconnect-web/rls.sql),
-- no INSERT policy. Web never hit this because it inserts profiles via a service-role client
-- (bypasses RLS); mobile self-registration inserts as the authenticated user itself, which
-- RLS default-denies with no matching policy -> "new row violates row-level security policy".
--
-- Restricted to role = 'customer' so a user can't self-elevate to cleaner/super_admin by
-- calling the REST API directly with the same auth.uid() but a different role value.
-- Cleaner/admin accounts are still only created server-side via the web app's adminClient.
CREATE POLICY "Users can insert own customer profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id AND role = 'customer');
