import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, Alert,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Location from 'expo-location'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { SERVICE_LABELS, ServiceType } from '@/constants/types'
import AppHeader from '@/components/AppHeader'

type JobInfo = {
  assignmentId: string
  bookingId: string
  service_type: ServiceType
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
  const { assignmentId, bookingId } = useLocalSearchParams<{ assignmentId: string; bookingId: string }>()
  const router = useRouter()

  const [job, setJob] = useState<JobInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [distance, setDistance] = useState<number | null>(null)
  const [withinRange, setWithinRange] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cashCollected, setCashCollected] = useState(false)
  const startMsRef = useRef<number | null>(null)

  useEffect(() => { loadJob() }, [assignmentId, bookingId])

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
          service_type, service_date, service_time, property_sqm, base_price,
          address_unit, address_street, address_city, address_province,
          service_lat, service_lng, special_notes, status,
          payment_method, payment_status, started_at,
          customer:profiles!customer_id(full_name)
        )
      `)
      .eq('id', assignmentId)
      .single()

    if (data) {
      const b = (data as any).bookings
      const isInProgress = b.status === 'in_progress'
      if (isInProgress && b.started_at) {
        startMsRef.current = new Date(b.started_at).getTime()
      }
      setJob({
        assignmentId,
        bookingId: data.booking_id,
        service_type: b.service_type,
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
      })
      if (isInProgress) setArrived(true)
      if (b.payment_status === 'paid') setCashCollected(true)
    }
    setLoading(false)
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
    const now = new Date().toISOString()
    startMsRef.current = Date.now()
    await supabase
      .from('bookings')
      .update({ status: 'in_progress', started_at: now })
      .eq('id', bookingId)

    setArrived(true)
    setJob(prev => prev ? { ...prev, booking_status: 'in_progress', started_at: now } : prev)
    setUpdating(false)
    Alert.alert('Timer Started!', 'You have confirmed arrival. Timer is now running.')
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
            await supabase
              .from('bookings')
              .update({ payment_status: 'paid' })
              .eq('id', bookingId)
            setCashCollected(true)
            setJob(prev => prev ? { ...prev, payment_status: 'paid' } : prev)
            setUpdating(false)
            Alert.alert('Cash Collected', 'Payment has been marked as collected.')
          },
        },
      ]
    )
  }

  async function completeJob() {
    if (job?.payment_method === 'cash' && !cashCollected) {
      Alert.alert(
        'Cash Not Collected',
        'Please collect the cash payment before marking this job as completed.',
        [{ text: 'OK' }]
      )
      return
    }
    Alert.alert(
      'Complete Job',
      'Are you sure you want to mark this job as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete', onPress: async () => {
            setUpdating(true)
            await Promise.all([
              supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingId),
              supabase.from('cleaner_assignments').update({ status: 'completed' }).eq('id', assignmentId),
            ])
            setUpdating(false)
            Alert.alert('Job Complete', 'Great work! This job has been marked as completed.', [
              { text: 'OK', onPress: () => router.replace('/(cleaner)/jobs') },
            ])
          },
        },
      ]
    )
  }

  function openMaps() {
    if (!job) return
    const address = [job.address_unit, job.address_street, job.address_city, job.address_province]
      .filter(Boolean).join(', ')
    const url = job.service_lat && job.service_lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${job.service_lat},${job.service_lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
    Linking.openURL(url)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (!job) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#6b7280' }}>Job not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const fullAddress = [job.address_unit, job.address_street, job.address_city, job.address_province]
    .filter(Boolean).join(', ') || '—'

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <AppHeader
        showBack
        onBackPress={() => router.back()}
        title={arrived ? 'Active Job' : 'Start Job'}
        subtitle={SERVICE_LABELS[job.service_type]}
        hideBell
        backgroundColor={arrived ? '#7c3aed' : undefined}
        rightContent={arrived
          ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#ffffff30' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>In Progress</Text>
            </View>
          : undefined
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>

        {/* Live timer */}
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
          backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{SERVICE_LABELS[job.service_type]}</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {formatDate(job.service_date)} · {formatTime(job.service_time)}
            </Text>
            <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 1 }}>{job.property_sqm} sqm</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.primary }}>
            ₱{Number(job.base_price).toLocaleString()}
          </Text>
        </View>

        {/* Address + Map + Navigate */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb',
          overflow: 'hidden',
        }}>
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Service Location</Text>
            <TouchableOpacity onPress={openMaps} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="navigation" size={13} color={Colors.primary} />
              <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>Get Directions</Text>
            </TouchableOpacity>
          </View>

          {job.service_lat && job.service_lng ? (
            <MapView
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
            <Text style={{ fontSize: 14, color: '#111827', lineHeight: 20 }}>{fullAddress}</Text>
            {job.service_lat && (
              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                GPS: {job.service_lat.toFixed(5)}, {job.service_lng!.toFixed(5)}
              </Text>
            )}
          </View>
        </View>

        {/* Arrival verification */}
        {!arrived && (
          <View style={{
            backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
            borderColor: withinRange ? '#86efac' : '#e5e7eb', padding: 16,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 }}>
              Arrival Verification
            </Text>

            {distance !== null && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
                backgroundColor: withinRange ? '#f0fdf4' : '#fef9c3',
                borderRadius: 10, padding: 10,
              }}>
                <Feather
                  name={withinRange ? 'check-circle' : 'alert-circle'}
                  size={18}
                  color={withinRange ? '#16a34a' : '#ca8a04'}
                />
                <Text style={{ fontSize: 13, color: withinRange ? '#15803d' : '#92400e', fontWeight: '600' }}>
                  {withinRange
                    ? `You are ${distance}m away — within range!`
                    : `You are ${distance}m away — move closer (within ${ARRIVAL_RADIUS_METERS}m)`}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={checkArrival}
              disabled={locating}
              style={{
                backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 12,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
            >
              {locating
                ? <ActivityIndicator color={Colors.primary} />
                : <>
                    <Feather name="map-pin" size={16} color={Colors.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>
                      {distance === null ? 'Check My Location' : 'Re-check Location'}
                    </Text>
                  </>
              }
            </TouchableOpacity>

            {withinRange && (
              <TouchableOpacity
                onPress={confirmArrival}
                disabled={updating}
                style={{
                  backgroundColor: Colors.primary, borderRadius: 12,
                  paddingVertical: 14, alignItems: 'center', marginTop: 10,
                  opacity: updating ? 0.7 : 1, flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
              >
                {updating
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Feather name="play-circle" size={18} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Start Timer</Text>
                    </>
                }
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Special notes */}
        {job.special_notes && (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Special Notes</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', lineHeight: 20 }}>{job.special_notes}</Text>
          </View>
        )}

        {/* Collect Cash */}
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

        {/* Mark as Completed */}
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
