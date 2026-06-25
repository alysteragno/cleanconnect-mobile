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
  const C = useThemeColors()
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
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="My Jobs"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      {/* Filter tabs */}
      <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border }}>
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
                backgroundColor: activeFilter === tab.key ? Colors.primary : C.white,
                borderWidth: 1,
                borderColor: activeFilter === tab.key ? Colors.primary : C.border,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: '600',
                color: activeFilter === tab.key ? '#fff' : C.textSecondary,
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
          <View style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.borderLight, padding: 32, alignItems: 'center', marginTop: 4,
          }}>
            <Feather name="briefcase" size={32} color={C.textMuted} style={{ marginBottom: 8 }} />
            <Text style={{ color: C.text, fontWeight: '600', textAlign: 'center' }}>
              {activeFilter === 'offered' ? 'No pending offers' : activeFilter === 'accepted' ? 'No upcoming jobs' : 'No completed jobs'}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
              {activeFilter === 'offered' ? 'New job offers will appear here.' : 'Check back later.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.borderLight, padding: 16,
          }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push(`/(cleaner)/jobs/${item.id}`)}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>
                    {SERVICE_LABELS[item.bookings?.service_type]}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {formatDate(item.bookings?.service_date)} · {formatTime(item.bookings?.service_time)}
                  </Text>
                  {item.bookings?.address_city && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Feather name="map-pin" size={10} color={C.textMuted} />
                      <Text style={{ fontSize: 12, color: C.textMuted }}>{item.bookings.address_city}</Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.textMuted }}>{item.bookings?.property_sqm} sqm</Text>
                {item.status === 'completed' && item.bookings?.customer && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="user" size={10} color={C.textMuted} />
                    <Text style={{ fontSize: 11, color: C.textMuted }}>{item.bookings.customer.full_name}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {item.status === 'offered' && (
              <View style={{
                flexDirection: 'row', gap: 8, marginTop: 12,
                paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderLight,
              }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => respondToOffer(item.id, true)}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: C.background, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => respondToOffer(item.id, false)}
                >
                  <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '600' }}>Decline</Text>
                </TouchableOpacity>
              </View>
            )}

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
