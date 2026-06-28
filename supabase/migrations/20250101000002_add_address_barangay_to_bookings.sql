-- Add barangay to bookings for Metro Manila service address granularity
alter table bookings add column if not exists address_barangay text;
