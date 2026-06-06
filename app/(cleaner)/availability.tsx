import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, SectionList,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { SERVICE_LABELS, ServiceType } from '@/constants/types'

type ScheduleItem = {
  id: string
  booking_id: string
  bookings: {
    service_type: ServiceType
    service_date: string
    service_time: string
    property_sqm: number
    address_city: string | null
    status: string
  }
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}
function formatDateShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function CleanerScheduleScreen() {
  const router = useRouter()
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadSchedule() }, [])

  async function loadSchedule() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('cleaner_assignments')
      .select(`
        id, booking_id,
        bookings (service_type, service_date, service_time, property_sqm, address_city, status)
      `)
      .eq('cleaner_id', user.id)
      .eq('status', 'accepted')
      .order('assigned_at', { ascending: true })

    setItems((data ?? []) as unknown as ScheduleItem[])
    setLoading(false)
    setRefreshing(false)
  }

  const sections = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = items
      .filter(i => i.bookings?.service_date >= today)
      .sort((a, b) => a.bookings.service_date.localeCompare(b.bookings.service_date))

    const byDate: Record<string, ScheduleItem[]> = {}
    for (const item of upcoming) {
      const d = item.bookings.service_date
      if (!byDate[d]) byDate[d] = []
      byDate[d].push(item)
    }

    return Object.entries(byDate).map(([date, data]) => ({
      title: date,
      data,
    }))
  }, [items])

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-pink-600 px-6 pt-16 pb-6">
        <Text className="text-white text-xl font-bold">My Schedule</Text>
        <Text className="text-pink-200 text-sm mt-0.5">Upcoming accepted jobs</Text>
      </View>

      {sections.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Feather name="calendar" size={40} color={Colors.textMuted} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', textAlign: 'center' }}>
            No upcoming jobs
          </Text>
          <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>
            Accept job offers to see them on your schedule.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
            onPress={() => router.push('/(cleaner)/jobs')}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>View Job Offers</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 4 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSchedule() }} tintColor={Colors.primary} />
          }
          renderSectionHeader={({ section }) => (
            <View style={{
              paddingVertical: 10, paddingHorizontal: 4, marginTop: 8,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.primary }}>
                {formatDate(section.title)}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{
                backgroundColor: '#fff', borderRadius: 14, borderWidth: 1,
                borderColor: '#e5e7eb', padding: 14, marginBottom: 8,
                flexDirection: 'row', alignItems: 'center', gap: 12,
              }}
              onPress={() => router.push(`/(cleaner)/jobs/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={{
                width: 48, height: 48, borderRadius: 12,
                backgroundColor: Colors.primary + '15',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="briefcase" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
                  {SERVICE_LABELS[item.bookings?.service_type]}
                </Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  {formatTime(item.bookings?.service_time)} · {item.bookings?.property_sqm} sqm
                </Text>
                {item.bookings?.address_city && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Feather name="map-pin" size={11} color="#9ca3af" />
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>{item.bookings.address_city}</Text>
                  </View>
                )}
              </View>
              <Feather name="chevron-right" size={16} color="#d1d5db" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}
