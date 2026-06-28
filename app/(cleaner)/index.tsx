import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, RefreshControl, Image, Alert,
  Animated, PanResponder, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useTheme } from '@/context/ThemeContext'
import { useThemeColors } from '@/hooks/useThemeColors'
import { ServiceType } from '@/constants/types'
import { getService } from '@/constants/services'
import AppHeader from '@/components/AppHeader'
import JobLocationModal from '@/components/JobLocationModal'

type JobOffer = {
  id: string
  booking_id: string
  status: string
  bookings: {
    service_slug: string
    service_date: string
    service_time: string
    property_sqm: number
    base_price: number
    address_city: string | null
    address_street: string | null
    address_unit: string | null
    service_lat: number | null
    service_lng: number | null
    customer_id: string
    status: string
    payment_method: string
    payment_status: string
    special_notes: string | null
    customer: { full_name: string } | null
  }
}

const SVC: Record<ServiceType, { icon: string; color: string; bg: string }> = {
  general:           { icon: 'home',   color: '#0891b2', bg: '#e0f2fe' },
  deep_cleaning:     { icon: 'layers', color: '#7c3aed', bg: '#ede9fe' },
  complete:          { icon: 'star',   color: '#db2777', bg: '#fce7f3' },
  disinfection:      { icon: 'shield', color: '#16a34a', bg: '#dcfce7' },
  post_construction: { icon: 'tool',   color: '#ca8a04', bg: '#fef9c3' },
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(t: string | null | undefined) {
  if (!t) return '—'
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

function todayLabel() {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}


function makeStyles(C: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
    body: { padding: 20, gap: 20, paddingBottom: 32 },

    greetingCard: {
      backgroundColor: C.white, borderRadius: 16,
      borderWidth: 1, borderColor: C.borderLight,
      padding: 20, flexDirection: 'row', alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    greetingLabel: { fontSize: 13, color: C.textMuted },
    greetingName: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 1 },
    greetingDate: { fontSize: 12, color: C.textSecondary, marginTop: 4 },
    offersBadge: {
      backgroundColor: C.primaryBg, borderRadius: 14,
      paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center',
    },
    offersBadgeNum: { fontSize: 22, fontWeight: '800', color: Colors.primary },
    offersBadgeLabel: { fontSize: 10, fontWeight: '600', color: Colors.primary, marginTop: 1 },

    section: { gap: 12 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    sectionLink: { fontSize: 12, fontWeight: '600', color: Colors.primary },

    /* ─── Offer card ─── */
    offerCard: {
      backgroundColor: C.white, borderRadius: 16,
      borderWidth: 1, borderColor: C.borderLight,
      overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    },
    accentBar: { height: 3 },

    offerHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    },
    offerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    offerTitleGroup: { flex: 1, marginLeft: 12 },
    offerService: { fontSize: 14, fontWeight: '700', color: C.text },
    offerMeta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    priceBadge: { alignItems: 'flex-end' },
    priceCurrency: { fontSize: 10, fontWeight: '600', color: C.textSecondary, lineHeight: 14 },
    priceValue: { fontSize: 20, fontWeight: '800', color: C.text },

    /* Map thumbnail */
    mapWrap: {
      height: 140, marginHorizontal: 16, marginBottom: 12,
      borderRadius: 12, overflow: 'hidden',
    },
    mapsBtn: {
      position: 'absolute', bottom: 8, right: 8,
      backgroundColor: 'rgba(0,0,0,0.58)',
      borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
      flexDirection: 'row', alignItems: 'center', gap: 5,
    },
    mapsBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    locationTagRow: {
      position: 'absolute', top: 8, left: 8,
      backgroundColor: C.white,
      borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
      flexDirection: 'row', alignItems: 'center', gap: 5,
      maxWidth: '78%',
    },
    locationTagText: { fontSize: 11, fontWeight: '600', color: C.text, flexShrink: 1 },

    /* Chips */
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: C.background, borderRadius: 99,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    chipText: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },

    divider: { height: 1, backgroundColor: C.borderLight, marginHorizontal: 16, marginBottom: 14 },

    offerActions: { paddingHorizontal: 16, paddingBottom: 16 },
    startBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    },
    startBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    photoStrip: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
    photoThumb: { width: 76, height: 76, borderRadius: 10 },

    /* Empty state */
    empty: {
      backgroundColor: C.white, borderRadius: 16,
      borderWidth: 1, borderColor: C.borderLight,
      padding: 36, alignItems: 'center', gap: 8,
    },
    emptyIcon: {
      width: 60, height: 60, borderRadius: 18,
      backgroundColor: C.primaryBg,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 4,
    },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
  })
}

