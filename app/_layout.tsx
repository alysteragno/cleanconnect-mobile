import '../global.css'
import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '@/lib/supabase'

export default function RootLayout() {
  const router = useRouter()

  useEffect(() => {
    // Handle initial session on app load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await navigateByRole(session.user.id)
      }
    })

    // Handle auth state changes (sign in / sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await navigateByRole(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        router.replace('/(auth)/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function navigateByRole(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    const role = data?.role
    if (role === 'customer') router.replace('/(customer)')
    else if (role === 'cleaner') router.replace('/(cleaner)')
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}
