import { useEffect, useRef, useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity,
  ActivityIndicator, Animated, Platform,
} from 'react-native'
import MapView, { Region } from 'react-native-maps'
import * as Location from 'expo-location'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'

export type Coord = { latitude: number; longitude: number }

type Props = {
  visible: boolean
  initial?: Coord | null
  onConfirm: (coord: Coord, address: string) => void
  onClose: () => void
}

const MANILA: Region = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
}

async function reverseGeocode(coord: Coord): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync(coord)
    if (results.length > 0) {
      const r = results[0]
      const parts = [r.name, r.street, r.district, r.city, r.region]
        .filter((s): s is string => !!s && s.trim().length > 0)
      return parts.join(', ')
    }
  } catch {
    // fall through
  }
  return `${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`
}

export default function LocationMapPicker({ visible, initial, onConfirm, onClose }: Props) {
  const mapRef = useRef<MapView>(null)
  const pinY = useRef(new Animated.Value(0)).current
  const shadowScale = useRef(new Animated.Value(1)).current

  const [center, setCenter] = useState<Coord>({
    latitude: MANILA.latitude,
    longitude: MANILA.longitude,
  })
  const [address, setAddress] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [locating, setLocating] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [panelHeight, setPanelHeight] = useState(200)

  useEffect(() => {
    if (!visible) return
    const start = initial ?? { latitude: MANILA.latitude, longitude: MANILA.longitude }
    setCenter(start)
    setGeocoding(true)
    reverseGeocode(start).then(addr => { setAddress(addr); setGeocoding(false) })
  }, [visible])

  function onRegionChange() {
    if (!dragging) {
      setDragging(true)
      setGeocoding(true)
      Animated.parallel([
        Animated.spring(pinY, { toValue: -14, useNativeDriver: true, tension: 120, friction: 6 }),
        Animated.spring(shadowScale, { toValue: 0.6, useNativeDriver: true, tension: 120, friction: 6 }),
      ]).start()
    }
  }

  function onRegionChangeComplete(region: Region) {
    setDragging(false)
    Animated.parallel([
      Animated.spring(pinY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.spring(shadowScale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
    ]).start()
    const coord = { latitude: region.latitude, longitude: region.longitude }
    setCenter(coord)
    reverseGeocode(coord).then(addr => { setAddress(addr); setGeocoding(false) })
  }

  async function goToMyLocation() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        mapRef.current?.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        }, 700)
      }
    } catch {
      // ignore
    }
    setLocating(false)
  }

  const initialRegion = initial
    ? { ...initial, latitudeDelta: 0.006, longitudeDelta: 0.006 }
    : MANILA

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {/* Map */}
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          onRegionChange={onRegionChange}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
        />

        {/* Fixed center pin (pointer-events: none so map still receives touches) */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: '50%',
            alignItems: 'center', justifyContent: 'flex-end',
          }}
        >
          <Animated.View style={{ transform: [{ translateY: pinY }], alignItems: 'center' }}>
            <View style={{
              backgroundColor: Colors.primary, borderRadius: 20, padding: 8,
              shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5, shadowRadius: 6, elevation: 8,
            }}>
              <Feather name="map-pin" size={22} color="#fff" />
            </View>
            {/* Stem */}
            <View style={{
              width: 2, height: 10,
              backgroundColor: Colors.primary,
            }} />
          </Animated.View>
          {/* Shadow dot */}
          <Animated.View style={{
            width: 10, height: 5, borderRadius: 5,
            backgroundColor: 'rgba(0,0,0,0.25)',
            transform: [{ scaleX: shadowScale }],
            marginTop: 2,
          }} />
        </View>

        {/* Back button */}
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 56 : 36,
            left: 16,
            backgroundColor: '#fff',
            borderRadius: 20, padding: 10,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.18, shadowRadius: 6, elevation: 5,
          }}
        >
          <Feather name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>

        {/* Title chip */}
        <View style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? 60 : 40,
          alignSelf: 'center',
          backgroundColor: '#fff', borderRadius: 20,
          paddingHorizontal: 14, paddingVertical: 8,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
            Move map to pin your location
          </Text>
        </View>

        {/* My Location FAB */}
        <TouchableOpacity
          onPress={goToMyLocation}
          disabled={locating}
          style={{
            position: 'absolute', bottom: panelHeight + 12, right: 16,
            backgroundColor: '#fff', borderRadius: 24, padding: 13,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15, shadowRadius: 5, elevation: 5,
          }}
        >
          {locating
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Feather name="navigation" size={20} color={Colors.primary} />
          }
        </TouchableOpacity>

        {/* Bottom confirm panel */}
        <View onLayout={e => setPanelHeight(e.nativeEvent.layout.height)} style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#fff',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1, shadowRadius: 10, elevation: 12,
        }}>
          {/* Drag handle */}
          <View style={{
            width: 36, height: 4, borderRadius: 2,
            backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 14,
          }} />

          <Text style={{ fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginBottom: 6 }}>
            PINNED LOCATION
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: '#fce7f3', alignItems: 'center', justifyContent: 'center',
              marginTop: 1, flexShrink: 0,
            }}>
              <Feather name="map-pin" size={15} color={Colors.primary} />
            </View>
            {geocoding ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingTop: 6 }}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={{ fontSize: 14, color: '#9ca3af' }}>Finding address…</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 15, fontWeight: '500', color: '#111827', flex: 1, lineHeight: 22, paddingTop: 4 }}>
                {address}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => onConfirm(center, address)}
            disabled={geocoding}
            style={{
              backgroundColor: geocoding ? '#e5e7eb' : Colors.primary,
              borderRadius: 14, paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: geocoding ? '#9ca3af' : '#fff', fontWeight: '700', fontSize: 16 }}>
              Confirm Location
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  )
}
