import { Fragment, useEffect, useRef, useState } from 'react'
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
import { useThemeColors } from '@/hooks/useThemeColors'
import { ServiceType, SpaceType, SERVICE_LABELS } from '@/constants/types'
import { estimatePrice } from '@/constants/pricing'
import { saveDraft, loadDraft, clearDraft } from '@/lib/bookingDraft'

function GCashIcon() {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#007DFB', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>G</Text>
    </View>
  )
}

function BankIcon() {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#1d4ed8', alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="home" size={22} color="#fff" />
    </View>
  )
}

function CashIcon() {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>₱</Text>
    </View>
  )
}

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cash: <CashIcon />,
  gcash: <GCashIcon />,
  bank_transfer: <BankIcon />,
}

type FormData = {
  service_type: ServiceType | null
  space_type: SpaceType | null
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
  service_date: Date | null
  service_time: Date | null
  payment_method: string
  payment_reference: string
  payment_proof_uri: string
  special_notes: string
}

const INITIAL_FORM: FormData = {
  service_type: null,
  space_type: null,
  property_sqm: '',
  sofa_seaters: 0,
  other_furniture: '',
  furniture_images: [],
  address_unit: '',
  address_street: '',
  address_city: '',
  address_province: '',
  service_lat: null,
  service_lng: null,
  service_address_label: '',
  service_date: null,
  service_time: null,
  payment_method: '',
  payment_reference: '',
  payment_proof_uri: '',
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
  const C = useThemeColors()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [showMap, setShowMap] = useState(false)
  const [step2Visited, setStep2Visited] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Restore draft on mount
  useEffect(() => {
    loadDraft().then(draft => {
      if (draft) {
        setForm({
          ...draft.form,
          service_type: draft.form.service_type as ServiceType | null,
          space_type: draft.form.space_type as SpaceType | null,
          service_date: draft.form.service_date ? new Date(draft.form.service_date) : null,
          service_time: draft.form.service_time ? new Date(draft.form.service_time) : null,
        })
        setStep(draft.step)
        setDraftRestored(true)
        setTimeout(() => setDraftRestored(false), 3000)
      }
      draftLoaded.current = true
    })
  }, [])

  // Save draft on every form/step change (only after initial load)
  useEffect(() => {
    if (!draftLoaded.current) return
    saveDraft({
      form: {
        ...form,
        service_date: form.service_date?.toISOString() ?? null,
        service_time: form.service_time?.toISOString() ?? null,
      },
      step,
      savedAt: new Date().toISOString(),
    })
  }, [form, step])

  // Auto-open map the first time the user lands on step 2
  useEffect(() => {
    if (step === 2 && !step2Visited) {
      setStep2Visited(true)
      if (!form.service_lat) setShowMap(true)
    }
  }, [step])
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [aiStep, setAiStep] = useState(0)
  const [draftRestored, setDraftRestored] = useState(false)
  const draftLoaded = useRef(false)

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

  function validateStep(): { title: string; message: string } | null {
    if (step === 1) {
      if (!form.service_type) return { title: 'Service required', message: 'Please select a service type.' }
      if (!form.space_type) return { title: 'Space required', message: 'Please select a space type.' }
      if (!form.property_sqm || isNaN(Number(form.property_sqm)) || Number(form.property_sqm) <= 0)
        return { title: 'Invalid size', message: 'Please enter a valid property size in sqm.' }
      if (form.furniture_images.length === 0)
        return { title: 'Photos required', message: 'Please upload at least one photo of the area or furniture to be cleaned.' }
    }
    if (step === 2) {
      if (!form.address_street.trim()) return { title: 'Address incomplete', message: 'Please enter a street address.' }
      if (!form.address_city.trim()) return { title: 'Address incomplete', message: 'Please enter a city.' }
      if (!form.address_province.trim()) return { title: 'Address incomplete', message: 'Please enter a province.' }
      if (!form.service_lat) return { title: 'Location required', message: 'Please pin your service location on the map.' }
    }
    if (step === 3) {
      if (!form.service_date) return { title: 'Date required', message: 'Please select a service date.' }
      if (!form.service_time) return { title: 'Time required', message: 'Please select a service time.' }
      const combined = new Date(form.service_date)
      combined.setHours(form.service_time.getHours(), form.service_time.getMinutes(), 0, 0)
      if (combined.getTime() - Date.now() < 24 * 60 * 60 * 1000)
        return { title: 'Too soon', message: 'Bookings must be made at least 24 hours in advance. Please choose a later date or time.' }
    }
    if (step === 5) {
      if (!form.payment_method) return { title: 'Payment required', message: 'Please select a payment method to continue.' }
      if (['gcash', 'bank_transfer'].includes(form.payment_method)) {
        if (!form.payment_reference.trim()) return { title: 'Reference required', message: 'Please enter the reference number from your payment.' }
        if (!form.payment_proof_uri) return { title: 'Proof required', message: 'Please attach a screenshot of your payment confirmation.' }
      }
    }
    return null
  }

  function handleNext() {
    const err = validateStep()
    if (err) { Alert.alert(err.title, err.message); return }

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
        // skip individual failed uploads
      }
    }

    let payment_proof_url: string | null = null
    if (form.payment_proof_uri) {
      try {
        const ext = form.payment_proof_uri.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${user.id}/proof-${Date.now()}.${ext}`
        const response = await fetch(form.payment_proof_uri)
        const blob = await response.blob()
        const { error: uploadError } = await supabase.storage
          .from('booking-images')
          .upload(path, blob, { contentType: `image/${ext}`, upsert: false })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('booking-images').getPublicUrl(path)
          payment_proof_url = urlData.publicUrl
        }
      } catch {
        // continue — validation already ensured uri exists; a failed upload surfaces via insertError
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
      other_furniture: form.other_furniture.trim() || null,
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
      payment_reference: form.payment_reference.trim() || null,
      payment_proof_url,
      special_notes: form.special_notes || null,
      status: 'pending',
      payment_status: 'unpaid',
      base_price,
      required_cleaners: 1,
      duration_hours,
    }).select('id').single()

    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    await clearDraft()
    router.replace(`/(customer)/bookings/${data.id}`)
  }

  const stepLabels = ['Service Details', 'Address', 'Schedule', 'Review', 'Payment']

  const stepIndicator = (
    <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <Fragment key={n}>
            <View style={{
              width: 30, height: 30, borderRadius: 15,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: n < step ? Colors.primary : n === step ? Colors.primary : C.borderLight,
              opacity: n < step ? 0.55 : 1,
            }}>
              {n < step
                ? <Feather name="check" size={14} color="#fff" />
                : <Text style={{ fontSize: 12, fontWeight: '700', color: n === step ? '#fff' : C.textMuted }}>{n}</Text>
              }
            </View>
            {n < 5 && (
              <View style={{ flex: 1, height: 2, backgroundColor: n < step ? Colors.primary : C.border }} />
            )}
          </Fragment>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {stepLabels.map((label, i) => (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 9, fontWeight: '600', color: i + 1 === step ? Colors.primary : C.textMuted }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )

  const navBar = (
    <View style={{
      flexDirection: 'row', padding: 16, gap: 12,
      borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white,
    }}>
      <TouchableOpacity
        onPress={handleBack}
        style={{
          flex: 1, paddingVertical: 14, borderRadius: 12,
          borderWidth: 1, borderColor: C.border, alignItems: 'center',
        }}
      >
        <Text style={{ color: C.textSecondary, fontWeight: '600' }}>
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
      style={{ flex: 1, backgroundColor: C.background }}
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
          backgroundColor: C.background + 'f7',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 32,
        }}>
          <View style={{
            backgroundColor: C.white, borderRadius: 24, padding: 32,
            borderWidth: 1, borderColor: C.border, alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
            width: '100%',
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 }}>
              AI Processing
            </Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 24, textAlign: 'center' }}>
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
                  backgroundColor: aiStep >= item.s ? Colors.primary : C.borderLight,
                  borderWidth: 1,
                  borderColor: aiStep >= item.s ? Colors.primary : C.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {aiStep >= item.s
                    ? <Feather name="check" size={14} color="#fff" />
                    : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.textMuted }} />
                  }
                </View>
                <Text style={{
                  fontSize: 14, fontWeight: '600',
                  color: aiStep >= item.s ? C.text : C.textMuted,
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

        {/* Draft restored banner */}
        {draftRestored && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12,
            borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 12,
          }}>
            <Feather name="refresh-cw" size={14} color="#16a34a" />
            <Text style={{ flex: 1, fontSize: 13, color: '#15803d', fontWeight: '600' }}>
              Draft restored — continuing from Step {step} of 5
            </Text>
            <TouchableOpacity onPress={() => setDraftRestored(false)}>
              <Feather name="x" size={14} color="#16a34a" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 1: Service & Space ── */}
        {step === 1 && (
          <View style={{ gap: 20 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 }}>
                Service Type
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {SERVICE_OPTIONS.map(s => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => update('service_type', s)}
                    style={{
                      width: '47%', padding: 14, borderRadius: 12, borderWidth: 1.5,
                      borderColor: form.service_type === s ? Colors.primary : C.border,
                      backgroundColor: form.service_type === s ? C.primaryBg : C.white,
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '600',
                      color: form.service_type === s ? Colors.primary : C.text,
                    }}>
                      {SERVICE_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 }}>
                Space Type
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {SPACE_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.key}
                    onPress={() => update('space_type', o.key)}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5,
                      borderColor: form.space_type === o.key ? Colors.primary : C.border,
                      backgroundColor: form.space_type === o.key ? C.primaryBg : C.white,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: 14, fontWeight: '600',
                      color: form.space_type === o.key ? Colors.primary : C.text,
                    }}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>
                Property Size (sqm)
              </Text>
              <TextInput
                value={form.property_sqm}
                onChangeText={t => update('property_sqm', t)}
                keyboardType="numeric"
                placeholder="e.g. 60"
                placeholderTextColor={C.textMuted}
                style={{
                  backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 15, color: C.text,
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>
                Number of Sofa Seaters
              </Text>
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>
                Include all sofas, sectionals, and upholstered chairs to be cleaned.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity
                  onPress={() => update('sofa_seaters', Math.max(0, form.sofa_seaters - 1))}
                  style={{
                    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: form.sofa_seaters > 0 ? Colors.primary : C.border,
                    backgroundColor: form.sofa_seaters > 0 ? C.primaryBg : C.background,
                  }}
                >
                  <Text style={{ fontSize: 22, color: form.sofa_seaters > 0 ? Colors.primary : C.textMuted, lineHeight: 26 }}>−</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 26, fontWeight: '800', color: C.text, minWidth: 40, textAlign: 'center' }}>
                  {form.sofa_seaters}
                </Text>
                <TouchableOpacity
                  onPress={() => update('sofa_seaters', Math.min(20, form.sofa_seaters + 1))}
                  style={{
                    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: C.primaryBg,
                  }}
                >
                  <Text style={{ fontSize: 22, color: Colors.primary, lineHeight: 26 }}>+</Text>
                </TouchableOpacity>
                {form.sofa_seaters > 0 && (
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>
                    {form.sofa_seaters} seater{form.sofa_seaters !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6 }}>
                Other Furniture
              </Text>
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
                List any other furniture that needs cleaning (e.g. 2 beds, 4 dining chairs, 1 office chair).
              </Text>
              <TextInput
                value={form.other_furniture}
                onChangeText={t => update('other_furniture', t)}
                placeholder="e.g. 2 beds, 4 dining chairs, 1 curtain set"
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{
                  backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 14, color: C.text, minHeight: 72,
                }}
              />
            </View>

            {/* Furniture photo upload */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
                  Furniture / Area Photos
                </Text>
                <View style={{
                  backgroundColor: C.primaryBg, borderRadius: 6,
                  paddingHorizontal: 7, paddingVertical: 2,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary }}>REQUIRED</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>
                Upload photos of the area/furniture so our admin can verify and confirm the service rate. Up to 5 photos.
              </Text>

              {form.furniture_images.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {form.furniture_images.map((uri, i) => (
                    <View key={uri} style={{ position: 'relative' }}>
                      <Image
                        source={{ uri }}
                        style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: C.borderLight }}
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
                    borderColor: form.furniture_images.length === 0 ? Colors.primary : C.border,
                    backgroundColor: form.furniture_images.length === 0 ? C.primaryBg : C.background,
                  }}
                >
                  <Feather name="camera" size={18} color={form.furniture_images.length === 0 ? Colors.primary : C.textMuted} />
                  <Text style={{
                    fontSize: 14, fontWeight: '600',
                    color: form.furniture_images.length === 0 ? Colors.primary : C.textSecondary,
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
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Service Address</Text>

            {[
              { key: 'address_unit' as const, label: 'Unit / Floor', placeholder: 'e.g. Unit 3B' },
              { key: 'address_street' as const, label: 'Street *', placeholder: 'e.g. 123 Rizal Ave' },
              { key: 'address_city' as const, label: 'City *', placeholder: 'e.g. Makati' },
              { key: 'address_province' as const, label: 'Province *', placeholder: 'e.g. Metro Manila' },
            ].map(field => (
              <View key={field.key}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 }}>
                  {field.label}
                </Text>
                <TextInput
                  value={form[field.key] as string}
                  onChangeText={t => update(field.key, t)}
                  placeholder={field.placeholder}
                  placeholderTextColor={C.textMuted}
                  style={{
                    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
                    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                    fontSize: 15, color: C.text,
                  }}
                />
              </View>
            ))}

            <TouchableOpacity
              onPress={() => setShowMap(true)}
              activeOpacity={0.85}
              style={{
                backgroundColor: C.white, borderRadius: 12, overflow: 'hidden',
                borderWidth: form.service_lat ? 1.5 : 1,
                borderColor: form.service_lat ? Colors.primary : C.border,
              }}
            >
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 14, paddingVertical: 12,
                backgroundColor: form.service_lat ? C.primaryBg : C.white,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={{
                    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: form.service_lat ? Colors.primary : C.borderLight,
                  }}>
                    <Feather name="map-pin" size={16} color={form.service_lat ? '#fff' : C.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {form.service_lat ? (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Feather name="check-circle" size={11} color="#16a34a" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>Location pinned</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: C.text, fontWeight: '500' }} numberOfLines={2}>
                          {form.service_address_label || `${form.service_lat.toFixed(5)}, ${form.service_lng!.toFixed(5)}`}
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <View style={{ backgroundColor: C.primaryBg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.primary }}>REQUIRED</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 13, color: C.textSecondary }}>Tap to pin your service location</Text>
                      </>
                    )}
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={form.service_lat ? Colors.primary : C.textMuted} />
              </View>
            </TouchableOpacity>

            <LocationMapPicker
              visible={showMap}
              initial={form.service_lat ? { latitude: form.service_lat, longitude: form.service_lng! } : null}
              onConfirm={(coord, address) => {
                update('service_lat', coord.latitude)
                update('service_lng', coord.longitude)
                update('service_address_label', address)
                setShowMap(false)
              }}
              onClose={() => setShowMap(false)}
            />
          </View>
        )}

        {/* ── Step 3: Date & Time ── */}
        {step === 3 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
              Select Preferred Date & Time
            </Text>

            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{
                backgroundColor: C.white, borderWidth: 1.5,
                borderColor: form.service_date ? Colors.primary : C.border,
                borderRadius: 12, padding: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Date *</Text>
              <Text style={{
                fontSize: 15, fontWeight: '600',
                color: form.service_date ? C.text : C.textMuted,
              }}>
                {form.service_date ? formatDisplayDate(form.service_date) : 'Tap to select a date'}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                mode="date"
                value={form.service_date ?? new Date()}
                minimumDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
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
                backgroundColor: C.white, borderWidth: 1.5,
                borderColor: form.service_time ? Colors.primary : C.border,
                borderRadius: 12, padding: 16,
              }}
            >
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Time *</Text>
              <Text style={{
                fontSize: 15, fontWeight: '600',
                color: form.service_time ? C.text : C.textMuted,
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
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Review Booking Details</Text>

            {[
              {
                title: 'Service',
                rows: [
                  { label: 'Type', value: SERVICE_LABELS[form.service_type!] },
                  { label: 'Space', value: form.space_type === 'residential' ? 'Residential' : 'Commercial' },
                  { label: 'Size', value: `${form.property_sqm} sqm` },
                  ...(form.sofa_seaters > 0 ? [{ label: 'Sofas', value: `${form.sofa_seaters} seater${form.sofa_seaters !== 1 ? 's' : ''}` }] : []),
                  ...(form.other_furniture.trim() ? [{ label: 'Other', value: form.other_furniture.trim() }] : []),
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
                backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
                borderColor: C.border, overflow: 'hidden',
              }}>
                <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>{section.title}</Text>
                </View>
                {section.rows.map((row, i) => (
                  <View key={row.label} style={{
                    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10,
                    borderBottomWidth: i < section.rows.length - 1 ? 1 : 0, borderBottomColor: C.borderLight,
                  }}>
                    <Text style={{ width: 80, fontSize: 13, color: C.textSecondary }}>{row.label}</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: C.text }}>{row.value}</Text>
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

            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Select Payment Method</Text>

            {PAYMENT_OPTIONS.map(p => (
              <TouchableOpacity
                key={p.key}
                onPress={() => update('payment_method', p.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
                  borderRadius: 14, borderWidth: 1.5,
                  borderColor: form.payment_method === p.key ? Colors.primary : C.border,
                  backgroundColor: form.payment_method === p.key ? C.primaryBg : C.white,
                }}
              >
                {PAYMENT_ICONS[p.key]}
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 15, fontWeight: '700',
                    color: form.payment_method === p.key ? Colors.primary : C.text,
                  }}>
                    {p.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>{p.desc}</Text>
                </View>
                <View style={{
                  width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
                  borderColor: form.payment_method === p.key ? Colors.primary : C.border,
                  backgroundColor: form.payment_method === p.key ? Colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {form.payment_method === p.key && (
                    <Feather name="check" size={12} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {/* GCash / Bank Transfer proof section */}
            {['gcash', 'bank_transfer'].includes(form.payment_method) && (
              <View style={{
                backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
                borderColor: C.border, padding: 16, gap: 14,
              }}>
                <View style={{
                  backgroundColor: '#fffbeb', borderRadius: 10, padding: 12,
                  borderWidth: 1, borderColor: '#fde68a',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 4 }}>
                    {form.payment_method === 'gcash' ? 'GCash Payment Details' : 'Bank Transfer Details'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#92400e', lineHeight: 18 }}>
                    {form.payment_method === 'gcash'
                      ? 'Send payment to our GCash number. Our admin will verify your payment before confirming your booking.'
                      : 'Transfer to our bank account. Our admin will verify your payment before confirming your booking.'}
                  </Text>
                </View>

                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 6 }}>
                    Reference Number <Text style={{ color: Colors.primary }}>*</Text>
                  </Text>
                  <TextInput
                    value={form.payment_reference}
                    onChangeText={t => update('payment_reference', t)}
                    placeholder={form.payment_method === 'gcash' ? 'e.g. 1234567890' : 'e.g. REF-20240625-001'}
                    placeholderTextColor={C.textMuted}
                    style={{
                      backgroundColor: C.background, borderWidth: 1.5,
                      borderColor: form.payment_reference.trim() ? Colors.primary : C.border,
                      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      fontSize: 15, color: C.text,
                    }}
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 6 }}>
                    Proof of Payment <Text style={{ color: Colors.primary }}>*</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
                    Attach a screenshot of your payment confirmation.
                  </Text>
                  {form.payment_proof_uri ? (
                    <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
                      <Image
                        source={{ uri: form.payment_proof_uri }}
                        style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: C.borderLight }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        onPress={() => update('payment_proof_uri', '')}
                        style={{
                          position: 'absolute', top: -8, right: -8,
                          width: 24, height: 24, borderRadius: 12,
                          backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Feather name="x" size={13} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
                        if (status !== 'granted') {
                          Alert.alert('Permission required', 'Please allow access to your photo library.')
                          return
                        }
                        const result = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ['images'],
                          quality: 0.8,
                        })
                        if (!result.canceled) update('payment_proof_uri', result.assets[0].uri)
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        gap: 8, paddingVertical: 14, borderRadius: 12,
                        borderWidth: 1.5, borderStyle: 'dashed',
                        borderColor: Colors.primary, backgroundColor: C.primaryBg,
                      }}
                    >
                      <Feather name="upload" size={18} color={Colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>
                        Upload Screenshot
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>
                Special Notes (optional)
              </Text>
              <TextInput
                value={form.special_notes}
                onChangeText={t => update('special_notes', t)}
                placeholder="e.g. Please bring eco-friendly products, gate code is 1234..."
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={{
                  backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 14, color: C.text, minHeight: 100,
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
