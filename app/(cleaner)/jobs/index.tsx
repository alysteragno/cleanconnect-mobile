import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, Image,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import { getService } from '@/constants/services'
import AppHeader from '@/components/AppHeader'

type Assignment = {
  id: string
  booking_id: string
  status: string
  bookings: {
    service_slug: string
    service_name: string | null
    service_date: string
    service_time: string
    property_sqm: number
    base_price: number
    duration_hours: number
    address_unit: string | null
    address_street: string | null
    address_city: string | null
    address_province: string | null
    status: string
    payment_method: string
    payment_status: string
    customer: { full_name: string } | null
  }
}

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  bank_check:    'Bank Check',
}

const FILTER_TABS = [
  { key: 'assigned', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
]

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function CleanerJobsScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('assigned')
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
          bookings (
            service_slug, service_name, service_date, service_time, property_sqm,
            base_price, duration_hours, address_unit, address_street, address_city,
            address_province, status, payment_method, payment_status,
            customer:profiles!customer_id(full_name)
          )
        `)
        .eq('cleaner_id', user.id)
        .in('status', ['assigned', 'completed'])
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

  const filtered = useMemo(
    () => assignments.filter(a => a.status === activeFilter),
    [assignments, activeFilter]
  )

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
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: '600',
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
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadJobs() }}
            tintColor={isDark ? '#ffffff' : Colors.primary}
            colors={[Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
          />
        }
        ListEmptyComponent={
          <View style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.borderLight, padding: 32, alignItems: 'center', marginTop: 4,
          }}>
            <Feather name="briefcase" size={32} color={C.textMuted} style={{ marginBottom: 8 }} />
            <Text style={{ color: C.text, fontWeight: '600', textAlign: 'center' }}>
              {activeFilter === 'assigned' ? 'No upcoming jobs' : 'No completed jobs'}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
              Check back later.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const svc = getService(item.bookings?.service_slug ?? '')
          const b = item.bookings
          const isCompleted = item.status === 'completed'
          const isInProgress = b?.status === 'in_progress'
          const address = [b?.address_unit, b?.address_street, b?.address_city, b?.address_province]
            .filter(Boolean).join(', ')

          return (
            <View style={{
              backgroundColor: C.white, borderRadius: 20, borderWidth: 1,
              borderColor: C.borderLight, overflow: 'hidden',
            }}>
              {/* Service image */}
              {svc?.image ? (
                <Image source={svc.image} style={{ width: '100%', height: 160 }} resizeMode="cover" />
              ) : (
                <View style={{
                  width: '100%', height: 130,
                  backgroundColor: svc?.placeholderBg ?? '#fce7f3',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather
                    name={(svc?.placeholderIcon ?? 'home') as any}
                    size={40}
                    color={svc?.placeholderIconColor ?? Colors.primary}
                    style={{ opacity: 0.55 }}
                  />
                </View>
              )}

              {/* Status + price row */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
              }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
                  backgroundColor: isCompleted ? '#dcfce7' : isInProgress ? '#ede9fe' : Colors.primary + '15',
                }}>
                  <View style={{
                    width: 6, height: 6, borderRadius: 3,
                    backgroundColor: isCompleted ? '#16a34a' : isInProgress ? '#7c3aed' : Colors.primary,
                  }} />
                  <Text style={{
                    fontSize: 11, fontWeight: '700',
                    color: isCompleted ? '#16a34a' : isInProgress ? '#7c3aed' : Colors.primary,
                  }}>
                    {isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Upcoming'}
                  </Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>
                  ₱{Number(b?.base_price).toLocaleString()}
                </Text>
              </View>

              {/* Service name */}
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, paddingHorizontal: 16, paddingTop: 6 }}>
                {svc?.name ?? b?.service_name ?? 'Cleaning Service'}
              </Text>

              {/* Details rows */}
              <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="calendar" size={13} color={C.textMuted} />
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>
                    {formatDate(b?.service_date ?? '')} · {formatTime(b?.service_time ?? '')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="home" size={13} color={C.textMuted} />
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>
                    {b?.property_sqm} sqm · ~{b?.duration_hours}h
                  </Text>
                </View>
                {address ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <Feather name="map-pin" size={13} color={C.textMuted} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 13, color: C.textSecondary, flex: 1, lineHeight: 18 }}>{address}</Text>
                  </View>
                ) : null}
                {b?.customer?.full_name ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="user" size={13} color={C.textMuted} />
                    <Text style={{ fontSize: 13, color: C.textSecondary }}>{b.customer.full_name}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="credit-card" size={13} color={C.textMuted} />
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>
                    {PAYMENT_LABELS[b?.payment_method ?? ''] ?? b?.payment_method} ·{' '}
                    <Text style={{ fontWeight: '700', color: b?.payment_status === 'paid' ? '#16a34a' : C.textMuted }}>
                      {b?.payment_status === 'paid' ? 'Paid' : 'Pending'}
                    </Text>
                  </Text>
                </View>
              </View>

              {/* 5-star waiting for review (completed only) */}
              {isCompleted && (
                <View style={{
                  marginHorizontal: 16, marginTop: 12, marginBottom: 4,
                  backgroundColor: '#fffbeb', borderRadius: 12, borderWidth: 1,
                  borderColor: '#b4a56bff', paddingHorizontal: 14, paddingVertical: 10,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {[1,2,3,4,5].map(n => (
                      <Feather key={n} name="star" size={16} color="#fde68a" />
                    ))}
                  </View>
                  <Text style={{ fontSize: 12, color: '#92400e', fontWeight: '600' }}>
                    Waiting for customer review
                  </Text>
                </View>
              )}

              {/* Divider + action button */}
              <View style={{ height: 1, backgroundColor: C.borderLight, marginTop: 12 }} />
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 14,
                  backgroundColor: isCompleted ? C.background : isInProgress ? '#7c3aed' : Colors.primary,
                }}
              >
              </TouchableOpacity>
            </View>
          )
        }}
      />
    </View>
  )
}
