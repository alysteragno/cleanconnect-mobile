import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Platform, StatusBar, useWindowDimensions,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import { ServiceDef, getService } from '@/constants/services'
import { useServices } from '@/hooks/useServices'
import * as Haptics from 'expo-haptics'

const STATUS_BAR_H = Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ?? 24)

function StarRow({ avg, count, C }: { avg: number | null; count: number; C: ReturnType<typeof useThemeColors> }) {
  const filled = avg !== null ? Math.round(avg) : 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Text key={i} style={{ fontSize: 16, color: i <= filled ? '#f59e0b' : C.border }}>★</Text>
      ))}
      {avg !== null ? (
        <Text style={{ fontSize: 13, color: C.textSecondary, marginLeft: 4 }}>
          {avg.toFixed(1)} ({count} {count === 1 ? 'review' : 'reviews'})
        </Text>
      ) : (
        <Text style={{ fontSize: 13, color: C.textMuted, marginLeft: 4 }}>No reviews yet</Text>
      )}
    </View>
  )
}

function MetaChip({ icon, label, C }: { icon: string; label: string; C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.background, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: C.border,
    }}>
      <Feather name={icon as any} size={14} color={C.textSecondary} />
      <Text style={{ fontSize: 13, color: C.text, fontWeight: '600' }}>{label}</Text>
    </View>
  )
}

