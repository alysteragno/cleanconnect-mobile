import { Fragment, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
  Animated, Easing, Modal,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import LocationMapPicker from '@/components/LocationMapPicker'
import BookingDateCalendar from '@/components/BookingDateCalendar'
import PaymongoQrModal from '@/components/PaymongoQrModal'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import GCashLogo from '@/assets/gcash_logo.svg'
import MayaLogo from '@/assets/maya_logo.svg'
import QrphLogo from '@/assets/qrph_logo.svg'
import { ServiceType, SpaceType, SERVICE_LABELS } from '@/constants/types'
import { useServices } from '@/hooks/useServices'
import { estimatePrice, estimateBookingPrice, estimateDurationHours, serviceNeedsSqm } from '@/constants/pricing'
import { saveDraft, loadDraft, clearDraft, saveRecentBooking } from '@/lib/bookingDraft'
import { PAYMONGO_ENABLED } from '@/constants/config'
import { isPaymongoMethod } from '@/lib/paymongo'
import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import * as ImageManipulator from 'expo-image-manipulator'



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

function BankCheckIcon() {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#1e40af', alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="file-text" size={22} color="#fff" />
    </View>
  )
}

// Unified online-payment (PayMongo QRPh) icon — the customer scans one QR with
// GCash, Maya, or any bank app on the hosted page.
function OnlinePaymentIcon() {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <QrphLogo width={30} height={30} />
    </View>
  )
}

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cash: <CashIcon />,
  // 'gcash' is the reused value for the unified "Online Payment" (QRPh) option.
  gcash: <OnlinePaymentIcon />,
  maya: <WalletIcon method="maya" />,
  bank_transfer: <BankIcon />,
  bank_check: <BankCheckIcon />,
}

type BankAccount = { bank_name: string; account_number: string; account_name: string }

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

function CountStepper({ label, hint, value, onChange, max = 20, C }: {
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  max?: number
  C: ReturnType<typeof useThemeColors>
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: Colors.primary }} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{label}</Text>
      </View>
      {hint && <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>{hint}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(0, value - 1))}
          style={{
            width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: value > 0 ? Colors.primary : C.border,
            backgroundColor: value > 0 ? C.primaryBg : C.background,
          }}
        >
          <Text style={{ fontSize: 22, color: value > 0 ? Colors.primary : C.textMuted, lineHeight: 26 }}>−</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 26, fontWeight: '800', color: C.text, minWidth: 40, textAlign: 'center' }}>{value}</Text>
        <TouchableOpacity
          onPress={() => onChange(Math.min(max, value + 1))}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: C.primaryBg }}
        >
          <Text style={{ fontSize: 22, color: Colors.primary, lineHeight: 26 }}>+</Text>
        </TouchableOpacity>
        {value > 0 && (
          <Text style={{ fontSize: 13, color: C.textSecondary, flex: 1 }}>{value} selected</Text>
        )}
      </View>
    </View>
  )
}

// ─── Types & constants ───────────────────────────────────────────────────────

type FormData = {
  service_type: ServiceType | null
  space_type: SpaceType | null
  property_sqm: string
  sofa_seaters: number
  mattress_count: number
  aircon_units: number
  carpet_count: number
  other_furniture: string
  furniture_images: string[]
  furniture_videos: string[]
  address_unit: string
  address_street: string
  address_barangay: string
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
  service_type: 'general', space_type: null, property_sqm: '', sofa_seaters: 0,
  mattress_count: 0, aircon_units: 0, carpet_count: 0,
  other_furniture: '', furniture_images: [], furniture_videos: [], address_unit: '', address_street: '',
  address_barangay: '', address_city: '', address_province: '', service_lat: null, service_lng: null,
  service_address_label: '', service_date: null, service_time: null,
  payment_method: '', payment_reference: '', payment_proof_uri: '', special_notes: '',
}

const SERVICE_OPTIONS: ServiceType[] = ['general', 'deep_cleaning', 'complete', 'disinfection', 'post_construction']

const SERVICE_SLUG_TO_TYPE: Record<string, ServiceType> = {
  commercial_cleaning:      'general',
  condo_cleaning:           'general',
  general_cleaning:         'general',
  office_cleaning:          'general',
  mattress_deep_cleaning:   'deep_cleaning',
  sofa_couch_deep_cleaning: 'deep_cleaning',
  carpet_cleaning:          'general',
  curtain_dry_cleaning:     'general',
  aircon_cleaning:          'general',
  aircon_freon_charging:    'general',
  aircon_repair:            'general',
  grease_trap_cleaning:     'general',
  grease_trap_installation: 'general',
  post_construction:        'post_construction',
}

// The 4 "General Cleaning" services are, by definition, one per property type —
// so the specific-service choice and the Space Type choice are the same
// decision made twice. These mappings keep the two in sync: picking a Space
// Type while browsing generically (no slug, or already on one of these 4)
// selects the matching service, and arriving via one of these 4 slugs
// pre-fills the matching Space Type. This never touches specific non-general
// services (aircon, mattress, sofa, carpet, curtain, grease trap) — for those,
// Space Type is just supplementary context about where the job happens.
const GENERAL_SLUG_TO_SPACE_TYPE: Record<string, SpaceType> = {
  general_cleaning:    'residential',
  condo_cleaning:       'condo',
  office_cleaning:      'office',
  commercial_cleaning:  'commercial',
}
const SPACE_TYPE_TO_GENERAL_SLUG: Record<SpaceType, string> = {
  residential: 'general_cleaning',
  condo:       'condo_cleaning',
  office:      'office_cleaning',
  commercial:  'commercial_cleaning',
}

const SPACE_OPTIONS: Array<{ key: SpaceType; label: string; icon: string; desc: string }> = [
  { key: 'residential', label: 'Residential', icon: 'home',     desc: 'House, townhouse' },
  { key: 'condo',       label: 'Condo',       icon: 'square',   desc: 'Condo or studio unit' },
  { key: 'commercial',  label: 'Commercial',  icon: 'package',  desc: 'Shop, restaurant' },
  { key: 'office',      label: 'Office',      icon: 'briefcase',desc: 'Office or workspace' },
]
const PAYMENT_OPTIONS = [
  { key: 'cash',       label: 'Cash',           desc: 'Pay on the day of service' },
  { key: 'gcash',      label: 'Online Payment', desc: 'GCash, Maya, or any bank app via QR' },
  { key: 'bank_check', label: 'Bank Check',     desc: 'Deliver a check before service' },
]

const METRO_MANILA_CITIES = [
  'Caloocan', 'Las Piñas', 'Makati', 'Malabon', 'Mandaluyong',
  'Manila', 'Marikina', 'Muntinlupa', 'Navotas', 'Parañaque',
  'Pasay', 'Pasig', 'Pateros', 'Quezon City', 'San Juan',
  'Taguig', 'Valenzuela',
]

function normalizeForMatch(s: string) {
  return s.toLowerCase().replace(/[ñ]/g, 'n').replace(/[áàä]/g, 'a')
}

function matchMetroManilaCity(geocodedCity: string): string | null {
  if (!geocodedCity) return null
  const norm = normalizeForMatch(geocodedCity)
  return METRO_MANILA_CITIES.find(c =>
    normalizeForMatch(c) === norm ||
    norm.includes(normalizeForMatch(c))
  ) ?? null
}

