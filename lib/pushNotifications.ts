import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

/**
 * Registers (or refreshes) this device's Expo push token for `userId`.
 * Must run on every app start with a restored session, not just right after
 * login — otherwise a token can go stale (reinstall, token rotation, etc.)
 * without the user ever noticing, since push failures are silent.
 */
export async function registerPushToken(userId: string) {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') return

    // The Android notification channel is created once at app startup
    // (see app/_layout.tsx) — no need to repeat it here.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId
    if (!projectId) return

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId)
  } catch {
    // Push registration is non-critical — silently skip on failure
  }
}
