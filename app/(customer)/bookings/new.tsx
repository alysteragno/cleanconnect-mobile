import { Fragment, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
  Animated, Easing,
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
import { useTheme } from '@/context/ThemeContext'
import GCashLogo from '@/assets/gcash_logo.svg'
import MayaLogo from '@/assets/maya_logo.svg'
import { ServiceType, SpaceType, SERVICE_LABELS } from '@/constants/types'
import { estimatePrice } from '@/constants/pricing'
import { saveDraft, loadDraft, clearDraft } from '@/lib/bookingDraft'
import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'

// ─── Wallet helpers ──────────────────────────────────────────────────────────

const WALLET_META: Record<string, { bg: string; Logo: React.FC<{ width: number; height: number }>; w: number; h: number; settingKey: string; label: string }> = {
  gcash: { bg: '#ffffffff', Logo: GCashLogo as any, w: 32, h: 32, settingKey: 'gcash_number', label: 'GCash Number' },
  maya:  { bg: '#0a1628', Logo: MayaLogo  as any, w: 34, h: 10, settingKey: 'maya_number',  label: 'Maya Number'  },
}

const isWallet = (m: string) => m === 'gcash' || m === 'maya'

function WalletIcon({ method }: { method: string }) {
  const meta = WALLET_META[method]
  if (!meta) return null
  const { bg, Logo, w, h } = meta
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Logo width={w} height={h} />
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
  gcash: <WalletIcon method="gcash" />,
  maya: <WalletIcon method="maya" />,
  bank_transfer: <BankIcon />,
}

// ─── Shared UI primitives ────────────────────────────────────────────────────

function RequiredBadge({ C }: { C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={{ backgroundColor: C.primaryBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary }}>REQUIRED</Text>
    </View>
  )
}

function DateTimeField({ label, value, displayValue, emptyText, onPress, show, onDone, C, children }: {
  label: string
  value: Date | null
  displayValue: string
  emptyText: string
  onPress: () => void
  show: boolean
  onDone: () => void
  C: ReturnType<typeof useThemeColors>
  children: React.ReactNode
}) {
  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        style={{
          backgroundColor: C.white, borderWidth: 1.5,
          borderColor: value ? Colors.primary : C.border,
          borderRadius: 12, padding: 16,
        }}
      >
        <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>{label} *</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: value ? C.text : C.textMuted }}>
          {value ? displayValue : emptyText}
        </Text>
      </TouchableOpacity>

      {show && (
        <View style={{ backgroundColor: C.white, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
          {children}
        </View>
      )}
      {Platform.OS === 'ios' && show && (
        <TouchableOpacity
          onPress={onDone}
          style={{ alignSelf: 'stretch', paddingVertical: 14, backgroundColor: Colors.primary, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Done</Text>
        </TouchableOpacity>
      )}
    </>
  )
}

function WalletPaymentDetail({ method, number, qrUrl, C }: {
  method: string
  number: string | undefined
  qrUrl: string | undefined
  C: ReturnType<typeof useThemeColors>
}) {
  const [saving, setSaving] = useState(false)

  async function saveQr() {
    if (!qrUrl) return
    setSaving(true)
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to your photo library to save the QR code.')
        return
      }
      const filename = `${method}_qr_${Date.now()}.jpg`
      const dest = FileSystem.cacheDirectory + filename
      await FileSystem.downloadAsync(qrUrl, dest)
      await MediaLibrary.saveToLibraryAsync(dest)
      Alert.alert('Saved!', 'QR code saved to your photo library.')
    } catch {
      Alert.alert('Error', 'Failed to save QR code. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!number) return <Text style={{ fontSize: 12, color: C.textSecondary }}>Loading payment details...</Text>
  const { bg, Logo, w, h, label } = WALLET_META[method]
  const isWide = w > h * 1.5
  const containerW = isWide ? 64 : 36
  const containerH = isWide ? 28 : 36
  const logoW = isWide ? 52 : w - 4
  const logoH = isWide ? Math.round(52 * h / w) : h
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: containerW, height: containerH, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Logo width={logoW} height={logoH} />
        </View>
        <View>
          <Text style={{ fontSize: 11, color: C.textSecondary }}>{label}</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: 1 }}>{number}</Text>
        </View>
      </View>
      {qrUrl && (
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Image
            source={{ uri: qrUrl }}
            style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: C.borderLight }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 12, color: C.textSecondary, textAlign: 'center' }}>
            Open your {label.replace(' Number', '')} app → Scan QR
          </Text>
          <TouchableOpacity
            onPress={saveQr}
            disabled={saving}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10,
              borderWidth: 1.5, borderColor: Colors.primary,
              backgroundColor: C.primaryBg, opacity: saving ? 0.6 : 1,
            }}
          >
            <Feather name="download" size={14} color={Colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary }}>
              {saving ? 'Saving...' : 'Save QR to Photos'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

function BankRow({ label, value, C }: { label: string; value: string; C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ fontSize: 12, color: C.textSecondary, width: 100 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, flex: 1 }}>{value}</Text>
    </View>
  )
}

