import { View, Text, TouchableOpacity, Image, ScrollView, Platform } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { getService } from '@/constants/services'
import CustomerInfoCard from '@/components/CustomerInfoCard'

const SVC_COLORS: Record<string, { icon: string; color: string; bg: string }> = {
  general:           { icon: 'home',   color: '#0891b2', bg: '#e0f2fe' },
  deep_cleaning:     { icon: 'layers', color: '#7c3aed', bg: '#ede9fe' },
  complete:          { icon: 'star',   color: '#db2777', bg: '#fce7f3' },
  disinfection:      { icon: 'shield', color: '#16a34a', bg: '#dcfce7' },
  post_construction: { icon: 'tool',   color: '#ca8a04', bg: '#fef9c3' },
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
function fmtTime(t: string) {
  if (!t) return '—'
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

type Props = {
  serviceSlug?: string | null
  serviceName?: string | null
  serviceDate: string
  serviceTime: string
  basePrice: number
  propertySqm: number
  durationHours?: number | null
  addressUnit?: string | null
  addressStreet?: string | null
  addressCity?: string | null
  serviceLatLng?: { lat: number; lng: number } | null
  photos?: string[]
  customer?: { full_name: string; phone: string | null } | null
  bookedAt?: string | null
  onMapPress?: () => void
  renderAction?: () => React.ReactNode
}

export default function AssignedJobCard({
  serviceSlug, serviceName, serviceDate, serviceTime,
  basePrice, propertySqm, durationHours,
  addressUnit, addressStreet, addressCity,
  serviceLatLng, photos = [], customer, bookedAt,
  onMapPress, renderAction,
}: Props) {
  const C = useThemeColors()
  const svcDef = getService(serviceSlug ?? '')
  const svcFallback = SVC_COLORS[serviceSlug ?? ''] ?? SVC_COLORS.general
  const hasCoords = serviceLatLng != null
  const addressLabel = [addressUnit, addressStreet, addressCity].filter(Boolean).join(', ')

  return (
    <View style={{
      backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
      borderColor: C.borderLight, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    }}>
      {/* Header: icon · service name · date/time · price */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        {svcDef?.image ? (
          <Image source={svcDef.image} style={{ width: 44, height: 44, borderRadius: 12 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: svcFallback.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={svcFallback.icon as any} size={20} color={svcFallback.color} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>
            {svcDef?.name ?? serviceName ?? 'Cleaning Service'}
          </Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
            {fmtDate(serviceDate)} · {fmtTime(serviceTime)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: C.textSecondary, lineHeight: 14 }}>PRICE</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>₱{Number(basePrice).toLocaleString()}</Text>
        </View>
      </View>

      {/* Map thumbnail — only when GPS coords exist and onMapPress is provided */}
      {hasCoords && onMapPress && (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onMapPress}
          style={{ height: 140, marginHorizontal: 16, marginBottom: 12, borderRadius: 12, overflow: 'hidden' }}
        >
          <MapView
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: serviceLatLng!.lat,
              longitude: serviceLatLng!.lng,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            showsCompass={false}
            showsScale={false}
            liteMode
          >
            <Marker
              coordinate={{ latitude: serviceLatLng!.lat, longitude: serviceLatLng!.lng }}
              pinColor={Colors.primary}
            />
          </MapView>

          {!!addressLabel && (
            <View style={{
              position: 'absolute', top: 8, left: 8,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
              flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '78%',
            }}>
              <Feather name="map-pin" size={10} color={Colors.primary} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#111827', flexShrink: 1 }} numberOfLines={1}>
                {addressLabel}
              </Text>
            </View>
          )}

          <View style={{
            position: 'absolute', bottom: 8, right: 8,
            backgroundColor: 'rgba(0,0,0,0.58)',
            borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
            flexDirection: 'row', alignItems: 'center', gap: 5,
          }}>
            <Feather name="maximize-2" size={11} color="#fff" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>View Location</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Furniture photo strip */}
      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
          nestedScrollEnabled
        >
          {photos.map((url, i) => (
            <Image key={i} source={{ uri: url }} style={{ width: 76, height: 76, borderRadius: 10 }} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      {/* Info chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
        {!hasCoords && addressCity && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.background, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Feather name="map-pin" size={10} color={C.textSecondary} />
            <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '500' }}>{addressCity}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.background, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Feather name="maximize" size={10} color={C.textSecondary} />
          <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '500' }}>{propertySqm} sqm</Text>
        </View>
        {durationHours != null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.background, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Feather name="clock" size={10} color={C.textSecondary} />
            <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '500' }}>~{durationHours}h</Text>
          </View>
        )}
      </View>

      {/* Customer info */}
      <CustomerInfoCard customer={customer} bookedAt={bookedAt} />

      {/* Optional bottom action */}
      {renderAction && (
        <>
          <View style={{ height: 1, backgroundColor: C.borderLight, marginTop: 12 }} />
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
            {renderAction()}
          </View>
        </>
      )}
    </View>
  )
}
