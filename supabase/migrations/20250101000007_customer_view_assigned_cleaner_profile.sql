-- Allow authenticated users to read cleaner profiles.
-- A simple role-based check avoids the RLS chain (profiles → cleaner_assignments → bookings)
-- that the previous EXISTS-based policy caused, which broke all profile reads including login.
CREATE POLICY "Authenticated users can view cleaner profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR role = 'cleaner'
);
