import { useEffect, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import MapView, { Marker, MapPressEvent, Region } from 'react-native-maps'
import * as Location from 'expo-location'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'

export type Coord = { latitude: number; longitude: number }

type Props = {
  visible: boolean
  initial?: Coord | null
  onConfirm: (coord: Coord) => void
  onClose: () => void
}

const MANILA: Region = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
}

function toRegion(coord: Coord): Region {
  return { ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 }
}

export default function LocationMapPicker({ visible, initial, onConfirm, onClose }: Props) {
  const [marker, setMarker] = useState<Coord | null>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (visible) setMarker(initial ?? null)
  }, [visible])

  async function goToMyLocation() {
    setLocating(true)
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setMarker({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
    }
    setLocating(false)
  }

  function handleMapPress(e: MapPressEvent) {
    setMarker(e.nativeEvent.coordinate)
  }

  const initialRegion = initial ? toRegion(initial) : MANILA

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: '#fff' }}>

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14,
          backgroundColor: Colors.primary,
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Pin Your Location</Text>
          <View style={{ width: 55 }} />
        </View>

        {/* Hint */}
        <View style={{
          backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: '#fde68a',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <Feather name="info" size={13} color="#92400e" />
          <Text style={{ fontSize: 12, color: '#92400e', flex: 1 }}>
            Tap anywhere on the map to pin your service location, or drag the marker to adjust.
          </Text>
        </View>

        {/* Map */}
        <MapView
          style={{ flex: 1 }}
          initialRegion={marker ? toRegion(marker) : initialRegion}
          onPress={handleMapPress}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {marker && (
            <Marker
              coordinate={marker}
              draggable
              pinColor={Colors.primary}
              onDragEnd={e => setMarker(e.nativeEvent.coordinate)}
            />
          )}
        </MapView>

        {/* Footer */}
        <View style={{
          padding: 16, backgroundColor: '#fff',
          borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 10,
        }}>
          {marker && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="map-pin" size={13} color={Colors.primary} />
              <Text style={{ fontSize: 12, color: '#6b7280' }} selectable>
                {marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={goToMyLocation}
              disabled={locating}
              style={{
                flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                borderWidth: 1.5, borderColor: Colors.primary,
                backgroundColor: '#fdf2f8', flexDirection: 'row', justifyContent: 'center', gap: 6,
              }}
            >
              {locating
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <>
                    <Feather name="navigation" size={14} color={Colors.primary} />
                    <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 13 }}>My Location</Text>
                  </>
              }
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => marker && onConfirm(marker)}
              disabled={!marker}
              style={{
                flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                backgroundColor: marker ? Colors.primary : '#e5e7eb',
              }}
            >
              <Text style={{ color: marker ? '#fff' : '#9ca3af', fontWeight: '700', fontSize: 14 }}>
                Use This Location
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </Modal>
  )
}
