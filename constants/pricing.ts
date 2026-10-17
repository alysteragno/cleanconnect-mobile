import { ServiceType } from './types'
import { getService } from './services'

export const BASE_RATE: Record<ServiceType, number> = {
  general: 500,
  deep_cleaning: 800,
  complete: 1200,
  disinfection: 1000,
  post_construction: 1500,
}

export function estimatePrice(service: ServiceType, sqm: number): number {
  return BASE_RATE[service] + sqm * 8
}

/**
 * Whether a service is priced/measured by floor area (square metres).
 *
 * Only the "General Cleaning" category services (general/residential, condo,
 * office, commercial, post-construction) are area-based. Everything else —
 * Deep Cleaning (mattress/sofa/carpet/curtain), Aircon, Grease Trap — is
 * unit- or flat-rate, so it never asks for sqm.
 *
 * A generic booking with no specific service (undefined slug) is treated as
 * area-based, matching the default general-cleaning flow.
 */
export function serviceNeedsSqm(slug: string | undefined | null): boolean {
  if (!slug) return true
  const svc = getService(slug)
  if (!svc) return true
  return svc.category === 'General Cleaning'
}

/**
 * Estimated price for a booking. Area-based services use the sqm formula;
 * unit/flat-rate services fall back to the service's starting price.
 * (Always an estimate — the admin confirms the final quote.)
 */
export function estimateBookingPrice(
  slug: string | undefined | null,
  serviceType: ServiceType,
  sqm: number,
): number {
  if (serviceNeedsSqm(slug)) return estimatePrice(serviceType, sqm)
  return getService(slug ?? '')?.startingPrice ?? BASE_RATE[serviceType]
}

/**
 * Estimated duration in hours. Mirrors `apply_cleanconnect_operational_rules()`'s
 * duration_hours tiering (cleanconnect-web's schema.sql) exactly, so a duration
 * estimated here — before the booking is even submitted — matches what the DB
 * trigger will actually store. Needed for accurate client-side time-slot
 * conflict prediction (see the Step 3 date/time picker in bookings/new.tsx).
 */
export function estimateDurationHours(slug: string | undefined | null, sqm: number): number {
  if (!serviceNeedsSqm(slug) || sqm <= 0) return 2
  if (sqm <= 30) return 2
  if (sqm <= 60) return 3
  if (sqm <= 100) return 4
  return 4 + Math.ceil((sqm - 100) / 50)
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Whether two [start, start + durationHours) windows (in minutes-since-
 * midnight) overlap. No buffer — this is for the customer double-booking
 * check (a customer can't physically be at two bookings at once), mirroring
 * cleanconnect-web's src/lib/booking-pricing.ts windowsOverlap().
 */
export function windowsOverlap(
  startA: number, durationHoursA: number,
  startB: number, durationHoursB: number,
): boolean {
  const endA = startA + durationHoursA * 60
  const endB = startB + durationHoursB * 60
  return startA < endB && endA > startB
}
