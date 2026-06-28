-- Drop the recursive policy from migration 8.
-- It caused infinite recursion: bookings RLS → cleaner_assignments → bookings RLS (migration 6).
DROP POLICY IF EXISTS "Cleaners can view their assigned bookings" ON public.bookings;

-- Security-definer helper: checks if the current user has a cleaner_assignment for
-- the given booking WITHOUT triggering the cleaner_assignments RLS (which itself
-- queries bookings), breaking the circular reference.
CREATE OR REPLACE FUNCTION public.cleaner_has_booking_assignment(booking_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cleaner_assignments
    WHERE cleaner_assignments.booking_id = booking_uuid
      AND cleaner_assignments.cleaner_id = auth.uid()
  );
$$;

-- Recreate the policy using the helper so no RLS cycle occurs.
CREATE POLICY "Cleaners can view their assigned bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  public.cleaner_has_booking_assignment(id)
);
