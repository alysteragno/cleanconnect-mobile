import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, Linking, RefreshControl, Platform,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Location from 'expo-location'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'
import { getService } from '@/constants/services'

const ARRIVAL_RADIUS_METERS = 500

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function formatElapsed(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(v => v.toString().padStart(2, '0')).join(':')
}

type Booking = {
  service_name: string | null
  service_slug: string | null
  space_type: string
  service_date: string
  service_time: string
  property_sqm: number
  base_price: number
  duration_hours: number
  address_unit: string | null
  address_street: string | null
  address_city: string | null
  address_province: string | null
  service_lat: number | null
  service_lng: number | null
  special_notes: string | null
  status: string
  payment_method: string
  payment_status: string
  started_at: string | null
  customer_id: string | null
  branches: { name: string } | null
  customer: { full_name: string } | null
}

type Assignment = {
  id: string
  booking_id: string
  status: string
  bookings: Booking
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [arrived, setArrived] = useState(false)
  const [locating, setLocating] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [withinRange, setWithinRange] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cashCollected, setCashCollected] = useState(false)
  const [locationTagged, setLocationTagged] = useState(false)
  const [taggingLocation, setTaggingLocation] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [completedAt, setCompletedAt] = useState<Date | null>(null)
  const startMsRef = useRef<number | null>(null)

  useEffect(() => { loadAssignment() }, [id])

  useEffect(() => {
    if (!arrived || completed) return
    if (startMsRef.current === null) startMsRef.current = Date.now()
    setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000))
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMsRef.current!) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [arrived, completed])

  async function loadAssignment() {
    const { data } = await supabase
      .from('cleaner_assignments')
      .select(`
        id, booking_id, status,
        bookings (
          service_name, service_slug, space_type, service_date, service_time, property_sqm,
          base_price, duration_hours, address_unit, address_street, address_city,
          address_province, service_lat, service_lng, special_notes, status,
          payment_method, payment_status, started_at, customer_id,
          branches (name),
          customer:profiles!customer_id(full_name)
        )
      `)
      .eq('id', id)
      .single()

    if (data?.bookings) {
      const b = data.bookings as any
      const isInProgress = b.status === 'in_progress'
      const isCompleted = b.status === 'completed' || data.status === 'completed'
      if (isInProgress && b.started_at) {
        startMsRef.current = new Date(b.started_at).getTime()
      }
      if (isInProgress) setArrived(true)
      if (isCompleted) {
        setCompleted(true)
        setCompletedAt(new Date())
      }
      if (b.payment_status === 'paid') setCashCollected(true)
    }
    setAssignment(data as unknown as Assignment)
    setLoading(false)
    setRefreshing(false)
  }

  async function tagStartingLocation() {
    setTaggingLocation(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location access is required to tag your starting location.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('profiles').update({
        home_lat: loc.coords.latitude,
        home_lng: loc.coords.longitude,
      }).eq('id', user.id)
      setLocationTagged(true)
      Alert.alert('Location Tagged', 'Starting location saved. Head to the service address when ready.')
    } catch {
      Alert.alert('Error', 'Could not get your location. Please try again.')
    } finally {
      setTaggingLocation(false)
    }
  }

  async function checkArrival() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location access is required to verify arrival.')
        setLocating(false)
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const b = assignment?.bookings
      if (b?.service_lat && b?.service_lng) {
        const dist = haversineDistance(loc.coords.latitude, loc.coords.longitude, b.service_lat, b.service_lng)
        setDistance(Math.round(dist))
        setWithinRange(dist <= ARRIVAL_RADIUS_METERS)
        if (dist > ARRIVAL_RADIUS_METERS) {
          Alert.alert('Not at location', `You are ${Math.round(dist)}m away. You must be within ${ARRIVAL_RADIUS_METERS}m to confirm arrival.`)
        }
      } else {
        setWithinRange(true)
      }
    } catch {
      Alert.alert('Error', 'Could not get your location. Please try again.')
    }
    setLocating(false)
  }

  async function confirmArrival() {
    if (!assignment) return
    setUpdating(true)
    try {
      const now = new Date().toISOString()
      startMsRef.current = Date.now()
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'in_progress', started_at: now })
        .eq('id', assignment.booking_id)
      if (error) throw error
      const b = assignment.bookings
      if (b?.customer_id) {
        const { data: { user } } = await supabase.auth.getUser()
        let first = 'Your cleaner'
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          if (prof?.full_name) first = (prof.full_name as string).split(' ')[0]
        }
        await supabase.from('notifications').insert({
          user_id: b.customer_id,
          title: 'Cleaner Has Arrived',
          body: `${first} is now at your location and has started the service.`,
          type: 'info',
        })
      }
      setArrived(true)
      setAssignment(prev => prev ? { ...prev, bookings: { ...prev.bookings, status: 'in_progress', started_at: now } } : prev)
      Alert.alert('Job Started!', 'Arrival confirmed. The customer has been notified.')
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not start the job. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  async function collectCash() {
    if (!assignment) return
    Alert.alert('Collect Cash', `Confirm you received ₱${Number(assignment.bookings.base_price).toLocaleString()} from the customer?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Collection', onPress: async () => {
          setUpdating(true)
          await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', assignment.booking_id)
          setCashCollected(true)
          setAssignment(prev => prev ? { ...prev, bookings: { ...prev.bookings, payment_status: 'paid' } } : prev)
          setUpdating(false)
          Alert.alert('Cash Collected', 'Payment marked as collected.')
        },
      },
    ])
  }

  async function completeJob() {
    if (!assignment) return
    const b = assignment.bookings
    if (b.payment_method === 'cash' && !cashCollected) {
      Alert.alert('Cash Not Collected', 'Please collect cash payment before completing.', [{ text: 'OK' }])
      return
    }
    Alert.alert('Complete Job', 'Mark this job as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete', onPress: async () => {
          setUpdating(true)
          await Promise.all([
            supabase.from('bookings').update({ status: 'completed' }).eq('id', assignment.booking_id),
            supabase.from('cleaner_assignments').update({ status: 'completed' }).eq('id', assignment.id),
          ])
          if (b.customer_id) {
            try {
              await supabase.from('notifications').insert({
                user_id: b.customer_id,
                title: 'Service Completed',
                body: `Your ${b.service_name ?? 'cleaning service'} has been completed. Please leave a review!`,
                type: 'info',
              })
            } catch {}
          }
          setCompleted(true)
          setCompletedAt(new Date())
          setAssignment(prev => prev ? { ...prev, status: 'completed', bookings: { ...prev.bookings, status: 'completed' } } : prev)
          setUpdating(false)
        },
      },
    ])
  }

  function openMaps() {
    const b = assignment?.bookings
    if (!b) return
    const address = [b.address_unit, b.address_street, b.address_city, b.address_province].filter(Boolean).join(', ')
    if (b.service_lat && b.service_lng) {
      const url = Platform.OS === 'ios'
        ? `maps://?daddr=${b.service_lat},${b.service_lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${b.service_lat},${b.service_lng}`
      Linking.openURL(url)
    } else if (address) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (!assignment?.bookings) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.textSecondary }}>Job not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const b = assignment.bookings
  const fullAddress = [b.address_unit, b.address_street, b.address_city, b.address_province].filter(Boolean).join(', ') || '—'
  const svc = b.service_slug ? getService(b.service_slug) : null
  const accent = svc?.accent ?? Colors.primary

  const headerBg = completed ? '#16a34a' : arrived ? '#7c3aed' : accent

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        showBack
        onBackPress={() => router.back()}
        title={b.service_name ?? 'Cleaning Service'}
        subtitle={`Job #${assignment.id.slice(0, 8).toUpperCase()}`}
        hideBell
        backgroundColor={headerBg}
        rightContent={
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
            backgroundColor: 'rgba(255,255,255,0.2)',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff', textTransform: 'capitalize' }}>
              {completed ? 'Completed' : arrived ? 'In Progress' : assignment.status}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ gap: 14, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAssignment() }}
            tintColor={isDark ? '#fff' : Colors.primary}
            colors={[Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#fff'}
          />
        }
      >

        {/* ── Service image hero ── */}
        <View style={{ position: 'relative' }}>
          {svc?.image ? (
            <Image
              source={svc.image}
              style={{ width: '100%', height: 200 }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ width: '100%', height: 160, backgroundColor: svc?.placeholderBg ?? '#fce7f3', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={(svc?.placeholderIcon ?? 'home') as any} size={48} color={svc?.placeholderIconColor ?? Colors.primary} style={{ opacity: 0.6 }} />
            </View>
          )}
          {/* price badge overlay */}
          <View style={{
            position: 'absolute', bottom: 12, right: 12,
            backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 8,
          }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
              ₱{Number(b.base_price).toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14 }}>

          {/* ── Completion card ── */}
          {completed && (
            <>
              <View style={{ backgroundColor: '#16a34a', borderRadius: 20, padding: 24, alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 64, height: 64, borderRadius: 32,
                  backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="check" size={32} color="#fff" />
                </View>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>Job Completed!</Text>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
                  Great work! The customer has been notified.
                </Text>
                {completedAt && (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>
                      Completed at {completedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{
                backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: '#fde68a', overflow: 'hidden',
              }}>
                <View style={{
                  backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 12,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  borderBottomWidth: 1, borderBottomColor: '#fde68a',
                }}>
                  <Feather name="star" size={16} color="#f59e0b" />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400e' }}>Waiting for Customer Review</Text>
                </View>
                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(n => <Feather key={n} name="star" size={20} color="#fde68a" />)}
                  </View>
                  <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>
                    Your rating will appear on your profile once the customer submits their review.
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* ── Live timer (in-progress) ── */}
          {arrived && !completed && (
            <View style={{ backgroundColor: '#7c3aed', borderRadius: 16, padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#ede9fe', fontSize: 11, fontWeight: '600', marginBottom: 4, letterSpacing: 1 }}>
                TIME ELAPSED
              </Text>
              <Text style={{ color: '#fff', fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {formatElapsed(elapsed)}
              </Text>
              {b.customer?.full_name && (
                <Text style={{ color: '#ddd6fe', fontSize: 13, marginTop: 8 }}>Customer: {b.customer.full_name}</Text>
              )}
            </View>
          )}

          {/* ── Job details ── */}
          <DetailCard C={C} title="Job Details" rows={[
            ...(b.customer ? [{ label: 'Customer', value: b.customer.full_name }] : []),
            { label: 'Service', value: b.service_name ?? 'Cleaning Service' },
            { label: 'Space', value: b.space_type === 'residential' ? 'Residential' : b.space_type === 'condo' ? 'Condo' : b.space_type === 'office' ? 'Office' : 'Commercial' },
            { label: 'Size', value: `${b.property_sqm} sqm` },
            { label: 'Duration', value: `~${b.duration_hours}h` },
            { label: 'Pay', value: `₱${Number(b.base_price).toLocaleString()}` },
            { label: 'Payment', value: `${b.payment_method} · ${b.payment_status === 'paid' ? '✓ Paid' : 'Pending'}`, highlight: b.payment_status === 'paid' },
            ...(b.branches ? [{ label: 'Branch', value: b.branches.name }] : []),
          ]} />

          <DetailCard C={C} title="Schedule" rows={[
            { label: 'Date', value: formatDate(b.service_date) },
            { label: 'Time', value: formatTime(b.service_time) },
          ]} />

          {/* ── Location + map ── */}
          <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            <View style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 10,
              borderBottomWidth: 1, borderBottomColor: C.border,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Service Location</Text>
              <TouchableOpacity onPress={openMaps} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="navigation" size={13} color={Colors.primary} />
                <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>Get Directions</Text>
              </TouchableOpacity>
            </View>
            {b.service_lat && b.service_lng ? (
              <MapView
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
                style={{ height: 160 }}
                region={{ latitude: b.service_lat, longitude: b.service_lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
                scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
              >
                <Marker coordinate={{ latitude: b.service_lat, longitude: b.service_lng }} pinColor={accent} />
              </MapView>
            ) : null}
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ fontSize: 14, color: C.text, lineHeight: 20 }}>{fullAddress}</Text>
              {b.service_lat && (
                <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                  GPS: {b.service_lat.toFixed(5)}, {b.service_lng!.toFixed(5)}
                </Text>
              )}
            </View>
          </View>

          {b.special_notes ? (
            <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 6 }}>Special Notes</Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>{b.special_notes}</Text>
            </View>
          ) : null}

          {/* ── Start flow (geo-tag + arrival check) ── */}
          {!arrived && !completed && (
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: '#eff6ff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#bfdbfe', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Feather name="info" size={15} color="#1e40af" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e3a8a', marginBottom: 2 }}>How to Start</Text>
                  <Text style={{ fontSize: 12, color: '#2563eb', lineHeight: 18 }}>
                    Tag your starting location first, then verify arrival at the service address.
                  </Text>
                </View>
              </View>

              {/* Step 1 */}
              <View style={{ backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: locationTagged ? '#86efac' : '#bfdbfe' }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                  borderBottomWidth: 1, borderBottomColor: locationTagged ? '#86efac' : '#bfdbfe',
                  backgroundColor: locationTagged ? '#f0fdf4' : '#eff6ff',
                }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: locationTagged ? '#16a34a' : '#1e40af', alignItems: 'center', justifyContent: 'center' }}>
                    {locationTagged ? <Feather name="check" size={14} color="#fff" /> : <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>1</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: locationTagged ? '#15803d' : '#1e3a8a' }}>Tag Starting Location</Text>
                    <Text style={{ fontSize: 11, color: locationTagged ? '#16a34a' : '#3b82f6', marginTop: 1 }}>
                      {locationTagged ? "Done — ready to head out" : "Do this before leaving your current location"}
                    </Text>
                  </View>
                </View>
                <View style={{ padding: 14 }}>
                  {locationTagged ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#86efac' }}>
                      <Feather name="check-circle" size={15} color="#16a34a" />
                      <Text style={{ fontSize: 13, color: '#15803d', fontWeight: '700' }}>Starting location saved</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={tagStartingLocation}
                      disabled={taggingLocation}
                      style={{ backgroundColor: '#1e40af', borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: taggingLocation ? 0.7 : 1 }}
                    >
                      {taggingLocation ? <ActivityIndicator color="#fff" size="small" /> : <>
                        <Feather name="crosshair" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Tag My Starting Location</Text>
                      </>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Step 2 */}
              <View style={{ backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: withinRange ? '#86efac' : C.border, opacity: locationTagged ? 1 : 0.5 }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                  borderBottomWidth: 1, borderBottomColor: withinRange ? '#86efac' : C.borderLight,
                  backgroundColor: withinRange ? '#f0fdf4' : C.background,
                }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: withinRange ? '#16a34a' : C.borderLight, alignItems: 'center', justifyContent: 'center' }}>
                    {withinRange ? <Feather name="check" size={14} color="#fff" /> : <Text style={{ fontSize: 12, fontWeight: '800', color: C.textMuted }}>2</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: withinRange ? '#15803d' : C.text }}>Verify Arrival at Job Site</Text>
                    <Text style={{ fontSize: 11, color: withinRange ? '#16a34a' : C.textSecondary, marginTop: 1 }}>
                      {withinRange ? "You're within range!" : `Must be within ${ARRIVAL_RADIUS_METERS}m`}
                    </Text>
                  </View>
                </View>
                <View style={{ padding: 14, gap: 10 }}>
                  {distance !== null && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, backgroundColor: withinRange ? '#f0fdf4' : '#fef9c3', borderColor: withinRange ? '#86efac' : '#fde68a' }}>
                      <Feather name={withinRange ? 'check-circle' : 'alert-circle'} size={15} color={withinRange ? '#16a34a' : '#ca8a04'} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: withinRange ? '#15803d' : '#92400e', flex: 1 }}>
                        {withinRange ? `${distance}m — within range!` : `${distance}m away — must be within ${ARRIVAL_RADIUS_METERS}m`}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={checkArrival}
                    disabled={locating || !locationTagged}
                    style={{ backgroundColor: C.borderLight, borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {locating ? <ActivityIndicator color={Colors.primary} /> : <>
                      <Feather name="map-pin" size={16} color={Colors.primary} />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>
                        {distance === null ? 'Check My Arrival Location' : 'Re-check My Location'}
                      </Text>
                    </>}
                  </TouchableOpacity>
                  {withinRange && (
                    <TouchableOpacity
                      onPress={confirmArrival}
                      disabled={updating}
                      style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: updating ? 0.7 : 1 }}
                    >
                      {updating ? <ActivityIndicator color="#fff" /> : <>
                        <Feather name="play-circle" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Confirm Arrival & Start Job</Text>
                      </>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* ── Cash collection (in-progress) ── */}
          {arrived && !completed && b.payment_method === 'cash' && (
            cashCollected ? (
              <View style={{ backgroundColor: '#f0fdf4', borderRadius: 14, borderWidth: 1, borderColor: '#86efac', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="check-circle" size={20} color="#16a34a" />
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#15803d' }}>Cash Collected</Text>
                  <Text style={{ fontSize: 12, color: '#16a34a', marginTop: 1 }}>₱{Number(b.base_price).toLocaleString()} received</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={collectCash}
                disabled={updating}
                style={{ backgroundColor: '#f59e0b', borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: updating ? 0.7 : 1 }}
              >
                <Feather name="dollar-sign" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Collect Cash — ₱{Number(b.base_price).toLocaleString()}</Text>
              </TouchableOpacity>
            )
          )}

          {/* ── Complete button (in-progress) ── */}
          {arrived && !completed && (
            <TouchableOpacity
              onPress={completeJob}
              disabled={updating}
              style={{ backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: updating ? 0.7 : 1 }}
            >
              {updating ? <ActivityIndicator color="#fff" /> : <>
                <Feather name="check-circle" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Mark as Completed</Text>
              </>}
            </TouchableOpacity>
          )}

        </View>
      </ScrollView>
    </View>
  )
}

function DetailCard({ title, rows, C }: {
  title: string
  rows: Array<{ label: string; value: string; highlight?: boolean }>
  C: ReturnType<typeof useThemeColors>
}) {
  return (
    <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
      <View style={{ backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>{title}</Text>
      </View>
      {rows.map((row, i) => (
        <View key={row.label} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
          <Text style={{ width: 90, fontSize: 13, color: C.textSecondary }}>{row.label}</Text>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: row.highlight ? '#16a34a' : C.text }}>{row.value}</Text>
        </View>
      ))}
    </View>
  )
}
