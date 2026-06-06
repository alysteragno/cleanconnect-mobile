import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import LocationMapPicker from '@/components/LocationMapPicker'
import { Colors } from '@/constants/colors'
import { ServiceType, SpaceType, SERVICE_LABELS } from '@/constants/types'
import { estimatePrice } from '@/constants/pricing'

type FormData = {
  service_type: ServiceType | null
  space_type: SpaceType | null
  property_sqm: string
  sofa_seaters: number
  furniture_images: string[]
  address_unit: string
  address_street: string
  address_city: string
  address_province: string
  service_lat: number | null
  service_lng: number | null
  service_date: Date | null
  service_time: Date | null
  payment_method: string
  special_notes: string
}

const INITIAL_FORM: FormData = {
  service_type: null,
  space_type: null,
  property_sqm: '',
  sofa_seaters: 0,
  furniture_images: [],
  address_unit: '',
  address_street: '',
  address_city: '',
  address_province: '',
  service_lat: null,
  service_lng: null,
  service_date: null,
  service_time: null,
  payment_method: '',
  special_notes: '',
}

const SERVICE_OPTIONS: ServiceType[] = ['general', 'premium_mattress', 'complete', 'disinfection', 'post_construction']
const SPACE_OPTIONS: Array<{ key: SpaceType; label: string }> = [
  { key: 'residential', label: 'Residential' },
  { key: 'commercial', label: 'Commercial' },
]
const PAYMENT_OPTIONS = [
  { key: 'cash', label: 'Cash', desc: 'Pay on the day of service' },
  { key: 'gcash', label: 'GCash', desc: 'Pay via GCash before service' },
  { key: 'bank_transfer', label: 'Bank Transfer', desc: 'Transfer to our bank account' },
]

const AI_STEPS = [
  { label: 'Manpower Estimation', s: 1 },
  { label: 'Availability Analysis', s: 2 },
  { label: 'Geo-based Cleaner Matching', s: 3 },
]

