-- Tracks when the cleaner tagged their starting location (Step 1, "Swipe to
-- Start Trip" on app/(cleaner)/jobs/[id].tsx). Without a persisted marker,
-- the job detail screen had no way to restore step 1 progress after an app
-- reload, so it re-showed the "Swipe to Start Trip" step every time even
-- though the cleaner had already started their trip.
-- Covered by the existing "Cleaners can update their assigned bookings"
-- UPDATE policy (migration 20250628000002) — no new RLS policy needed.
ALTER TABLE public.bookings
ADD COLUMN cleaner_en_route_at timestamptz;
