import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = '@cc/booking_draft'

export type StoredDraft = {
  form: {
    service_type: string | null
    space_type: string | null
    property_sqm: string
    sofa_seaters: number
    other_furniture: string
    furniture_images: string[]
    address_unit: string
    address_street: string
    address_city: string
    address_province: string
    service_lat: number | null
    service_lng: number | null
    service_address_label: string
    service_date: string | null
    service_time: string | null
    payment_method: string
    payment_reference: string
    payment_proof_uri: string
    special_notes: string
  }
  step: number
  savedAt: string
}

export async function saveDraft(draft: StoredDraft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(draft))
}

export async function loadDraft(): Promise<StoredDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredDraft) : null
  } catch {
    return null
  }
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY)
}
