import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { ServiceType, SERVICE_LABELS } from '@/constants/types'
import AppHeader from '@/components/AppHeader'

type JobOffer = {
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
  }
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
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function todayLabel() {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export default function CleanerHomeScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [offers, setOffers] = useState<JobOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: profile }, { data: assignments }, { count }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase
        .from('cleaner_assignments')
        .select(`
          id, booking_id, status,
          bookings (service_type, service_date, service_time, property_sqm, base_price, address_city)
        `)
        .eq('cleaner_id', user.id)
        .eq('status', 'offered')
        .order('assigned_at', { ascending: false })
        .limit(5),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ])

    setName(profile?.full_name?.split(' ')[0] ?? 'there')
    setOffers((assignments ?? []) as unknown as JobOffer[])
    setUnreadCount(count ?? 0)
    setLoading(false)
  }

  async function respondToOffer(assignmentId: string, accept: boolean) {
    await supabase
      .from('cleaner_assignments')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', assignmentId)
    setOffers(prev => prev.filter(o => o.id !== assignmentId))
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
      <AppHeader
        title="Home"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      <View style={s.body}>

        {/* ── Greeting card ── */}
        <View style={s.greetingCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.greetingLabel}>Welcome back,</Text>
            <Text style={s.greetingName}>{name}</Text>
            <Text style={s.greetingDate}>{todayLabel()}</Text>
          </View>
          {offers.length > 0 && (
            <View style={s.offersBadge}>
              <Text style={s.offersBadgeNum}>{offers.length}</Text>
              <Text style={s.offersBadgeLabel}>
                new offer{offers.length > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

      

        {/* ── Job Offers ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>
              Job Offers{offers.length > 0 ? ` (${offers.length})` : ''}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(cleaner)/jobs')}>
              <Text style={s.sectionLink}>All jobs</Text>
            </TouchableOpacity>
          </View>

          {offers.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Feather name="inbox" size={28} color={Colors.primary} />
              </View>
              <Text style={s.emptyTitle}>No pending offers</Text>
              <Text style={s.emptySub}>New job offers from the dispatch team will show up here.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {offers.map(offer => {
                const svc = SVC[offer.bookings?.service_type as ServiceType] ?? SVC.general
                return (
                  <View key={offer.id} style={s.offerCard}>

                    {/* Top row: icon + service + price */}
                    <View style={s.offerTop}>
                      <View style={[s.offerIcon, { backgroundColor: svc.bg }]}>
                        <Feather name={svc.icon as any} size={20} color={svc.color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.offerService}>
                          {SERVICE_LABELS[offer.bookings?.service_type as ServiceType]}
                        </Text>
                        <Text style={s.offerMeta}>
                          {formatDate(offer.bookings?.service_date)} · {formatTime(offer.bookings?.service_time)}
                        </Text>
                      </View>
                      <Text style={s.offerPrice}>
                        ₱{Number(offer.bookings?.base_price).toLocaleString()}
                      </Text>
                    </View>

                    {/* Detail chips */}
                    <View style={s.offerChips}>
                      {offer.bookings?.address_city && (
                        <View style={s.chip}>
                          <Feather name="map-pin" size={10} color={Colors.textSecondary} />
                          <Text style={s.chipText}>{offer.bookings.address_city}</Text>
                        </View>
                      )}
                      <View style={s.chip}>
                        <Feather name="maximize" size={10} color={Colors.textSecondary} />
                        <Text style={s.chipText}>{offer.bookings?.property_sqm} sqm</Text>
                      </View>
                    </View>

                    {/* Divider */}
                    <View style={s.offerDivider} />

                    {/* Action buttons */}
                    <View style={s.offerActions}>
                      <TouchableOpacity
                        style={s.acceptBtn}
                        onPress={() => respondToOffer(offer.id, true)}
                        activeOpacity={0.8}
                      >
                        <Feather name="check" size={14} color="#fff" />
                        <Text style={s.acceptText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.declineBtn}
                        onPress={() => respondToOffer(offer.id, false)}
                        activeOpacity={0.8}
                      >
                        <Feather name="x" size={14} color={Colors.textSecondary} />
                        <Text style={s.declineText}>Decline</Text>
                      </TouchableOpacity>
                    </View>

                  </View>
                )
              })}
            </View>
          )}
        </View>

      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  body: { padding: 20, gap: 20 },

  // Greeting
  greetingCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.borderLight,
    padding: 20, flexDirection: 'row', alignItems: 'center',
  },
  greetingLabel: { fontSize: 13, color: Colors.textMuted },
  greetingName: { fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 1 },
  greetingDate: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  offersBadge: {
    backgroundColor: Colors.primaryLight, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center',
  },
  offersBadgeNum: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  offersBadgeLabel: { fontSize: 10, fontWeight: '600', color: Colors.primary, marginTop: 1 },

  // Quick nav
  quickRow: { flexDirection: 'row', gap: 12 },
  quickItem: { flex: 1, alignItems: 'center', gap: 8 },
  quickIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },

  // Section
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sectionLink: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  // Offer card
  offerCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.borderLight,
    padding: 16,
  },
  offerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  offerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  offerService: { fontSize: 14, fontWeight: '700', color: Colors.text },
  offerMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  offerPrice: { fontSize: 18, fontWeight: '800', color: Colors.text },
  offerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.background, borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  chipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  offerDivider: { height: 1, backgroundColor: Colors.borderLight, marginBottom: 14 },
  offerActions: { flexDirection: 'row', gap: 10 },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12,
  },
  acceptText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  declineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  declineText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

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
})