// ─── Types & constants ───────────────────────────────────────────────────────

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
  service_type: null, space_type: null, property_sqm: '', sofa_seaters: 0,
  other_furniture: '', furniture_images: [], address_unit: '', address_street: '',
  address_city: '', address_province: '', service_lat: null, service_lng: null,
  service_address_label: '', service_date: null, service_time: null,
  payment_method: '', payment_reference: '', payment_proof_uri: '', special_notes: '',
}

const SERVICE_OPTIONS: ServiceType[] = ['general', 'premium_mattress', 'complete', 'disinfection', 'post_construction']
const SPACE_OPTIONS: Array<{ key: SpaceType; label: string }> = [
  { key: 'residential', label: 'Residential' },
  { key: 'commercial', label: 'Commercial' },
]
const PAYMENT_OPTIONS = [
  { key: 'cash',          label: 'Cash',          desc: 'Pay on the day of service' },
  { key: 'gcash',         label: 'GCash',         desc: 'Pay via GCash before service' },
  { key: 'maya',          label: 'Maya',          desc: 'Pay via Maya before service' },
  { key: 'bank_transfer', label: 'Bank Transfer', desc: 'Transfer to our bank account' },
]

const AI_STEPS = [
  { label: 'Manpower Estimation',      s: 1 },
  { label: 'Availability Analysis',    s: 2 },
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

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NewBookingScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [showMap, setShowMap] = useState(false)
  const [step2Visited, setStep2Visited] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [aiStep, setAiStep] = useState(0)
  const [draftRestored, setDraftRestored] = useState(false)
  const [paymentSettings, setPaymentSettings] = useState<Record<string, string>>({})
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})
  const draftLoaded = useRef(false)

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

  useEffect(() => {
    if (step === 2 && !step2Visited) {
      setStep2Visited(true)
      if (!form.service_lat) setShowMap(true)
    }
  }, [step])

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['gcash_number', 'maya_number', 'bank_name', 'bank_account_number', 'bank_account_name'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((s: { key: string; value: string }) => { map[s.key] = s.value })
        setPaymentSettings(map)
      })
    setQrUrls({
      gcash: supabase.storage.from('payment-assets').getPublicUrl('qr-codes/gcash.jpg').data.publicUrl,
      maya:  supabase.storage.from('payment-assets').getPublicUrl('qr-codes/maya.jpg').data.publicUrl,
    })
  }, [])

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
      mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 5,
    })
    if (!result.canceled) {
      update('furniture_images', [...form.furniture_images, ...result.assets.map(a => a.uri)].slice(0, 5))
    }
  }

  async function pickProof() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
    if (!result.canceled) update('payment_proof_uri', result.assets[0].uri)
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
    }
    if (step === 6) {
      if (isWallet(form.payment_method)) {
        if (!/^\d{13}$/.test(form.payment_reference))
          return { title: 'Invalid reference', message: `${WALLET_META[form.payment_method].label} reference must be exactly 13 digits.` }
        if (!form.payment_proof_uri) return { title: 'Proof required', message: 'Please attach a screenshot of your payment confirmation.' }
      }
      if (form.payment_method === 'bank_transfer') {
        if (!form.payment_reference.trim()) return { title: 'Reference required', message: 'Please enter the reference number from your payment.' }
        if (!form.payment_proof_uri) return { title: 'Proof required', message: 'Please attach a screenshot of your payment confirmation.' }
      }
    }
    return null
  }

  function handleNext() {
    const err = validateStep()
    if (err) { Alert.alert(err.title, err.message); return }

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

    async function uploadImage(uri: string, path: string) {
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const fullPath = `${user!.id}/${path}.${ext}`
      const blob = await (await fetch(uri)).blob()
      const { error } = await supabase.storage.from('booking-images').upload(fullPath, blob, { contentType: `image/${ext}`, upsert: false })
      if (error) return null
      return supabase.storage.from('booking-images').getPublicUrl(fullPath).data.publicUrl
    }

    const uploadedUrls: string[] = []
    for (const uri of form.furniture_images) {
      try {
        const url = await uploadImage(uri, `${Date.now()}-${Math.random().toString(36).slice(2)}`)
        if (url) uploadedUrls.push(url)
      } catch { /* skip */ }
    }

    let payment_proof_url: string | null = null
    if (form.payment_proof_uri) {
      try { payment_proof_url = await uploadImage(form.payment_proof_uri, `proof-${Date.now()}`) } catch { /* continue */ }
    }

    const sqm = parseFloat(form.property_sqm)
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
      base_price: estimatePrice(form.service_type!, sqm),
      required_cleaners: 1,
      duration_hours: Math.max(1, Math.ceil(sqm / 30)),
    }).select('id').single()

    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    await clearDraft()
    router.replace(`/(customer)/bookings/${data.id}`)
  }

  const stepLabels = ['Service', 'Address', 'Schedule', 'Review', 'Payment', 'Confirm']

  const stepIndicator = (
    <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <Fragment key={n}>
            <View style={{
              width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
              backgroundColor: n <= step ? Colors.primary : C.borderLight,
              opacity: n < step ? 0.55 : 1,
            }}>
              {n < step
                ? <Feather name="check" size={12} color="#fff" />
                : <Text style={{ fontSize: 11, fontWeight: '700', color: n === step ? '#fff' : C.textMuted }}>{n}</Text>
              }
            </View>
            {n < 6 && <View style={{ flex: 1, height: 2, backgroundColor: n < step ? Colors.primary : C.border }} />}
          </Fragment>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {stepLabels.map((label, i) => (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '600', color: i + 1 === step ? Colors.primary : C.textMuted }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )

  const navBar = (
    <View style={{ flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white }}>
      <TouchableOpacity
        onPress={handleBack}
        style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}
      >
        <Text style={{ color: C.textSecondary, fontWeight: '600' }}>{step === 1 ? 'Cancel' : 'Back'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={step === 6 ? handleSubmit : handleNext}
        disabled={submitting}
        style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', opacity: submitting ? 0.7 : 1 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {step === 4 ? 'Process Booking →' : step === 6 ? 'Confirm Booking' : 'Next →'}
        </Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <AppHeader title="New Booking" subtitle={`Step ${step} of 6 — ${stepLabels[step - 1]}`} hideBell />

      {stepIndicator}

      {/* ── AI Processing Overlay ── */}
      {processing && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : 'rgba(249,250,251,0.97)',
          alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 32,
        }}>
          <View style={{
            backgroundColor: C.white, borderRadius: 24, padding: 32,
            borderWidth: 1, borderColor: C.border, alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.5 : 0.12, shadowRadius: 20, elevation: 12, width: '100%',
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 }}>AI Processing</Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 24, textAlign: 'center' }}>
              Finding the best match for your booking...
            </Text>
            {AI_STEPS.map(item => (
              <View key={item.label} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                width: '100%', marginBottom: 14,
                opacity: aiStep >= item.s ? 1 : isDark ? 0.45 : 0.3,
              }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: aiStep >= item.s ? C.primary : C.border,
                  borderWidth: 1, borderColor: aiStep >= item.s ? C.primary : C.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {aiStep >= item.s
                    ? <Feather name="check" size={14} color="#fff" />
                    : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.textMuted }} />
                  }
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: aiStep >= item.s ? C.text : C.textSecondary }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>

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
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 }}>Service Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {SERVICE_OPTIONS.map(s => (
                  <TouchableOpacity
                    key={s} onPress={() => update('service_type', s)}
                    style={{
                      width: '47%', padding: 14, borderRadius: 12, borderWidth: 1.5,
                      borderColor: form.service_type === s ? Colors.primary : C.border,
                      backgroundColor: form.service_type === s ? C.primaryBg : C.white,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: form.service_type === s ? Colors.primary : C.text }}>
                      {SERVICE_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 }}>Space Type</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {SPACE_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.key} onPress={() => update('space_type', o.key)}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5,
                      borderColor: form.space_type === o.key ? Colors.primary : C.border,
                      backgroundColor: form.space_type === o.key ? C.primaryBg : C.white,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: form.space_type === o.key ? Colors.primary : C.text }}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>Property Size (sqm)</Text>
              <TextInput
                value={form.property_sqm} onChangeText={t => update('property_sqm', t)}
                keyboardType="numeric" placeholder="e.g. 60" placeholderTextColor={C.textMuted}
                style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>Number of Sofa Seaters</Text>
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
                <Text style={{ fontSize: 26, fontWeight: '800', color: C.text, minWidth: 40, textAlign: 'center' }}>{form.sofa_seaters}</Text>
                <TouchableOpacity
                  onPress={() => update('sofa_seaters', Math.min(20, form.sofa_seaters + 1))}
                  style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: C.primaryBg }}
                >
                  <Text style={{ fontSize: 22, color: Colors.primary, lineHeight: 26 }}>+</Text>
                </TouchableOpacity>
                {form.sofa_seaters > 0 && (
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>{form.sofa_seaters} seater{form.sofa_seaters !== 1 ? 's' : ''}</Text>
                )}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6 }}>Other Furniture</Text>
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
                List any other furniture that needs cleaning (e.g. 2 beds, 4 dining chairs, 1 office chair).
              </Text>
              <TextInput
                value={form.other_furniture} onChangeText={t => update('other_furniture', t)}
                placeholder="e.g. 2 beds, 4 dining chairs, 1 curtain set" placeholderTextColor={C.textMuted}
                multiline numberOfLines={3} textAlignVertical="top"
                style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, minHeight: 72 }}
              />
            </View>

            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Furniture / Area Photos</Text>
                <RequiredBadge C={C} />
              </View>
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>
                Upload photos of the area/furniture so our admin can verify and confirm the service rate. Up to 5 photos.
              </Text>
              {form.furniture_images.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {form.furniture_images.map((uri, i) => (
                    <View key={uri} style={{ position: 'relative' }}>
                      <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: C.borderLight }} resizeMode="cover" />
                      <TouchableOpacity
                        onPress={() => update('furniture_images', form.furniture_images.filter((_, idx) => idx !== i))}
                        style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}
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
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: form.furniture_images.length === 0 ? Colors.primary : C.border,
                    backgroundColor: form.furniture_images.length === 0 ? C.primaryBg : C.background,
                  }}
                >
                  <Feather name="camera" size={18} color={form.furniture_images.length === 0 ? Colors.primary : C.textMuted} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: form.furniture_images.length === 0 ? Colors.primary : C.textSecondary }}>
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
              { key: 'address_unit'     as const, label: 'Unit / Floor', placeholder: 'e.g. Unit 3B' },
              { key: 'address_street'   as const, label: 'Street *',     placeholder: 'e.g. 123 Rizal Ave' },
              { key: 'address_city'     as const, label: 'City *',       placeholder: 'e.g. Makati' },
              { key: 'address_province' as const, label: 'Province *',   placeholder: 'e.g. Metro Manila' },
            ].map(field => (
              <View key={field.key}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 }}>{field.label}</Text>
                <TextInput
                  value={form[field.key] as string} onChangeText={t => update(field.key, t)}
                  placeholder={field.placeholder} placeholderTextColor={C.textMuted}
                  style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text }}
                />
              </View>
            ))}

            <TouchableOpacity
              onPress={() => setShowMap(true)} activeOpacity={0.85}
              style={{ backgroundColor: C.white, borderRadius: 12, overflow: 'hidden', borderWidth: form.service_lat ? 1.5 : 1, borderColor: form.service_lat ? Colors.primary : C.border }}
            >
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 14, paddingVertical: 12,
                backgroundColor: form.service_lat ? C.primaryBg : C.white,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: form.service_lat ? Colors.primary : C.borderLight }}>
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
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Select Preferred Date & Time</Text>

            <DateTimeField
              label="Date" value={form.service_date}
              displayValue={form.service_date ? formatDisplayDate(form.service_date) : ''}
              emptyText="Tap to select a date"
              onPress={() => setShowDatePicker(true)}
              show={showDatePicker} onDone={() => setShowDatePicker(false)} C={C}
            >
              <DateTimePicker
                mode="date"
                value={form.service_date ?? new Date()}
                minimumDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={Colors.primary}
                onChange={(_e: DateTimePickerEvent, date?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false)
                  if (date) update('service_date', date)
                }}
              />
            </DateTimeField>

            <DateTimeField
              label="Time" value={form.service_time}
              displayValue={form.service_time ? formatDisplayTime(form.service_time) : ''}
              emptyText="Tap to select a time"
              onPress={() => setShowTimePicker(true)}
              show={showTimePicker} onDone={() => setShowTimePicker(false)} C={C}
            >
              <DateTimePicker
                mode="time"
                value={form.service_time ?? (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d })()}
                minuteInterval={30}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={Colors.primary}
                onChange={(_e: DateTimePickerEvent, date?: Date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false)
                  if (date) update('service_time', date)
                }}
              />
            </DateTimeField>

            <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#fde68a' }}>
              <Text style={{ fontSize: 12, color: '#92400e' }}>
                Please schedule at least 24 hours in advance. Service hours: 8:00 AM – 5:00 PM.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 4: Review ── */}
        {step === 4 && (
          <View style={{ gap: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Review Booking Details</Text>

            {[
              {
                title: 'Service',
                rows: [
                  { label: 'Type',      value: SERVICE_LABELS[form.service_type!] },
                  { label: 'Space',     value: form.space_type === 'residential' ? 'Residential' : 'Commercial' },
                  { label: 'Size',      value: `${form.property_sqm} sqm` },
                  ...(form.sofa_seaters > 0 ? [{ label: 'Sofas', value: `${form.sofa_seaters} seater${form.sofa_seaters !== 1 ? 's' : ''}` }] : []),
                  ...(form.other_furniture.trim() ? [{ label: 'Other', value: form.other_furniture.trim() }] : []),
                  { label: 'Photos',    value: `${form.furniture_images.length} uploaded` },
                  { label: 'Est. Price', value: `₱${estimatePrice(form.service_type!, parseFloat(form.property_sqm)).toLocaleString()}` },
                ],
              },
              {
                title: 'Address',
                rows: [
                  { label: 'Address', value: [form.address_unit, form.address_street, form.address_city, form.address_province].filter(Boolean).join(', ') },
                  { label: 'GPS',     value: form.service_lat ? `${form.service_lat.toFixed(5)}, ${form.service_lng!.toFixed(5)}` : 'Not captured' },
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
              <View key={section.title} style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
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

            <View style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Feather name="cpu" size={16} color="#16a34a" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: '#15803d', lineHeight: 18 }}>
                Tapping "Process Booking" will run AI matching — estimating manpower, checking availability, and finding the nearest cleaner for your location.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 5: Select Payment Method ── */}
        {step === 5 && (
          <View style={{ gap: 16 }}>
            <View style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bbf7d0' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d', marginBottom: 4 }}>Booking Summary</Text>
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
                key={p.key} onPress={() => update('payment_method', p.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
                  borderRadius: 14, borderWidth: 1.5,
                  borderColor: form.payment_method === p.key ? Colors.primary : C.border,
                  backgroundColor: form.payment_method === p.key ? C.primaryBg : C.white,
                }}
              >
                {PAYMENT_ICONS[p.key]}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: form.payment_method === p.key ? Colors.primary : C.text }}>{p.label}</Text>
                  <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>{p.desc}</Text>
                </View>
                <View style={{
                  width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
                  borderColor: form.payment_method === p.key ? Colors.primary : C.border,
                  backgroundColor: form.payment_method === p.key ? Colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {form.payment_method === p.key && <Feather name="check" size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Step 6: Payment Details & Confirm ── */}
        {step === 6 && (
          <View style={{ gap: 16 }}>

            {/* Selected method chip */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: C.white, borderRadius: 14, padding: 14,
              borderWidth: 1.5, borderColor: Colors.primary,
            }}>
              {PAYMENT_ICONS[form.payment_method]}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.textSecondary }}>Payment Method</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>
                  {PAYMENT_OPTIONS.find(p => p.key === form.payment_method)?.label}
                </Text>
              </View>
            </View>

            {(isWallet(form.payment_method) || form.payment_method === 'bank_transfer') && (
              <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 14 }}>

                {/* Payment destination */}
                <View style={{
                  backgroundColor: C.warningBg, borderRadius: 10, padding: 12,
                  borderWidth: 1, borderColor: isDark ? '#854d0e' : '#fde68a', gap: 8,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.warning }}>
                    {form.payment_method === 'bank_transfer' ? 'Transfer to:' : 'Send payment to:'}
                  </Text>

                  {isWallet(form.payment_method) ? (
                    <WalletPaymentDetail
                      method={form.payment_method}
                      number={paymentSettings[WALLET_META[form.payment_method].settingKey]}
                      qrUrl={qrUrls[form.payment_method]}
                      C={C}
                    />
                  ) : (
                    Object.keys(paymentSettings).length > 0 ? (
                      <View style={{ gap: 6 }}>
                        {paymentSettings.bank_name         && <BankRow label="Bank"         value={paymentSettings.bank_name}         C={C} />}
                        {paymentSettings.bank_account_number && <BankRow label="Account No."  value={paymentSettings.bank_account_number} C={C} />}
                        {paymentSettings.bank_account_name && <BankRow label="Account Name" value={paymentSettings.bank_account_name} C={C} />}
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>Loading payment details...</Text>
                    )
                  )}

                  <Text style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>
                    Admin will verify your payment before confirming the booking.
                  </Text>
                </View>

                {/* Reference number */}
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 6 }}>
                    Reference Number <Text style={{ color: Colors.primary }}>*</Text>
                  </Text>
                  <TextInput
                    value={form.payment_reference}
                    onChangeText={t => update('payment_reference', isWallet(form.payment_method) ? t.replace(/\D/g, '').slice(0, 13) : t)}
                    placeholder={isWallet(form.payment_method) ? `13-digit ${WALLET_META[form.payment_method].label} reference` : 'e.g. REF-20240625-001'}
                    placeholderTextColor={C.textMuted}
                    keyboardType={isWallet(form.payment_method) ? 'number-pad' : 'default'}
                    maxLength={isWallet(form.payment_method) ? 13 : undefined}
                    style={{
                      backgroundColor: C.background, borderWidth: 1.5,
                      borderColor: form.payment_reference.trim() ? Colors.primary : C.border,
                      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      fontSize: 15, color: C.text,
                    }}
                  />
                  {isWallet(form.payment_method) && (
                    <Text style={{ fontSize: 11, marginTop: 4, textAlign: 'right', color: form.payment_reference.length === 13 ? '#16a34a' : C.textMuted }}>
                      {form.payment_reference.length}/13 digits
                    </Text>
                  )}
                </View>

                {/* Proof of payment */}
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Proof of Payment</Text>
                    <RequiredBadge C={C} />
                  </View>
                  <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
                    Attach a screenshot of your payment confirmation.
                  </Text>
                  {form.payment_proof_uri ? (
                    <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
                      <Image source={{ uri: form.payment_proof_uri }} style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: C.borderLight }} resizeMode="cover" />
                      <TouchableOpacity
                        onPress={() => update('payment_proof_uri', '')}
                        style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Feather name="x" size={13} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={pickProof}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
                        borderColor: Colors.primary, backgroundColor: C.primaryBg,
                      }}
                    >
                      <Feather name="upload" size={18} color={Colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>Upload Screenshot</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {form.payment_method === 'cash' && (
              <View style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Feather name="check-circle" size={16} color="#16a34a" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: '#15803d' }}>
                  Our cleaner will collect cash payment on the day of service.
                </Text>
              </View>
            )}

            {/* Special notes */}
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>Special Notes (optional)</Text>
              <TextInput
                value={form.special_notes} onChangeText={t => update('special_notes', t)}
                placeholder="e.g. Please bring eco-friendly products, gate code is 1234..."
                placeholderTextColor={C.textMuted} multiline numberOfLines={4} textAlignVertical="top"
                style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, minHeight: 100 }}
              />
            </View>

            <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#fde68a' }}>
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

      {submitting && <SubmitLoader isDark={isDark} C={C} />}
    </KeyboardAvoidingView>
  )
}