export default function CleanerHomeScreen() {
  const router = useRouter()
  const { theme, isDark } = useTheme()
  const C = useThemeColors()
  const s = useMemo(() => makeStyles(C), [C])

  const [name, setName] = useState('')
  const [offers, setOffers] = useState<JobOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [mapOffer, setMapOffer] = useState<JobOffer | null>(null)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [photoMap, setPhotoMap] = useState<Record<string, string[]>>({})
  const [startingId, setStartingId] = useState<string | null>(null)

  // Restore which job had "Start Job" pressed across reloads / logouts
  useEffect(() => {
    AsyncStorage.getItem('activeFlowJobId').then(id => {
      if (id) setExpandedJobId(id)
    })
  }, [])

  // When offer list refreshes: clear the persisted ID if that job is gone
  useEffect(() => {
    if (!expandedJobId || loading) return
    const stillExists = offers.some(o => o.id === expandedJobId)
    if (!stillExists) {
      AsyncStorage.removeItem('activeFlowJobId')
      setExpandedJobId(null)
    }
  }, [offers, loading])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); setRefreshing(false); return }

      const [
        { data: profile },
        { data: assignments },
        { count },
      ] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        supabase
          .from('cleaner_assignments')
          .select(`
            id, booking_id, status,
            bookings (
              service_slug, service_date, service_time,
              property_sqm, base_price,
              address_city, address_street, address_unit,
              service_lat, service_lng,
              customer_id, status,
              payment_method, payment_status, special_notes,
              customer:profiles!customer_id(full_name)
            )
          `)
          .eq('cleaner_id', user.id)
          .eq('status', 'assigned')
          .order('assigned_at', { ascending: false })
          .limit(5),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false),
      ])

      const p = profile as { full_name: string } | null
      setName(p?.full_name?.split(' ')[0] ?? 'there')
      const offerList = ((assignments ?? []) as unknown as JobOffer[])
        .filter(a => !['completed', 'cancelled'].includes(a.bookings?.status ?? ''))
      setOffers(offerList)
      setUnreadCount(count ?? 0)
      loadFurniturePhotos(offerList)
    } catch {
      // silent — empty state is acceptable fallback
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function loadFurniturePhotos(offerList: JobOffer[]) {
    const map: Record<string, string[]> = {}
    await Promise.all(
      offerList.map(async (offer) => {
        const customerId = offer.bookings?.customer_id
        if (!customerId) return

        const { data: files } = await supabase.storage
          .from('furniture-photos')
          .list(customerId, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } })

        if (files && files.length > 0) {
          map[offer.booking_id] = files
            .filter(f => f.name && !f.name.startsWith('proof-') && !f.name.startsWith('.'))
            .map(f =>
              supabase.storage
                .from('furniture-photos')
                .getPublicUrl(`${customerId}/${f.name}`).data.publicUrl
            )
        }
      })
    )
    setPhotoMap(map)
  }

  async function startJob(offer: JobOffer) {
    setStartingId(offer.id)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'in_progress' })
        .eq('id', offer.booking_id)
      if (error) throw error
      if (offer.bookings.customer_id) {
        await supabase.from('notifications').insert({
          user_id: offer.bookings.customer_id,
          title: 'Cleaner Has Arrived',
          body: `${name} is now at your location and has started the service.`,
          type: 'info',
        })
      }
      await AsyncStorage.setItem('activeFlowJobId', offer.id)
      setExpandedJobId(offer.id)
      await loadData()
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not start the job.')
    } finally {
      setStartingId(null)
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    )
  }

  return (
    <>
    <ScrollView
      style={s.screen}
      showsVerticalScrollIndicator={false}
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
      <AppHeader
        title="Home"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      <View style={s.body}>

        {/* Greeting card */}
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
                job{offers.length > 1 ? 's' : ''} assigned
              </Text>
            </View>
          )}
        </View>

        {/* Assigned Jobs */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>
              Assigned Jobs{offers.length > 0 ? ` (${offers.length})` : ''}
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
              <Text style={s.emptyTitle}>No assigned jobs</Text>
              <Text style={s.emptySub}>
                Jobs assigned to you by the dispatch team will appear here.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {offers.map(offer => {
                const bk = offer.bookings
                const svcDef = getService(bk?.service_slug ?? '')
                const svc = SVC[svcDef?.serviceType ?? 'general'] ?? SVC.general
                const serviceLabel = svcDef?.name ?? bk?.service_slug ?? 'Cleaning Service'
                const hasCoords = bk?.service_lat != null && bk?.service_lng != null
                const addressLabel = [bk?.address_unit, bk?.address_street, bk?.address_city]
                  .filter(Boolean).join(', ')

                return (
                  <View key={offer.id} style={s.offerCard}>

                    {/* Color accent bar */}
                    <View style={[s.accentBar, { backgroundColor: svc.color }]} />

                    {/* Header: icon · service name · date/time · price */}
                    <View style={s.offerHeader}>
                      <View style={[s.offerIcon, { backgroundColor: svc.bg }]}>
                        <Feather name={svc.icon as any} size={20} color={svc.color} />
                      </View>
                      <View style={s.offerTitleGroup}>
                        <Text style={s.offerService}>
                          {serviceLabel}
                        </Text>
                        <Text style={s.offerMeta}>
                          {formatDate(bk?.service_date)} · {formatTime(bk?.service_time)}
                        </Text>
                      </View>
                      <View style={s.priceBadge}>
                        <Text style={s.priceCurrency}>PRICE</Text>
                        <Text style={s.priceValue}>
                          ₱{Number(bk?.base_price).toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {/* Map thumbnail — only when GPS coords exist */}
                    {hasCoords && (
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => setMapOffer(offer)}
                        style={s.mapWrap}
                      >
                        <MapView
                          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
                          style={StyleSheet.absoluteFillObject}
                          userInterfaceStyle={theme}
                          initialRegion={{
                            latitude: bk.service_lat!,
                            longitude: bk.service_lng!,
                            latitudeDelta: 0.005,
                            longitudeDelta: 0.005,
                          }}
                          scrollEnabled={false}
                          zoomEnabled={false}
                          rotateEnabled={false}
                          pitchEnabled={false}
                          showsUserLocation={false}
                          showsCompass={false}
                          showsScale={false}
                          liteMode
                        >
                          <Marker
                            coordinate={{
                              latitude: bk.service_lat!,
                              longitude: bk.service_lng!,
                            }}
                            pinColor={Colors.primary}
                          />
                        </MapView>

                        {/* Address tag (top-left) */}
                        {!!addressLabel && (
                          <View style={s.locationTagRow}>
                            <Feather name="map-pin" size={10} color={Colors.primary} />
                            <Text style={s.locationTagText} numberOfLines={1}>
                              {addressLabel}
                            </Text>
                          </View>
                        )}

                                        {/* Expand hint (bottom-right) */}
                        <View style={s.mapsBtn}>
                          <Feather name="maximize-2" size={11} color="#fff" />
                          <Text style={s.mapsBtnText}>View Location</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Furniture photos — from storage bucket */}
                    {(photoMap[offer.booking_id] ?? []).length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.photoStrip}
                        nestedScrollEnabled
                      >
                        {(photoMap[offer.booking_id] ?? []).map((url, i) => (
                          <Image
                            key={i}
                            source={{ uri: url }}
                            style={s.photoThumb}
                            resizeMode="cover"
                          />
                        ))}
                      </ScrollView>
                    )}

                    {/* Info chips */}
                    <View style={s.chipRow}>
                      {!hasCoords && bk?.address_city && (
                        <View style={s.chip}>
                          <Feather name="map-pin" size={10} color={C.textSecondary} />
                          <Text style={s.chipText}>{bk.address_city}</Text>
                        </View>
                      )}
                      <View style={s.chip}>
                        <Feather name="maximize" size={10} color={C.textSecondary} />
                        <Text style={s.chipText}>{bk?.property_sqm} sqm</Text>
                      </View>
                    </View>

                    <View style={s.divider} />

                    {/* Start Job / Active Flow */}
                    <View style={s.offerActions}>
                      {bk?.status === 'in_progress' || expandedJobId === offer.id ? (
                        <ActiveJobFlow
                          offer={offer}
                          onJobUpdate={loadData}
                        />
                      ) : (
                        <TouchableOpacity
                          style={[s.startBtn, startingId === offer.id && { opacity: 0.7 }]}
                          onPress={() => startJob(offer)}
                          disabled={startingId === offer.id}
                          activeOpacity={0.85}
                        >
                          {startingId === offer.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <>
                                <Feather name="play-circle" size={16} color="#fff" />
                                <Text style={s.startBtnText}>Start Job</Text>
                              </>
                          }
                        </TouchableOpacity>
                      )}
                    </View>

                  </View>
                )
              })}
            </View>
          )}
        </View>

      </View>
    </ScrollView>

    {mapOffer != null && (
      <JobLocationModal
        visible
        coord={{
          latitude: mapOffer.bookings.service_lat!,
          longitude: mapOffer.bookings.service_lng!,
        }}
        address={[
          mapOffer.bookings.address_unit,
          mapOffer.bookings.address_street,
          mapOffer.bookings.address_city,
        ].filter(Boolean).join(', ')}
        serviceLabel={getService(mapOffer.bookings.service_slug ?? '')?.name ?? 'Cleaning Service'}
        onClose={() => setMapOffer(null)}
      />
    )}
    </>
  )
}

