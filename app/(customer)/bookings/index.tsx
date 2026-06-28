import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, Alert, RefreshControl, Image, Linking,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Feather, Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'
import { Booking, BookingStatus, Feedback, STATUS_LABELS } from '@/constants/types'
import { getService } from '@/constants/services'
import GCashLogo from '@/assets/gcash_logo.svg'
import MayaLogo from '@/assets/maya_logo.svg'

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
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BookingDetail = Booking & {
  cleaner_assignments?: Array<{ status: string; cleaner_id: string | null }>
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

function starIcon(n: number, avg: number): 'star' | 'star-half' | 'star-outline' {
  if (avg >= n) return 'star'
  if (avg > n - 0.75) return 'star-half'
  return 'star-outline'
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CurrentBookingScreen() {
  const router  = useRouter()
  const C       = useThemeColors()
  const { isDark } = useTheme()

  const [booking,          setBooking]          = useState<BookingDetail | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [empty,            setEmpty]            = useState(false)
  const [refreshing,       setRefreshing]       = useState(false)
  const [unreadCount,      setUnreadCount]      = useState(0)
  const [paymentSettings,  setPaymentSettings]  = useState<Record<string, string>>({})
  const [existingFeedback, setExistingFeedback] = useState<Feedback | null | undefined>(undefined)
  const [rating,           setRating]           = useState(0)
  const [comment,          setComment]          = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [cleanerStats,     setCleanerStats]     = useState<{ avg: number; count: number } | null>(null)
  const [cleanerEta,       setCleanerEta]       = useState<{ distKm: number; etaMin: number } | null>(null)
  const [cleanerName,      setCleanerName]      = useState<string | null>(null)

  // Refresh whenever the tab is focused
  useFocusEffect(useCallback(() => { load() }, []))

  // Realtime + poll — keeps status current when cleaner updates booking or assignments
  useEffect(() => {
    if (!booking?.id) return
    const ch = supabase
      .channel(`cur-bk-${booking.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${booking.id}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cleaner_assignments', filter: `booking_id=eq.${booking.id}` }, () => load())
      .subscribe()
    const iv = setInterval(load, 7000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [booking?.id])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setEmpty(true); setLoading(false); setRefreshing(false); return }

    // Most recent non-cancelled booking (active or completed — excluded: cancelled only)
    const { data: bk } = await supabase
      .from('bookings')
      .select('*, cleaner_assignments(status, cleaner_id)')
      .eq('customer_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!bk) {
      setEmpty(true)
      setBooking(null)
      setLoading(false)
      setRefreshing(false)
      // Still fetch unread count for the bell
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count ?? 0)
      return
    }

    // Payment instructions
    if (bk.payment_method === 'gcash' || bk.payment_method === 'bank_transfer') {
      const { data: settings } = await supabase
        .from('settings').select('key, value')
        .in('key', ['gcash_number', 'bank_name', 'bank_account', 'bank_account_name'])
      const map: Record<string, string> = {}
      ;(settings ?? []).forEach((s: { key: string; value: string }) => { map[s.key] = s.value })
      setPaymentSettings(map)
    }

    // Feedback for completed bookings
    if (bk.status === 'completed') {
      const { data: fb } = await supabase
        .from('feedback').select('*').eq('booking_id', bk.id).maybeSingle()
      setExistingFeedback(fb as Feedback | null)
    } else {
      setExistingFeedback(undefined)
    }

    // Cleaner name, rating, ETA
    const acceptedCleanerId = (bk.cleaner_assignments as any[])?.find(a => a.status === 'accepted')?.cleaner_id
    if (acceptedCleanerId) {
      const [{ data: ratings }, { data: cleanerProfile }] = await Promise.all([
        supabase.from('feedback').select('rating').eq('cleaner_id', acceptedCleanerId),
        supabase.from('profiles').select('full_name, home_lat, home_lng').eq('id', acceptedCleanerId).maybeSingle(),
      ])
      if (ratings && ratings.length > 0) {
        const sum = ratings.reduce((s: number, r: { rating: number }) => s + r.rating, 0)
        setCleanerStats({ avg: sum / ratings.length, count: ratings.length })
      } else {
        setCleanerStats(null)
      }
      setCleanerName((cleanerProfile as any)?.full_name ?? null)
      const cLat = (cleanerProfile as any)?.home_lat
      const cLng = (cleanerProfile as any)?.home_lng
      if (cLat && cLng && bk.service_lat && bk.service_lng) {
        const distKm = haversineKm(cLat, cLng, bk.service_lat, bk.service_lng)
        setCleanerEta({ distKm, etaMin: Math.round(distKm / 30 * 60) })
      } else {
        setCleanerEta(null)
      }
    } else {
      setCleanerName(null)
      setCleanerStats(null)
      setCleanerEta(null)
    }

    // Unread notifications
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setUnreadCount(count ?? 0)

    setBooking(bk as BookingDetail)
    setEmpty(false)
    setLoading(false)
    setRefreshing(false)
  }

  async function submitFeedback() {
    if (rating === 0) { Alert.alert('Rating required', 'Please select a star rating.'); return }
    setSubmitting(true)
    const cleaner_id = booking?.cleaner_assignments?.find(a => a.status === 'accepted')?.cleaner_id ?? null
    const { error } = await supabase.from('feedback').insert({
      booking_id: booking?.id, cleaner_id, rating, comment: comment.trim() || null,
    })
    setSubmitting(false)
    if (error) { Alert.alert('Error', error.message); return }
    setExistingFeedback({ id: '', booking_id: booking?.id!, cleaner_id: cleaner_id ?? '', rating, comment, created_at: '' })
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (empty || !booking) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <AppHeader
          title="My Booking"
          unreadCount={unreadCount}
          onBellPress={() => router.push('/(customer)/notifications')}
        />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
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
          <View style={{
            width: 96, height: 96, borderRadius: 48,
            backgroundColor: Colors.primary + '15',
            alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <Feather name="calendar" size={42} color={Colors.primary} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 10 }}>
            No Active Booking
          </Text>
          <Text style={{ fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            You don't have any bookings yet. Book a cleaning service to get started.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(customer)/bookings/new')}
            style={{
              paddingHorizontal: 32, paddingVertical: 14,
              backgroundColor: Colors.primary, borderRadius: 14,
              flexDirection: 'row', alignItems: 'center', gap: 8,
            }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Book Now</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const svc         = booking.service_slug ? getService(booking.service_slug) : undefined
  const serviceName = svc?.name ?? booking.service_name ?? 'Cleaning Service'
  const svcImage    = svc?.image ?? null
  const svcAccent   = svc?.accent ?? Colors.primary
  const svcCategory = (svc?.category ?? 'Cleaning').toUpperCase()
  const svcIcon     = (svc?.placeholderIcon ?? 'home') as keyof typeof Feather.glyphMap
  const progressIdx = PROGRESS_STEPS.indexOf(booking.status as BookingStatus)
  const statusColor = STATUS_COLORS[booking.status as BookingStatus]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="My Booking"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications')}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
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
          <StatusBanner
            icon={cleanerName ? 'navigation' : 'check-circle'}
            title={cleanerName ? 'Cleaner En Route' : 'Booking Confirmed'}
            body={cleanerName
              ? `${cleanerName} is heading to your location.`
              : 'Your booking is confirmed. A cleaner will be assigned soon.'}
            bg="#fdf2f8" accent={Colors.primary} titleColor="#831843" bodyColor="#9d174d" />
        )}
        {booking.status === 'in_progress' && (
          <StatusBanner icon="wind" title="Cleaning in Progress"
            body={cleanerName ? `${cleanerName} is currently cleaning your space.` : 'Your space is currently being cleaned.'}
            bg="#f5f3ff" accent="#7c3aed" titleColor="#4c1d95" bodyColor="#5b21b6" />
        )}
        {booking.status === 'completed' && (
          <StatusBanner icon="check-circle" title="Service Completed"
            body="Your space has been cleaned. We hope you're satisfied with the service!"
            bg="#f0fdf4" accent="#16a34a" titleColor="#14532d" bodyColor="#166534" />
        )}

        {/* ── Hero card ── */}
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
                        {done
                          ? <Feather name="check" size={14} color="#fff" />
                          : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: active ? '#fff' : C.textMuted }} />
                        }
                      </View>
                      <View style={{ flex: 1, height: 2, backgroundColor: i === PROGRESS_STEPS.length - 1 ? 'transparent' : done ? Colors.primary : C.border }} />
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
              {booking.payment_method === 'cash' && (
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>₱</Text>
                </View>
              )}
              {booking.payment_method === 'bank_transfer' && (
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#1d4ed8', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="home" size={18} color="#fff" />
                </View>
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>
                {PAYMENT_LABELS[booking.payment_method] ?? booking.payment_method}
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
              {booking.service_lat ? (
                <View>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>GPS Coordinates</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>
                    {booking.service_lat.toFixed(5)}, {booking.service_lng!.toFixed(5)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Assigned cleaner ── */}
        {cleanerName && (
          <View style={{
            marginHorizontal: 16, marginBottom: 14,
            backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: C.background, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Assigned Cleaner
              </Text>
            </View>
            <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.primary }}>
                  {cleanerName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{cleanerName}</Text>
                {cleanerStats ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <Ionicons key={n} name={starIcon(n, cleanerStats.avg)} size={13} color="#f59e0b" />
                      ))}
                    </View>
                    <Text style={{ fontSize: 12, color: C.textSecondary }}>
                      {cleanerStats.avg.toFixed(1)} · {cleanerStats.count} {cleanerStats.count === 1 ? 'review' : 'reviews'}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>No reviews yet</Text>
                )}
              </View>
              <View style={{ backgroundColor: '#f0fdf4', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>Assigned</Text>
              </View>
            </View>
            {cleanerEta && (booking.status === 'confirmed' || booking.status === 'in_progress') && (
              <View style={{ borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.primary + '12', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="navigation" size={17} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Est. travel from cleaner's home</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
                    {fmtEta(cleanerEta.etaMin)}
                    <Text style={{ fontSize: 12, fontWeight: '400', color: C.textSecondary }}> · {cleanerEta.distKm.toFixed(1)} km</Text>
                  </Text>
                </View>
                {booking.service_lat && booking.service_lng && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`https://maps.google.com/?q=${booking.service_lat},${booking.service_lng}`)}
                    style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Map</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

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

      </ScrollView>
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
      <View style={{
        position: 'absolute', top: 20, right: 20,
        width: 76, height: 76, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Feather name={icon} size={34} color="#fff" style={{ opacity: 0.75 }} />
      </View>
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
      <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4, letterSpacing: -0.5 }}>
        {serviceName}
      </Text>
      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 24 }}>
        {booking.space_type === 'residential' ? 'Residential'
          : booking.space_type === 'condo' ? 'Condo'
          : booking.space_type === 'office' ? 'Office'
          : 'Commercial'} · {booking.property_sqm} sqm
        {booking.sofa_seaters ? ` · ${booking.sofa_seaters} sofa${booking.sofa_seaters !== 1 ? 's' : ''}` : ''}
      </Text>
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
      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginBottom: 18 }} />
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
              : 'Unpaid'}
          </Text>
        </View>
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: accent, opacity: 0.7 }} />
    </View>
  )
}

// ── Status Banner ─────────────────────────────────────────────────────────────

function StatusBanner({
  icon, title, body, bg, accent, titleColor, bodyColor,
}: {
  icon:       keyof typeof Feather.glyphMap
  title:      string
  body:       string
  bg:         string
  accent:     string
  titleColor: string
  bodyColor:  string
}) {
  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 14, borderRadius: 20, overflow: 'hidden', marginTop: 13,
      borderWidth: 1, borderColor: accent + '30',
      shadowColor: accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
    }}>
      <View style={{ backgroundColor: bg, padding: 18 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3 }} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 16, backgroundColor: accent,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
          }}>
            <Feather name={icon} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, paddingTop: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: titleColor, marginBottom: 4, letterSpacing: -0.2 }}>
              {title}
            </Text>
            <Text style={{ fontSize: 13, color: bodyColor, lineHeight: 19 }}>{body}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
