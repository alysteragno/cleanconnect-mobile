import { useEffect, useState } from 'react'
import { ImageSourcePropType } from 'react-native'
import { supabase } from '@/lib/supabase'
import STATIC_SERVICES, { ServiceDef, ServiceGroup, SERVICE_GROUPS as STATIC_GROUPS, getService as getStaticService } from '@/constants/services'

// ── Bundled fallback images keyed by slug ────────────────────────────────────
// Used when the admin has not yet uploaded an image to the bucket.

const FALLBACK_IMAGES: Record<string, ImageSourcePropType> = {
  mattress_deep_cleaning:   require('@/assets/services/mattress_deepCleaning.webp'),
  sofa_couch_deep_cleaning: require('@/assets/services/sofa_deepcleaning.webp'),
  carpet_cleaning:          require('@/assets/services/carpet_cleaning.webp'),
  curtain_dry_cleaning:     require('@/assets/services/curtain_drycleaning.webp'),
  aircon_cleaning:          require('@/assets/services/aircon_cleaning.webp'),
  aircon_repair:            require('@/assets/services/aircon_repair.webp'),
  grease_trap_cleaning:     require('@/assets/services/greasetrap.webp'),
  grease_trap_installation: require('@/assets/services/greasetrap_installation.webp'),
  general_cleaning:         require('@/assets/services/residential_cleaning.webp'),
  condo_cleaning:           require('@/assets/services/condo_cleaning.jpeg'),
  office_cleaning:          require('@/assets/services/office_cleaning.webp'),
}

type DbService = {
  id: string
  slug: string
  name: string
  description: string
  image_url: string | null
  placeholder_bg: string
  placeholder_icon: string
  placeholder_icon_color: string
  accent_color: string
  duration: string
  starting_price: number
  sort_order: number
}

// Category, full description, and service_type aren't reliably populated in
// the DB (category_id is null for many rows and has no "General Cleaning"
// entry), so those structural fields are resolved from the bundled static
// definitions by slug. Admin-editable fields (name, price, image, etc.)
// still come straight from the DB row.
function toServiceDef(row: DbService): ServiceDef {
  const fallback = getStaticService(row.slug)
  return {
    slug:                  row.slug,
    name:                  row.name,
    category:              fallback?.category ?? 'General Cleaning',
    categoryIcon:          fallback?.categoryIcon ?? 'home',
    desc:                  row.description,
    fullDesc:              fallback?.fullDesc ?? row.description,
    image:                 row.image_url
                             ? { uri: row.image_url }
                             : (FALLBACK_IMAGES[row.slug] ?? fallback?.image ?? null),
    placeholderBg:         row.placeholder_bg,
    placeholderIcon:       row.placeholder_icon,
    placeholderIconColor:  row.placeholder_icon_color,
    accent:                row.accent_color,
    duration:              row.duration,
    startingPrice:         row.starting_price,
    serviceType:           fallback?.serviceType ?? 'general',
  }
}

function groupServices(services: ServiceDef[]): ServiceGroup[] {
  const categoryOrder = ['Deep Cleaning', 'Aircon Services', 'Grease Trap', 'General Cleaning']
  const iconMap: Record<string, string> = {
    'Deep Cleaning':    'layers',
    'Aircon Services':  'wind',
    'Grease Trap':      'droplet',
    'General Cleaning': 'home',
  }
  const groups: Record<string, ServiceDef[]> = {}
  for (const svc of services) {
    if (!groups[svc.category]) groups[svc.category] = []
    groups[svc.category].push(svc)
  }
  return categoryOrder
    .filter(cat => groups[cat]?.length > 0)
    .map(cat => ({
      category: cat,
      categoryIcon: iconMap[cat] ?? 'layers',
      items: groups[cat],
    }))
}

type State = {
  services: ServiceDef[]
  groups: ServiceGroup[]
  loading: boolean
  error: string | null
}

export function useServices() {
  const [state, setState] = useState<State>({
    services: STATIC_SERVICES,
    groups: STATIC_GROUPS,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data || data.length === 0) {
          // Keep static fallback, just mark loading done
          setState(s => ({ ...s, loading: false, error: error?.message ?? null }))
          return
        }
        const services = (data as DbService[]).map(toServiceDef)
        setState({ services, groups: groupServices(services), loading: false, error: null })
      })

    return () => { cancelled = true }
  }, [])

  function getService(slug: string) {
    return state.services.find(s => s.slug === slug)
  }

  return { ...state, getService }
}
