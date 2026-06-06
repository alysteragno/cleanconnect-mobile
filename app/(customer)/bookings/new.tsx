import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import { Colors } from '@/constants/colors'
import { Branch, ServiceType, SpaceType, SERVICE_LABELS } from '@/constants/types'
import { estimatePrice } from '@/constants/pricing'

type FormData = {
  service_type: ServiceType | null
  space_type: SpaceType | null
  property_sqm: string
  branch_id: string | null
  branch_name: string
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
  branch_id: null,
  branch_name: '',
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
  const [branches, setBranches] = useState<Branch[]>([])
  const [loadingGPS, setLoadingGPS] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('branches').select('id, name, address').then(({ data }) => {
      setBranches((data ?? []) as Branch[])
    })
  }, [])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleGPS() {
    setGpsError('')
    setLoadingGPS(true)
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      setGpsError('Location permission denied. Please enable it in Settings.')
      setLoadingGPS(false)
      return
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    update('service_lat', loc.coords.latitude)
    update('service_lng', loc.coords.longitude)
    setLoadingGPS(false)
  }

  function validateStep(): string {
    if (step === 1) {
      if (!form.service_type) return 'Please select a service type.'
      if (!form.space_type) return 'Please select a space type.'
      if (!form.property_sqm || isNaN(Number(form.property_sqm)) || Number(form.property_sqm) <= 0)
        return 'Please enter a valid property size.'
      if (!form.branch_id) return 'Please select a branch.'
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
    if (step === 4) {
      if (!form.payment_method) return 'Please select a payment method.'
    }
    return ''
  }

  function handleNext() {
    const err = validateStep()
    if (err) { Alert.alert('Missing info', err); return }
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

    const sqm = parseFloat(form.property_sqm)
    const base_price = estimatePrice(form.service_type!, sqm)
    const duration_hours = Math.max(1, Math.ceil(sqm / 30))

    const { data, error: insertError } = await supabase.from('bookings').insert({
      customer_id: user.id,
      branch_id: form.branch_id,
      service_type: form.service_type,
      space_type: form.space_type,
      property_sqm: sqm,
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
              {step === 5 ? 'Confirm Booking' : 'Next →'}
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
        subtitle={`Step ${step} of 5 — ${['Service Details', 'Address', 'Schedule', 'Payment', 'Review'][step - 1]}`}
        hideBell
      />

      {stepIndicator}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Step 1: Service, Space, Branch ── */}
        {step === 1 && (
          <View style={{ gap: 20 }}>
            {/* Service type */}
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

            {/* Space type */}
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

            {/* Property sqm */}
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

            {/* Branch */}
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
                Branch
              </Text>
              {branches.length === 0
                ? <ActivityIndicator color={Colors.primary} />
                : branches.map(b => (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => { update('branch_id', b.id); update('branch_name', b.name) }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', padding: 14,
                      marginBottom: 8, borderRadius: 12, borderWidth: 1.5,
                      borderColor: form.branch_id === b.id ? Colors.primary : '#e5e7eb',
                      backgroundColor: form.branch_id === b.id ? '#fdf2f8' : '#fff',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 14, fontWeight: '600',
                        color: form.branch_id === b.id ? Colors.primary : '#111827',
                      }}>
                        {b.name}
                      </Text>
                      {b.address && (
                        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{b.address}</Text>
                      )}
                    </View>
                    {form.branch_id === b.id && (
                      <Feather name="check" size={18} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))
              }
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

            {/* GPS */}
            <View style={{
              backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 16,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                GPS Location (optional)
              </Text>
              {form.service_lat ? (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="check-circle" size={14} color="#16a34a" />
                    <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: '600' }}>Location captured</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {form.service_lat.toFixed(6)}, {form.service_lng!.toFixed(6)}
                  </Text>
                  <TouchableOpacity onPress={() => { update('service_lat', null); update('service_lng', null) }} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: '#dc2626' }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={handleGPS}
                    disabled={loadingGPS}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      paddingVertical: 10, borderRadius: 10,
                      backgroundColor: loadingGPS ? '#f3f4f6' : '#fdf2f8',
                      borderWidth: 1, borderColor: Colors.primary,
                    }}
                  >
                    {loadingGPS
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="map-pin" size={14} color={Colors.primary} />
                          <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 13 }}>Use My Current Location</Text>
                        </View>
                    }
                  </TouchableOpacity>
                  {gpsError ? (
                    <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{gpsError}</Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        )}

        {/* ── Step 3: Date & Time ── */}
        {step === 3 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
              Schedule Your Cleaning
            </Text>

            {/* Date picker */}
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
                onChange={(e: DateTimePickerEvent, date?: Date) => {
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

            {/* Time picker */}
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
                onChange={(e: DateTimePickerEvent, date?: Date) => {
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

        {/* ── Step 4: Payment method + notes ── */}
        {step === 4 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Payment Method</Text>

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
          </View>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <View style={{ gap: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Review Your Booking</Text>

            {[
              {
                title: 'Service',
                rows: [
                  { label: 'Type', value: SERVICE_LABELS[form.service_type!] },
                  { label: 'Space', value: form.space_type === 'residential' ? 'Residential' : 'Commercial' },
                  { label: 'Size', value: `${form.property_sqm} sqm` },
                  { label: 'Branch', value: form.branch_name },
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
              {
                title: 'Payment',
                rows: [
                  { label: 'Method', value: PAYMENT_OPTIONS.find(p => p.key === form.payment_method)?.label ?? '—' },
                  ...(form.special_notes ? [{ label: 'Notes', value: form.special_notes }] : []),
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
              backgroundColor: '#fffbeb', borderRadius: 10, padding: 12,
              borderWidth: 1, borderColor: '#fde68a',
            }}>
              <Text style={{ fontSize: 12, color: '#92400e' }}>
                The estimated price shown is approximate. The final price will be confirmed by admin before your booking is confirmed.
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
