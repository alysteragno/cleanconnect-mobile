import { ImageSourcePropType } from 'react-native'
import { ServiceType } from './types'

export type ServiceDef = {
  slug: string
  name: string
  category: string
  categoryIcon: string
  desc: string
  fullDesc: string
  image: ImageSourcePropType | null
  placeholderBg: string
  placeholderIcon: string
  placeholderIconColor: string
  accent: string
  duration: string
  startingPrice: number
  serviceType: ServiceType
}

export type ServiceGroup = {
  category: string
  categoryIcon: string
  items: ServiceDef[]
}

const SERVICES: ServiceDef[] = [
  // ── Deep Cleaning ──────────────────────────────────────────────────────────
  {
    slug: 'mattress_deep_cleaning',
    name: 'Mattress Deep Cleaning',
    category: 'Deep Cleaning',
    categoryIcon: 'layers',
    desc: 'Removes dust mites, stains, and allergens from your mattress.',
    fullDesc: 'Our mattress deep cleaning service uses professional-grade hot-water extraction and UV sanitation to eliminate dust mites, bacteria, allergens, and stubborn stains. Your mattress is left fresh, sanitized, and dry within hours — giving you a healthier sleep environment.',
    image: require('@/assets/services/mattress_deepCleaning.webp'),
    placeholderBg: '#fce7f3', placeholderIcon: 'layers', placeholderIconColor: '#db2777',
    accent: '#db2777', duration: '1–2 hrs', startingPrice: 800, serviceType: 'deep_cleaning',
  },
  {
    slug: 'sofa_couch_deep_cleaning',
    name: 'Sofa / Couch Cleaning',
    category: 'Deep Cleaning',
    categoryIcon: 'layers',
    desc: 'Deep extraction cleaning for all sofa and couch types.',
    fullDesc: 'We use hot-water extraction and fabric-safe cleaning solutions to deep clean your sofa, sectionals, and upholstered chairs. Removes embedded dirt, pet hair, odors, and stains — restoring your furniture to its original freshness.',
    image: require('@/assets/services/sofa_deepcleaning.webp'),
    placeholderBg: '#fff7ed', placeholderIcon: 'layers', placeholderIconColor: '#ea580c',
    accent: '#ea580c', duration: '1–2 hrs', startingPrice: 800, serviceType: 'deep_cleaning',
  },
  {
    slug: 'carpet_cleaning',
    name: 'Carpet Cleaning',
    category: 'Deep Cleaning',
    categoryIcon: 'grid',
    desc: 'Hot-water extraction and stain treatment for carpets.',
    fullDesc: 'Professional hot-water extraction removes ground-in dirt, allergens, and stubborn stains from all types of carpets. Our process leaves carpets thoroughly cleaned and deodorized, with minimal dry time so you can get back to normal quickly.',
    image: require('@/assets/services/carpet_cleaning.webp'),
    placeholderBg: '#f0fdf4', placeholderIcon: 'grid', placeholderIconColor: '#22c55e',
    accent: '#22c55e', duration: '2–3 hrs', startingPrice: 900, serviceType: 'general',
  },
  {
    slug: 'curtain_dry_cleaning',
    name: 'Curtain Dry Cleaning',
    category: 'Deep Cleaning',
    categoryIcon: 'wind',
    desc: 'On-site dry cleaning that freshens and sanitizes curtains.',
    fullDesc: 'Our on-site curtain dry cleaning service removes dust, odors, and bacteria from your curtains without taking them down. We use specialized dry-cleaning solutions that are safe for all fabric types, leaving your curtains fresh, bright, and allergen-free.',
    image: require('@/assets/services/curtain_drycleaning.webp'),
    placeholderBg: '#eff6ff', placeholderIcon: 'wind', placeholderIconColor: '#3b82f6',
    accent: '#3b82f6', duration: '1–2 hrs', startingPrice: 700, serviceType: 'general',
  },

  // ── Aircon Services ────────────────────────────────────────────────────────
  {
    slug: 'aircon_cleaning',
    name: 'Aircon Cleaning',
    category: 'Aircon Services',
    categoryIcon: 'wind',
    desc: 'Coil wash and blower cleaning for optimal cooling performance.',
    fullDesc: 'Regular aircon cleaning extends the lifespan of your unit and improves energy efficiency. Our technicians perform coil washing, blower cleaning, and drain line flushing to restore your aircon\'s cooling performance and improve indoor air quality.',
    image: require('@/assets/services/aircon_cleaning.webp'),
    placeholderBg: '#e0f2fe', placeholderIcon: 'wind', placeholderIconColor: '#0891b2',
    accent: '#0891b2', duration: '1–2 hrs', startingPrice: 600, serviceType: 'general',
  },
  {
    slug: 'aircon_freon_charging',
    name: 'Aircon Freon Charging',
    category: 'Aircon Services',
    categoryIcon: 'zap',
    desc: "Refrigerant recharge to restore your aircon's cooling power.",
    fullDesc: 'Low refrigerant is a common cause of poor cooling. Our certified technicians will check for leaks, repair if needed, and recharge your unit with the correct refrigerant type and amount — restoring full cooling performance.',
    image: null,
    placeholderBg: '#dbeafe', placeholderIcon: 'zap', placeholderIconColor: '#1d4ed8',
    accent: '#1d4ed8', duration: '1–2 hrs', startingPrice: 800, serviceType: 'general',
  },
  {
    slug: 'aircon_repair',
    name: 'Aircon Repair',
    category: 'Aircon Services',
    categoryIcon: 'tool',
    desc: 'Diagnosis and repair for common aircon faults and malfunctions.',
    fullDesc: 'From faulty thermostats to compressor issues, our technicians diagnose and fix common aircon problems on-site. We carry common replacement parts to minimize downtime and get your unit running again as quickly as possible.',
    image: require('@/assets/services/aircon_repair.webp'),
    placeholderBg: '#fff1f2', placeholderIcon: 'tool', placeholderIconColor: '#e11d48',
    accent: '#e11d48', duration: '1–3 hrs', startingPrice: 1000, serviceType: 'general',
  },

  // ── Grease Trap ────────────────────────────────────────────────────────────
  {
    slug: 'grease_trap_cleaning',
    name: 'Grease Trap Cleaning',
    category: 'Grease Trap',
    categoryIcon: 'droplet',
    desc: 'High-pressure cleaning for commercial grease traps and interceptors.',
    fullDesc: 'Clogged grease traps cause foul odors and compliance violations. Our team performs thorough high-pressure cleaning and waste removal to keep your grease trap functioning properly and your kitchen compliant with health and sanitation standards.',
    image: require('@/assets/services/greasetrap.webp'),
    placeholderBg: '#fef3c7', placeholderIcon: 'droplet', placeholderIconColor: '#d97706',
    accent: '#d97706', duration: '2–4 hrs', startingPrice: 1500, serviceType: 'general',
  },
  {
    slug: 'grease_trap_installation',
    name: 'Grease Trap Installation',
    category: 'Grease Trap',
    categoryIcon: 'tool',
    desc: 'Professional installation of grease traps for kitchens and restaurants.',
    fullDesc: 'We supply and install the right grease trap size for your commercial kitchen or restaurant, ensuring proper placement and connection to your drainage system. All installations meet local plumbing and environmental codes.',
    image: require('@/assets/services/greasetrap_installation.webp'),
    placeholderBg: '#fef3c7', placeholderIcon: 'tool', placeholderIconColor: '#b45309',
    accent: '#b45309', duration: '3–5 hrs', startingPrice: 2500, serviceType: 'general',
  },

  // ── General Cleaning ───────────────────────────────────────────────────────
  {
    slug: 'general_cleaning',
    name: 'General Cleaning',
    category: 'General Cleaning',
    categoryIcon: 'home',
    desc: 'Thorough cleaning for houses, townhouses, and residential properties.',
    fullDesc: 'Our professional house cleaning covers all rooms — living areas, bedrooms, kitchen, and bathrooms. We dust, vacuum, mop, wipe surfaces, and sanitize key areas to leave your home spotless and fresh.',
    image: require('@/assets/services/residential_cleaning.webp'),
    placeholderBg: '#fce7f3', placeholderIcon: 'home', placeholderIconColor: '#db2777',
    accent: '#db2777', duration: '3–5 hrs', startingPrice: 1500, serviceType: 'general',
  },
  {
    slug: 'condo_cleaning',
    name: 'Condo Cleaning',
    category: 'General Cleaning',
    categoryIcon: 'square',
    desc: 'Efficient cleaning tailored for condominiums and studio units.',
    fullDesc: 'Specialized cleaning service for condos and studio units. We work efficiently in smaller spaces, covering all surfaces, appliances, bathrooms, and floors — making your condo feel hotel-fresh after every session.',
    image: require('@/assets/services/condo_cleaning.jpeg'),
    placeholderBg: '#eff6ff', placeholderIcon: 'square', placeholderIconColor: '#3b82f6',
    accent: '#3b82f6', duration: '2–4 hrs', startingPrice: 1200, serviceType: 'general',
  },
  {
    slug: 'office_cleaning',
    name: 'Office Cleaning',
    category: 'General Cleaning',
    categoryIcon: 'briefcase',
    desc: 'Professional cleaning for offices, workspaces, and business premises.',
    fullDesc: 'Keep your workplace clean, healthy, and professional. We clean desks, floors, pantries, restrooms, and common areas — using commercial-grade supplies that meet workplace hygiene standards.',
    image: require('@/assets/services/office_cleaning.webp'),
    placeholderBg: '#f0fdf4', placeholderIcon: 'briefcase', placeholderIconColor: '#16a34a',
    accent: '#16a34a', duration: '2–4 hrs', startingPrice: 1200, serviceType: 'general',
  },
  {
    slug: 'commercial_cleaning',
    name: 'Commercial Cleaning',
    category: 'General Cleaning',
    categoryIcon: 'package',
    desc: 'Comprehensive cleaning for commercial establishments and large spaces.',
    fullDesc: 'Large-scale cleaning for commercial spaces including shops, warehouses, event venues, and establishments. Our crew handles high-traffic areas, deep floor cleaning, and comprehensive sanitization to keep your business ready for customers.',
    image: null,
    placeholderBg: '#fff7ed', placeholderIcon: 'package', placeholderIconColor: '#ea580c',
    accent: '#ea580c', duration: '3–5 hrs', startingPrice: 1500, serviceType: 'general',
  },
  {
    slug: 'post_construction',
    name: 'Post-Construction Cleaning',
    category: 'General Cleaning',
    categoryIcon: 'tool',
    desc: 'Thorough cleanup after construction, renovation, or remodeling work.',
    fullDesc: 'Post-construction cleaning removes dust, debris, paint splatters, and construction residue from all surfaces. Our team does a full top-to-bottom clean — windows, floors, walls, fixtures — leaving the space move-in or open-for-business ready.',
    image: null,
    placeholderBg: '#fef3c7', placeholderIcon: 'tool', placeholderIconColor: '#d97706',
    accent: '#d97706', duration: '4–8 hrs', startingPrice: 3000, serviceType: 'post_construction',
  },
]

export default SERVICES

export function getService(slug: string): ServiceDef | undefined {
  return SERVICES.find(s => s.slug === slug)
}

export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    category: 'Deep Cleaning',
    categoryIcon: 'layers',
    items: SERVICES.filter(s => s.category === 'Deep Cleaning'),
  },
  {
    category: 'Aircon Services',
    categoryIcon: 'wind',
    items: SERVICES.filter(s => s.category === 'Aircon Services'),
  },
  {
    category: 'Grease Trap',
    categoryIcon: 'droplet',
    items: SERVICES.filter(s => s.category === 'Grease Trap'),
  },
]
