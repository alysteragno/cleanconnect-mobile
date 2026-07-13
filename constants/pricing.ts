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

/** Estimated duration in hours — derived from sqm for area services, else a flat default. */
export function estimateDurationHours(slug: string | undefined | null, sqm: number): number {
  if (serviceNeedsSqm(slug) && sqm > 0) return Math.max(1, Math.ceil(sqm / 30))
  return 2
}