function formatDisplayDate(d: Date) {
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function formatDisplayTime(d: Date) {
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}
function toDateString(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function toTimeString(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function NewBookingScreen() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [showMap, setShowMap] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [aiStep, setAiStep] = useState(0)

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library to upload furniture photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 5,
    })
    if (!result.canceled) {
      const newUris = result.assets.map(a => a.uri)
      update('furniture_images', [...form.furniture_images, ...newUris].slice(0, 5))
    }
  }

  function validateStep(): string {
    if (step === 1) {
      if (!form.service_type) return 'Please select a service type.'
      if (!form.space_type) return 'Please select a space type.'
      if (!form.property_sqm || isNaN(Number(form.property_sqm)) || Number(form.property_sqm) <= 0)
        return 'Please enter a valid property size.'
      if (form.furniture_images.length === 0)
        return 'Please upload at least one photo of the area/furniture to be cleaned.'
    }
    if (step === 2) {
      if (!form.address_street.trim()) return 'Please enter a street address.'
      if (!form.address_city.trim()) return 'Please enter a city.'
      if (!form.address_province.trim()) return 'Please enter a province.'
    }
    if (step === 3) {
      if (!form.service_date) return 'Please select a date.'
      if (!form.service_time) return 'Please select a time.'
    }
    if (step === 5) {
      if (!form.payment_method) return 'Please select a payment method.'
    }
    return ''
  }

  function handleNext() {
    const err = validateStep()
    if (err) { Alert.alert('Missing info', err); return }

    // Step 4 (Review) → trigger AI Processing animation before going to step 5
    if (step === 4) {
      setProcessing(true)
      setAiStep(0)
      setTimeout(() => setAiStep(1), 700)
      setTimeout(() => setAiStep(2), 1400)
      setTimeout(() => setAiStep(3), 2100)
      setTimeout(() => { setProcessing(false); setAiStep(0); setStep(5) }, 2800)
      return
    }

    setStep(s => s + 1)
  }

  function handleBack() {
    if (step === 1) { router.back(); return }
    setStep(s => s - 1)
  }

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated.'); setSubmitting(false); return }

    // Upload furniture images to Supabase Storage
    const uploadedUrls: string[] = []
    for (const uri of form.furniture_images) {
      try {
        const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const response = await fetch(uri)
        const blob = await response.blob()
        const { error: uploadError } = await supabase.storage
          .from('booking-images')
          .upload(path, blob, { contentType: `image/${ext}`, upsert: false })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('booking-images').getPublicUrl(path)
          uploadedUrls.push(urlData.publicUrl)
        }
      } catch {
        // skip individual failed uploads, form still submits
      }
    }

    const sqm = parseFloat(form.property_sqm)
    const base_price = estimatePrice(form.service_type!, sqm)
    const duration_hours = Math.max(1, Math.ceil(sqm / 30))

    const { data, error: insertError } = await supabase.from('bookings').insert({
      customer_id: user.id,
      service_type: form.service_type,
      space_type: form.space_type,
      property_sqm: sqm,
      sofa_seaters: form.sofa_seaters > 0 ? form.sofa_seaters : null,
      furniture_images: uploadedUrls.length > 0 ? uploadedUrls : null,
      address_unit: form.address_unit || null,
      address_street: form.address_street,
      address_city: form.address_city,
      address_province: form.address_province,
      service_lat: form.service_lat,
      service_lng: form.service_lng,
      service_date: toDateString(form.service_date!),
      service_time: toTimeString(form.service_time!),
      payment_method: form.payment_method,
      special_notes: form.special_notes || null,
      status: 'pending',
      payment_status: 'unpaid',
      base_price,
      required_cleaners: 1,
      duration_hours,
    }).select('id').single()

    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    router.replace(`/(customer)/bookings/${data.id}`)
  }

  const stepLabels = ['Service Details', 'Address', 'Schedule', 'Review', 'Payment']

  const stepIndicator = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <View key={n} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{
            width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
            backgroundColor: n < step ? Colors.primary + '60' : n === step ? Colors.primary : '#e5e7eb',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: n <= step ? '#fff' : '#9ca3af' }}>
              {n}
            </Text>
          </View>
          {n < 5 && (
            <View style={{ width: 20, height: 2, backgroundColor: n < step ? Colors.primary : '#e5e7eb', marginHorizontal: 2 }} />
          )}
        </View>
      ))}
    </View>
  )

  const navBar = (
    <View style={{
      flexDirection: 'row', padding: 16, gap: 12,
      borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff',
    }}>
      <TouchableOpacity
        onPress={handleBack}
        style={{
          flex: 1, paddingVertical: 14, borderRadius: 12,
          borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center',
        }}
      >
        <Text style={{ color: '#6b7280', fontWeight: '600' }}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={step === 5 ? handleSubmit : handleNext}
        disabled={submitting}
        style={{
          flex: 2, paddingVertical: 14, borderRadius: 12,
          backgroundColor: Colors.primary, alignItems: 'center',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontWeight: '700' }}>
              {step === 4 ? 'Process Booking →' : step === 5 ? 'Confirm Booking' : 'Next →'}
            </Text>
        }
      </TouchableOpacity>
    </View>
  )

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppHeader
        title="New Booking"
        subtitle={`Step ${step} of 5 — ${stepLabels[step - 1]}`}
        hideBell
      />

      {stepIndicator}

      {/* ── AI Processing Overlay ── */}
      {processing && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.97)',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 32,
        }}>
          <View style={{
            backgroundColor: '#fff', borderRadius: 24, padding: 32,
            borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
            width: '100%',
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: '#fdf2f8', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 6 }}>
              AI Processing
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 24, textAlign: 'center' }}>
              Finding the best match for your booking...
            </Text>
            {AI_STEPS.map(item => (
              <View key={item.label} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                width: '100%', marginBottom: 14,
                opacity: aiStep >= item.s ? 1 : 0.3,
              }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: aiStep >= item.s ? Colors.primary : '#f3f4f6',
                  borderWidth: 1,
                  borderColor: aiStep >= item.s ? Colors.primary : '#e5e7eb',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {aiStep >= item.s
                    ? <Feather name="check" size={14} color="#fff" />
                    : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#d1d5db' }} />
                  }
                </View>
                <Text style={{
                  fontSize: 14, fontWeight: '600',
                  color: aiStep >= item.s ? '#111827' : '#9ca3af',
                }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Step 1: Service & Space ── */}
        {step === 1 && (
          <View style={{ gap: 20 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
                Service Type
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {SERVICE_OPTIONS.map(s => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => update('service_type', s)}
                    style={{
                      width: '47%', padding: 14, borderRadius: 12, borderWidth: 1.5,
                      borderColor: form.service_type === s ? Colors.primary : '#e5e7eb',
                      backgroundColor: form.service_type === s ? '#fdf2f8' : '#fff',
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '600',
                      color: form.service_type === s ? Colors.primary : '#374151',
                    }}>
                      {SERVICE_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
                Space Type
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {SPACE_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.key}
                    onPress={() => update('space_type', o.key)}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5,
                      borderColor: form.space_type === o.key ? Colors.primary : '#e5e7eb',
                      backgroundColor: form.space_type === o.key ? '#fdf2f8' : '#fff',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: 14, fontWeight: '600',
                      color: form.space_type === o.key ? Colors.primary : '#374151',
                    }}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                Property Size (sqm)
              </Text>
              <TextInput
                value={form.property_sqm}
                onChangeText={t => update('property_sqm', t)}
                keyboardType="numeric"
                placeholder="e.g. 60"
                placeholderTextColor="#9ca3af"
                style={{
                  backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 15, color: '#111827',
                }}
              />
            </View>

            {/* Sofa seaters */}
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                Number of Sofa Seaters
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                Include all sofas, sectionals, and upholstered chairs to be cleaned.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity
                  onPress={() => update('sofa_seaters', Math.max(0, form.sofa_seaters - 1))}
                  style={{
                    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: form.sofa_seaters > 0 ? Colors.primary : '#e5e7eb',
                    backgroundColor: form.sofa_seaters > 0 ? '#fdf2f8' : '#f9fafb',
                  }}
                >
                  <Text style={{ fontSize: 22, color: form.sofa_seaters > 0 ? Colors.primary : '#d1d5db', lineHeight: 26 }}>−</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#111827', minWidth: 40, textAlign: 'center' }}>
                  {form.sofa_seaters}
                </Text>
                <TouchableOpacity
                  onPress={() => update('sofa_seaters', Math.min(20, form.sofa_seaters + 1))}
                  style={{
                    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: '#fdf2f8',
                  }}
                >
                  <Text style={{ fontSize: 22, color: Colors.primary, lineHeight: 26 }}>+</Text>
                </TouchableOpacity>
                {form.sofa_seaters > 0 && (
                  <Text style={{ fontSize: 13, color: '#6b7280' }}>
                    {form.sofa_seaters} seater{form.sofa_seaters !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            </View>

            {/* Furniture photo upload */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
                  Furniture / Area Photos
                </Text>
                <View style={{
                  backgroundColor: '#fce7f3', borderRadius: 6,
                  paddingHorizontal: 7, paddingVertical: 2,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary }}>REQUIRED</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                Upload photos of the area/furniture so our admin can verify and confirm the service rate. Up to 5 photos.
              </Text>

              {/* Image grid */}
              {form.furniture_images.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {form.furniture_images.map((uri, i) => (
                    <View key={uri} style={{ position: 'relative' }}>
                      <Image
                        source={{ uri }}
                        style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        onPress={() => update('furniture_images', form.furniture_images.filter((_, idx) => idx !== i))}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Feather name="x" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {form.furniture_images.length < 5 && (
                <TouchableOpacity
                  onPress={pickImages}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 14, borderRadius: 12,
                    borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: form.furniture_images.length === 0 ? Colors.primary : '#e5e7eb',
                    backgroundColor: form.furniture_images.length === 0 ? '#fdf2f8' : '#f9fafb',
                  }}
                >
                  <Feather name="camera" size={18} color={form.furniture_images.length === 0 ? Colors.primary : '#9ca3af'} />
                  <Text style={{
                    fontSize: 14, fontWeight: '600',
                    color: form.furniture_images.length === 0 ? Colors.primary : '#6b7280',
                  }}>
                    {form.furniture_images.length === 0 ? 'Upload Photos (Required)' : 'Add More Photos'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Step 2: Address + GPS ── */}
        {step === 2 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Service Address</Text>

            {[
              { key: 'address_unit' as const, label: 'Unit / Floor (optional)', placeholder: 'e.g. Unit 3B' },
              { key: 'address_street' as const, label: 'Street *', placeholder: 'e.g. 123 Rizal Ave' },
              { key: 'address_city' as const, label: 'City *', placeholder: 'e.g. Makati' },
              { key: 'address_province' as const, label: 'Province *', placeholder: 'e.g. Metro Manila' },
            ].map(field => (
              <View key={field.key}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  {field.label}
                </Text>
                <TextInput
                  value={form[field.key] as string}
                  onChangeText={t => update(field.key, t)}
                  placeholder={field.placeholder}
                  placeholderTextColor="#9ca3af"
                  style={{
                    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
                    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                    fontSize: 15, color: '#111827',
                  }}
                />
              </View>
            ))}

            <View style={{
              backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 16,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                Pin Location on Map (optional)
              </Text>
              {form.service_lat ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="check-circle" size={14} color="#16a34a" />
                    <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: '600' }}>Location pinned</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#6b7280' }} selectable>
                    {form.service_lat.toFixed(6)}, {form.service_lng!.toFixed(6)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setShowMap(true)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        gap: 6, paddingVertical: 9, borderRadius: 10,
                        borderWidth: 1, borderColor: Colors.primary, backgroundColor: '#fdf2f8',
                      }}
                    >
                      <Feather name="map" size={13} color={Colors.primary} />
                      <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 13 }}>Adjust</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { update('service_lat', null); update('service_lng', null) }}
                      style={{
                        flex: 1, alignItems: 'center', justifyContent: 'center',
                        paddingVertical: 9, borderRadius: 10,
                        borderWidth: 1, borderColor: '#e5e7eb',
                      }}
                    >
                      <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '600' }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowMap(true)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    paddingVertical: 12, borderRadius: 10,
                    backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: Colors.primary, gap: 8,
                  }}
                >
                  <Feather name="map-pin" size={15} color={Colors.primary} />
                  <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 14 }}>
                    Open Map to Pin Location
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <LocationMapPicker
              visible={showMap}
              initial={form.service_lat ? { latitude: form.service_lat, longitude: form.service_lng! } : null}
              onConfirm={coord => { update('service_lat', coord.latitude); update('service_lng', coord.longitude); setShowMap(false) }}
              onClose={() => setShowMap(false)}
            />
          </View>
        )}

        {/* ── Step 3: Date & Time ── */}
        {step === 3 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
              Select Preferred Date & Time
            </Text>

            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{
                backgroundColor: '#fff', borderWidth: 1.5,
                borderColor: form.service_date ? Colors.primary : '#e5e7eb',
                borderRadius: 12, padding: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Date *</Text>
              <Text style={{
                fontSize: 15, fontWeight: '600',
                color: form.service_date ? '#111827' : '#9ca3af',
              }}>
                {form.service_date ? formatDisplayDate(form.service_date) : 'Tap to select a date'}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                mode="date"
                value={form.service_date ?? new Date()}
                minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_e: DateTimePickerEvent, date?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false)
                  if (date) update('service_date', date)
                }}
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={{
                  alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8,
                  backgroundColor: Colors.primary, borderRadius: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              style={{
                backgroundColor: '#fff', borderWidth: 1.5,
                borderColor: form.service_time ? Colors.primary : '#e5e7eb',
                borderRadius: 12, padding: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Time *</Text>
              <Text style={{
                fontSize: 15, fontWeight: '600',
                color: form.service_time ? '#111827' : '#9ca3af',
              }}>
                {form.service_time ? formatDisplayTime(form.service_time) : 'Tap to select a time'}
              </Text>
            </TouchableOpacity>

            {showTimePicker && (
              <DateTimePicker
                mode="time"
                value={form.service_time ?? (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d })()}
                minuteInterval={30}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e: DateTimePickerEvent, date?: Date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false)
                  if (date) update('service_time', date)
                }}
              />
            )}
            {Platform.OS === 'ios' && showTimePicker && (
              <TouchableOpacity
                onPress={() => setShowTimePicker(false)}
                style={{
                  alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8,
                  backgroundColor: Colors.primary, borderRadius: 8,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            )}

            <View style={{
              backgroundColor: '#fffbeb', borderRadius: 10, padding: 12,
              borderWidth: 1, borderColor: '#fde68a',
            }}>
              <Text style={{ fontSize: 12, color: '#92400e' }}>
                Please schedule at least 24 hours in advance. Service hours: 7:00 AM – 6:00 PM.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 4: Review Booking Details ── */}
        {step === 4 && (
          <View style={{ gap: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Review Booking Details</Text>

            {[
              {
                title: 'Service',
                rows: [
                  { label: 'Type', value: SERVICE_LABELS[form.service_type!] },
                  { label: 'Space', value: form.space_type === 'residential' ? 'Residential' : 'Commercial' },
                  { label: 'Size', value: `${form.property_sqm} sqm` },
                  ...(form.sofa_seaters > 0 ? [{ label: 'Sofas', value: `${form.sofa_seaters} seater${form.sofa_seaters !== 1 ? 's' : ''}` }] : []),
                  { label: 'Photos', value: `${form.furniture_images.length} uploaded` },
                  {
                    label: 'Est. Price',
                    value: `₱${estimatePrice(form.service_type!, parseFloat(form.property_sqm)).toLocaleString()}`,
                  },
                ],
              },
              {
                title: 'Address',
                rows: [
                  { label: 'Address', value: [form.address_unit, form.address_street, form.address_city, form.address_province].filter(Boolean).join(', ') },
                  { label: 'GPS', value: form.service_lat ? `${form.service_lat.toFixed(5)}, ${form.service_lng!.toFixed(5)}` : 'Not captured' },
                ],
              },
              {
                title: 'Schedule',
                rows: [
                  { label: 'Date', value: form.service_date ? formatDisplayDate(form.service_date) : '—' },
                  { label: 'Time', value: form.service_time ? formatDisplayTime(form.service_time) : '—' },
                ],
              },
            ].map(section => (
              <View key={section.title} style={{
                backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
                borderColor: '#e5e7eb', overflow: 'hidden',
              }}>
                <View style={{ backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>{section.title}</Text>
                </View>
                {section.rows.map((row, i) => (
                  <View key={row.label} style={{
                    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10,
                    borderBottomWidth: i < section.rows.length - 1 ? 1 : 0, borderBottomColor: '#f3f4f6',
                  }}>
                    <Text style={{ width: 80, fontSize: 13, color: '#6b7280' }}>{row.label}</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' }}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ))}

            <View style={{
              backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            }}>
              <Feather name="cpu" size={16} color="#16a34a" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: '#15803d', lineHeight: 18 }}>
                Tapping "Process Booking" will run AI matching — estimating manpower, checking availability, and finding the nearest cleaner for your location.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 5: Payment & Confirm ── */}
        {step === 5 && (
          <View style={{ gap: 16 }}>
            <View style={{
              backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: '#bbf7d0',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d', marginBottom: 4 }}>
                Booking Summary
              </Text>
              <Text style={{ fontSize: 13, color: '#166534' }}>
                {SERVICE_LABELS[form.service_type!]} · {form.property_sqm} sqm · {form.service_date ? formatDisplayDate(form.service_date) : ''} at {form.service_time ? formatDisplayTime(form.service_time) : ''}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d', marginTop: 6 }}>
                Est. Price: ₱{estimatePrice(form.service_type!, parseFloat(form.property_sqm)).toLocaleString()}
              </Text>
            </View>

            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Select Payment Method</Text>

            {PAYMENT_OPTIONS.map(p => (
              <TouchableOpacity
                key={p.key}
                onPress={() => update('payment_method', p.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', padding: 16,
                  borderRadius: 12, borderWidth: 1.5,
                  borderColor: form.payment_method === p.key ? Colors.primary : '#e5e7eb',
                  backgroundColor: form.payment_method === p.key ? '#fdf2f8' : '#fff',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 15, fontWeight: '700',
                    color: form.payment_method === p.key ? Colors.primary : '#111827',
                  }}>
                    {p.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{p.desc}</Text>
                </View>
                {form.payment_method === p.key && (
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                Special Notes (optional)
              </Text>
              <TextInput
                value={form.special_notes}
                onChangeText={t => update('special_notes', t)}
                placeholder="e.g. Please bring eco-friendly products, gate code is 1234..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={{
                  backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 14, color: '#111827', minHeight: 100,
                }}
              />
            </View>

            <View style={{
              backgroundColor: '#fffbeb', borderRadius: 10, padding: 12,
              borderWidth: 1, borderColor: '#fde68a',
            }}>
              <Text style={{ fontSize: 12, color: '#92400e' }}>
                The estimated price is approximate. Final price will be confirmed by admin before your booking is confirmed.
              </Text>
            </View>

            {error ? (
              <View style={{ backgroundColor: '#fee2e2', borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 13, color: '#dc2626' }}>{error}</Text>
              </View>
            ) : null}
          </View>
        )}

      </ScrollView>

      {navBar}
    </KeyboardAvoidingView>
  )
}
