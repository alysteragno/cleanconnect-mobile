-- Allow cleaners to update bookings where they have an assignment.
-- Required for arrival confirmation (status → in_progress) and job
-- completion (status → completed, payment_status → paid).
-- Reuses the cleaner_has_booking_assignment security-definer helper
-- (created in migration 9) to avoid RLS recursion.
CREATE POLICY "Cleaners can update their assigned bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (public.cleaner_has_booking_assignment(id))
WITH CHECK (public.cleaner_has_booking_assignment(id));
