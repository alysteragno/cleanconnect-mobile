import { View, Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function CleanerProfileScreen() {
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  return (
    <View className="flex-1 bg-gray-50 items-center justify-center px-6">
      <Text className="text-gray-400 mb-6">Profile — coming soon</Text>
      <TouchableOpacity
        className="bg-red-50 border border-red-200 rounded-xl px-6 py-3"
        onPress={handleSignOut}
      >
        <Text className="text-red-600 font-semibold text-sm">Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}
