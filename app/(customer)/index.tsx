import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { Booking, BookingStatus, ServiceType, SERVICE_LABELS, STATUS_LABELS } from '@/constants/types'
import AppHeader from '@/components/AppHeader'
import { loadDraft, clearDraft } from '@/lib/bookingDraft'

const STEP_LABELS = ['Service Details', 'Address', 'Schedule', 'Review', 'Payment']

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
  const C = useThemeColors()
  const [name, setName] = useState('')
  const [recent, setRecent] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [draft, setDraft] = useState<{ step: number; service_type: string | null; savedAt: string } | null>(null)

  useEffect(() => { loadData() }, [])

  useFocusEffect(useCallback(() => {
    loadDraft().then(d => setDraft(d ? { step: d.step, service_type: d.form.service_type, savedAt: d.savedAt } : null))
  }, []))

  function handleDiscardDraft() {
    Alert.alert('Discard draft?', 'Your saved booking progress will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => { await clearDraft(); setDraft(null) } },
    ])
  }

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

  const s = useMemo(() => makeStyles(C), [C])

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
          {draft ? (
            <View style={s.hero}>
              <Feather name="wind" size={130} color="rgba(255,255,255,0.07)"
                style={{ position: 'absolute', bottom: -20, right: -20 }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <View style={[s.heroPill, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Feather name="clock" size={10} color="#fff" />
                  <Text style={s.heroPillText}>Draft Saved</Text>
                </View>
                <TouchableOpacity onPress={handleDiscardDraft} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>

              <Text style={s.heroTitle}>Continue your{'\n'}booking.</Text>
              <Text style={s.heroSub}>
                Step {draft.step} of 5 — {STEP_LABELS[draft.step - 1]}
                {draft.service_type ? ` · ${SERVICE_LABELS[draft.service_type as ServiceType]}` : ''}
              </Text>

              {/* Step progress dots */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 18 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <View key={n} style={{
                    height: 4, flex: 1, borderRadius: 2,
                    backgroundColor: n <= draft.step ? '#fff' : 'rgba(255,255,255,0.3)',
                  }} />
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => router.push('/(customer)/bookings/new')}
                  style={{
                    flex: 1, backgroundColor: '#fff', borderRadius: 12,
                    paddingVertical: 12, alignItems: 'center', flexDirection: 'row',
                    justifyContent: 'center', gap: 6,
                  }}
                >
                  <Feather name="play" size={14} color={Colors.primary} />
                  <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 14 }}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDiscardDraft}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 13 }}>Start new</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
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
          )}

          {/* ── Recent bookings ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recent Bookings </Text>
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
                      <Feather name="chevron-right" size={14} color={C.textMuted} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Floating Book Now / Resume button */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/(customer)/bookings/new')}
        activeOpacity={0.85}
      >
        <Feather name={draft ? 'play' : 'plus'} size={18} color="#fff" />
        <Text style={s.fabText}>{draft ? 'Resume Booking' : 'Book a Cleaner'}</Text>
      </TouchableOpacity>
    </View>
  )
}

function makeStyles(C: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
    body: { padding: 20, gap: 20 },

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

    section: { gap: 12 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    sectionLink: { fontSize: 12, fontWeight: '600', color: Colors.primary },

    card: {
      backgroundColor: C.white, borderRadius: 16,
      borderWidth: 1, borderColor: C.borderLight,
      overflow: 'hidden',
    },
    bookingRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
    },
    bookingDivider: { borderBottomWidth: 1, borderBottomColor: C.borderLight },
    svcIcon: {
      width: 40, height: 40, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    bookingName: { fontSize: 13, fontWeight: '600', color: C.text },
    bookingDate: { fontSize: 11, color: C.textMuted, marginTop: 2 },
    statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
    statusText: { fontSize: 10, fontWeight: '700' },
    bookingPrice: { fontSize: 12, fontWeight: '700', color: C.text },

    empty: {
      backgroundColor: C.white, borderRadius: 16,
      borderWidth: 1, borderColor: C.borderLight,
      padding: 32, alignItems: 'center', gap: 8,
    },
    emptyIcon: {
      width: 56, height: 56, borderRadius: 16,
      backgroundColor: C.primaryLight,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 4,
    },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 18 },

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
}
