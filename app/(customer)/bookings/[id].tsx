import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, Alert, RefreshControl, Image, Platform, Animated,
  Keyboard,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps'
import { Feather, Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'
import JobLocationModal from '@/components/JobLocationModal'
import LocationMapPicker, { Coord, GeocodedParts } from '@/components/LocationMapPicker'
import {
  Booking, BookingStatus, Feedback,
  STATUS_LABELS,
} from '@/constants/types'
import { useServices } from '@/hooks/useServices'
import { PAYMONGO_ENABLED } from '@/constants/config'
import { startPaymongoCheckout, isPaymongoMethod } from '@/lib/paymongo'
import GCashLogo from '@/assets/gcash_logo.svg'
import MayaLogo from '@/assets/maya_logo.svg'
import QrphLogo from '@/assets/qrph_logo.svg'

// ── Constants ─────────────────────────────────────────────────────────────────


const STATUS_COLORS: Record<BookingStatus, string> = {
  pending:     '#ca8a04',
  confirmed:   Colors.primary,
  in_progress: '#7c3aed',
  completed:   '#16a34a',
  cancelled:   '#dc2626',
}

const STATUS_ICONS: Record<BookingStatus, keyof typeof Feather.glyphMap> = {
  pending:     'clock',
  confirmed:   'check-circle',
  in_progress: 'wind',
  completed:   'award',
  cancelled:   'x-circle',
}

const PROGRESS_STEPS: BookingStatus[] = ['pending', 'confirmed', 'in_progress', 'completed']

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash on Service Day',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  bank_check:    'Bank Check',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BookingDetail = Booking & {
  cleaner_assignments?: Array<{
    status: string
    cleaner_id: string | null
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtEta(min: number) {
  if (min < 60) return `~${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtCreatedAt(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const h = d.getHours(), m = d.getMinutes()
  const time = `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  return `${date} · ${time}`
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const { getService } = useServices()
  const C       = useThemeColors()
  const { isDark } = useTheme()

  const [booking,          setBooking]          = useState<BookingDetail | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [deleted,          setDeleted]          = useState(false)
  const [paymentSettings,  setPaymentSettings]  = useState<Record<string, string>>({})
  const [existingFeedback, setExistingFeedback] = useState<Feedback | null | undefined>(undefined)
  const [rating,           setRating]           = useState(0)
  const [comment,          setComment]          = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [refreshing,       setRefreshing]       = useState(false)
  const [cancelling,       setCancelling]       = useState(false)
  const [paying,           setPaying]           = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [savingLocation,     setSavingLocation]     = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const [kbHeight, setKbHeight] = useState(0)

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      setKbHeight(e.endCoordinates.height)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  const [cleanerMapModal, setCleanerMapModal] = useState<{ lat: number; lng: number; name: string | null; address: string } | null>(null)
  const [assignedCleaners, setAssignedCleaners] = useState<Array<{
    id: string
    name: string | null
    photoUrl: string | null
    eta: { distKm: number; etaMin: number } | null
    location: { lat: number; lng: number } | null
  }>>([])

  useEffect(() => { load() }, [id])

  // Live booking updates via Realtime
  useEffect(() => {
    if (!id) return
    const ch = supabase
      .channel(`bk-detail-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => setDeleted(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaner_assignments', filter: `booking_id=eq.${id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])

  // Poll every 7 s as Realtime fallback so status always stays current
  useEffect(() => {
    if (!id) return
    const iv = setInterval(load, 7000)
    return () => clearInterval(iv)
  }, [id])

  // Auto-redirect 3 s after deletion
  useEffect(() => {
    if (!deleted) return
    const t = setTimeout(() => router.replace('/(customer)/' as any), 3000)
    return () => clearTimeout(t)
  }, [deleted])


  async function load() {
    const { data: bk } = await supabase
      .from('bookings')
      .select('*, cleaner_assignments(status, cleaner_id, en_route_lat, en_route_lng, en_route_at)')
      .eq('id', id)
      .maybeSingle()

    if (!bk) { setDeleted(true); setLoading(false); setRefreshing(false); return }

    // Payment instructions for GCash / bank transfer (legacy manual flow only —
    // under PayMongo the hosted checkout page shows all payment details).
    if (!PAYMONGO_ENABLED && (bk.payment_method === 'gcash' || bk.payment_method === 'bank_transfer')) {
      const { data: settings } = await supabase
        .from('settings').select('key, value')
        .in('key', ['gcash_number', 'bank_accounts'])
      const map: Record<string, string> = {}
      ;(settings ?? []).forEach((s: { key: string; value: string }) => { map[s.key] = s.value })
      setPaymentSettings(map)
    }

    // Feedback for completed bookings
    if (bk.status === 'completed') {
      const { data: fb } = await supabase
        .from('feedback').select('*').eq('booking_id', id).maybeSingle()
      setExistingFeedback(fb as Feedback | null)
    }

    // Fetch all assigned cleaners — each row has a distinct cleaner_id.
    // Location comes from the assignment's own en-route geotag (captured
    // once, when the cleaner taps "Start Trip"), not profiles.home_lat/lng —
    // that column is the admin-set static home address, a different thing.
    const assignedRows: any[] = ((bk.cleaner_assignments as any[]) ?? [])
      .filter((a: any) => a.cleaner_id && a.status !== 'declined')

    if (assignedRows.length > 0) {
      const cleaners = await Promise.all(assignedRows.map(async (a: any) => {
        const { data: profile } = await supabase.from('profiles').select('full_name, photo_url').eq('id', a.cleaner_id).maybeSingle()
        const cLat = a.en_route_lat
        const cLng = a.en_route_lng
        const location = cLat != null && cLng != null ? { lat: cLat, lng: cLng } : null
        const eta = location && bk.service_lat && bk.service_lng
          ? (() => { const d = haversineKm(cLat, cLng, bk.service_lat, bk.service_lng); return { distKm: d, etaMin: Math.round(d / 30 * 60) } })()
          : null
        return { id: a.cleaner_id as string, name: (profile as any)?.full_name ?? null, photoUrl: (profile as any)?.photo_url ?? null, eta, location }
      }))
      setAssignedCleaners(cleaners)
    } else {
      setAssignedCleaners([])
    }

    setBooking(bk as BookingDetail)
    setLoading(false)
    setRefreshing(false)
  }

  async function submitFeedback() {
    if (rating === 0) { Alert.alert('Rating required', 'Please select a star rating.'); return }
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated.')
      const cleaner_id = assignedCleaners[0]?.id ?? null
      const { error } = await supabase.from('feedback').insert({
        booking_id: id, customer_id: user.id, cleaner_id, rating, comment: comment.trim() || null,
      })
      if (error) throw error
      setExistingFeedback({ id: '', booking_id: id!, cleaner_id: cleaner_id ?? '', rating, comment, created_at: '' })
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not submit feedback.')
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelBooking() {
    if (!booking) return
    const hasEnRoute = !!booking.cleaner_en_route_at

    Alert.alert(
      'Cancel Booking',
      hasEnRoute
        ? 'Our cleaner is already in transit or has arrived at your location.\n\nPer our cancellation policy, a Transportation/Gas Fee will be charged for last-minute cancellations. Do you still want to cancel?'
        : 'Cancellation is free of charge when done ahead of time.\n\nAre you sure you want to cancel this booking?',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true)
            try {
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) throw new Error('Not authenticated.')

              const { error } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', id)
                .eq('customer_id', user.id)
              if (error) throw error

              await supabase
                .from('cleaner_assignments')
                .update({ status: 'declined' })
                .eq('booking_id', id)

              await supabase.from('notifications').insert({
                user_id: user.id,
                title: 'Booking Cancelled',
                body: hasEnRoute
                  ? 'Your booking has been cancelled. Per our last-minute cancellation policy, a Transportation/Gas Fee applies. Our team will follow up with the details.'
                  : 'Your booking has been successfully cancelled. No charges apply.',
                type: 'info',
              })

              for (const cleaner of assignedCleaners) {
                await supabase.from('notifications').insert({
                  user_id: cleaner.id,
                  title: 'Booking Cancelled by Customer',
                  body: hasEnRoute
                    ? 'The customer cancelled after you were already in transit or on-site. Per company policy, you are entitled to a Transportation/Gas Fee. Please contact admin for details.'
                    : 'The customer has cancelled their booking. No charges apply.',
                  type: 'info',
                })
              }

              await load()
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not cancel booking.')
            } finally {
              setCancelling(false)
            }
          },
        },
      ]
    )
  }

  async function handlePayNow() {
    if (!booking || paying) return
    setPaying(true)
    try {
      const result = await startPaymongoCheckout(booking.id)
      if (result.status === 'error') {
        Alert.alert('Payment', result.message)
      }
      // Refetch either way — payment is confirmed server-side by the PayMongo
      // webhook, so the freshly-loaded row reflects the real status.
      await load()
    } catch (err) {
      // startPaymongoCheckout typically returns a typed error instead of throwing,
      // but WebBrowser.openBrowserAsync itself can still throw — without this, that
      // failure was silent (button just looked like it did nothing).
      console.error('[handlePayNow] unexpected error:', err)
      Alert.alert('Payment', 'Something went wrong opening the payment page. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  // Bookings created by an admin (phone-in/walk-in) don't get a GPS pin at
  // creation time — only the customer's own device can set one accurately.
  // Reuses the same picker as the new-booking flow; only the coordinates are
  // saved here since the address fields were already entered by the admin.
  async function handleConfirmLocation(coord: Coord, _address: string, _city: string, _parts: GeocodedParts) {
    if (!booking) return
    setSavingLocation(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated.')

      const { error } = await supabase
        .from('bookings')
        .update({ service_lat: coord.latitude, service_lng: coord.longitude })
        .eq('id', booking.id)
        .eq('customer_id', user.id)
      if (error) throw error

      setShowLocationPicker(false)
      await load()
    } catch (err: any) {
      Alert.alert('Couldn\'t save location', err?.message ?? 'Please try again.')
    } finally {
      setSavingLocation(false)
    }
  }

  // ── Loading / deleted states ─────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (deleted || !booking) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <AppHeader showBack onBackPress={() => router.replace('/(customer)/' as any)} title="Booking Details" hideBell />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{
            width: 88, height: 88, borderRadius: 44,
            backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <Feather name="trash-2" size={38} color="#dc2626" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 10 }}>
            Booking Removed
          </Text>
          <Text style={{ fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
            This booking has been removed by the administrator.
          </Text>
          <Text style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 36 }}>
            If you believe this is a mistake, please reach out through the Support tab.
          </Text>
          <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>Redirecting to home…</Text>
          <TouchableOpacity
            onPress={() => router.replace('/(customer)/' as any)}
            style={{
              paddingHorizontal: 32, paddingVertical: 14,
              backgroundColor: Colors.primary, borderRadius: 14,
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Derived display values ───────────────────────────────────────────────

  // Look up the exact service from local catalog using the slug saved on the booking.
  // This is the source of truth for name, image, accent color, category, and icon.
  // service_slug was backfilled on existing bookings and is saved on all new ones.
  const svc         = booking.service_slug ? getService(booking.service_slug) : undefined
  const serviceName = svc?.name ?? booking.service_name ?? 'Cleaning Service'
  const svcImage    = svc?.image ?? null
  const svcAccent   = svc?.accent ?? Colors.primary
  const svcCategory = (svc?.category ?? 'Cleaning').toUpperCase()
  const svcIcon     = (svc?.placeholderIcon ?? 'home') as keyof typeof Feather.glyphMap

  const progressIdx  = PROGRESS_STEPS.indexOf(booking.status as BookingStatus)
  const statusColor  = STATUS_COLORS[booking.status as BookingStatus]
  const cleanerNames = assignedCleaners.map(c => c.name ?? 'Unknown').join(' & ')

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader showBack onBackPress={() => router.back()} title="Booking Details" hideBell />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: kbHeight > 0 ? kbHeight + 24 : 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load() }}
            tintColor={isDark ? '#ffffff' : Colors.primary}
            colors={isDark ? ['#ffffff'] : [Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
          />
        }
      >

        {/* ── Status banner ── */}
        {booking.status === 'pending' && (
          <StatusBanner icon="clock" title="Awaiting Confirmation"
            body="Our team is reviewing your booking and will confirm it shortly."
            bg="#fff7ed" accent="#f59e0b" titleColor="#78350f" bodyColor="#92400e" />
        )}
        {booking.status === 'confirmed' && (
          <StatusBanner icon="check-circle" title="Booking Confirmed"
            body={assignedCleaners.length > 0 ? `${cleanerNames} has been assigned to your booking.` : 'Your booking is confirmed. A cleaner will be assigned soon.'}
            bg="#fdf2f8" accent={Colors.primary} titleColor="#831843" bodyColor="#9d174d" />
        )}
        {booking.status === 'in_progress' && (
          <StatusBanner icon="wind" title="Cleaning in Progress"
            body={assignedCleaners.length > 0 ? `${cleanerNames} is currently cleaning your space.` : 'Your space is currently being cleaned.'}
            bg="#f5f3ff" accent="#7c3aed" titleColor="#4c1d95" bodyColor="#5b21b6" live />
        )}
        {booking.status === 'completed' && (
          <StatusBanner icon="check-circle" title="Service Completed"
            body="Your space has been cleaned. We hope you're satisfied with the service!"
            bg="#f0fdf4" accent="#16a34a" titleColor="#14532d" bodyColor="#166534" />
        )}

        {/* ── Hero card — image stacked above content ── */}
        <View style={{ margin: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#0f172a' }}>
          {svcImage && (
            <Image source={svcImage} style={{ width: '100%', height: 180 }} resizeMode="cover" />
          )}
          <HeroContent
            booking={booking}
            serviceName={serviceName}
            accent={svcAccent}
            category={svcCategory}
            icon={svcIcon}
            statusColor={statusColor}
          />
        </View>

        {/* ── Progress tracker ── */}
        {booking.status !== 'cancelled' ? (
          <View style={{
            marginHorizontal: 16, marginBottom: 14, padding: 20,
            backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {PROGRESS_STEPS.map((s, i) => {
                const done   = i < progressIdx
                const active = i === progressIdx
                return (
                  <View key={s} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                      <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : (done || active) ? Colors.primary : C.border }} />
                      <View style={{
                        width: 30, height: 30, borderRadius: 15,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: (done || active) ? Colors.primary : C.borderLight,
                      }}>
                        {(done || active)
                          ? <Feather name="check" size={14} color="#fff" />
                          : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.textMuted }} />
                        }
                      </View>
                      <View style={{ flex: 1, height: 2, backgroundColor: i === PROGRESS_STEPS.length - 1 ? 'transparent' : (done || active) ? Colors.primary : C.border }} />
                    </View>
                    <Text style={{
                      fontSize: 9, fontWeight: '700', marginTop: 7, textAlign: 'center', lineHeight: 13,
                      color: (done || active) ? Colors.primary : C.textMuted, letterSpacing: 0.2,
                    }}>
                      {STATUS_LABELS[s]}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        ) : (
          <View style={{
            marginHorizontal: 16, marginBottom: 14,
            backgroundColor: '#fee2e2', borderRadius: 16, borderWidth: 1, borderColor: '#fca5a5',
            padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#dc2626' }}>Booking Cancelled</Text>
              <Text style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>Contact support if you need assistance.</Text>
            </View>
          </View>
        )}


{/* ── Payment ── */}
        <View style={{
          marginHorizontal: 16, marginBottom: 14,
          backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
        }}>
          <View style={{ backgroundColor: C.background, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Payment
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
            <Text style={{ flex: 1, fontSize: 13, color: C.textSecondary }}>Method</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {PAYMONGO_ENABLED && isPaymongoMethod(booking.payment_method) ? (
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' }}>
                  <QrphLogo width={28} height={28} />
                </View>
              ) : (
                <>
                  {booking.payment_method === 'gcash' && (
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' }}>
                      <GCashLogo width={28} height={28} />
                    </View>
                  )}
                  {booking.payment_method === 'maya' && (
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <MayaLogo width={26} height={8} />
                    </View>
                  )}
                  {booking.payment_method === 'bank_transfer' && (
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#1d4ed8', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="home" size={18} color="#fff" />
                    </View>
                  )}
                </>
              )}
              {booking.payment_method === 'cash' && (
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>₱</Text>
                </View>
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>
                {PAYMONGO_ENABLED && isPaymongoMethod(booking.payment_method)
                  ? 'Online Payment'
                  : PAYMENT_LABELS[booking.payment_method] ?? booking.payment_method}
              </Text>
            </View>
          </View>
          {([
            { label: 'Amount',    value: `₱${Number(booking.base_price).toLocaleString()}` },
            ...(booking.payment_reference ? [{ label: 'Reference', value: booking.payment_reference }] : []),
          ] as Array<{ label: string; value: string }>).map((row, i, arr) => (
            <View key={row.label} style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 18, paddingVertical: 13,
              borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.borderLight,
            }}>
              <Text style={{ flex: 1, fontSize: 13, color: C.textSecondary }}>{row.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{row.value}</Text>
            </View>
          ))}
        </View>
        {/* ── Pay Now (online-payment booking, still unpaid) ── */}
        {PAYMONGO_ENABLED
          && isPaymongoMethod(booking.payment_method)
          && booking.payment_status === 'unpaid'
          && booking.status !== 'cancelled'
          && booking.status !== 'completed' && (
          <View style={{
            marginHorizontal: 16, marginBottom: 14,
            backgroundColor: C.white, borderRadius: 18,
            borderWidth: 1, borderColor: C.border, overflow: 'hidden',
          }}>
            <View style={{
              backgroundColor: '#fff7ed', paddingHorizontal: 18, paddingVertical: 13,
              borderBottomWidth: 1, borderBottomColor: '#fed7aa',
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Feather name="alert-circle" size={16} color="#c2410c" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#9a3412', flex: 1 }}>
                Payment Required
              </Text>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 19 }}>
                Complete your secure online payment of{' '}
                <Text style={{ fontWeight: '800', color: C.text }}>₱{Number(booking.base_price).toLocaleString()}</Text>
                {' '}via PayMongo to confirm this booking.
              </Text>
              <TouchableOpacity
                onPress={handlePayNow}
                disabled={paying}
                activeOpacity={0.85}
                style={{
                  backgroundColor: Colors.primary, borderRadius: 12,
                  paddingVertical: 14, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: paying ? 0.7 : 1,
                }}
              >
                {paying
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Feather name="lock" size={15} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Pay Now</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Location ── */}
        <View style={{
          marginHorizontal: 16, marginBottom: 14, padding: 20,
          backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 16 }}>
            Service Location
          </Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ alignItems: 'center', paddingTop: 3 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary }} />
              <View style={{ width: 1.5, flex: 1, minHeight: booking.service_lat ? 32 : 0, backgroundColor: C.border, marginVertical: 5 }} />
              {booking.service_lat && (
                <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, borderColor: Colors.primary, backgroundColor: C.white }} />
              )}
            </View>
            <View style={{ flex: 1, gap: 18 }}>
              <View>
                <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>Address</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
                  {[booking.address_unit, booking.address_street].filter(Boolean).join(', ') || '—'}
                </Text>
                <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
                  {[booking.address_city, booking.address_province].filter(Boolean).join(', ')}
                </Text>
              </View>
              {booking.address_barangay ? (
                <View>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>Barangay</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>
                    {booking.address_barangay}
                  </Text>
                </View>
              ) : null}
              {!booking.service_lat && booking.status !== 'completed' && booking.status !== 'cancelled' && (
                <View>
                  <TouchableOpacity
                    onPress={() => setShowLocationPicker(true)}
                    disabled={savingLocation}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: Colors.primary + '12', borderRadius: 12,
                      borderWidth: 1, borderColor: Colors.primary + '30',
                      paddingVertical: 12, opacity: savingLocation ? 0.6 : 1,
                    }}
                  >
                    {savingLocation
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Feather name="map-pin" size={15} color={Colors.primary} />
                    }
                    <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary }}>
                      Pin your exact location
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 15 }}>
                    Help your cleaner find you faster — pin your location using GPS for more accuracy than the typed address.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Assigned cleaner cards (one per cleaner) ── */}
        {assignedCleaners.map((cleaner) => (
          <View key={cleaner.id} style={{
            marginHorizontal: 16, marginBottom: 14,
            borderRadius: 20, overflow: 'hidden',
            backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
          }}>
            <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {cleaner.photoUrl ? (
                <Image
                  source={{ uri: cleaner.photoUrl }}
                  style={{ width: 52, height: 52, borderRadius: 26 }}
                />
              ) : (
                <View style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: '#f1f5f9',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#475569' }}>
                    {(cleaner.name ?? '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                  Assigned Cleaner
                </Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3 }}>{cleaner.name ?? 'Unknown'}</Text>
              </View>
              <View style={{ backgroundColor: '#fdf2f8', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#fbcfe8' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>✓ Assigned</Text>
              </View>
            </View>

            {/* ETA + Maps — only for active statuses */}
            {(booking.status === 'confirmed' || booking.status === 'in_progress') && (
              <View style={{ padding: 16, gap: 12 }}>

                {/* ETA tile */}
                {cleaner.eta && (
                  <View style={{
                    backgroundColor: C.background, borderRadius: 14, padding: 16,
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    borderWidth: 1, borderColor: C.border,
                  }}>
                    <View style={{
                      width: 48, height: 48, borderRadius: 24,
                      backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Feather name="navigation" size={22} color="#475569" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                        Est. Travel Time
                      </Text>
                      <Text style={{ fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5 }}>
                        {fmtEta(cleaner.eta.etaMin)}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 1 }}>
                        {cleaner.eta.distKm.toFixed(1)} km from cleaner's location
                      </Text>
                    </View>
                  </View>
                )}

                {/* Cleaner is on the way — shown once location is tagged, before arrival */}
                {booking.status === 'confirmed' && cleaner.location && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: '#eff6ff', borderRadius: 12, padding: 12,
                    borderWidth: 1, borderColor: '#bfdbfe',
                  }}>
                    <Feather name="navigation" size={15} color="#1d4ed8" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e40af' }}>
                        Cleaner is on the way
                      </Text>
                      <Text style={{ fontSize: 11, color: '#3b82f6', marginTop: 1 }}>
                        {cleaner.name?.split(' ')[0] ?? 'Your cleaner'} has tagged their location
                      </Text>
                    </View>
                  </View>
                )}

                {/* Cleaner location — inline map + opens full-screen modal on tap */}
                {cleaner.location ? (
                  <TouchableOpacity
                    onPress={() => setCleanerMapModal({ ...cleaner.location!, name: cleaner.name, address: 'Cleaner\'s Location' })}
                    activeOpacity={0.88}
                    style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}
                  >
                    <MapView
                      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
                      style={{ height: 120 }}
                      region={{
                        latitude: cleaner.location.lat,
                        longitude: cleaner.location.lng,
                        latitudeDelta: 0.008,
                        longitudeDelta: 0.008,
                      }}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      rotateEnabled={false}
                      pitchEnabled={false}
                      pointerEvents="none"
                    >
                      <Marker
                        coordinate={{ latitude: cleaner.location.lat, longitude: cleaner.location.lng }}
                        pinColor={Colors.primary}
                      />
                    </MapView>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: C.white, paddingVertical: 11, paddingHorizontal: 14,
                    }}>
                      <View style={{
                        width: 34, height: 34, borderRadius: 17,
                        backgroundColor: '#fce7f3', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Feather name="map-pin" size={16} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>
                          View Cleaner's Location
                        </Text>
                        <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                          Tap to view on map
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={C.textMuted} />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Feather name="info" size={14} color={C.textMuted} />
                    <Text style={{ fontSize: 12, color: C.textMuted, flex: 1 }}>
                      Cleaner location not set yet.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ))}



        {/* ── Special notes ── */}
        {booking.special_notes && (
          <View style={{
            marginHorizontal: 16, marginBottom: 14,
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
              Special Notes
            </Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>{booking.special_notes}</Text>
          </View>
        )}

        {/* ── Contact Admin (cancellation charges / refunds) ── */}
        {booking.status === 'cancelled' && (
          <View style={{
            marginHorizontal: 16, marginBottom: 14,
            backgroundColor: C.white, borderRadius: 18,
            borderWidth: 1, borderColor: C.border, overflow: 'hidden',
          }}>
            <View style={{
              backgroundColor: '#eff6ff', paddingHorizontal: 18, paddingVertical: 14,
              borderBottomWidth: 1, borderBottomColor: '#bfdbfe',
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Feather name="headphones" size={16} color="#1d4ed8" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e40af', flex: 1 }}>
                Questions about charges or refunds?
              </Text>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>
                If you were charged a Transportation/Gas Fee or would like to request a refund, you can message our admin team directly.
              </Text>
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: '/(customer)/support/new' as any,
                  params: {
                    subject: `Cancellation Charge / Refund — Booking #${booking.id.slice(0, 8).toUpperCase()}`,
                    message: `Hi, I would like to inquire about my cancelled booking #${booking.id.slice(0, 8).toUpperCase()} for ${serviceName} scheduled on ${fmtDate(booking.service_date)}.\n\n`,
                  },
                })}
                activeOpacity={0.85}
                style={{
                  backgroundColor: '#1d4ed8', borderRadius: 12,
                  paddingVertical: 13, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Feather name="message-circle" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Message Admin</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Rate & Feedback ── */}
        {booking.status === 'completed' && (
          <View style={{
            marginHorizontal: 16, marginBottom: 14,
            backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 20,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 16 }}>
              Rate Your Experience
            </Text>
            {existingFeedback ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1,2,3,4,5].map(n => (
                    <Ionicons key={n} name={n <= existingFeedback.rating ? 'star' : 'star-outline'} size={28} color={n <= existingFeedback.rating ? '#f59e0b' : C.border} />
                  ))}
                </View>
                {existingFeedback.comment && (
                  <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', fontStyle: 'italic' }}>
                    "{existingFeedback.comment}"
                  </Text>
                )}
                <Text style={{ fontSize: 12, color: C.textMuted }}>Thank you for your feedback!</Text>
              </View>
            ) : existingFeedback === null ? (
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                  {[1,2,3,4,5].map(n => (
                    <TouchableOpacity key={n} onPress={() => setRating(n)}>
                      <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={36} color={n <= rating ? '#f59e0b' : C.border} />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={comment} onChangeText={setComment}
                  placeholder="Share your experience (optional)..."
                  placeholderTextColor={C.textMuted}
                  multiline numberOfLines={3} textAlignVertical="top"
                  style={{
                    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
                    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                    fontSize: 14, color: C.text, minHeight: 80,
                  }}
                />
                <TouchableOpacity
                  onPress={submitFeedback} disabled={submitting}
                  style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Submit Review</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <ActivityIndicator color={Colors.primary} />
            )}
          </View>
        )}

        {/* ── Cancel Booking ── */}
        {(booking.status === 'pending' || booking.status === 'confirmed') && (
          <TouchableOpacity
            onPress={cancelBooking}
            disabled={cancelling}
            activeOpacity={0.8}
            style={{
              marginHorizontal: 16, marginBottom: 14,
              paddingVertical: 14, borderRadius: 14,
              borderWidth: 1.5, borderColor: '#dc2626',
              backgroundColor: '#fff5f5',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            {cancelling
              ? <ActivityIndicator color="#dc2626" size="small" />
              : <>
                  <Feather name="x-circle" size={16} color="#dc2626" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#dc2626' }}>Cancel Booking</Text>
                </>
            }
          </TouchableOpacity>
        )}

      </ScrollView>

      {cleanerMapModal && (
        <JobLocationModal
          visible
          coord={{ latitude: cleanerMapModal.lat, longitude: cleanerMapModal.lng }}
          serviceLabel={cleanerMapModal.name ?? 'Cleaner'}
          panelLabel="CLEANER LOCATION"
          address={cleanerMapModal.address}
          onClose={() => setCleanerMapModal(null)}
        />
      )}

      <LocationMapPicker
        visible={showLocationPicker}
        onConfirm={handleConfirmLocation}
        onClose={() => setShowLocationPicker(false)}
      />
    </View>
  )
}

// ── Hero content ──────────────────────────────────────────────────────────────

function HeroContent({
  booking, serviceName, accent, category, icon, statusColor,
}: {
  booking:     BookingDetail
  serviceName: string
  accent:      string
  category:    string
  icon:        keyof typeof Feather.glyphMap
  statusColor: string
}) {
  return (
    <View style={{ padding: 22 }}>

      {/* Decorative icon — top right */}
      <View style={{
        position: 'absolute', top: 20, right: 20,
        width: 76, height: 76, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Feather name={icon} size={34} color="#fff" style={{ opacity: 0.75 }} />
      </View>

      {/* Status badge + booking ID */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingRight: 90 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99,
          paddingHorizontal: 12, paddingVertical: 5,
        }}>
          <Feather name={STATUS_ICONS[booking.status as BookingStatus]} size={10} color={statusColor} />
          <Text style={{ fontSize: 11, fontWeight: '800', color: statusColor }}>
            {STATUS_LABELS[booking.status as BookingStatus]}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600', letterSpacing: 0.5 }}>
          #{booking.id.slice(0, 8).toUpperCase()}
        </Text>
      </View>

      {/* Category pill */}
      <View style={{
        alignSelf: 'flex-start', marginBottom: 8,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5 }}>
          {category}
        </Text>
      </View>

      {/* Service name */}
      <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4, letterSpacing: -0.5 }}>
        {serviceName}
      </Text>
      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 24 }}>
        {booking.space_type === 'residential' ? 'Residential'
          : booking.space_type === 'condo' ? 'Condo'
          : booking.space_type === 'office' ? 'Office'
          : 'Commercial'}{booking.property_sqm ? ` · ${booking.property_sqm} sqm` : ''}
        {booking.sofa_seaters ? ` · ${booking.sofa_seaters} sofa${booking.sofa_seaters !== 1 ? 's' : ''}` : ''}
      </Text>

      {/* Date / Time / Duration columns */}
      <View style={{ flexDirection: 'row', marginBottom: 22 }}>
        {[
          { label: 'Date', value: fmtDate(booking.service_date) },
          { label: 'Time', value: fmtTime(booking.service_time) },
          { label: 'Est.',  value: `~${booking.duration_hours}h` },
        ].map((col, i) => (
          <View key={col.label} style={{ flex: 1 }}>
            {i > 0 && (
              <View style={{ position: 'absolute', left: 0, top: 2, bottom: 2, width: 1, backgroundColor: 'rgba(255,255,255,0.18)' }} />
            )}
            <View style={{ paddingLeft: i > 0 ? 14 : 0, paddingRight: i < 2 ? 14 : 0 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, color: 'rgba(255,255,255,0.6)' }}>
                {col.label}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{col.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Booked on */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 }}>
        <Feather name="clock" size={10} color="rgba(255,255,255,0.45)" />
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '500' }}>
          Booked on {fmtCreatedAt(booking.created_at)}
        </Text>
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginBottom: 18 }} />

      {/* Price + Payment status */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, color: 'rgba(255,255,255,0.6)' }}>
            Est. Price
          </Text>
          <Text style={{ fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -1 }}>
            ₱{Number(booking.base_price).toLocaleString()}
          </Text>
        </View>
        <View style={{
          backgroundColor: booking.payment_status === 'paid' ? '#16a34a28' : booking.payment_status === 'refunded' ? '#7c3aed28' : 'rgba(255,255,255,0.1)',
          borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
          borderWidth: 1,
          borderColor: booking.payment_status === 'paid' ? '#16a34a50' : booking.payment_status === 'refunded' ? '#7c3aed50' : 'rgba(255,255,255,0.2)',
        }}>
          <Text style={{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3, color: booking.payment_status === 'paid' ? '#4ade80' : booking.payment_status === 'refunded' ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}>
            Payment
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: booking.payment_status === 'paid' ? '#4ade80' : booking.payment_status === 'refunded' ? '#c4b5fd' : 'rgba(255,255,255,0.85)' }}>
            {booking.payment_status === 'paid' ? '✓ Paid'
              : booking.payment_status === 'partial' ? 'Partially Paid'
              : booking.payment_status === 'refunded' ? 'Refunded'
              : booking.payment_method === 'cash' ? 'Awaiting Payment'
              : 'Pending Confirmation'}
          </Text>
        </View>
      </View>

      {/* Accent bottom strip */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: accent, opacity: 0.7 }} />
    </View>
  )
}

// ── Status Banner ─────────────────────────────────────────────────────────────

function StatusBanner({
  icon, title, body, bg, accent, titleColor, bodyColor, live,
}: {
  icon:       keyof typeof Feather.glyphMap
  title:      string
  body:       string
  bg:         string
  accent:     string
  titleColor: string
  bodyColor:  string
  live?:      boolean
}) {
  const dotAnim = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    if (!live) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dotAnim, { toValue: 1, duration: 620, useNativeDriver: true }),
      Animated.timing(dotAnim, { toValue: 0.35, duration: 620, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [live])

  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 14, borderRadius: 20, overflow: 'hidden', marginTop: 13,
      borderWidth: 1, borderColor: accent + '30',
      shadowColor: accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
    }}>
      <View style={{ backgroundColor: bg, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 16, backgroundColor: accent,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
          }}>
            <Feather name={icon} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, paddingTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: titleColor, letterSpacing: -0.2 }}>
                {title}
              </Text>
              {live && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Animated.View style={{
                    width: 7, height: 7, borderRadius: 3.5,
                    backgroundColor: accent, opacity: dotAnim,
                  }} />
                  <Text style={{ fontSize: 9, fontWeight: '800', color: accent, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Live
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 13, color: bodyColor, lineHeight: 19 }}>{body}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
