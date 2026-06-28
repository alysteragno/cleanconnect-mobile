import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, Alert, RefreshControl, Platform,
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

type JobInfo = {
  assignmentId: string
  bookingId: string
  service_name: string | null
  service_date: string
  service_time: string
  property_sqm: number
  base_price: number
  address_unit: string | null
  address_street: string | null
  address_city: string | null
  address_province: string | null
  service_lat: number | null
  service_lng: number | null
  special_notes: string | null
  booking_status: string
  payment_method: string
  payment_status: string
  started_at: string | null
  customer_name: string | null
  customer_id: string | null
}

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
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

export default function ActiveJobScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>()
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()

  const [job, setJob] = useState<JobInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [withinRange, setWithinRange] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cashCollected, setCashCollected] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [locationTagged, setLocationTagged] = useState(false)
  const [taggingLocation, setTaggingLocation] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [completedAt, setCompletedAt] = useState<Date | null>(null)
  const startMsRef = useRef<number | null>(null)

  useEffect(() => { loadJob() }, [assignmentId])

  useEffect(() => {
    if (!arrived) return
    if (startMsRef.current === null) startMsRef.current = Date.now()
    setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000))
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMsRef.current!) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [arrived])

  async function loadJob() {
    const { data } = await supabase
      .from('cleaner_assignments')
      .select(`
        id, booking_id, status,
        bookings (
          service_name, service_date, service_time, property_sqm, base_price,
          address_unit, address_street, address_city, address_province,
          service_lat, service_lng, special_notes, status,
          payment_method, payment_status, started_at, customer_id,
          customer:profiles!customer_id(full_name)
        )
      `)
      .eq('id', assignmentId)
      .single()

    if (data?.bookings) {
      const b = data.bookings as any
      const isInProgress = b.status === 'in_progress'
      const isCompleted = b.status === 'completed'
      if (isInProgress && b.started_at) {
        startMsRef.current = new Date(b.started_at).getTime()
      }
      if (isCompleted) {
        setCompleted(true)
        setCompletedAt(new Date())
      }
      setJob({
        assignmentId,
        bookingId: data.booking_id,
        service_name: b.service_name ?? null,
        service_date: b.service_date,
        service_time: b.service_time,
        property_sqm: b.property_sqm,
        base_price: b.base_price,
        address_unit: b.address_unit,
        address_street: b.address_street,
        address_city: b.address_city,
        address_province: b.address_province,
        service_lat: b.service_lat,
        service_lng: b.service_lng,
        special_notes: b.special_notes,
        booking_status: b.status,
        payment_method: b.payment_method ?? '',
        payment_status: b.payment_status ?? 'unpaid',
        started_at: b.started_at ?? null,
        customer_name: b.customer?.full_name ?? null,
        customer_id: b.customer_id ?? null,
      })
      if (isInProgress) setArrived(true)
      if (b.payment_status === 'paid') setCashCollected(true)
    }
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
      Alert.alert('Location Tagged', 'Your starting location has been saved. Head to the service address when ready.')
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
      const cleanerLat = loc.coords.latitude
      const cleanerLng = loc.coords.longitude

      if (job?.service_lat && job?.service_lng) {
        const dist = haversineDistance(cleanerLat, cleanerLng, job.service_lat, job.service_lng)
        setDistance(Math.round(dist))
        setWithinRange(dist <= ARRIVAL_RADIUS_METERS)
        if (dist > ARRIVAL_RADIUS_METERS) {
          Alert.alert(
            'Not at location',
            `You are ${Math.round(dist)}m away from the service address. You must be within ${ARRIVAL_RADIUS_METERS}m to confirm arrival.`
          )
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
    setUpdating(true)
    try {
      const now = new Date().toISOString()
      startMsRef.current = Date.now()

      const { error: bookingErr, data: bookingData } = await supabase
        .from('bookings')
        .update({ status: 'in_progress', started_at: now })
        .eq('id', job!.bookingId)
        .select()

      console.log('[confirmArrival] booking update result:', { bookingData, bookingErr })

      if (bookingErr) throw bookingErr

      if (job?.customer_id) {
        const { data: { user } } = await supabase.auth.getUser()
        let cleanerFirst = 'Your cleaner'
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          if (prof?.full_name) cleanerFirst = prof.full_name.split(' ')[0]
        }
        await supabase.from('notifications').insert({
          user_id: job.customer_id,
          title: 'Cleaner Has Arrived',
          body: `${cleanerFirst} is now at your location and has started the service.`,
          type: 'info',
        })
      }

      setArrived(true)
      setJob(prev => prev ? { ...prev, booking_status: 'in_progress', started_at: now } : prev)
      Alert.alert('Job Started!', 'Arrival confirmed. The customer has been notified and your timer is running.')
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not start the job. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  async function collectCash() {
    Alert.alert(
      'Collect Cash',
      `Confirm you received ₱${Number(job?.base_price).toLocaleString()} from the customer?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Collection',
          onPress: async () => {
            setUpdating(true)
            const { error } = await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', job!.bookingId)
            setUpdating(false)
            if (error) {
              Alert.alert('Error', 'Could not record payment. Please try again.')
              return
            }
            setCashCollected(true)
            setJob(prev => prev ? { ...prev, payment_status: 'paid' } : prev)
            Alert.alert('Cash Collected', 'Payment has been marked as collected.')
          },
        },
      ]
    )
  }

  async function completeJob() {
    if (job?.payment_method === 'cash' && !cashCollected) {
      Alert.alert('Cash Not Collected', 'Please collect the cash payment before marking this job as completed.', [{ text: 'OK' }])
      return
    }
    Alert.alert('Complete Job', 'Are you sure you want to mark this job as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete', onPress: async () => {
          setUpdating(true)
          const bookingUpdate: Record<string, string> = { status: 'completed' }
          if (job!.payment_method === 'cash') bookingUpdate.payment_status = 'paid'
          await Promise.all([
            supabase.from('bookings').update(bookingUpdate).eq('id', job!.bookingId),
            supabase.from('cleaner_assignments').update({ status: 'completed' }).eq('id', assignmentId),
          ])
          if (job?.customer_id) {
            try {
              await supabase.from('notifications').insert({
                user_id: job.customer_id,
                title: 'Service Completed',
                body: `Your ${job.service_name ?? 'cleaning service'} has been completed. Please leave a review!`,
                type: 'info',
              })
            } catch {}
          }
          setCompleted(true)
          setCompletedAt(new Date())
          setJob(prev => prev ? {
            ...prev,
            booking_status: 'completed',
            ...(job!.payment_method === 'cash' && { payment_status: 'paid' }),
          } : prev)
          setUpdating(false)
        },
      },
    ])
  }

  function openMaps() {
    if (!job) return
    const address = [job.address_unit, job.address_street, job.address_city, job.address_province]
      .filter(Boolean).join(', ')
    let url: string
    if (job.service_lat && job.service_lng) {
      url = Platform.OS === 'ios'
        ? `maps://?daddr=${job.service_lat},${job.service_lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${job.service_lat},${job.service_lng}`
    } else {
      url = Platform.OS === 'ios'
        ? `maps://?daddr=${encodeURIComponent(address)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
    }
    Linking.openURL(url)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (completed && job) {
    const completedTimeStr = completedAt
      ? completedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
      : null
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <AppHeader
          showBack={false}
          title="Job Completed"
          subtitle={job.service_name ?? 'Cleaning Service'}
          hideBell
          backgroundColor="#16a34a"
        />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Success hero */}
          <View style={{
            backgroundColor: '#16a34a', borderRadius: 24, padding: 32, alignItems: 'center', gap: 12,
          }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="check" size={40} color="#fff" />
            </View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>Great Work!</Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 20 }}>
              This job has been marked as completed.{'\n'}The customer has been notified.
            </Text>
            {completedTimeStr && (
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 99,
                paddingHorizontal: 14, paddingVertical: 6,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>
                  Completed at {completedTimeStr}
                </Text>
              </View>
            )}
          </View>

          {/* Waiting for review */}
          <View style={{
            backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: '#fde68a',
            overflow: 'hidden',
          }}>
            <View style={{
              backgroundColor: '#fffbeb', paddingHorizontal: 18, paddingVertical: 14,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              borderBottomWidth: 1, borderBottomColor: '#fde68a',
            }}>
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: '#f59e0b20', alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="star" size={20} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400e' }}>Waiting for Customer Review</Text>
                <Text style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                  The customer can now rate your service
                </Text>
              </View>
            </View>
            <View style={{ padding: 18, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Feather key={n} name="star" size={22} color="#fde68a" />
                ))}
              </View>
              <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>
                Your rating will appear on your profile once the customer submits their review. Great service leads to better job offers!
              </Text>
            </View>
          </View>

          {/* Job summary */}
          <View style={{
            backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border,
            overflow: 'hidden',
          }}>
            <View style={{
              backgroundColor: C.background, paddingHorizontal: 18, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: C.borderLight,
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Job Summary
              </Text>
            </View>
            <View style={{ padding: 18, gap: 12 }}>
              {[
                { label: 'Service', value: job.service_name ?? 'Cleaning Service' },
                { label: 'Date', value: formatDate(job.service_date) },
                { label: 'Time', value: formatTime(job.service_time) },
                { label: 'Property', value: `${job.property_sqm} sqm` },
                { label: 'Customer', value: job.customer_name ?? '—' },
                { label: 'Payment', value: `₱${Number(job.base_price).toLocaleString()} · ${job.payment_method}` },
              ].map(row => (
                <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>{row.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, maxWidth: '60%', textAlign: 'right' }}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Back to jobs */}
          <TouchableOpacity
            onPress={() => router.replace('/(cleaner)/jobs')}
            style={{
              backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}
          >
            <Feather name="briefcase" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Back to My Jobs</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    )
  }

  if (!job) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.textSecondary }}>Job not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const fullAddress = [job.address_unit, job.address_street, job.address_city, job.address_province]
    .filter(Boolean).join(', ') || '—'

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        showBack
        onBackPress={() => router.back()}
        title={arrived ? 'Active Job' : 'Start Job'}
        subtitle={job.service_name ?? 'Cleaning Service'}
        hideBell
        backgroundColor={arrived ? '#7c3aed' : undefined}
        rightContent={arrived
          ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#ffffff30' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>In Progress</Text>
            </View>
          : undefined
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadJob() }}
          tintColor={isDark ? '#ffffff' : Colors.primary}
          colors={isDark ? ['#ffffff'] : [Colors.primary]}
          progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
        />
      }
      >

        {/* Live timer — always purple, intentional branding */}
        {arrived && (
          <View style={{
            backgroundColor: '#7c3aed', borderRadius: 16, padding: 20, alignItems: 'center',
          }}>
            <Text style={{ color: '#ede9fe', fontSize: 12, fontWeight: '600', marginBottom: 4, letterSpacing: 1 }}>
              TIME ELAPSED
            </Text>
            <Text style={{ color: '#fff', fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {formatElapsed(elapsed)}
            </Text>
            {job.customer_name && (
              <Text style={{ color: '#ddd6fe', fontSize: 13, marginTop: 8 }}>
                Customer: {job.customer_name}
              </Text>
            )}
          </View>
        )}

        {/* Job summary */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{job.service_name ?? 'Cleaning Service'}</Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 2 }}>
              {formatDate(job.service_date)} · {formatTime(job.service_time)}
            </Text>
            <Text style={{ fontSize: 13, color: C.textMuted, marginTop: 1 }}>{job.property_sqm} sqm</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.primary }}>
            ₱{Number(job.base_price).toLocaleString()}
          </Text>
        </View>

        {/* Address + Map */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border,
          overflow: 'hidden',
        }}>
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

          {job.service_lat && job.service_lng ? (
            <MapView
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
              style={{ height: 160 }}
              region={{
                latitude: job.service_lat,
                longitude: job.service_lng,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={{ latitude: job.service_lat, longitude: job.service_lng }}
                pinColor={Colors.primary}
              />
            </MapView>
          ) : null}

          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 14, color: C.text, lineHeight: 20 }}>{fullAddress}</Text>
            {job.service_lat && (
              <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                GPS: {job.service_lat.toFixed(5)}, {job.service_lng!.toFixed(5)}
              </Text>
            )}
          </View>
        </View>

        {/* ── Job start guide — 2-step geo-tag flow ── */}
        {!arrived && (
          <View style={{ gap: 12 }}>

            {/* Guide banner */}
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#bfdbfe', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Feather name="info" size={15} color="#1e40af" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e3a8a', marginBottom: 3 }}>How to Start Your Job</Text>
                <Text style={{ fontSize: 12, color: '#2563eb', lineHeight: 18 }}>
                  Complete both steps in order. Tag your starting location before you leave, then verify arrival once you reach the service address.
                </Text>
              </View>
            </View>

            {/* Step 1 — Tag starting location */}
            <View style={{
              backgroundColor: C.white, borderRadius: 16, overflow: 'hidden',
              borderWidth: 1.5, borderColor: locationTagged ? '#86efac' : '#bfdbfe',
            }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderBottomWidth: 1,
                borderBottomColor: locationTagged ? '#86efac' : '#bfdbfe',
                backgroundColor: locationTagged ? '#f0fdf4' : '#eff6ff',
              }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: locationTagged ? '#16a34a' : '#1e40af',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {locationTagged
                    ? <Feather name="check" size={14} color="#fff" />
                    : <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>1</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: locationTagged ? '#15803d' : '#1e3a8a' }}>
                    Tag Your Starting Location
                  </Text>
                  <Text style={{ fontSize: 11, color: locationTagged ? '#16a34a' : '#3b82f6', marginTop: 1 }}>
                    {locationTagged ? 'Done — you\'re ready to head out' : 'Do this before leaving your current location'}
                  </Text>
                </View>
              </View>
              <View style={{ padding: 14, gap: 10 }}>
                <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
                  Capture your current GPS so the customer sees an accurate estimated arrival time. Make sure you're still at your starting point when you tap this.
                </Text>
                {locationTagged ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#86efac' }}>
                    <Feather name="check-circle" size={15} color="#16a34a" />
                    <Text style={{ fontSize: 13, color: '#15803d', fontWeight: '700' }}>Starting location saved</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={tagStartingLocation}
                    disabled={taggingLocation}
                    style={{
                      backgroundColor: '#1e40af', borderRadius: 12, paddingVertical: 13,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: taggingLocation ? 0.7 : 1,
                    }}
                  >
                    {taggingLocation
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <Feather name="crosshair" size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Tag My Starting Location</Text>
                        </>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Step 2 — Verify arrival */}
            <View style={{
              backgroundColor: C.white, borderRadius: 16, overflow: 'hidden',
              borderWidth: 1.5, borderColor: withinRange ? '#86efac' : C.border,
              opacity: locationTagged ? 1 : 0.5,
            }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderBottomWidth: 1,
                borderBottomColor: withinRange ? '#86efac' : C.borderLight,
                backgroundColor: withinRange ? '#f0fdf4' : C.background,
              }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: withinRange ? '#16a34a' : C.borderLight,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {withinRange
                    ? <Feather name="check" size={14} color="#fff" />
                    : <Text style={{ fontSize: 12, fontWeight: '800', color: C.textMuted }}>2</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: withinRange ? '#15803d' : C.text }}>
                    Verify Arrival at Job Site
                  </Text>
                  <Text style={{ fontSize: 11, color: withinRange ? '#16a34a' : C.textSecondary, marginTop: 1 }}>
                    {withinRange ? 'Location confirmed — you\'re within range!' : `Do this when you reach the service address`}
                  </Text>
                </View>
              </View>
              <View style={{ padding: 14, gap: 10 }}>
                <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
                  Once you arrive at the service address, tap the button below. You must be within {ARRIVAL_RADIUS_METERS}m to confirm. This starts your job timer and notifies the customer.
                </Text>

                {distance !== null && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1,
                    backgroundColor: withinRange ? '#f0fdf4' : '#fef9c3',
                    borderColor: withinRange ? '#86efac' : '#fde68a',
                  }}>
                    <Feather name={withinRange ? 'check-circle' : 'alert-circle'} size={15} color={withinRange ? '#16a34a' : '#ca8a04'} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: withinRange ? '#15803d' : '#92400e', flex: 1 }}>
                      {withinRange
                        ? `${distance}m from job site — you're within range!`
                        : `${distance}m away — must be within ${ARRIVAL_RADIUS_METERS}m`}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={checkArrival}
                  disabled={locating || !locationTagged}
                  style={{
                    backgroundColor: C.borderLight, borderRadius: 12, paddingVertical: 12,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {locating
                    ? <ActivityIndicator color={Colors.primary} />
                    : <>
                        <Feather name="map-pin" size={16} color={Colors.primary} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>
                          {distance === null ? 'Check My Arrival Location' : 'Re-check My Location'}
                        </Text>
                      </>
                  }
                </TouchableOpacity>

                {withinRange && (
                  <TouchableOpacity
                    onPress={confirmArrival}
                    disabled={updating}
                    style={{
                      backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: updating ? 0.7 : 1,
                    }}
                  >
                    {updating
                      ? <ActivityIndicator color="#fff" />
                      : <>
                          <Feather name="play-circle" size={18} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Confirm Arrival & Start Job</Text>
                        </>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>

          </View>
        )}

        {job.special_notes && (
          <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 6 }}>Special Notes</Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>{job.special_notes}</Text>
          </View>
        )}

        {arrived && job.payment_method === 'cash' && (
          cashCollected ? (
            <View style={{
              backgroundColor: '#f0fdf4', borderRadius: 14, borderWidth: 1,
              borderColor: '#86efac', padding: 16,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Feather name="check-circle" size={20} color="#16a34a" />
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#15803d' }}>Cash Collected</Text>
                <Text style={{ fontSize: 12, color: '#16a34a', marginTop: 1 }}>
                  ₱{Number(job.base_price).toLocaleString()} received from customer
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={collectCash}
              disabled={updating}
              style={{
                backgroundColor: '#f59e0b', borderRadius: 14, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                opacity: updating ? 0.7 : 1,
              }}
            >
              <Feather name="dollar-sign" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                Collect Cash — ₱{Number(job.base_price).toLocaleString()}
              </Text>
            </TouchableOpacity>
          )
        )}

        {arrived && (
          <TouchableOpacity
            onPress={completeJob}
            disabled={updating}
            style={{
              backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              opacity: updating ? 0.7 : 1,
            }}
          >
            {updating
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Feather name="check-circle" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Mark as Completed</Text>
                </>
            }
          </TouchableOpacity>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  )
}