export default function ServiceDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()
  const { width } = useWindowDimensions()

  const { getService } = useServices()
  const svc: ServiceDef | undefined = getService(slug ?? '')

  const [rating, setRating] = useState<{ avg: number; count: number } | null>(null)
  const [loadingRating, setLoadingRating] = useState(true)
  const [activeBookingId, setActiveBookingId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!svc) return
    supabase
      .from('feedback')
      .select('rating, bookings!inner(service_slug)')
      .then(({ data }) => {
        const rows = (data ?? []).filter((f: any) => getService(f.bookings?.service_slug)?.serviceType === svc.serviceType)
        if (rows.length === 0) { setLoadingRating(false); return }
        const avg = rows.reduce((s: number, f: any) => s + f.rating, 0) / rows.length
        setRating({ avg, count: rows.length })
        setLoadingRating(false)
      })
  }, [svc?.serviceType])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setActiveBookingId(null); return }
      const { data } = await supabase
        .from('bookings')
        .select('id')
        .eq('customer_id', user.id)
        .not('status', 'in', '(completed,cancelled)')
        .limit(1)
        .maybeSingle()
      setActiveBookingId(data?.id ?? null)
    })
  }, [])

  if (!svc) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Feather name="alert-circle" size={40} color={C.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginTop: 12 }}>Service not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.primary, borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const HERO_H = 280

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        bounces
      >
        {/* ── Hero Image ── */}
        <View style={{ width, height: HERO_H, backgroundColor: svc.placeholderBg }}>
          {svc.image ? (
            <Image
              source={svc.image}
              style={{ width, height: HERO_H }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={svc.placeholderIcon as any} size={72} color={svc.placeholderIconColor} style={{ opacity: 0.35 }} />
            </View>
          )}

          {/* gradient overlay for back button visibility */}
          <View
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 80,
              background: 'transparent',
            }}
          />
        </View>

        {/* ── Content card ── */}
        <View style={{
          backgroundColor: C.white,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          marginTop: -20,
          paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
          gap: 6,
        }}>
          {/* Category badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: svc.accent + '18',
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
            }}>
              <Feather name={svc.categoryIcon as any} size={11} color={svc.accent} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: svc.accent, letterSpacing: 0.3 }}>
                {svc.category}
              </Text>
            </View>
          </View>

          {/* Service name */}
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 28 }}>
            {svc.name}
          </Text>

          {/* Rating */}
          {loadingRating ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <StarRow avg={rating?.avg ?? null} count={rating?.count ?? 0} C={C} />
          )}
        </View>

        {/* ── Meta chips ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <MetaChip icon="clock" label={svc.duration} C={C} />
            <MetaChip icon="tag" label={`Starts at ₱${svc.startingPrice.toLocaleString()}`} C={C} />
          </View>

          {/* ── About section ── */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>About this service</Text>
            <Text style={{ fontSize: 14, color: C.textSecondary, lineHeight: 22 }}>
              {svc.fullDesc}
            </Text>
          </View>

          {/* ── What's included ── */}
          <View style={{
            backgroundColor: C.background, borderRadius: 16,
            borderWidth: 1, borderColor: C.border, padding: 16, gap: 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Feather name="check-circle" size={14} color={Colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>What's included</Text>
            </View>
            {getInclusions(svc.slug).map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 7 }} />
                <Text style={{ flex: 1, fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>{item}</Text>
              </View>
            ))}
          </View>

          {/* ── Notice ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: isDark ? '#1e293b' : '#fffbeb',
            borderRadius: 12, padding: 12,
            borderWidth: 1, borderColor: isDark ? '#854d0e' : '#fde68a',
          }}>
            <Feather name="info" size={14} color="#92400e" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 }}>
              Final pricing is confirmed by our admin before your booking is accepted. The starting price shown is an estimate.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Back button — absolute over hero ── */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: 'absolute',
          top: STATUS_BAR_H + 8,
          left: 16,
          width: 38, height: 38, borderRadius: 19,
          backgroundColor: 'rgba(0,0,0,0.35)',
          alignItems: 'center', justifyContent: 'center',
        }}
        activeOpacity={0.8}
      >
        <Feather name="arrow-left" size={18} color="#fff" />
      </TouchableOpacity>

      {/* ── Sticky Book Now footer ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: C.white,
        borderTopWidth: 1, borderTopColor: C.border,
        padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: C.textMuted }}>Starting at</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.primary }}>
            ₱{svc.startingPrice.toLocaleString()}
          </Text>
        </View>

        {activeBookingId ? (
          /* Has active booking — show disabled state with link to it */
          <TouchableOpacity
            style={{
              flex: 2, height: 52, borderRadius: 14,
              backgroundColor: C.borderLight,
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}
            activeOpacity={0.7}
            onPress={() => router.push(`/(customer)/bookings/${activeBookingId}` as any)}
          >
            <Text style={{ color: C.textSecondary, fontWeight: '700', fontSize: 13 }}>Active Booking in Progress</Text>
            <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 11, marginTop: 2 }}>Tap to view →</Text>
          </TouchableOpacity>
        ) : (
          /* No active booking — normal Book button */
          <TouchableOpacity
            style={{
              flex: 2, height: 52, borderRadius: 14,
              backgroundColor: activeBookingId === undefined ? C.borderLight : Colors.primary,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: activeBookingId === undefined ? 0 : 0.35,
              shadowRadius: 10, elevation: activeBookingId === undefined ? 0 : 6,
            }}
            activeOpacity={0.85}
            disabled={activeBookingId === undefined}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              router.push({
                pathname: '/(customer)/bookings/new',
                params: { service: svc.slug },
              })
            }}
          >
            <Feather name="calendar" size={16} color={activeBookingId === undefined ? C.textMuted : '#fff'} />
            <Text style={{ color: activeBookingId === undefined ? C.textMuted : '#fff', fontWeight: '700', fontSize: 15 }}>
              Book This Service
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function getInclusions(slug: string): string[] {
  const map: Record<string, string[]> = {
    mattress_deep_cleaning: [
      'Hot-water extraction deep cleaning',
      'UV sanitation treatment',
      'Stain and odor removal',
      'Allergen elimination',
    ],
    sofa_couch_deep_cleaning: [
      'Hot-water extraction for all fabric types',
      'Stain and odor treatment',
      'Pet hair and dander removal',
      'Fabric protector application (on request)',
    ],
    carpet_cleaning: [
      'Hot-water extraction cleaning',
      'Pre-treatment for stubborn stains',
      'Deodorizing and sanitizing',
      'Quick-dry process',
    ],
    curtain_dry_cleaning: [
      'On-site dry cleaning (no removal needed)',
      'Dust and allergen removal',
      'Fabric-safe cleaning solutions',
      'Odor neutralization',
    ],
    aircon_cleaning: [
      'Evaporator coil washing',
      'Blower fan cleaning',
      'Drain line flushing',
      'Filter cleaning or replacement check',
    ],
    aircon_freon_charging: [
      'Refrigerant level check and leak test',
      'Leak repair (minor)',
      'Refrigerant recharge to specification',
      'Performance test after charging',
    ],
    aircon_repair: [
      'Full diagnostic check',
      'Common fault repair (thermostat, capacitor, etc.)',
      'Electrical connections check',
      'Post-repair performance test',
    ],
    grease_trap_cleaning: [
      'Grease and sludge removal',
      'High-pressure flush and rinse',
      'Deodorizing treatment',
      'Disposal of collected waste',
    ],
    grease_trap_installation: [
      'Site assessment and sizing',
      'Grease trap supply and installation',
      'Drainage connection and testing',
      'Compliance documentation (on request)',
    ],
    house_cleaning: [
      'All rooms dusted and vacuumed',
      'Kitchen surfaces and appliance exteriors wiped',
      'Bathroom scrubbing and sanitizing',
      'Floors mopped and cleaned',
    ],
    condo_cleaning: [
      'All surfaces dusted and wiped',
      'Kitchen and bathroom deep cleaned',
      'Floors vacuumed and mopped',
      'Efficient service for smaller units',
    ],
    office_cleaning: [
      'Desks and workstations wiped down',
      'Floors vacuumed or mopped',
      'Pantry and restrooms sanitized',
      'Trash bins emptied and replaced',
    ],
    commercial_cleaning: [
      'High-traffic floor cleaning',
      'Surface and display wiping',
      'Restroom deep sanitizing',
      'Waste removal and disposal',
    ],
  }
  return map[slug] ?? [
    'Professional cleaning by trained staff',
    'Commercial-grade cleaning supplies',
    'Post-service quality check',
  ]
}
