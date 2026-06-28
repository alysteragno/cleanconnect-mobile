-- Allow cleaners to read bookings where they have an assignment.
-- Required since active.tsx now queries bookings directly (not via join embed).
CREATE POLICY "Cleaners can view their assigned bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cleaner_assignments
    WHERE cleaner_assignments.booking_id = bookings.id
      AND cleaner_assignments.cleaner_id = auth.uid()
  )
);
