import '../global.css'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/pushNotifications'
import { getOtpPending } from '@/lib/authFlow'
import { ThemeProvider, useTheme } from '@/context/ThemeContext'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

async function setupNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#db2777',
      sound: 'default',
    })
  }
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

function RootLayoutInner() {
  const router = useRouter()
  const { isDark } = useTheme()
  const notifChannelRef = useRef<RealtimeChannel | null>(null)
  const userRoleRef = useRef<string | null>(null)

  useEffect(() => {
    setupNotifications()

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await navigateByRole(session.user.id)
        subscribeToNotifications(session.user.id)
        registerPushToken(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Login is a password step followed by an emailed OTP step. Both the password
      // check and the signOut() between the two steps fire their own transient
      // SIGNED_IN/SIGNED_OUT here — ignore them until the OTP step actually finishes.
      if (getOtpPending()) return

      if (event === 'SIGNED_IN' && session) {
        await navigateByRole(session.user.id)
        subscribeToNotifications(session.user.id)
        registerPushToken(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        notifChannelRef.current?.unsubscribe()
        notifChannelRef.current = null
        userRoleRef.current = null
        router.replace('/(auth)/login')
      }
    })

    // Tapping a notification navigates to the notifications screen
    const tapSub = Notifications.addNotificationResponseReceivedListener(() => {
      const role = userRoleRef.current
      if (role === 'customer') router.push('/(customer)/notifications')
      else if (role === 'cleaner') router.push('/(cleaner)/notifications')
    })

    return () => {
      subscription.unsubscribe()
      tapSub.remove()
      notifChannelRef.current?.unsubscribe()
    }
  }, [])

  function subscribeToNotifications(userId: string) {
    notifChannelRef.current?.unsubscribe()
    notifChannelRef.current = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const n = payload.new as { title: string; body: string }
          await Notifications.scheduleNotificationAsync({
            content: { title: n.title, body: n.body, sound: true, data: {} },
            trigger: null,
          })
        }
      )
      .subscribe()
  }

  async function navigateByRole(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    const role = data?.role
    userRoleRef.current = role ?? null
    if (role === 'customer') router.replace('/(customer)')
    else if (role === 'cleaner') router.replace('/(cleaner)')
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  )
}