// ── Swipe-to-confirm slider ───────────────────────────────────────────────────

function SwipeSlider({
  label, sublabel, color, icon, onConfirm, disabled = false,
}: {
  label: string
  sublabel?: string
  color: string
  icon: keyof typeof Feather.glyphMap
  onConfirm: () => void
  disabled?: boolean
}) {
  const THUMB = 60
  const PAD   = 5

  const trackWRef    = useRef(0)
  const [trackW, setTrackW] = useState(0)
  const translateX   = useRef(new Animated.Value(0)).current
  const chevronAnim  = useRef(new Animated.Value(0.3)).current
  const disabledRef  = useRef(disabled)
  const onConfirmRef = useRef(onConfirm)

  useEffect(() => { disabledRef.current  = disabled  }, [disabled])
  useEffect(() => { onConfirmRef.current = onConfirm }, [onConfirm])

  useEffect(() => {
    if (disabled) { chevronAnim.setValue(0); return }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(chevronAnim, { toValue: 0.85, duration: 550, useNativeDriver: false }),
      Animated.timing(chevronAnim, { toValue: 0.22, duration: 550, useNativeDriver: false }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [disabled])

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponder:  (_, gs) => !disabledRef.current && Math.abs(gs.dx) > 4,
    onPanResponderMove: (_, gs) => {
      if (disabledRef.current) return
      const max = trackWRef.current - THUMB - PAD * 2
      translateX.setValue(Math.min(Math.max(0, gs.dx), max))
    },
    onPanResponderRelease: (_, gs) => {
      if (disabledRef.current) return
      const max = trackWRef.current - THUMB - PAD * 2
      if (gs.dx >= max * 0.78) {
        Animated.timing(translateX, { toValue: max, duration: 110, useNativeDriver: false }).start(() => {
          onConfirmRef.current()
          setTimeout(() => Animated.spring(translateX, { toValue: 0, friction: 7, useNativeDriver: false }).start(), 320)
        })
      } else {
        Animated.spring(translateX, { toValue: 0, friction: 6, useNativeDriver: false }).start()
      }
    },
  })).current

  const maxDrag = Math.max(1, trackW - THUMB - PAD * 2)

  const fillWidth = trackW > THUMB + PAD * 2
    ? translateX.interpolate({ inputRange: [0, maxDrag], outputRange: [0, maxDrag], extrapolate: 'clamp' })
    : new Animated.Value(0)

  const labelOpacity = translateX.interpolate({
    inputRange: [0, 72], outputRange: [1, 0], extrapolate: 'clamp',
  })

  const c = disabled ? '#9ca3af' : color

  return (
    <View
      onLayout={e => { const w = e.nativeEvent.layout.width; trackWRef.current = w; setTrackW(w) }}
      style={{
        height: 70, borderRadius: 22, overflow: 'hidden',
        backgroundColor: disabled ? '#f3f4f6' : color + '12',
        borderWidth: 1.5, borderColor: disabled ? '#e5e7eb' : color + '42',
      }}
    >
      {/* Progress fill — starts at thumb right edge */}
      {trackW > 0 && (
        <Animated.View style={{
          position: 'absolute', left: THUMB + PAD * 2, top: PAD, bottom: PAD,
          borderRadius: 16, backgroundColor: disabled ? '#e5e7eb' : color + '28',
          width: fillWidth,
        }} />
      )}

      {/* Center label */}
      <Animated.View style={{
        position: 'absolute', left: THUMB + PAD + 12, right: 34,
        top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center',
        opacity: labelOpacity,
      }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: c }} numberOfLines={1}>{label}</Text>
        {sublabel && (
          <Text style={{ fontSize: 12, color: c, opacity: 0.72, marginTop: 2 }}>{sublabel}</Text>
        )}
      </Animated.View>

      {/* Pulsing chevron hint — right */}
      <Animated.View style={{
        position: 'absolute', right: 14, top: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? new Animated.Value(0) : chevronAnim,
      }}>
        <Feather name="chevrons-right" size={17} color={c} />
      </Animated.View>

      {/* Draggable thumb */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          position: 'absolute', left: PAD, top: PAD,
          width: THUMB, height: THUMB, borderRadius: THUMB / 2 - 2,
          backgroundColor: c, alignItems: 'center', justifyContent: 'center',
          transform: [{ translateX }],
          shadowColor: disabled ? '#9ca3af' : color,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: disabled ? 0.08 : 0.45,
          shadowRadius: 8, elevation: disabled ? 1 : 5,
        }}
      >
        <Feather name={icon} size={24} color="#fff" />
      </Animated.View>
    </View>
  )
}

