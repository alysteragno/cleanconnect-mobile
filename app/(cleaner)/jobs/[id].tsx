import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { SERVICE_LABELS, ServiceType } from '@/constants/types'

type Assignment = {
  id: string
  booking_id: string
  status: string
  bookings: {
    service_type: ServiceType
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
    branches: { name: string } | null
  }
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

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(false)

  useEffect(() => { loadAssignment() }, [id])

  async function loadAssignment() {
    const { data } = await supabase
      .from('cleaner_assignments')
      .select(`
        id, booking_id, status,
        bookings (
          service_type, space_type, service_date, service_time, property_sqm,
          base_price, duration_hours, address_unit, address_street, address_city,
          address_province, service_lat, service_lng, special_notes, status,
          payment_method, branches (name)
        )
      `)
      .eq('id', id)
      .single()

    setAssignment(data as unknown as Assignment)
    setLoading(false)
  }

  async function respondToOffer(accept: boolean) {
    setResponding(true)
    await supabase
      .from('cleaner_assignments')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', id)

    setResponding(false)
    if (accept) {
      setAssignment(prev => prev ? { ...prev, status: 'accepted' } : prev)
    } else {
      router.back()
    }
  }

  function openMaps() {
    const b = assignment?.bookings
    if (!b) return

    const address = [b.address_unit, b.address_street, b.address_city, b.address_province]
      .filter(Boolean).join(', ')

    if (b.service_lat && b.service_lng) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${b.service_lat},${b.service_lng}`
      Linking.openURL(url)
    } else if (address) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
      Linking.openURL(url)
    } else {
      Alert.alert('No location', 'No address or GPS coordinates available for this job.')
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (!assignment) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#6b7280' }}>Job not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const b = assignment.bookings
  const fullAddress = [b.address_unit, b.address_street, b.address_city, b.address_province]
    .filter(Boolean).join(', ') || '—'

  const statusColors: Record<string, string> = {
    offered: '#ca8a04', accepted: Colors.primary, completed: '#16a34a', declined: '#6b7280',
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{
        backgroundColor: Colors.primary,
        paddingTop: 56, paddingBottom: 20, paddingHorizontal: 24,
        flexDirection: 'row', alignItems: 'center',
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
            {SERVICE_LABELS[b.service_type]}
          </Text>
          <Text style={{ color: '#fbcfe8', fontSize: 12, marginTop: 2 }}>
            Job #{assignment.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        <View style={{
          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
          backgroundColor: (statusColors[assignment.status] ?? '#6b7280') + '30',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff', textTransform: 'capitalize' }}>
            {assignment.status}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>

        {/* Service details */}
        <DetailCard title="Job Details" rows={[
          { label: 'Service', value: SERVICE_LABELS[b.service_type] },
          { label: 'Space', value: b.space_type === 'residential' ? 'Residential' : 'Commercial' },
          { label: 'Size', value: `${b.property_sqm} sqm` },
          { label: 'Duration', value: `~${b.duration_hours}h` },
          { label: 'Pay', value: `₱${Number(b.base_price).toLocaleString()}` },
          ...(b.branches ? [{ label: 'Branch', value: b.branches.name }] : []),
        ]} />

        {/* Schedule */}
        <DetailCard title="Schedule" rows={[
          { label: 'Date', value: formatDate(b.service_date) },
          { label: 'Time', value: formatTime(b.service_time) },
        ]} />

        {/* Address */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
          borderColor: '#e5e7eb', overflow: 'hidden',
        }}>
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Service Address</Text>
            <TouchableOpacity
              onPress={openMaps}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Feather name="navigation" size={13} color={Colors.primary} />
              <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>Navigate</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 14, color: '#111827', lineHeight: 20 }}>{fullAddress}</Text>
            {b.service_lat && (
              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                GPS: {b.service_lat.toFixed(5)}, {b.service_lng!.toFixed(5)}
              </Text>
            )}
          </View>
        </View>

        {/* Special notes */}
        {b.special_notes && (
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Special Notes</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', lineHeight: 20 }}>{b.special_notes}</Text>
          </View>
        )}

        {/* Offer actions */}
        {assignment.status === 'offered' && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              onPress={() => respondToOffer(false)}
              disabled={responding}
              style={{
                flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb',
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '600' }}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => respondToOffer(true)}
              disabled={responding}
              style={{
                flex: 2, backgroundColor: Colors.primary, borderRadius: 14,
                paddingVertical: 14, alignItems: 'center', opacity: responding ? 0.7 : 1,
              }}
            >
              {responding
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Accept Job</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Go to active job */}
        {assignment.status === 'accepted' && b.status === 'in_progress' && (
          <TouchableOpacity
            style={{
              backgroundColor: '#7c3aed', borderRadius: 14, paddingVertical: 15,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}
            onPress={() => router.push(`/(cleaner)/jobs/active?assignmentId=${assignment.id}&bookingId=${assignment.booking_id}`)}
          >
            <Feather name="zap" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Go to Active Job</Text>
          </TouchableOpacity>
        )}

        {/* Start job (if accepted and booking confirmed) */}
        {assignment.status === 'accepted' && b.status === 'confirmed' && (
          <TouchableOpacity
            style={{
              backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15,
              alignItems: 'center',
            }}
            onPress={() => router.push(`/(cleaner)/jobs/active?assignmentId=${assignment.id}&bookingId=${assignment.booking_id}`)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Start Job</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  )
}

function DetailCard({ title, rows }: {
  title: string
  rows: Array<{ label: string; value: string; highlight?: boolean }>
}) {
  return (
    <View style={{
      backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
      borderColor: '#e5e7eb', overflow: 'hidden',
    }}>
      <View style={{
        backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
      }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>{title}</Text>
      </View>
      {rows.map((row, i) => (
        <View key={row.label} style={{
          flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 11,
          borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: '#f3f4f6',
        }}>
          <Text style={{ width: 90, fontSize: 13, color: '#6b7280' }}>{row.label}</Text>
          <Text style={{
            flex: 1, fontSize: 13, fontWeight: '600',
            color: row.highlight ? '#16a34a' : '#111827',
          }}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  )
}
