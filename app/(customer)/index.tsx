import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, RefreshControl, Image, FlatList, useWindowDimensions } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import { Booking } from '@/constants/types'
import AppHeader from '@/components/AppHeader'
import { loadDraft } from '@/lib/bookingDraft'
import * as Haptics from 'expo-haptics'
import { ServiceDef, getService } from '@/constants/services'
import { useServices } from '@/hooks/useServices'

const AD_BANNERS = [
  require('@/assets/adBanner/mattress_deepcleaning.webp'),
  require('@/assets/adBanner/post_construction.webp'),
  require('@/assets/adBanner/commercial_cleaning.webp'),
  require('@/assets/adBanner/restaurant.webp'),
  require('@/assets/adBanner/house.webp'),
  require('@/assets/adBanner/office_cleaning.webp'),
  require('@/assets/adBanner/services.webp'),
  require('@/assets/adBanner/shopcleaning.webp'),
]

function AdCarousel() {
  const [idx, setIdx] = useState(0)
  const listRef = useRef<FlatList>(null)
  const { width } = useWindowDimensions()
  const itemW = width - 40

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % AD_BANNERS.length
        listRef.current?.scrollToIndex({ index: next, animated: true })
        return next
      })
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  return (
    <View style={{ borderRadius: 20, overflow: 'hidden' }}>
      <FlatList
        ref={listRef}
        data={AD_BANNERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemW}
        decelerationRate="fast"
        getItemLayout={(_, i) => ({ length: itemW, offset: itemW * i, index: i })}
        onScrollToIndexFailed={info => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: true })
          }, 500)
        }}
        renderItem={({ item }) => (
          <Image source={item} style={{ width: itemW, height: 180 }} resizeMode="cover" />
        )}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={e => {
          setIdx(Math.round(e.nativeEvent.contentOffset.x / itemW))
        }}
      />
      <View style={{ position: 'absolute', bottom: 10, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {AD_BANNERS.map((_, i) => (
          <View key={i} style={{
            height: 5, width: i === idx ? 18 : 5,
            borderRadius: 3,
            backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.5)',
          }} />
        ))}
      </View>
    </View>
  )
}

function CategoryDivider({ label, icon, C }: { label: string; icon: string; C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.borderLight }} />
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: C.background,
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 99, borderWidth: 1, borderColor: C.borderLight,
      }}>
        <Feather name={icon as any} size={11} color={C.textMuted} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: C.textMuted, letterSpacing: 0.4 }}>
          {label}
        </Text>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: C.borderLight }} />
    </View>
  )
}