// ─── Submit loading screen ───────────────────────────────────────────────────

function SubmitLoader({ isDark, C }: { isDark: boolean; C: ReturnType<typeof useThemeColors> }) {
  const sweep = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  const [msgIdx, setMsgIdx] = useState(0)

  const MSGS = ['Reserving your slot...', 'Notifying our team...', 'Finalizing details...', 'Almost there...']
  const TRACK_W = 220
  const HEAD_W = 52

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(sweep, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ])).start()

    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
    ])).start()

    const t = setInterval(() => setMsgIdx(i => (i + 1) % MSGS.length), 1800)
    return () => clearInterval(t)
  }, [])

  const vacuumX    = sweep.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_W - HEAD_W] })
  const cleanW     = sweep.interpolate({ inputRange: [0, 1], outputRange: [HEAD_W * 0.6, TRACK_W] })
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] })
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.7, 0.3] })

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: isDark ? 'rgba(15,23,42,0.97)' : 'rgba(249,250,251,0.97)',
      alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 32,
    }}>
      <View style={{
        backgroundColor: C.white, borderRadius: 28, padding: 36,
        borderWidth: 1, borderColor: C.border, alignItems: 'center', width: '100%',
        shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
        shadowOpacity: isDark ? 0.55 : 0.12, shadowRadius: 24, elevation: 16,
      }}>
        <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <Animated.View style={{
            position: 'absolute', width: 96, height: 96, borderRadius: 48,
            backgroundColor: C.primaryBg, transform: [{ scale: pulseScale }], opacity: pulseOpacity,
          }} />
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="wind" size={28} color="#fff" />
          </View>
        </View>

        <View style={{
          width: TRACK_W, height: 64,
          backgroundColor: isDark ? C.borderLight : '#f1f5f9',
          borderRadius: 16, borderWidth: 1, borderColor: C.border,
          overflow: 'hidden', marginBottom: 28,
        }}>
          <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: cleanW, backgroundColor: isDark ? C.primaryBg : '#fdf2f8' }} />
          {[32, 72, 118, 162, 196].map((x, i) => (
            <View key={i} style={{ position: 'absolute', bottom: 14, left: x, width: 5, height: 5, borderRadius: 2.5, backgroundColor: isDark ? C.border : '#d1d5db' }} />
          ))}
          <View style={{ position: 'absolute', bottom: 11, left: 10, right: 10, height: 2, backgroundColor: C.border, borderRadius: 1 }} />
          <Animated.View style={{ position: 'absolute', bottom: 9, transform: [{ translateX: vacuumX }] }}>
            <View style={{ width: HEAD_W, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
              {[0, 1, 2].map(i => <View key={i} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.75)' }} />)}
            </View>
            <View style={{ width: HEAD_W - 12, height: 5, borderRadius: 3, backgroundColor: C.primaryDark, alignSelf: 'center', marginTop: 1 }} />
          </Animated.View>
        </View>

        <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 8 }}>Confirming Booking</Text>
        <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', minHeight: 18 }}>{MSGS[msgIdx]}</Text>
      </View>
    </View>
  )
}
