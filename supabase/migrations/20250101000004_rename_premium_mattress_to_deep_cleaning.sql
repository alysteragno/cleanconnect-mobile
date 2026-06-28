-- Rename service_type value 'premium_mattress' → 'deep_cleaning' everywhere.
-- The old name was ambiguous (only described mattresses, not sofas/curtains).
-- 'deep_cleaning' matches the category label used in the services catalog.

UPDATE bookings
SET service_type = 'deep_cleaning'
WHERE service_type = 'premium_mattress';

UPDATE services
SET service_type = 'deep_cleaning'
WHERE service_type = 'premium_mattress';