function ServiceCard({ svc, cardWidth, onPress, C, rating }: {
  svc: ServiceDef
  cardWidth: number
  onPress: () => void
  C: ReturnType<typeof useThemeColors>
  rating: { avg: number; count: number } | null
}) {
  const avg = rating?.avg ?? null
  const filled = avg !== null ? Math.round(avg) : 0

  return (
    <TouchableOpacity
      style={{
        width: cardWidth,
        backgroundColor: C.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.borderLight,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      }}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {svc.image ? (
        <Image source={svc.image} style={{ width: '100%', height: 120 }} resizeMode="cover" />
      ) : (
        <View style={{ width: '100%', height: 120, backgroundColor: svc.placeholderBg, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={svc.placeholderIcon as any} size={34} color={svc.placeholderIconColor} />
        </View>
      )}

      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 5 }}>
        {/* name */}
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, lineHeight: 16 }} numberOfLines={2}>
          {svc.name}
        </Text>

        {/* time | price */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Feather name="clock" size={10} color={C.textMuted} />
          <Text style={{ fontSize: 10, color: C.textMuted }}>{svc.duration}</Text>
          <Text style={{ fontSize: 10, color: C.borderLight, fontWeight: '700' }}>|</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary }}>
            ₱{svc.startingPrice.toLocaleString()}+
          </Text>
        </View>

        {/* stars */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <Text key={i} style={{ fontSize: 11, color: i <= filled ? '#f59e0b' : '#d1d5db', lineHeight: 14 }}>★</Text>
          ))}
          {avg !== null ? (
            <Text style={{ fontSize: 10, color: C.textMuted, marginLeft: 2 }}>
              {avg.toFixed(1)} ({rating!.count})
            </Text>
          ) : (
            <Text style={{ fontSize: 9, color: C.textMuted, marginLeft: 2 }}>No reviews</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function CustomerHomeScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()
  const { width } = useWindowDimensions()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [draft, setDraft] = useState<{ step: number; service_type: string | null; savedAt: string } | null>(null)
  const [inProgressBooking, setInProgressBooking] = useState<{ id: string; service_name: string | null; service_date: string; space_type: string | null } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [serviceRatings, setServiceRatings] = useState<Record<string, { avg: number; count: number }>>({})
  const { groups: serviceGroups } = useServices()
  const fabPulse = useRef(new Animated.Value(0)).current
  const fabRing  = useRef(new Animated.Value(0)).current

  const cardWidth = (width - 40 - 12) / 2

  useEffect(() => {
    if (!inProgressBooking) return
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(fabRing, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(fabRing, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(700),
      ])
    )
    pulse.start()
    ring.start()
    return () => { pulse.stop(); ring.stop(); fabPulse.setValue(0); fabRing.setValue(0) }
  }, [inProgressBooking])

  useEffect(() => { loadData() }, [])

  useFocusEffect(useCallback(() => {
    loadDraft().then(d => setDraft(d ? { step: d.step, service_type: d.form.service_type, savedAt: d.savedAt } : null))
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('bookings')
        .select('id, service_name, service_date, space_type')
        .eq('customer_id', user.id)
        .eq('status', 'in_progress')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setInProgressBooking(data ?? null))
    })
  }, []))


  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: profile }, { count }, { data: inProgress }, { data: feedbackRows }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
      supabase
        .from('bookings')
        .select('id, service_name, service_date, space_type')
        .eq('customer_id', user.id)
        .eq('status', 'in_progress')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('feedback')
        .select('rating, bookings!inner(service_slug)'),
    ])

    // Aggregate average rating per service_type, resolved from service_slug
    const byType: Record<string, { sum: number; count: number }> = {}
    ;(feedbackRows ?? []).forEach((f: any) => {
      const slug: string | undefined = f.bookings?.service_slug
      const st = slug ? getService(slug)?.serviceType : undefined
      if (!st) return
      if (!byType[st]) byType[st] = { sum: 0, count: 0 }
      byType[st].sum += f.rating
      byType[st].count++
    })
    const ratings: Record<string, { avg: number; count: number }> = {}
    Object.entries(byType).forEach(([k, v]) => {
      ratings[k] = { avg: v.sum / v.count, count: v.count }
    })

    setName(profile?.full_name?.split(' ')[0] ?? 'there')
    setUnreadCount(count ?? 0)
    setInProgressBooking(inProgress ?? null)
    setServiceRatings(ratings)
    setLoading(false)
    setRefreshing(false)
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
      <AppHeader
        greeting="Good day,"
        name={name}
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications')}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData() }}
            tintColor={isDark ? '#ffffff' : Colors.primary}
            colors={isDark ? ['#ffffff'] : [Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
          />
        }
      >
        <View style={s.body}>
          {/* ── Ad Banner Carousel ── */}
          <AdCarousel />

          {/* ── In-Progress Booking Card ── */}
          {inProgressBooking && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/(customer)/bookings/${inProgressBooking.id}` as any)}
              style={{
                backgroundColor: '#7c3aed', borderRadius: 16, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 14,
                shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
              }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="activity" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, marginBottom: 2 }}>IN PROGRESS</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }} numberOfLines={1}>
                  {inProgressBooking.service_name ?? 'Cleaning Service'}
                </Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                  {new Date(inProgressBooking.service_date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>View</Text>
                <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.85)" />
              </View>
            </TouchableOpacity>
          )}

          {/* ── Services Grid ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Choose Services</Text>
            {serviceGroups.map((group, gi) => (
              <View key={group.category} style={{ gap: 10 }}>
                {gi > 0 && (
                  <CategoryDivider label={group.category} icon={group.categoryIcon} C={C} />
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {group.items.map(svc => (
                    <ServiceCard
                      key={svc.slug}
                      svc={svc}
                      cardWidth={cardWidth}
                      C={C}
                      rating={serviceRatings[svc.serviceType] ?? null}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        router.push(`/(customer)/services/${svc.slug}` as any)
                      }}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Floating Book Now / Resume button */}
      <Animated.View
        style={[
          s.fabWrap,
          !!inProgressBooking && {
            transform: [{ scale: fabPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.03, 1] }) }],
          },
        ]}
      >
        {!!inProgressBooking && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
              borderRadius: 27,
              backgroundColor: Colors.primary,
              opacity: fabRing.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.3, 0.1, 0] }),
              transform: [{ scale: fabRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
            }}
          />
        )}
        <TouchableOpacity
          style={s.fab}
          onPress={() => router.push('/(customer)/bookings/new')}
          activeOpacity={0.85}
        >
          <Feather name={draft ? 'play' : 'plus'} size={18} color="#fff" />
          <Text style={s.fabText}>{draft ? 'Resume Booking' : 'Book a Service'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

function makeStyles(C: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
    body: { padding: 20, gap: 20 },

    section: { gap: 12 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },

    fabWrap: {
      position: 'absolute', bottom: 24, alignSelf: 'center', borderRadius: 27,
    },
    fab: {
      paddingHorizontal: 28, height: 54, borderRadius: 27,
      backgroundColor: Colors.primary,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
    },
    fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  })
}
