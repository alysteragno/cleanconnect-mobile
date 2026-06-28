ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_image TEXT;

-- Backfill existing bookings from the services catalog
UPDATE bookings b
SET service_image = s.image_url
FROM services s
WHERE s.slug = b.service_slug
  AND b.service_image IS NULL
  AND s.image_url IS NOT NULL;

-- Auto-fill service_image on new bookings via trigger
CREATE OR REPLACE FUNCTION fill_booking_service_image()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.service_slug IS NOT NULL AND NEW.service_image IS NULL THEN
    SELECT image_url INTO NEW.service_image
    FROM services
    WHERE slug = NEW.service_slug
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_booking_service_image ON bookings;

CREATE TRIGGER trg_fill_booking_service_image
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION fill_booking_service_image();