// ── Active job flow ───────────────────────────────────────────────────────────

function ActiveJobFlow({
  offer, onJobUpdate,
}: {
  offer: JobOffer; onJobUpdate: () => void
}) {
  const C = useThemeColors()

  const bk = offer.bookings
  const arrived = true

  const [updating, setUpdating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cashCollected, setCashCollected] = useState(bk.payment_status === 'paid')

  const startMsRef    = useRef<number | null>(null)
  const pulseAnim     = useRef(new Animated.Value(1)).current
  const dotAnim       = useRef(new Animated.Value(0.35)).current
  const completePulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!arrived) return
    if (startMsRef.current === null) startMsRef.current = Date.now()
    setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000))
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMsRef.current!) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [arrived])

  useEffect(() => {
    if (!arrived) return
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.013, duration: 1300, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,     duration: 1300, useNativeDriver: true }),
    ]))
    const dot = Animated.loop(Animated.sequence([
      Animated.timing(dotAnim, { toValue: 1,    duration: 650, useNativeDriver: true }),
      Animated.timing(dotAnim, { toValue: 0.35, duration: 650, useNativeDriver: true }),
    ]))
    const complete = Animated.loop(Animated.sequence([
      Animated.timing(completePulse, { toValue: 1.028, duration: 900, useNativeDriver: true }),
      Animated.timing(completePulse, { toValue: 1,     duration: 900, useNativeDriver: true }),
    ]))
    pulse.start(); dot.start(); complete.start()
    return () => { pulse.stop(); dot.stop(); complete.stop() }
  }, [arrived])

  async function executeCollectCash() {
    if (updating) return
    setUpdating(true)
    try {
      await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', offer.booking_id)
      setCashCollected(true)
      onJobUpdate()
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not record payment.')
    } finally { setUpdating(false) }
  }

  async function executeComplete() {
    if (updating) return
    setUpdating(true)
    try {
      await Promise.all([
        supabase.from('bookings').update({ status: 'completed' }).eq('id', offer.booking_id),
        supabase.from('cleaner_assignments').update({ status: 'completed' }).eq('id', offer.id),
      ])
      onJobUpdate()
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not complete the job.')
    } finally { setUpdating(false) }
  }

  return (
    <View style={{ gap: 12 }}>
      {/* In-progress card with throb */}
      {arrived && (
        <Animated.View style={{
          backgroundColor: '#3b0764', borderRadius: 22, padding: 22,
          overflow: 'hidden',
          transform: [{ scale: pulseAnim }],
          shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
        }}>
          {/* Live badge — top right */}
          <View style={{ position: 'absolute', top: 18, right: 18, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#a78bfa', opacity: dotAnim }} />
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#c4b5fd', letterSpacing: 1.4, textTransform: 'uppercase' }}>
              Live
            </Text>
          </View>

          <Text style={{ fontSize: 11, color: '#c4b5fd', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.3, marginBottom: 6 }}>
            Cleaning in Progress
          </Text>
          <Text style={{ color: '#fff', fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2, lineHeight: 58 }}>
            {formatElapsed(elapsed)}
          </Text>

          {bk.customer && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(167,139,250,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="user" size={12} color="#c4b5fd" />
              </View>
              <Text style={{ color: '#ddd6fe', fontSize: 13, fontWeight: '500' }}>{bk.customer.full_name}</Text>
            </View>
          )}

          {/* Decorative glow circle */}
          <View style={{ position: 'absolute', right: -35, bottom: -35, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(124,58,237,0.28)' }} />
        </Animated.View>
      )}

      {bk.special_notes && (
        <View style={{ backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.textSecondary, marginBottom: 4 }}>Special Notes</Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>{bk.special_notes}</Text>
        </View>
      )}

      {/* Actions section */}
      {arrived && (
        <View style={{ gap: 10, marginTop: 4 }}>
          {/* Divider label */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: C.borderLight }} />
            <Text style={{ fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 1.4, textTransform: 'uppercase' }}>
              Actions
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.borderLight }} />
          </View>

          {/* Swipe — Collect Cash */}
          {bk.payment_method === 'cash' && (
            cashCollected || bk.payment_status === 'paid' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, backgroundColor: '#f0fdf4', borderRadius: 18, borderWidth: 1, borderColor: '#86efac' }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={18} color="#fff" />
                </View>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803d' }}>Cash Collected</Text>
                  <Text style={{ fontSize: 11, color: '#16a34a', marginTop: 1 }}>₱{Number(bk.base_price).toLocaleString()} received</Text>
                </View>
              </View>
            ) : (
              <SwipeSlider
                label="Swipe to Collect Cash"
                sublabel={`₱${Number(bk.base_price).toLocaleString()}`}
                color="#f59e0b"
                icon="dollar-sign"
                onConfirm={executeCollectCash}
                disabled={updating}
              />
            )
          )}

          {/* Swipe — Complete Job (pulsing) */}
          {(() => {
            const cashPending = bk.payment_method === 'cash' && !cashCollected && bk.payment_status !== 'paid'
            return (
              <View style={{ gap: 6 }}>
                {cashPending && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                    <Feather name="alert-circle" size={12} color="#ca8a04" />
                    <Text style={{ fontSize: 11, color: '#ca8a04', fontWeight: '600' }}>
                      Collect cash payment first to unlock completion.
                    </Text>
                  </View>
                )}
                <Animated.View style={{
                  transform: [{ scale: cashPending ? new Animated.Value(1) : completePulse }],
                  shadowColor: cashPending ? 'transparent' : '#16a34a',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: cashPending ? 0 : 0.22,
                  shadowRadius: 10,
                  elevation: cashPending ? 0 : 4,
                  borderRadius: 22,
                }}>
                  <SwipeSlider
                    label="Swipe to Complete"
                    color="#16a34a"
                    icon="check-circle"
                    onConfirm={executeComplete}
                    disabled={updating || cashPending}
                  />
                </Animated.View>
              </View>
            )
          })()}
        </View>
      )}
    </View>
  )
}
