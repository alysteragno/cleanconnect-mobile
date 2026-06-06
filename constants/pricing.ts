import { ServiceType } from './types'

export const BASE_RATE: Record<ServiceType, number> = {
  general: 500,
  premium_mattress: 800,
  complete: 1200,
  disinfection: 1000,
  post_construction: 1500,
}

export function estimatePrice(service: ServiceType, sqm: number): number {
  return BASE_RATE[service] + sqm * 8
}
