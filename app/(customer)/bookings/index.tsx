import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
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
  const C = useThemeColors()
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
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="My Bookings"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications')}
      />

      {/* Filter tabs */}
      <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
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
                backgroundColor: activeFilter === tab.key ? Colors.primary : C.white,
                borderWidth: 1,
                borderColor: activeFilter === tab.key ? Colors.primary : C.border,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: activeFilter === tab.key ? '#fff' : C.textSecondary,
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
          <View style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.borderLight, padding: 32, alignItems: 'center', marginTop: 16,
          }}>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: Colors.primary + '15',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <Feather name="calendar" size={26} color={Colors.primary} />
            </View>
            {activeFilter === 'all' ? (
              <>
                <Text style={{ color: C.text, fontWeight: '600', textAlign: 'center' }}>No bookings yet</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 }}>
                  Book your first cleaning to get started.
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                  onPress={() => router.push('/(customer)/bookings/new')}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Book Now</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ color: C.text, fontWeight: '600', textAlign: 'center' }}>
                  No {STATUS_LABELS[activeFilter as BookingStatus]?.toLowerCase()} bookings
                </Text>
                <TouchableOpacity onPress={() => setActiveFilter('all')} style={{ marginTop: 8 }}>
                  <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '600' }}>Clear filter</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
        renderItem={({ item: b }) => (
          <TouchableOpacity
            style={{
              backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
              borderColor: C.borderLight, padding: 16,
            }}
            onPress={() => router.push(`/(customer)/bookings/${b.id}`)}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>
                  {SERVICE_LABELS[b.service_type]}
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
                  {formatDate(b.service_date)} · {formatTime(b.service_time)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
                  ₱{Number(b.base_price).toLocaleString()}
                </Text>
                <View style={{
                  marginTop: 4, paddingHorizontal: 8, paddingVertical: 2,
                  borderRadius: 99, backgroundColor: STATUS_COLORS[b.status] + '18',
                }}>
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
          position: 'absolute', bottom: 24, right: 24,
          backgroundColor: Colors.primary, borderRadius: 28,
          paddingVertical: 14, paddingHorizontal: 20,
          shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}
        onPress={() => router.push('/(customer)/bookings/new')}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>+ Book Now</Text>
      </TouchableOpacity>
    </View>
  )
}
