import { useRef, useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, Platform, Linking,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'

type Coord = { latitude: number; longitude: number }

type Props = {
  visible: boolean
  coord: Coord
  address?: string
  serviceLabel?: string
  panelLabel?: string
  showDirections?: boolean
  onClose: () => void
}

export default function JobLocationModal({
  visible, coord, address, serviceLabel, panelLabel, showDirections, onClose,
}: Props) {
  const mapRef = useRef<MapView>(null)
  const { theme } = useTheme()
  const C = useThemeColors()
  const [panelHeight, setPanelHeight] = useState(260)

  function openDirections() {
    const url = Platform.OS === 'ios'
      ? `maps://maps.apple.com/?daddr=${coord.latitude},${coord.longitude}&dirflg=d`
      : `google.navigation:q=${coord.latitude},${coord.longitude}`
    Linking.openURL(url)
  }

  function recenter() {
    mapRef.current?.animateToRegion(
      { ...coord, latitudeDelta: 0.007, longitudeDelta: 0.007 },
      500
    )
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {/* Interactive map */}
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFillObject}
          userInterfaceStyle={theme}
          initialRegion={{
            ...coord,
            latitudeDelta: 0.007,
            longitudeDelta: 0.007,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass
          rotateEnabled
          pitchEnabled
        >
          <Marker coordinate={coord} tracksViewChanges={false}>
            <View style={styles.pinWrap}>
              <View style={styles.pinBubble}>
                <Feather name="map-pin" size={20} color="#fff" />
              </View>
              <View style={styles.pinStem} />
              <View style={styles.pinShadow} />
            </View>
          </Marker>
        </MapView>

        {/* Back button */}
        <TouchableOpacity
          onPress={onClose}
          style={[styles.fabBack, { top: Platform.OS === 'ios' ? 56 : 36 }]}
        >
          <Feather name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>

        {/* Title chip */}
        <View style={[styles.titleChip, { top: Platform.OS === 'ios' ? 60 : 40 }]}>
          <Text style={styles.titleChipText} numberOfLines={1}>
            {serviceLabel ?? 'Location'}
          </Text>
        </View>

        {/* Re-center FAB */}
        <TouchableOpacity
          onPress={recenter}
          style={[styles.fabRecenter, { bottom: panelHeight + 16 }]}
        >
          <Feather name="crosshair" size={20} color={Colors.primary} />
        </TouchableOpacity>

        {/* Bottom panel */}
        <View
          onLayout={e => setPanelHeight(e.nativeEvent.layout.height)}
          style={[styles.panel, { backgroundColor: C.white }]}
        >
          <View style={styles.dragHandle} />

          <Text style={[styles.panelLabel, { color: C.textMuted }]}>
            {panelLabel ?? 'LOCATION'}
          </Text>

          {!!address && (
            <View style={styles.addressRow}>
              <View style={styles.pinIcon}>
                <Feather name="map-pin" size={16} color={Colors.primary} />
              </View>
              <Text style={[styles.addressText, { color: C.text }]}>
                {address}
              </Text>
            </View>
          )}

          {showDirections && (
            <TouchableOpacity
              onPress={openDirections}
              style={styles.directionsBtn}
              activeOpacity={0.85}
            >
              <Feather name="navigation" size={16} color="#fff" />
              <Text style={styles.directionsBtnText}>Get Directions</Text>
            </TouchableOpacity>
          )}

        </View>

      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fabBack: {
    position: 'absolute', left: 16,
    backgroundColor: '#fff', borderRadius: 20, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 5,
  },
  titleChip: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 9,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
    maxWidth: '65%',
  },
  titleChipText: { fontSize: 13, fontWeight: '700', color: '#111827' },

  fabRecenter: {
    position: 'absolute', right: 16,
    backgroundColor: '#fff', borderRadius: 24, padding: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 5, elevation: 5,
  },

  pinWrap: { alignItems: 'center' },
  pinBubble: {
    backgroundColor: Colors.primary, borderRadius: 22, padding: 9,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 6, elevation: 8,
  },
  pinStem: { width: 2, height: 10, backgroundColor: Colors.primary },
  pinShadow: {
    width: 10, height: 5, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },

  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 38 : 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 12,
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 16,
  },
  panelLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10,
  },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  pinIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#fce7f3', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  addressText: { fontSize: 15, fontWeight: '500', lineHeight: 22, flex: 1 },

  directionsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, marginTop: 14,
  },
  directionsBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})
