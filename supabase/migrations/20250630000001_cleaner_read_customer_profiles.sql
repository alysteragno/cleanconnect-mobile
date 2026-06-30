-- Allow cleaners to read customer profiles for bookings they are assigned to.
-- Uses SECURITY DEFINER to bypass RLS on the inner query and avoid the
-- profiles → cleaner_assignments → bookings recursion seen in migration 009.
CREATE OR REPLACE FUNCTION public.cleaner_has_customer_assignment(customer_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cleaner_assignments ca
    JOIN public.bookings b ON b.id = ca.booking_id
    WHERE ca.cleaner_id = auth.uid()
      AND b.customer_id = customer_uuid
  );
$$;

-- Additive policy — OR'd with the existing "Authenticated users can view cleaner profiles".
-- Grants cleaners access to the customer profile rows on their assigned bookings.
CREATE POLICY "Cleaners can view customer profiles for assigned bookings"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.cleaner_has_customer_assignment(id)
);
