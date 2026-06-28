-- Add service_slug to bookings so the mobile app can display the exact
-- service name (e.g. "Sofa / Couch Cleaning") instead of the generic
-- service_type label (e.g. "Mattress & Upholstery").
alter table bookings
  add column if not exists service_slug text;
