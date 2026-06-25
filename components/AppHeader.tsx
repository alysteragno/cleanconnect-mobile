import { View, Text, TouchableOpacity } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'

type Props = {
  title?: string
  subtitle?: string
  greeting?: string
  name?: string
  unreadCount?: number
  onBellPress?: () => void
  hideBell?: boolean
  showBack?: boolean
  onBackPress?: () => void
  rightContent?: React.ReactNode
  backgroundColor?: string
}

const HEADER_PADDING_TOP = 56
const HEADER_PADDING_H = 20
const HEADER_PADDING_BOTTOM = 18
const BELL_SIZE = 25

export default function AppHeader({
  title,
  subtitle,
  greeting,
  name,
  unreadCount = 0,
  onBellPress,
  hideBell = false,
  showBack = false,
  onBackPress,
  rightContent,
  backgroundColor,
}: Props) {
  const isHome = !!greeting && !!name

  return (
    <View style={{
      backgroundColor: backgroundColor ?? Colors.primary,
      paddingTop: HEADER_PADDING_TOP,
      paddingBottom: HEADER_PADDING_BOTTOM,
      paddingHorizontal: HEADER_PADDING_H,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 6,
    }}>
      {isHome ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ color: '#fbcfe8', fontSize: 13 }}>{greeting}</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 }}>{name}</Text>
          </View>
          {!hideBell && <Bell count={unreadCount} onPress={onBellPress} />}
        </View>
      ) : showBack ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={onBackPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={BELL_SIZE} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={{ color: '#fbcfe8', fontSize: 12, marginTop: 1 }}>{subtitle}</Text>
            ) : null}
          </View>
          {rightContent ?? null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{title}</Text>
            {subtitle ? (
              <Text style={{ color: '#fbcfe8', fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
            ) : null}
          </View>
          {!hideBell && <Bell count={unreadCount} onPress={onBellPress} />}
        </View>
      )}
    </View>
  )
}

function Bell({ count, onPress }: { count: number; onPress?: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ position: 'relative', padding: 4 }}>
      <Feather name="bell" size={BELL_SIZE} color="#fff" />
      {count > 0 && (
        <View style={{
          position: 'absolute', top: 0, right: 0,
          backgroundColor: '#fbbf24', borderRadius: 99,
          minWidth: 17, height: 17,
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  )
}
