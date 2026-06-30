-- Allow cleaners to read feedback for bookings they are assigned to.
-- Queries by booking_id (not cleaner_id) so rows inserted without cleaner_id are still visible.
-- Reuses the existing cleaner_has_booking_assignment() security-definer function from migration 009.
DROP POLICY IF EXISTS "Cleaners can view their own feedback" ON public.feedback;

CREATE POLICY "Cleaners can view their own feedback"
ON public.feedback
FOR SELECT
TO authenticated
USING (
  cleaner_id = auth.uid()
  OR public.cleaner_has_booking_assignment(booking_id)
);
