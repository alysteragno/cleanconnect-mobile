import { useEffect, useState } from 'react'
import { ImageSourcePropType } from 'react-native'
import { supabase } from '@/lib/supabase'
import STATIC_SERVICES, { ServiceDef, ServiceGroup, SERVICE_GROUPS as STATIC_GROUPS } from '@/constants/services'

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
}

type DbService = {
  id: string
  slug: string
  name: string
  category: string
  category_icon: string
  description: string
  full_description: string
  image_url: string | null
  placeholder_bg: string
  placeholder_icon: string
  placeholder_icon_color: string
  accent_color: string
  duration_label: string
  starting_price: number
  service_type: string
  display_order: number
}

function toServiceDef(row: DbService): ServiceDef {
  return {
    slug:                  row.slug,
    name:                  row.name,
    category:              row.category,
    categoryIcon:          row.category_icon,
    desc:                  row.description,
    fullDesc:              row.full_description,
    image:                 row.image_url
                             ? { uri: row.image_url }
                             : (FALLBACK_IMAGES[row.slug] ?? null),
    placeholderBg:         row.placeholder_bg,
    placeholderIcon:       row.placeholder_icon,
    placeholderIconColor:  row.placeholder_icon_color,
    accent:                row.accent_color,
    duration:              row.duration_label,
    startingPrice:         row.starting_price,
    serviceType:           row.service_type as ServiceDef['serviceType'],
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
      .order('display_order', { ascending: true })
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
