export type UserRole = 'customer' | 'cleaner' | 'super_admin'

export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded'

export type AssignmentStatus = 'offered' | 'accepted' | 'declined' | 'completed'

export type ServiceType = 'general' | 'deep_cleaning' | 'complete' | 'disinfection' | 'post_construction'

export type SpaceType = 'residential' | 'commercial' | 'condo' | 'office'

export const SERVICE_LABELS: Record<ServiceType, string> = {
  general: 'General Cleaning',
  deep_cleaning: 'Deep Cleaning',
  complete: 'Complete Package',
  disinfection: 'Disinfection',
  post_construction: 'Post-Construction',
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export type Branch = {
  id: string
  name: string
  address: string | null
}

export type Feedback = {
  id: string
  booking_id: string
  customer_id: string
  cleaner_id: string
  rating: number
  comment: string | null
  created_at: string
}

export type Profile = {
  id: string
  full_name: string
  phone: string | null
  role: UserRole
  branch_id: string | null
  is_active: boolean
}

export type Booking = {
  id: string
  customer_id: string
  branch_id: string
  service_name: string | null
  service_image: string | null
  service_slug: string | null
  space_type: SpaceType
  service_date: string
  service_time: string
  property_sqm: number
  sofa_seaters: number | null
  required_cleaners: number
  duration_hours: number
  base_price: number
  status: BookingStatus
  payment_status: PaymentStatus
  payment_method: string
  payment_reference: string | null
  other_furniture: string | null
  address_unit: string | null
  address_street: string | null
  address_barangay: string | null
  address_city: string | null
  address_province: string | null
  service_lat: number | null
  service_lng: number | null
  special_notes: string | null
  furniture_images: string[] | null
  started_at: string | null
  created_at: string
}
