import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { Tabs } from 'expo-router'
import * as Location from 'expo-location'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { supabase } from '@/lib/supabase'

// Opportunistic "last seen" location ping — fired when the cleaner opens the
// app or brings it back to the foreground, NOT on a timer or background
// task (no continuous tracking). Only runs if location permission was
// already granted (e.g. from a prior "Start Trip"/"I've Arrived" tap in the
// jobs flow) — this passive ping never itself prompts for permission, since
// a background lifecycle event is a bad moment to interrupt the user with a
// permission dialog. Feeds AI dispatch's proximity ranking for idle
// cleaners, who otherwise only have a location once they've started a job.
async function pingLastSeenLocation() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync()
    if (status !== 'granted') return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    const { error, data } = await supabase
      .from('profiles')
      .update({
        last_seen_lat: loc.coords.latitude,
        last_seen_lng: loc.coords.longitude,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
    // Never surface this to the cleaner (it's a passive, best-effort ping),
    // but do log it — a silent 0-row update (e.g. an RLS policy gap) should
    // be debuggable instead of invisibly doing nothing.
    if (error || !data || data.length === 0) {
      console.warn('[pingLastSeenLocation] update failed:', JSON.stringify(error))
    }
  } catch {
    // Best-effort only — a failed passive ping should never surface to the cleaner.
  }
}

export default function CleanerLayout() {
  const C = useThemeColors()
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    pingLastSeenLocation()

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        pingLastSeenLocation()
      }
      appState.current = next
    })
    return () => sub.remove()
  }, [])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          borderTopColor: C.border,
          backgroundColor: C.white,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size }) => <Feather name="briefcase" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="availability"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  )
}
