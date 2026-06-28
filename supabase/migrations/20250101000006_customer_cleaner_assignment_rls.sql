-- Allow customers to read cleaner_assignments for their own bookings.
-- Without this policy, the nested join in the booking detail query returns []
-- and the assigned cleaner card / ETA never renders.
CREATE POLICY "Customers can view assignments for their bookings"
ON public.cleaner_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = cleaner_assignments.booking_id
      AND bookings.customer_id = auth.uid()
  )
);
