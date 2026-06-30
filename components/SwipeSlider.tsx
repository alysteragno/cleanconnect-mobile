import { useEffect, useRef } from 'react'
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'

const THUMB = 56
const HEIGHT = 64

type Props = {
  label: string
  color: string
  icon?: string
  disabled?: boolean
  onComplete: () => void | Promise<void>
}

export default function SwipeSlider({ label, color, icon = 'chevrons-right', disabled = false, onComplete }: Props) {
  const translateX = useRef(new Animated.Value(0)).current
  const doneRef = useRef(false)
  const maxRef = useRef(0)
  const disabledRef = useRef(disabled)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => { disabledRef.current = disabled }, [disabled])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !doneRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current && !doneRef.current,
      onPanResponderMove: (_, g) => {
        const max = maxRef.current
        if (max <= 0) return
        translateX.setValue(Math.max(0, Math.min(g.dx, max)))
      },
      onPanResponderRelease: (_, g) => {
        const max = maxRef.current
        if (max <= 0) return
        if (g.dx >= max * 0.8) {
          doneRef.current = true
          Animated.spring(translateX, { toValue: max, useNativeDriver: false }).start()
          onCompleteRef.current()
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false }).start()
        }
      },
    })
  ).current

  return (
    <View
      style={{ height: HEIGHT, backgroundColor: color, borderRadius: HEIGHT / 2, overflow: 'hidden', opacity: disabled ? 0.6 : 1 }}
      onLayout={e => { maxRef.current = e.nativeEvent.layout.width - THUMB - 8 }}
    >
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
          {label}
        </Text>
      </View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 4,
          top: 4,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateX }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 3,
        }}
        {...pan.panHandlers}
      >
        <Feather name={icon as any} size={22} color={color} />
      </Animated.View>
    </View>
  )
}
