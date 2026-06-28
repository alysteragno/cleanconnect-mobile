alter table bookings
  add column if not exists started_at timestamptz;
