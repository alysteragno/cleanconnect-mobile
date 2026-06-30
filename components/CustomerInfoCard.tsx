import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Linking, Animated, Easing } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'

type Props = {
  customer: { full_name: string; phone: string | null } | null | undefined
  bookedAt: string | null | undefined
}

function fmtBookedOn(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function CustomerInfoCard({ customer, bookedAt }: Props) {
  const C = useThemeColors()
  const throb = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(throb, { toValue: 1.1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(throb, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [])

  if (!customer) return null

  const initials = customer.full_name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
      <Text style={{
        fontSize: 10, fontWeight: '700', color: C.textMuted,
        letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 2,
      }}>
        Customer
      </Text>
      <View style={{
        backgroundColor: C.white, borderRadius: 14, borderWidth: 1,
        borderColor: C.borderLight, paddingHorizontal: 14, paddingVertical: 12,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <Animated.View style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: Colors.primary + '18',
          alignItems: 'center', justifyContent: 'center',
          transform: [{ scale: throb }],
        }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.primary }}>
            {initials}
          </Text>
        </Animated.View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{customer.full_name}</Text>
          {customer.phone && (
            <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '600' }}>{customer.phone}</Text>
          )}
          {bookedAt && (
            <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
              Booked {fmtBookedOn(bookedAt)}
            </Text>
          )}
        </View>

        {customer.phone && (
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${customer.phone}`)}
            activeOpacity={0.7}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: '#dcfce7',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Feather name="phone" size={17} color="#16a34a" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
