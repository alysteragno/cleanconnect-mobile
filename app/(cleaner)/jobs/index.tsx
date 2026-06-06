import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { SERVICE_LABELS, ServiceType } from '@/constants/types'
import AppHeader from '@/components/AppHeader'

type Assignment = {
  id: string
  booking_id: string
  status: string
  bookings: {
    service_type: ServiceType
    service_date: string
    service_time: string
    property_sqm: number
    base_price: number
    address_city: string | null
    address_street: string | null
    status: string
    customer: { full_name: string } | null
  }
}

const FILTER_TABS = [
  { key: 'offered', label: 'Offers' },
  { key: 'accepted', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
]

const STATUS_COLORS: Record<string, string> = {
  offered: '#ca8a04',
  accepted: Colors.primary,
  completed: '#16a34a',
  declined: '#6b7280',
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

export default function CleanerJobsScreen() {
  const router = useRouter()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('offered')
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('cleaner_assignments')
        .select(`
          id, booking_id, status,
          bookings (service_type, service_date, service_time, property_sqm, base_price, address_city, address_street, status, customer:profiles!customer_id(full_name))
        `)
        .eq('cleaner_id', user.id)
        .neq('status', 'declined')
        .order('assigned_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ])

    setAssignments((data ?? []) as unknown as Assignment[])
    setUnreadCount(count ?? 0)
    setLoading(false)
    setRefreshing(false)
  }

  async function respondToOffer(assignmentId: string, accept: boolean) {
    await supabase
      .from('cleaner_assignments')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', assignmentId)

    setAssignments(prev =>
      accept
        ? prev.map(a => a.id === assignmentId ? { ...a, status: 'accepted' } : a)
        : prev.filter(a => a.id !== assignmentId)
    )
  }

  const filtered = useMemo(
    () => assignments.filter(a => a.status === activeFilter),
    [assignments, activeFilter]
  )

  const offeredCount = assignments.filter(a => a.status === 'offered').length

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-gray-50">
      <AppHeader
        title="My Jobs"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      {/* Filter tabs */}
      <View className="bg-white border-b border-gray-100">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        >
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveFilter(tab.key)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                backgroundColor: activeFilter === tab.key ? Colors.primary : '#fff',
                borderWidth: 1,
                borderColor: activeFilter === tab.key ? Colors.primary : '#e5e7eb',
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: '600',
                color: activeFilter === tab.key ? '#fff' : '#6b7280',
              }}>
                {tab.label}
              </Text>
              {tab.key === 'offered' && offeredCount > 0 && (
                <View style={{
                  backgroundColor: activeFilter === 'offered' ? '#fff' : Colors.primary,
                  borderRadius: 99, width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '700',
                    color: activeFilter === 'offered' ? Colors.primary : '#fff',
                  }}>
                    {offeredCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadJobs() }} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Feather name="briefcase" size={32} color={Colors.textMuted} style={{ marginBottom: 8 }} />
            <Text className="text-gray-900 font-semibold text-center">
              {activeFilter === 'offered' ? 'No pending offers' : activeFilter === 'accepted' ? 'No upcoming jobs' : 'No completed jobs'}
            </Text>
            <Text className="text-gray-400 text-sm text-center mt-1">
              {activeFilter === 'offered' ? 'New job offers will appear here.' : 'Check back later.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white rounded-2xl border border-gray-100 p-4">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push(`/(cleaner)/jobs/${item.id}`)}
            >
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 mr-3">
                  <Text className="text-sm font-semibold text-gray-900">
                    {SERVICE_LABELS[item.bookings?.service_type]}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {formatDate(item.bookings?.service_date)} · {formatTime(item.bookings?.service_time)}
                  </Text>
                  {item.bookings?.address_city && (
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Feather name="map-pin" size={10} color={Colors.textMuted} />
                      <Text className="text-xs text-gray-400">{item.bookings.address_city}</Text>
                    </View>
                  )}
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-gray-900">
                    ₱{Number(item.bookings?.base_price).toLocaleString()}
                  </Text>
                  <View style={{
                    marginTop: 4, paddingHorizontal: 8, paddingVertical: 2,
                    borderRadius: 99, backgroundColor: (STATUS_COLORS[item.status] ?? '#6b7280') + '18',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: STATUS_COLORS[item.status] ?? '#6b7280', textTransform: 'capitalize' }}>
                      {item.status}
                    </Text>
                  </View>
                </View>
              </View>
              <View className="flex-row items-center justify-between mt-0.5">
                <Text className="text-xs text-gray-400">{item.bookings?.property_sqm} sqm</Text>
                {item.status === 'completed' && item.bookings?.customer && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="user" size={10} color="#9ca3af" />
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{item.bookings.customer.full_name}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Offer actions */}
            {item.status === 'offered' && (
              <View className="flex-row gap-2 mt-3 pt-3 border-t border-gray-50">
                <TouchableOpacity
                  className="flex-1 bg-pink-600 rounded-xl py-2.5 items-center"
                  onPress={() => respondToOffer(item.id, true)}
                >
                  <Text className="text-white text-sm font-semibold">Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-gray-100 rounded-xl py-2.5 items-center"
                  onPress={() => respondToOffer(item.id, false)}
                >
                  <Text className="text-gray-600 text-sm font-semibold">Decline</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Go to active job */}
            {item.status === 'accepted' && item.bookings?.status === 'in_progress' && (
              <TouchableOpacity
                style={{
                  marginTop: 10, backgroundColor: '#7c3aed', borderRadius: 12,
                  paddingVertical: 10, alignItems: 'center',
                }}
                onPress={() => router.push(`/(cleaner)/jobs/active?assignmentId=${item.id}&bookingId=${item.booking_id}`)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Active Job — Open</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  )
}
