import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { Booking, BookingStatus, SERVICE_LABELS, STATUS_LABELS } from '@/constants/types'
import AppHeader from '@/components/AppHeader'

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: '#ca8a04',
  confirmed: Colors.primary,
  in_progress: '#7c3aed',
  completed: '#16a34a',
  cancelled: '#dc2626',
}

const FILTER_TABS: Array<{ key: BookingStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`
}

export default function BookingsScreen() {
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<BookingStatus | 'all'>('all')
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    loadBookings()
  }, [])

  async function loadBookings() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, service_type, service_date, service_time, base_price, status, payment_status, payment_method')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ])

    setBookings((data ?? []) as unknown as Booking[])
    setUnreadCount(count ?? 0)
    setLoading(false)
    setRefreshing(false)
  }

  function handleRefresh() {
    setRefreshing(true)
    loadBookings()
  }

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return bookings
    return bookings.filter(b => b.status === activeFilter)
  }, [bookings, activeFilter])

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
        title="My Bookings"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications')}
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
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: activeFilter === tab.key ? Colors.primary : '#fff',
                borderWidth: 1,
                borderColor: activeFilter === tab.key ? Colors.primary : '#e5e7eb',
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: activeFilter === tab.key ? '#fff' : '#6b7280',
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Text className="text-3xl mb-3">📋</Text>
            {activeFilter === 'all' ? (
              <>
                <Text className="text-gray-900 font-semibold text-center">No bookings yet</Text>
                <Text className="text-gray-400 text-sm text-center mt-1 mb-4">
                  Book your first cleaning to get started.
                </Text>
                <TouchableOpacity
                  className="bg-pink-600 rounded-xl px-6 py-3"
                  onPress={() => router.push('/(customer)/bookings/new')}
                >
                  <Text className="text-white font-semibold text-sm">Book Now</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-gray-900 font-semibold text-center">
                  No {STATUS_LABELS[activeFilter as BookingStatus]?.toLowerCase()} bookings
                </Text>
                <TouchableOpacity onPress={() => setActiveFilter('all')} className="mt-2">
                  <Text className="text-pink-600 text-sm font-semibold">Clear filter</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
        renderItem={({ item: b }) => (
          <TouchableOpacity
            className="bg-white rounded-2xl border border-gray-100 p-4"
            onPress={() => router.push(`/(customer)/bookings/${b.id}`)}
            activeOpacity={0.7}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-gray-900 font-semibold text-sm">
                  {SERVICE_LABELS[b.service_type]}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  {formatDate(b.service_date)} · {formatTime(b.service_time)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-900 font-bold text-sm">
                  ₱{Number(b.base_price).toLocaleString()}
                </Text>
                <View
                  style={{
                    marginTop: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 99,
                    backgroundColor: STATUS_COLORS[b.status] + '18',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: STATUS_COLORS[b.status] }}>
                    {STATUS_LABELS[b.status]}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* FAB — Book Now */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          backgroundColor: Colors.primary,
          borderRadius: 28,
          paddingVertical: 14,
          paddingHorizontal: 20,
          shadowColor: Colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
        onPress={() => router.push('/(customer)/bookings/new')}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>+ Book Now</Text>
      </TouchableOpacity>
    </View>
  )
}