function CityPickerModal({ visible, onSelect, onClose, C }: {
  visible: boolean
  onSelect: (city: string) => void
  onClose: () => void
  C: ReturnType<typeof useThemeColors>
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: C.white,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        maxHeight: '70%',
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, paddingHorizontal: 20, marginBottom: 4 }}>
          Select City
        </Text>
        <Text style={{ fontSize: 12, color: C.textSecondary, paddingHorizontal: 20, marginBottom: 12 }}>
          Metro Manila cities only
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {METRO_MANILA_CITIES.map((city, i) => (
            <TouchableOpacity
              key={city}
              onPress={() => { onSelect(city); onClose() }}
              style={{
                paddingVertical: 14, paddingHorizontal: 20,
                borderBottomWidth: i < METRO_MANILA_CITIES.length - 1 ? 1 : 0,
                borderBottomColor: C.borderLight,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 15, color: C.text, fontWeight: '500' }}>{city}</Text>
              <Feather name="chevron-right" size={14} color={C.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}

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

function isWithinServiceHours(time: Date): boolean {
  const h = time.getHours()
  const m = time.getMinutes()
  if (h < 8 || h > 17) return false
  if (h === 17 && m > 0) return false
  return true
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NewBookingScreen() {
  const router = useRouter()
  const { service: serviceSlug } = useLocalSearchParams<{ service?: string }>()
  const { getService } = useServices()
  const C = useThemeColors()
  const { isDark } = useTheme()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const defaultTime = useRef((() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d })()).current
  const [currentServiceSlug, setCurrentServiceSlug] = useState<string | undefined>(serviceSlug)
  const mountedSlugRef = useRef(serviceSlug)
  const [showMap, setShowMap] = useState(false)
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [step2Visited, setStep2Visited] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrBookingId, setQrBookingId] = useState<string | null>(null)
  const [qrPaymentSummary, setQrPaymentSummary] = useState<{
    customerName: string
    customerEmail: string
    customerPhone: string
    serviceLabel: string
    amount: number
  } | null>(null)

  // dateStr ('YYYY-MM-DD') -> booked time strings ('HH:MM') for this customer's
  // own active (non-completed, non-cancelled) bookings — feeds both the Step 3
  // calendar's crossed-out dates and the immediate date+time conflict check.
  const [bookedSlots, setBookedSlots] = useState<Record<string, string[]>>({})
  const [dateConflictError, setDateConflictError] = useState<string | null>(null)

  const [paymentSettings,  setPaymentSettings]  = useState<Record<string, string>>({})
  const [bankAccounts,     setBankAccounts]     = useState<BankAccount[] | undefined>(undefined)
  const [selectedBankIdx,  setSelectedBankIdx]  = useState(0)
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})
  const draftLoaded = useRef(false)
  const draftCleared = useRef(false)
  const [checkingActive, setCheckingActive] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCheckingActive(false); return }

      // Check for a saved draft
      const draft = await loadDraft()
      const shouldRestore = draft && (!serviceSlug || serviceSlug === draft.serviceSlug)

      if (shouldRestore) {
        // Ask the user instead of silently restoring
        const savedOn = new Date(draft!.savedAt).toLocaleDateString('en-PH', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
        Alert.alert(
          'Resume Previous Booking?',
          `You have a saved draft from ${savedOn}. Continue where you left off, or start fresh?`,
          [
            {
              text: 'Start Fresh',
              style: 'destructive',
              onPress: async () => {
                draftCleared.current = true
                await clearDraft()
                if (serviceSlug && SERVICE_SLUG_TO_TYPE[serviceSlug]) {
                  setForm(f => ({
                    ...f,
                    service_type: SERVICE_SLUG_TO_TYPE[serviceSlug!],
                    space_type: GENERAL_SLUG_TO_SPACE_TYPE[serviceSlug!] ?? f.space_type,
                  }))
                }
                draftLoaded.current = true
                setCheckingActive(false)
              },
            },
            {
              text: 'Resume Draft',
              onPress: () => {
                setForm({
                  ...INITIAL_FORM,
                  ...draft!.form,
                  service_type: draft!.form.service_type as ServiceType | null,
                  space_type: draft!.form.space_type as SpaceType | null,
                  service_date: draft!.form.service_date ? new Date(draft!.form.service_date) : null,
                  service_time: draft!.form.service_time ? new Date(draft!.form.service_time) : null,
                })
                setStep(draft!.step)
                if (draft!.serviceSlug) setCurrentServiceSlug(draft!.serviceSlug)
                draftLoaded.current = true
                setCheckingActive(false)
              },
            },
          ],
          { cancelable: false },
        )
        return // wait for user choice before showing form
      }

      // No draft to restore (or different service — clear stale draft)
      if (draft) await clearDraft()

      draftLoaded.current = true

      if (serviceSlug && SERVICE_SLUG_TO_TYPE[serviceSlug]) {
        setForm(f => ({
          ...f,
          service_type: SERVICE_SLUG_TO_TYPE[serviceSlug!],
          space_type: GENERAL_SLUG_TO_SPACE_TYPE[serviceSlug!] ?? f.space_type,
        }))
      }

      setCheckingActive(false)
    }
    init()
  }, [])

  // If the component instance is reused with a different service slug (Expo Router
  // Tabs+Stack edge case), reset the form so the new service is shown correctly.
  useEffect(() => {
    if (mountedSlugRef.current === serviceSlug) return
    mountedSlugRef.current = serviceSlug
    setCurrentServiceSlug(serviceSlug)
    setForm({
      ...INITIAL_FORM,
      ...(serviceSlug && SERVICE_SLUG_TO_TYPE[serviceSlug]
        ? {
            service_type: SERVICE_SLUG_TO_TYPE[serviceSlug],
            space_type: GENERAL_SLUG_TO_SPACE_TYPE[serviceSlug] ?? null,
          }
        : {}),
    })
    setStep(1)
    setAgreedToTerms(false)
    setTermsExpanded(false)
    draftCleared.current = false
    draftLoaded.current = true
  }, [serviceSlug])

  useEffect(() => {
    if (!draftLoaded.current || draftCleared.current) return
    saveDraft({
      form: {
        ...form,
        service_date: form.service_date?.toISOString() ?? null,
        service_time: form.service_time?.toISOString() ?? null,
      },
      step,
      savedAt: new Date().toISOString(),
      serviceSlug: currentServiceSlug,
    })
  }, [form, step, currentServiceSlug])

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
      .in('key', ['gcash_number', 'maya_number', 'bank_accounts', 'check_payable_to', 'check_delivery_address'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((s: { key: string; value: string }) => { map[s.key] = s.value })
        setPaymentSettings(map)
        try {
          setBankAccounts(map.bank_accounts ? JSON.parse(map.bank_accounts) : [])
        } catch {
          setBankAccounts([])
        }
      })
    setQrUrls({
      gcash: supabase.storage.from('payment-assets').getPublicUrl('qr-codes/gcash.jpg').data.publicUrl,
      maya:  supabase.storage.from('payment-assets').getPublicUrl('qr-codes/maya.jpg').data.publicUrl,
    })
  }, [])

  useEffect(() => {
    async function loadBookedSlots() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('bookings')
        .select('service_date, service_time')
        .eq('customer_id', user.id)
        .neq('status', 'completed')
        .neq('status', 'cancelled')

      const map: Record<string, string[]> = {}
      ;(data ?? []).forEach((row: { service_date: string; service_time: string }) => {
        const timeKey = row.service_time?.slice(0, 5) // 'HH:MM:SS' -> 'HH:MM'
        if (!timeKey) return
        if (!map[row.service_date]) map[row.service_date] = []
        map[row.service_date].push(timeKey)
      })
      setBookedSlots(map)
    }
    loadBookedSlots()
  }, [])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleDateOrTimeChange(next: { date?: Date; time?: Date }) {
    if (next.date) update('service_date', next.date)
    if (next.time) update('service_time', next.time)
  }

  // Single source of truth for the Step 3 conflict banner — one booking per
  // calendar day, regardless of time. Recomputes on any date change OR once
  // booked slots finish loading, so a restored draft (date already set
  // before bookedSlots loads) is re-checked too, not just fresh picker taps.
  useEffect(() => {
    if (form.service_date) {
      const conflict = (bookedSlots[toDateString(form.service_date)] ?? []).length > 0
      setDateConflictError(conflict ? 'You already have a booking scheduled on this date. Please choose a different date.' : null)
    } else {
      setDateConflictError(null)
    }
  }, [form.service_date, bookedSlots])

  // Area-based (General Cleaning) services collect property size; unit/flat-rate
  // services (aircon, mattress, sofa, carpet, grease trap, …) do not.
  const needsSqm = serviceNeedsSqm(currentServiceSlug)

  // Whether the Space Type picker is currently standing in for "which of the
  // 4 General Cleaning services" (no specific service chosen yet, or already
  // on one of those 4) — as opposed to just describing where an unrelated
  // specific service (aircon, mattress, ...) will happen.
  const spaceTypeDrivesService = !currentServiceSlug || !!GENERAL_SLUG_TO_SPACE_TYPE[currentServiceSlug]

  function selectSpaceType(spaceType: SpaceType) {
    setForm(f => ({ ...f, space_type: spaceType }))
    if (spaceTypeDrivesService) setCurrentServiceSlug(SPACE_TYPE_TO_GENERAL_SLUG[spaceType])
  }

  async function pickMedia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library to upload photos and videos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.7,
      videoMaxDuration: 60,
    })
    if (result.canceled) return
    const images = result.assets.filter(a => a.type === 'image').map(a => a.uri)
    const videos = result.assets.filter(a => a.type === 'video').map(a => a.uri)
    setForm(f => ({
      ...f,
      furniture_images: [...f.furniture_images, ...images],
      furniture_videos: [...f.furniture_videos, ...videos],
    }))
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
      if (!form.space_type) return { title: 'Space required', message: 'Please select a space type.' }
      if (needsSqm && (!form.property_sqm || isNaN(Number(form.property_sqm)) || Number(form.property_sqm) <= 0))
        return { title: 'Invalid size', message: 'Please enter a valid property size in sqm.' }
      if (form.furniture_images.length === 0)
        return { title: 'Photos required', message: 'Please upload at least one photo of the area or furniture to be cleaned.' }
    }
    if (step === 2) {
      if (!form.address_street.trim()) return { title: 'Address incomplete', message: 'Please enter a street address.' }
      if (!form.address_barangay.trim()) return { title: 'Address incomplete', message: 'Please enter a barangay.' }
      if (!form.address_city.trim()) return { title: 'Address incomplete', message: 'Please select a city.' }
      if (!form.service_lat) return { title: 'Location required', message: 'Please pin your service location on the map.' }
    }
    if (step === 3) {
      if (!form.service_date) return { title: 'Date required', message: 'Please select a service date.' }
      if (!form.service_time) return { title: 'Time required', message: 'Please select a service time.' }
      if (dateConflictError) return { title: 'Already booked', message: dateConflictError }
      if (!isWithinServiceHours(form.service_time))
        return { title: 'Outside service hours', message: 'Service is available from 8:00 AM to 5:00 PM only. Please choose a time within that window.' }
      const combined = new Date(form.service_date)
      combined.setHours(form.service_time.getHours(), form.service_time.getMinutes(), 0, 0)
      if (combined.getTime() - Date.now() < 24 * 60 * 60 * 1000)
        return { title: 'Too soon', message: 'Bookings must be made at least 24 hours in advance. Please choose a later date or time.' }
    }
    if (step === 4) {
      if (!agreedToTerms) return { title: 'Agreement required', message: 'Please read and agree to the Booking Terms & Conditions before processing your booking.' }
    }
    if (step === 5) {
      if (!form.payment_method) return { title: 'Payment required', message: 'Please select a payment method to continue.' }
    }
    if (step === 6 && !PAYMONGO_ENABLED) {
      // Legacy manual flow — reference number + proof screenshot are collected
      // in-app. Under PayMongo these are handled on the hosted checkout page.
      if (form.payment_method === 'gcash') {
        if (!/^\d{13}$/.test(form.payment_reference))
          return { title: 'Invalid reference', message: 'GCash reference must be exactly 13 digits.' }
        if (!form.payment_proof_uri) return { title: 'Proof required', message: 'Please attach a screenshot of your payment confirmation.' }
      }
      if (form.payment_method === 'maya') {
        if (!form.payment_reference.trim()) return { title: 'Reference required', message: 'Please enter the reference number from your Maya payment.' }
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
    setStep(s => s + 1)
  }

  function handleCancel() {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel? Your progress will be lost.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Cancel Booking', style: 'destructive',
          onPress: async () => { draftCleared.current = true; await clearDraft(); router.back() },
        },
      ],
    )
  }

  function handleBack() {
    if (step === 1) { handleCancel(); return }
    setStep(s => s - 1)
  }

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated.'); setSubmitting(false); return }

    // One booking per calendar day, regardless of time — backstop against the
    // Step 3 calendar check (race conditions, stale bookedSlots, etc).
    const { data: conflict } = await supabase
      .from('bookings')
      .select('id')
      .eq('customer_id', user.id)
      .eq('service_date', toDateString(form.service_date!))
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle()
    if (conflict?.id) {
      setError('You already have a booking scheduled on this date. Please choose a different date.')
      setSubmitting(false)
      return
    }

    async function uploadToStorage(bucket: string, uri: string, filename: string): Promise<string | null> {
      const converted = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )
      const fullPath = `${user!.id}/${filename}.jpg`

      const base64 = await FileSystem.readAsStringAsync(converted.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const binaryStr = atob(base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

      const { error } = await supabase.storage
        .from(bucket)
        .upload(fullPath, bytes, { contentType: 'image/jpeg', upsert: false })
      if (error) {
        console.error(`[upload] ${bucket}/${fullPath}:`, error.message)
        return null
      }
      return supabase.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl
    }

    // Videos are streamed straight from disk (no base64 in JS memory, no image
    // conversion) via the Storage REST endpoint using the user's access token.
    async function uploadVideoToStorage(uri: string, filename: string): Promise<string | null> {
      const ext = (uri.split('?')[0].split('.').pop() || 'mp4').toLowerCase()
      const contentType = ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4'
      const fullPath = `${user!.id}/${filename}.${ext}`
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return null
      try {
        const res = await FileSystem.uploadAsync(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/furniture-photos/${fullPath}`,
          uri,
          {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { Authorization: `Bearer ${token}`, 'content-type': contentType, 'x-upsert': 'false' },
          },
        )
        if (res.status !== 200 && res.status !== 201) {
          console.error(`[video upload] ${fullPath}:`, res.status, res.body)
          return null
        }
        return supabase.storage.from('furniture-photos').getPublicUrl(fullPath).data.publicUrl
      } catch (e: any) {
        console.error('[video upload] error:', e?.message)
        return null
      }
    }

    const uploadedUrls: string[] = []
    for (const uri of form.furniture_images) {
      const url = await uploadToStorage(
        'furniture-photos',
        uri,
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      )
      if (url) uploadedUrls.push(url)
    }

    const uploadedVideoUrls: string[] = []
    for (const uri of form.furniture_videos) {
      const url = await uploadVideoToStorage(uri, `video-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      if (url) uploadedVideoUrls.push(url)
    }
    const allMedia = [...uploadedUrls, ...uploadedVideoUrls]

    let payment_proof_url: string | null = null
    if (form.payment_proof_uri) {
      payment_proof_url = await uploadToStorage(
        'payment-receipts',
        form.payment_proof_uri,
        `proof-${Date.now()}`,
      )
    }

    const sqm = needsSqm ? parseFloat(form.property_sqm) : 0

    const serviceDetails: string[] = []
    if (currentServiceSlug === 'mattress_deep_cleaning' && form.mattress_count > 0)
      serviceDetails.push(`${form.mattress_count} mattress${form.mattress_count !== 1 ? 'es' : ''}`)
    if ((currentServiceSlug === 'aircon_cleaning' || currentServiceSlug === 'aircon_freon_charging' || currentServiceSlug === 'aircon_repair') && form.aircon_units > 0)
      serviceDetails.push(`${form.aircon_units} aircon unit${form.aircon_units !== 1 ? 's' : ''}`)
    if (currentServiceSlug === 'carpet_cleaning' && form.carpet_count > 0)
      serviceDetails.push(`${form.carpet_count} carpet${form.carpet_count !== 1 ? 's' : ''}`)
    const combinedFurniture = [...serviceDetails, form.other_furniture.trim()].filter(Boolean).join(', ')

    const serviceName = getService(currentServiceSlug ?? '')?.name ?? SERVICE_LABELS[form.service_type ?? 'general']
    const basePrice = estimateBookingPrice(currentServiceSlug, form.service_type!, sqm)

    const { data, error: insertError } = await supabase.from('bookings').insert({
      customer_id: user.id,
      service_name: serviceName,
      service_slug: currentServiceSlug ?? null,
      space_type: form.space_type,
      property_sqm: sqm,
      sofa_seaters: currentServiceSlug === 'sofa_couch_deep_cleaning' && form.sofa_seaters > 0 ? form.sofa_seaters : null,
      other_furniture: combinedFurniture || null,
      furniture_images: allMedia.length > 0 ? allMedia : null,
      address_unit: form.address_unit || null,
      address_street: form.address_street,
      address_barangay: form.address_barangay || null,
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
      base_price: basePrice,
      required_cleaners: 1,
      duration_hours: estimateDurationHours(currentServiceSlug, sqm),
    }).select('id').single()

    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    draftCleared.current = true
    await clearDraft()
    await saveRecentBooking({
      id: data.id,
      status: 'pending',
      service_type: form.service_type ?? 'general',
      service_date: toDateString(form.service_date!),
    })

    // Online payment → collect now via a native in-app QR Ph code (no browser,
    // no webview). Cash (on-site) and bank check (physical, admin-verified)
    // skip PayMongo entirely and go straight to the booking detail screen.
    if (PAYMONGO_ENABLED && isPaymongoMethod(form.payment_method)) {
      const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).single()
      setQrPaymentSummary({
        customerName: profile?.full_name ?? '',
        customerEmail: user.email ?? '',
        customerPhone: profile?.phone ?? '',
        serviceLabel: serviceName,
        amount: basePrice,
      })
      setQrBookingId(data.id)
      setShowQrModal(true)
      return
    }

    router.replace(`/(customer)/bookings/${data.id}`)
  }

  function closeQrModalAndNavigate() {
    const bookingId = qrBookingId
    setShowQrModal(false)
    setQrBookingId(null)
    setQrPaymentSummary(null)
    // The booking already exists either way — paid or not, the detail screen
    // observes the row (realtime + polling) and shows a "Pay Now" retry CTA
    // if it's still unpaid.
    if (bookingId) router.replace(`/(customer)/bookings/${bookingId}`)
  }

  if (checkingActive) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    )
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
        <Text style={{ color: step === 1 ? '#dc2626' : C.textSecondary, fontWeight: '600' }}>
          {step === 1 ? 'Cancel Booking' : 'Back'}
        </Text>
      </TouchableOpacity>
      {(() => {
        const blocked = step === 4 && !agreedToTerms
        return (
          <TouchableOpacity
            onPress={step === 6 ? handleSubmit : handleNext}
            disabled={submitting || blocked}
            style={{
              flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
              backgroundColor: blocked ? C.borderLight : Colors.primary,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            <Text style={{ fontWeight: '700', color: blocked ? C.textMuted : '#fff' }}>
              {blocked
                ? 'Read Terms to Continue'
                : step === 4 ? 'Continue to Payment →'
                : step === 6 ? 'Confirm Booking'
                : 'Next →'}
            </Text>
          </TouchableOpacity>
        )
      })()}
    </View>
  )

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <AppHeader title="New Booking" subtitle={`Step ${step} of 6 — ${stepLabels[step - 1]}`} hideBell />

      {stepIndicator}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>


        {/* ── Step 1: Service & Space ── */}
        {step === 1 && (
          <View style={{ gap: 20 }}>
            {/* Service info banner — persisted via draft so it survives navigation */}
            {currentServiceSlug && (() => {
              const svcDef = getService(currentServiceSlug)
              if (!svcDef) return null
              return (
                <View style={{
                  borderRadius: 20, overflow: 'hidden',
                  borderWidth: 1, borderColor: C.border,
                  backgroundColor: C.white,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: isDark ? 0 : 0.07,
                  shadowRadius: 10,
                  elevation: 3,
                }}>
                  {svcDef.image ? (
                    <View>
                      <Image source={svcDef.image} style={{ width: '100%', height: 170 }} resizeMode="cover" />
                      <View style={{
                        position: 'absolute', top: 12, left: 12,
                        backgroundColor: svcDef.accent + 'DD',
                        borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>
                          {svcDef.category.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ width: '100%', height: 110, backgroundColor: svcDef.placeholderBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={svcDef.placeholderIcon as any} size={44} color={svcDef.placeholderIconColor} style={{ opacity: 0.35 }} />
                      <View style={{
                        position: 'absolute', top: 12, left: 12,
                        backgroundColor: svcDef.accent + 'DD',
                        borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>
                          {svcDef.category.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={{ padding: 16, gap: 6 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3 }}>{svcDef.name}</Text>
                    <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>{svcDef.desc}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderLight }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Feather name="clock" size={12} color={C.textMuted} />
                        <Text style={{ fontSize: 12, color: C.textMuted, fontWeight: '500' }}>{svcDef.duration}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Feather name="tag" size={12} color={Colors.primary} />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.primary }}>
                          From ₱{svcDef.startingPrice.toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Feather name="check-circle" size={11} color="#16a34a" />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a' }}>Selected</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              )
            })()}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: Colors.primary }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Space Type</Text>
              </View>
              {spaceTypeDrivesService && (
                <Text style={{ fontSize: 11, color: C.textSecondary, marginBottom: 10, lineHeight: 16 }}>
                  Picks your General Cleaning service — Residential, Condo, Office, or Commercial.
                </Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spaceTypeDrivesService ? 0 : 8 }}>
                {SPACE_OPTIONS.map(o => {
                  const selected = form.space_type === o.key
                  return (
                    <TouchableOpacity
                      key={o.key} onPress={() => selectSpaceType(o.key)}
                      style={{
                        width: '47%', padding: 14, borderRadius: 12, borderWidth: 1.5,
                        borderColor: selected ? Colors.primary : C.border,
                        backgroundColor: selected ? C.primaryBg : C.white,
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                      }}
                    >
                      <View style={{
                        width: 34, height: 34, borderRadius: 10,
                        backgroundColor: selected ? Colors.primary : C.background,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Feather name={o.icon as any} size={16} color={selected ? '#fff' : C.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? Colors.primary : C.text }}>
                          {o.label}
                        </Text>
                        <Text style={{ fontSize: 10, color: selected ? Colors.primary : C.textMuted, marginTop: 1 }} numberOfLines={1}>
                          {o.desc}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {needsSqm && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: Colors.primary }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Property Size (sqm)</Text>
              </View>
              <TextInput
                value={form.property_sqm} onChangeText={t => update('property_sqm', t)}
                keyboardType="numeric" placeholder="e.g. 60" placeholderTextColor={C.textMuted}
                style={{ backgroundColor: C.white, borderWidth: 1.5, borderColor: form.property_sqm ? Colors.primary : C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text }}
              />
              {form.property_sqm && !isNaN(Number(form.property_sqm)) && Number(form.property_sqm) > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: C.primaryBg, borderRadius: 10 }}>
                  <Feather name="tag" size={13} color={Colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.primary }}>
                    Est. ₱{estimatePrice(form.service_type ?? 'general', parseFloat(form.property_sqm)).toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.textSecondary }}> · subject to admin confirmation</Text>
                </View>
              )}
            </View>
            )}

            {currentServiceSlug === 'sofa_couch_deep_cleaning' && (
              <CountStepper
                label="Number of Sofa Seaters"
                hint="Include all sofas, sectionals, and upholstered chairs to be cleaned."
                value={form.sofa_seaters}
                onChange={n => update('sofa_seaters', n)}
                C={C}
              />
            )}

            {currentServiceSlug === 'mattress_deep_cleaning' && (
              <CountStepper
                label="Number of Mattresses"
                hint="Count each mattress that needs deep cleaning (single, double, queen, king)."
                value={form.mattress_count}
                onChange={n => update('mattress_count', n)}
                C={C}
              />
            )}

            {(currentServiceSlug === 'aircon_cleaning' || currentServiceSlug === 'aircon_freon_charging' || currentServiceSlug === 'aircon_repair') && (
              <CountStepper
                label="Number of Aircon Units"
                hint="Count each aircon unit that needs service."
                value={form.aircon_units}
                onChange={n => update('aircon_units', n)}
                max={30}
                C={C}
              />
            )}

            {currentServiceSlug === 'carpet_cleaning' && (
              <CountStepper
                label="Number of Carpets"
                hint="Count each carpet or rug that needs cleaning."
                value={form.carpet_count}
                onChange={n => update('carpet_count', n)}
                C={C}
              />
            )}

            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: Colors.primary }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Additional Details</Text>
              </View>
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
                {getAdditionalDetailsHint(currentServiceSlug)}
              </Text>
              <TextInput
                value={form.other_furniture} onChangeText={t => update('other_furniture', t)}
                placeholder={getAdditionalDetailsPlaceholder(currentServiceSlug)} placeholderTextColor={C.textMuted}
                multiline numberOfLines={3} textAlignVertical="top"
                style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, minHeight: 72 }}
              />
            </View>

            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: Colors.primary }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Furniture / Area Photos & Video</Text>
                <RequiredBadge C={C} />
              </View>
              <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>
                Upload photos of the area/furniture so our admin can verify and confirm the service rate. Add as many as you need — you can also attach a short video.
              </Text>

              {/* Photo previews */}
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

              {/* Video previews */}
              {form.furniture_videos.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {form.furniture_videos.map((uri, i) => (
                    <View key={uri} style={{ position: 'relative' }}>
                      <View style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="play-circle" size={26} color="#fff" />
                        <View style={{ position: 'absolute', bottom: 5, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Feather name="video" size={9} color="rgba(255,255,255,0.85)" />
                          <Text style={{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>Video</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => update('furniture_videos', form.furniture_videos.filter((_, idx) => idx !== i))}
                        style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Feather name="x" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                onPress={pickMedia}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
                  borderColor: form.furniture_images.length === 0 ? Colors.primary : C.border,
                  backgroundColor: form.furniture_images.length === 0 ? C.primaryBg : C.background,
                }}
              >
                <Feather name="camera" size={18} color={form.furniture_images.length === 0 ? Colors.primary : C.textMuted} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: form.furniture_images.length === 0 ? Colors.primary : C.textSecondary }}>
                  {form.furniture_images.length === 0 && form.furniture_videos.length === 0 ? 'Upload Photos / Video (Photo Required)' : 'Add More Photos / Video'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 2: Address + GPS ── */}
        {step === 2 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Service Address</Text>

            {/* Unit / Floor */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 }}>Unit / Floor</Text>
              <TextInput
                value={form.address_unit} onChangeText={t => update('address_unit', t)}
                placeholder="e.g. Unit 3B" placeholderTextColor={C.textMuted}
                style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text }}
              />
            </View>

            {/* Street */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 }}>Street *</Text>
              <TextInput
                value={form.address_street} onChangeText={t => update('address_street', t)}
                placeholder="e.g. 123 Rizal Ave" placeholderTextColor={C.textMuted}
                style={{ backgroundColor: C.white, borderWidth: 1, borderColor: form.address_street ? Colors.primary : C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text }}
              />
            </View>

            {/* Barangay */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 }}>Barangay *</Text>
              <TextInput
                value={form.address_barangay} onChangeText={t => update('address_barangay', t)}
                placeholder="e.g. Brgy. San Antonio" placeholderTextColor={C.textMuted}
                style={{ backgroundColor: C.white, borderWidth: 1, borderColor: form.address_barangay ? Colors.primary : C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text }}
              />
            </View>

            {/* City — Metro Manila dropdown */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 }}>City * <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '400' }}>(Metro Manila)</Text></Text>
              <TouchableOpacity
                onPress={() => setShowCityPicker(true)}
                style={{
                  backgroundColor: C.white, borderWidth: 1,
                  borderColor: form.address_city ? Colors.primary : C.border,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
                  flexDirection: 'row', alignItems: 'center',
                }}
              >
                <Text style={{ flex: 1, fontSize: 15, color: form.address_city ? C.text : C.textMuted }}>
                  {form.address_city || 'Select city'}
                </Text>
                <Feather name="chevron-down" size={16} color={form.address_city ? Colors.primary : C.textMuted} />
              </TouchableOpacity>
              {form.address_city ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <Feather name="map" size={11} color={C.textMuted} />
                  <Text style={{ fontSize: 11, color: C.textMuted }}>Metro Manila</Text>
                </View>
              ) : null}
            </View>

            {/* GPS pin */}
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

            <CityPickerModal
              visible={showCityPicker}
              onSelect={city => {
                update('address_city', city)
                update('address_province', 'Metro Manila')
              }}
              onClose={() => setShowCityPicker(false)}
              C={C}
            />

            <LocationMapPicker
              visible={showMap}
              initial={form.service_lat ? { latitude: form.service_lat, longitude: form.service_lng! } : null}
              onConfirm={(coord, address, geocodedCity, parts) => {
                const matched = matchMetroManilaCity(geocodedCity)
                setForm(f => ({
                  ...f,
                  service_lat: coord.latitude,
                  service_lng: coord.longitude,
                  service_address_label: address,

                  address_street: parts.street || f.address_street,
                  address_barangay: parts.district || f.address_barangay,
                  address_city: matched || f.address_city,
                  address_province: matched ? 'Metro Manila' : (parts.subregion || f.address_province),
                }))
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

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, color: C.textSecondary }}>Date *</Text>
              <BookingDateCalendar
                selectedDate={form.service_date ? toDateString(form.service_date) : null}
                minDate={toDateString(new Date(Date.now() + 24 * 60 * 60 * 1000))}
                bookedDates={new Set(Object.keys(bookedSlots))}
                onSelectDate={(dateStr) => {
                  const [y, m, d] = dateStr.split('-').map(Number)
                  handleDateOrTimeChange({ date: new Date(y, m - 1, d) })
                }}
              />
            </View>

            <DateTimeField
              label="Time" value={form.service_time}
              displayValue={form.service_time ? formatDisplayTime(form.service_time) : ''}
              emptyText="Tap to select a time"
              onPress={() => setShowTimePicker(true)}
              show={showTimePicker} onDone={() => setShowTimePicker(false)} C={C}
            >
              <DateTimePicker
                mode="time"
                value={form.service_time ?? defaultTime}
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={Colors.primary}
                minuteInterval={30}
                onChange={(_e: DateTimePickerEvent, date?: Date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false)
                  if (date) handleDateOrTimeChange({ time: date })
                }}
              />
            </DateTimeField>

            {/* Already-booked inline conflict */}
            {dateConflictError && (
              <View style={{
                backgroundColor: '#fef2f2', borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: '#fca5a5',
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              }}>
                <Feather name="alert-circle" size={15} color="#dc2626" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626', marginBottom: 2 }}>
                    Already booked
                  </Text>
                  <Text style={{ fontSize: 12, color: '#b91c1c', lineHeight: 17 }}>{dateConflictError}</Text>
                </View>
              </View>
            )}

            {/* Out-of-hours inline warning */}
            {form.service_time && !isWithinServiceHours(form.service_time) && (
              <View style={{
                backgroundColor: '#fef2f2', borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: '#fca5a5',
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              }}>
                <Feather name="alert-circle" size={15} color="#dc2626" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626', marginBottom: 2 }}>
                    Outside service hours
                  </Text>
                  <Text style={{ fontSize: 12, color: '#b91c1c', lineHeight: 17 }}>
                    {formatDisplayTime(form.service_time)} is not within our operating window. Please choose a time between 8:00 AM and 5:00 PM.
                  </Text>
                </View>
              </View>
            )}

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

            {/* ── Service hero card ── */}
            {(() => {
              const svcDef    = getService(currentServiceSlug ?? '')
              const svcName   = svcDef?.name ?? SERVICE_LABELS[form.service_type!]
              const svcImage  = svcDef?.image ?? null
              const svcAccent = svcDef?.accent ?? Colors.primary
              const svcCat    = (svcDef?.category ?? '').toUpperCase()
              const svcIcon   = (svcDef?.placeholderIcon ?? 'home') as React.ComponentProps<typeof Feather>['name']
              const sqmVal    = needsSqm ? (parseFloat(form.property_sqm) || 0) : 0
              const estPrice  = estimateBookingPrice(currentServiceSlug, form.service_type!, sqmVal)
              const estHours  = estimateDurationHours(currentServiceSlug, sqmVal)
              const spaceLabel =
                form.space_type === 'residential' ? 'Residential'
                  : form.space_type === 'condo' ? 'Condo'
                  : form.space_type === 'office' ? 'Office'
                  : 'Commercial'
              const extras = [
                currentServiceSlug === 'sofa_couch_deep_cleaning' && form.sofa_seaters > 0
                  ? `${form.sofa_seaters} sofa${form.sofa_seaters !== 1 ? 's' : ''}` : null,
                currentServiceSlug === 'mattress_deep_cleaning' && form.mattress_count > 0
                  ? `${form.mattress_count} mattress${form.mattress_count !== 1 ? 'es' : ''}` : null,
                (currentServiceSlug === 'aircon_cleaning' || currentServiceSlug === 'aircon_freon_charging' || currentServiceSlug === 'aircon_repair') && form.aircon_units > 0
                  ? `${form.aircon_units} unit${form.aircon_units !== 1 ? 's' : ''}` : null,
                currentServiceSlug === 'carpet_cleaning' && form.carpet_count > 0
                  ? `${form.carpet_count} carpet${form.carpet_count !== 1 ? 's' : ''}` : null,
              ].filter(Boolean).join(' · ')

              const Inner = () => (
                <View style={{ padding: 20 }}>
                  {/* Decorative icon */}
                  <View style={{
                    position: 'absolute', top: 16, right: 16,
                    width: 64, height: 64, borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name={svcIcon} size={28} color="#fff" style={{ opacity: 0.75 }} />
                  </View>

                  {/* Category pill */}
                  {svcCat ? (
                    <View style={{
                      alignSelf: 'flex-start', marginBottom: 8,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5 }}>
                        {svcCat}
                      </Text>
                    </View>
                  ) : null}

                  {/* Service name */}
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4, paddingRight: 72, letterSpacing: -0.3 }}>
                    {svcName}
                  </Text>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 18 }}>
                    {spaceLabel}{needsSqm && form.property_sqm ? ` · ${form.property_sqm} sqm` : ''}
                    {extras ? ` · ${extras}` : ''}
                  </Text>

                  {/* Divider */}
                  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginBottom: 16 }} />

                  {/* Price + Duration */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>
                        Estimated Price
                      </Text>
                      <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>
                        ₱{estPrice.toLocaleString()}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
                      alignItems: 'center',
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>
                        Est. Duration
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                        {svcDef?.duration ?? `~${estHours}h`}
                      </Text>
                    </View>
                  </View>

                  {/* Bottom accent strip */}
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: svcAccent, opacity: 0.7 }} />
                </View>
              )

              return (
                <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: '#0f172a' }}>
                  {svcImage && (
                    <Image source={svcImage} style={{ width: '100%', height: 160 }} resizeMode="cover" />
                  )}
                  <Inner />
                </View>
              )
            })()}

            {/* ── Location card ── */}
            <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(219,39,119,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="map-pin" size={14} color={Colors.primary} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Service Location</Text>
              </View>
              <View style={{ padding: 16, gap: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
                  {[form.address_unit, form.address_street].filter(Boolean).join(', ') || '—'}
                </Text>
                <Text style={{ fontSize: 13, color: C.textSecondary }}>
                  {[form.address_barangay, form.address_city, form.address_province].filter(Boolean).join(', ')}
                </Text>
                {form.service_lat ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                    <Feather name="crosshair" size={12} color={Colors.primary} />
                    <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>
                      GPS: {form.service_lat.toFixed(5)}, {form.service_lng!.toFixed(5)}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                    <Feather name="alert-circle" size={12} color="#ca8a04" />
                    <Text style={{ fontSize: 12, color: '#ca8a04', fontWeight: '600' }}>GPS not captured</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Schedule card ── */}
            <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(219,39,119,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="calendar" size={14} color={Colors.primary} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Schedule</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                {[
                  { icon: 'calendar' as const, label: 'Date', value: form.service_date ? formatDisplayDate(form.service_date) : '—' },
                  { icon: 'clock'    as const, label: 'Time', value: form.service_time ? formatDisplayTime(form.service_time) : '—' },
                ].map((col, i) => (
                  <View key={col.label} style={{ flex: 1, padding: 14, borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: C.borderLight }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                      <Feather name={col.icon} size={12} color={C.textMuted} />
                      <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600' }}>{col.label}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{col.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Extra details (if any) ── */}
            {(form.other_furniture.trim() || form.furniture_images.length > 0 || form.furniture_videos.length > 0 || form.special_notes.trim()) && (
              <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(219,39,119,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="info" size={14} color={Colors.primary} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Additional Details</Text>
                </View>
                {form.other_furniture.trim() ? (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: form.furniture_images.length > 0 || form.furniture_videos.length > 0 || form.special_notes.trim() ? 1 : 0, borderBottomColor: C.borderLight }}>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>Items / Details</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{form.other_furniture.trim()}</Text>
                  </View>
                ) : null}
                {form.furniture_images.length > 0 ? (
                  <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: form.furniture_videos.length > 0 || form.special_notes.trim() ? 1 : 0, borderBottomColor: C.borderLight }}>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
                      Photos · {form.furniture_images.length} {form.furniture_images.length !== 1 ? 'images' : 'image'}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {form.furniture_images.map((uri, i) => (
                        <Image
                          key={i}
                          source={{ uri }}
                          style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: C.borderLight }}
                          resizeMode="cover"
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
                {form.furniture_videos.length > 0 ? (
                  <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: form.special_notes.trim() ? 1 : 0, borderBottomColor: C.borderLight }}>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
                      Videos · {form.furniture_videos.length} {form.furniture_videos.length !== 1 ? 'videos' : 'video'}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {form.furniture_videos.map((_uri, i) => (
                        <View key={i} style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="play-circle" size={28} color="#fff" />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
                {form.special_notes.trim() ? (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>Special Notes</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{form.special_notes.trim()}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ── Terms & Conditions ── */}
            <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
              <TouchableOpacity
                onPress={() => setTermsExpanded(e => !e)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}
              >
                <View style={{
                  width: 34, height: 34, borderRadius: 10,
                  backgroundColor: agreedToTerms ? 'rgba(22,163,74,0.15)' : 'rgba(219,39,119,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name={agreedToTerms ? 'check-circle' : 'file-text'} size={16} color={agreedToTerms ? '#16a34a' : Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Booking Terms & Conditions</Text>
                  <Text style={{ fontSize: 11, marginTop: 1, color: agreedToTerms ? '#16a34a' : C.textSecondary }}>
                    {agreedToTerms ? '✓ Agreed — tap to review' : termsExpanded ? 'Scroll to the bottom to agree' : 'Required — tap to read & agree'}
                  </Text>
                </View>
                {!agreedToTerms && !termsExpanded && (
                  <View style={{ backgroundColor: '#fee2e2', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#dc2626' }}>Required</Text>
                  </View>
                )}
                <Feather name={termsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
              </TouchableOpacity>

              {termsExpanded && (
                <View style={{ borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, gap: 14 }}>
                  {([
                    {
                      icon: 'tag' as const,
                      title: 'Pricing & Final Quote',
                      items: [
                        'Estimated price is not final and subject to admin confirmation.',
                        'Extra charges may apply for larger areas or additional items found on-site.',
                        'You will be informed of any price changes before service starts.',
                      ],
                    },
                    {
                      icon: 'x-circle' as const,
                      title: 'Cancellation Policy',
                      items: [
                        'Free cancellation if requested at least 24 hours before service.',
                        'Cancellations within 24 hours incur a ₱200 fee.',
                        'Cancelling after the cleaner is in transit or on-site incurs a minimum ₱300 fee.',
                        'No-shows are treated as same-day cancellations.',
                      ],
                    },
                    {
                      icon: 'calendar' as const,
                      title: 'Rescheduling',
                      items: [
                        'Rescheduling must be requested at least 24 hours in advance.',
                        'Subject to cleaner availability.',
                        'Same-day rescheduling is treated as a cancellation.',
                      ],
                    },
                    {
                      icon: 'user-check' as const,
                      title: 'Customer Responsibilities',
                      items: [
                        'Ensure property access at the scheduled time.',
                        'Provide accurate booking details to avoid additional charges.',
                        'Secure valuables and pets before the cleaner arrives.',
                      ],
                    },
                    {
                      icon: 'credit-card' as const,
                      title: 'Payment Terms',
                      items: [
                        'Digital payments must be submitted and verified before the service date.',
                        'Cash is collected by the cleaner upon arrival.',
                        'Booking remains pending until payment is confirmed.',
                      ],
                    },
                    {
                      icon: 'shield' as const,
                      title: 'Liability',
                      items: [
                        'We are not liable for pre-existing damage to property or fixtures.',
                        'Report any damage caused by our cleaner within 24 hours.',
                        'Liability is limited to the value of the service rendered.',
                      ],
                    },
                  ] as Array<{ icon: React.ComponentProps<typeof Feather>['name']; title: string; items: string[] }>).map((section, si, arr) => (
                    <View key={section.title} style={{ gap: 6, paddingBottom: si < arr.length - 1 ? 14 : 0, borderBottomWidth: si < arr.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: 'rgba(219,39,119,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name={section.icon} size={12} color={Colors.primary} />
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>
                          {section.title}
                        </Text>
                      </View>
                      {section.items.map((item, i) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 7, paddingLeft: 4 }}>
                          <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>•</Text>
                          <Text style={{ flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  ))}

                  {/* ── Agree checkbox — at the very bottom of T&C ── */}
                  <View style={{ borderTopWidth: 1.5, borderTopColor: C.border, paddingTop: 16 }}>
                    <TouchableOpacity
                      onPress={() => setAgreedToTerms(v => !v)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14,
                        borderRadius: 14, borderWidth: 1.5,
                        borderColor: agreedToTerms ? Colors.primary : C.border,
                        backgroundColor: agreedToTerms ? C.primaryBg : C.background,
                      }}
                    >
                      <View style={{
                        width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                        borderColor: agreedToTerms ? Colors.primary : C.border,
                        backgroundColor: agreedToTerms ? Colors.primary : 'transparent',
                        alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
                      }}>
                        {agreedToTerms && <Feather name="check" size={13} color="#fff" />}
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 20 }}>
                        I have read and agree to the{' '}
                        <Text style={{ fontWeight: '700', color: Colors.primary }}>Booking Terms & Conditions</Text>
                        , including the pricing policy and cancellation fees.
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <View style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Feather name="cpu" size={16} color="#16a34a" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: '#15803d', lineHeight: 18 }}>
                Once you confirm and submit, we'll automatically match your booking with the nearest available cleaner based on your service location and schedule — no manual searching needed.
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
                {getService(currentServiceSlug ?? '')?.name ?? SERVICE_LABELS[form.service_type!]}{needsSqm && form.property_sqm ? ` · ${form.property_sqm} sqm` : ''} · {form.service_date ? formatDisplayDate(form.service_date) : ''} at {form.service_time ? formatDisplayTime(form.service_time) : ''}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d', marginTop: 6 }}>
                Est. Price: ₱{estimateBookingPrice(currentServiceSlug, form.service_type!, needsSqm ? parseFloat(form.property_sqm) || 0 : 0).toLocaleString()}
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

            {/* ── PayMongo online payment (QRPh — gcash/maya/bank_transfer) ── */}
            {PAYMONGO_ENABLED && isPaymongoMethod(form.payment_method) && (
              <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <QrphLogo width={28} height={28} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>Secure Online Payment</Text>
                    <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 1 }}>Powered by PayMongo</Text>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: C.borderLight }} />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>Amount to pay</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>
                    ₱{estimateBookingPrice(currentServiceSlug, form.service_type!, needsSqm ? parseFloat(form.property_sqm) || 0 : 0).toLocaleString()}
                  </Text>
                </View>

                {[
                  'Tap "Confirm Booking" to create your booking and open the secure payment page.',
                  'Pay with GCash, Maya, or any bank app by scanning the on-screen QR.',
                  'Your booking updates to "Paid" automatically once payment goes through.',
                ].map((line, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <Feather name="check-circle" size={14} color="#16a34a" style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>{line}</Text>
                  </View>
                ))}

                <View style={{ backgroundColor: C.background, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Feather name="info" size={13} color={C.textMuted} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 11, color: C.textMuted, lineHeight: 16 }}>
                    You can also pay later from your booking details if you close the payment page.
                  </Text>
                </View>
              </View>
            )}

            {!PAYMONGO_ENABLED && (isWallet(form.payment_method) || form.payment_method === 'bank_transfer') && (
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
                    bankAccounts === undefined ? (
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>Loading payment details...</Text>
                    ) : bankAccounts.length === 0 ? (
                      <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '500', lineHeight: 18 }}>
                        Bank transfer is currently unavailable. Please choose another payment method.
                      </Text>
                    ) : (
                      <View style={{ gap: 10 }}>
                        {bankAccounts.length > 1 && (
                          <View>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                              Select Bank
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                              {bankAccounts.map((bank, i) => (
                                <TouchableOpacity
                                  key={i}
                                  onPress={() => setSelectedBankIdx(i)}
                                  style={{
                                    paddingHorizontal: 14, paddingVertical: 8,
                                    borderRadius: 10, borderWidth: 1.5,
                                    borderColor: selectedBankIdx === i ? Colors.primary : C.border,
                                    backgroundColor: selectedBankIdx === i ? Colors.primary + '15' : C.white,
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 13, fontWeight: '700',
                                    color: selectedBankIdx === i ? Colors.primary : C.text,
                                  }}>
                                    {bank.bank_name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}
                        <View style={{ gap: 6 }}>
                          <BankRow label="Bank"         value={bankAccounts[selectedBankIdx].bank_name}      C={C} />
                          <BankRow label="Account No."  value={bankAccounts[selectedBankIdx].account_number} C={C} />
                          <BankRow label="Account Name" value={bankAccounts[selectedBankIdx].account_name}   C={C} />
                        </View>
                      </View>
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
                    onChangeText={t => update('payment_reference', form.payment_method === 'gcash' ? t.replace(/\D/g, '').slice(0, 13) : t)}
                    placeholder={form.payment_method === 'gcash' ? '13-digit GCash reference' : form.payment_method === 'maya' ? 'Maya reference number' : 'e.g. REF-20240625-001'}
                    placeholderTextColor={C.textMuted}
                    keyboardType={form.payment_method === 'gcash' ? 'number-pad' : 'default'}
                    maxLength={form.payment_method === 'gcash' ? 13 : undefined}
                    style={{
                      backgroundColor: C.background, borderWidth: 1.5,
                      borderColor: form.payment_reference.trim() ? Colors.primary : C.border,
                      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      fontSize: 15, color: C.text,
                    }}
                  />
                  {form.payment_method === 'gcash' && (
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

            {/* Bank Check is always a manual, off-platform method — never PayMongo. */}
            {form.payment_method === 'bank_check' && (
              <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 }}>
                <View style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#bfdbfe', gap: 12 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Make check payable to:
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e3a8a' }}>
                      {paymentSettings.check_payable_to ?? 'Loading...'}
                    </Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: '#bfdbfe' }} />
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Deliver check to:
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e3a8a', lineHeight: 20 }}>
                      {paymentSettings.check_delivery_address ?? 'Loading...'}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
                  Admin will verify receipt of the check before confirming your booking. No upload or reference number is required.
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

      {qrBookingId && (
        <PaymongoQrModal
          visible={showQrModal}
          bookingId={qrBookingId}
          onPaid={closeQrModalAndNavigate}
          onClose={closeQrModalAndNavigate}
          customerName={qrPaymentSummary?.customerName || undefined}
          customerEmail={qrPaymentSummary?.customerEmail || undefined}
          customerPhone={qrPaymentSummary?.customerPhone || undefined}
          serviceLabel={qrPaymentSummary?.serviceLabel}
          amount={qrPaymentSummary?.amount}
          bookingRef={qrBookingId.slice(0, 8).toUpperCase()}
        />
      )}
    </KeyboardAvoidingView>
  )
}

// ─── Additional details helpers ─────────────────────────────────────────────

function getAdditionalDetailsHint(slug: string | undefined): string {
  if (slug === 'aircon_cleaning' || slug === 'aircon_freon_charging' || slug === 'aircon_repair')
    return 'Share any relevant aircon details (e.g. brand, model, location of units, known issues).'
  if (slug === 'grease_trap_cleaning' || slug === 'grease_trap_installation')
    return 'Include grease trap size, location, or any access instructions for our team.'
  if (slug === 'mattress_deep_cleaning')
    return 'Include mattress sizes (single, queen, king) or any specific stain/odor issues.'
  if (slug === 'sofa_couch_deep_cleaning')
    return 'Describe fabric type, color, or any stains/pet hair our team should know about.'
  if (slug === 'carpet_cleaning')
    return 'Note carpet material, colors, or specific stain areas that need extra attention.'
  if (slug === 'curtain_dry_cleaning')
    return 'Include number of curtain panels, fabric type, or any special handling notes.'
  return 'List any other furniture or items that need cleaning (e.g. 2 beds, 4 dining chairs).'
}

function getAdditionalDetailsPlaceholder(slug: string | undefined): string {
  if (slug === 'aircon_cleaning' || slug === 'aircon_freon_charging' || slug === 'aircon_repair')
    return 'e.g. 2 wall-mounted units (Samsung), 1 window type unit in bedroom'
  if (slug === 'grease_trap_cleaning' || slug === 'grease_trap_installation')
    return 'e.g. 500L trap under the kitchen sink, access through back door'
  if (slug === 'mattress_deep_cleaning')
    return 'e.g. 1 queen, 2 single — coffee stain on the queen mattress'
  if (slug === 'sofa_couch_deep_cleaning')
    return 'e.g. L-shaped fabric sofa, light gray — pet hair and odor issues'
  if (slug === 'carpet_cleaning')
    return 'e.g. 2 wool rugs (3x4m), red wine stain on the living room carpet'
  if (slug === 'curtain_dry_cleaning')
    return 'e.g. 6 linen panels (floor-length), blackout curtains in master bedroom'
  return 'e.g. 2 beds, 4 dining chairs, 1 office chair'
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
