import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { Booking, BookingStatus, ServiceType, SERVICE_LABELS, STATUS_LABELS } from '@/constants/types'
import AppHeader from '@/components/AppHeader'

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: Colors.warning,
  confirmed: Colors.primary,
  in_progress: '#7c3aed',
  completed: Colors.success,
  cancelled: Colors.error,
}

const SVC: Record<ServiceType, { icon: string; color: string; bg: string }> = {
  general:            { icon: 'home',    color: '#0891b2', bg: '#e0f2fe' },
  premium_mattress:   { icon: 'layers',  color: '#7c3aed', bg: '#ede9fe' },
  complete:           { icon: 'star',    color: '#db2777', bg: '#fce7f3' },
  disinfection:       { icon: 'shield',  color: '#16a34a', bg: '#dcfce7' },
  post_construction:  { icon: 'tool',    color: '#ca8a04', bg: '#fef9c3' },
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function CustomerHomeScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [recent, setRecent] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: profile }, { data: bookings }, { count }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase
        .from('bookings')
        .select('id, service_type, service_date, base_price, status')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ])

    setName(profile?.full_name?.split(' ')[0] ?? 'there')
    setRecent((bookings ?? []) as unknown as Booking[])
    setUnreadCount(count ?? 0)
    setLoading(false)
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={s.screen}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        <AppHeader
          greeting="Good day,"
          name={name}
          unreadCount={unreadCount}
          onBellPress={() => router.push('/(customer)/notifications')}
        />

        <View style={s.body}>

          {/* ── Hero booking card ── */}
          <TouchableOpacity
            style={s.hero}
            onPress={() => router.push('/(customer)/bookings/new')}
            activeOpacity={0.9}
          >
            <Feather name="wind" size={130} color="rgba(255,255,255,0.07)"
              style={{ position: 'absolute', bottom: -20, right: -20 }} />

            <View style={s.heroPill}>
              <Feather name="star" size={10} color={Colors.primary} />
              <Text style={s.heroPillText}>Maid For You Cleaning Services</Text>
            </View>

            <Text style={s.heroTitle}>Book your next{'\n'}cleaning today.</Text>
            <Text style={s.heroSub}>Professional · Trusted · Affordable</Text>
          </TouchableOpacity>

          {/* ── Recent bookings ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recent Bookings</Text>
              <TouchableOpacity onPress={() => router.push('/(customer)/bookings')}>
                <Text style={s.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>

            {recent.length === 0 ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Feather name="calendar" size={28} color={Colors.primary} />
                </View>
                <Text style={s.emptyTitle}>No bookings yet</Text>
                <Text style={s.emptySub}>Your bookings will appear here once you book a cleaning.</Text>
              </View>
            ) : (
              <View style={s.card}>
                {recent.map((b, i) => {
                  const svc = SVC[b.service_type] ?? SVC.general
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[s.bookingRow, i < recent.length - 1 && s.bookingDivider]}
                      onPress={() => router.push(`/(customer)/bookings/${b.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.svcIcon, { backgroundColor: svc.bg }]}>
                        <Feather name={svc.icon as any} size={16} color={svc.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.bookingName}>{SERVICE_LABELS[b.service_type]}</Text>
                        <Text style={s.bookingDate}>{formatDate(b.service_date)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[s.statusPill, { backgroundColor: STATUS_COLORS[b.status] + '18' }]}>
                          <Text style={[s.statusText, { color: STATUS_COLORS[b.status] }]}>
                            {STATUS_LABELS[b.status]}
                          </Text>
                        </View>
                        <Text style={s.bookingPrice}>₱{Number(b.base_price).toLocaleString()}</Text>
                      </View>
                      <Feather name="chevron-right" size={14} color={Colors.textMuted} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Floating Book Now button */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/(customer)/bookings/new')}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={18} color="#fff" />
        <Text style={s.fabText}>Book a Cleaner</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  body: { padding: 20, gap: 20 },

  // Hero
  hero: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
  },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 99, marginBottom: 14,
  },
  heroPillText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', lineHeight: 32, marginBottom: 6 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 20 },

  // Section
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sectionLink: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  // Card
  card: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  bookingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  bookingDivider: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  svcIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  bookingName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  bookingDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  statusText: { fontSize: 10, fontWeight: '700' },
  bookingPrice: { fontSize: 12, fontWeight: '700', color: Colors.text },

  // Empty
  empty: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.borderLight,
    padding: 32, alignItems: 'center', gap: 8,
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // FAB
  fab: {
    position: 'absolute', bottom: 24,
    alignSelf: 'center',
    paddingHorizontal: 28, height: 54, borderRadius: 27,
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
