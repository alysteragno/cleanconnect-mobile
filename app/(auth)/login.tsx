import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError(null)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.session) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.session.user.id)
        .single()

      if (profile?.is_active === false) {
        await supabase.auth.signOut()
        setError('Your account has been deactivated. Please contact support.')
        setLoading(false)
        return
      }

      if (profile?.role && profile.role !== 'customer' && profile.role !== 'cleaner') {
        await supabase.auth.signOut()
        setError('This app is for customers and cleaners only. Please use the web portal.')
        setLoading(false)
        return
      }

      if (profile?.role === 'customer') {
        router.replace('/(customer)')
        return
      }
      if (profile?.role === 'cleaner') {
        router.replace('/(cleaner)')
        return
      }

      setError(`Login succeeded but profile could not be loaded (error: ${profileError?.message ?? 'unknown'}). Check Supabase RLS policies.`)
      await supabase.auth.signOut()
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-pink-600"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 pt-16 pb-8">
          {/* Logo */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{
              backgroundColor: '#fff', borderRadius: 24, padding: 16,
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
            }}>
              <Image
                source={require('../../assets/logo.webp')}
                style={{ width: 140, height: 90 }}
                resizeMode="contain"
              />
            </View>
            <Text style={{ color: '#fbcfe8', fontSize: 13, marginTop: 12 }}>
              Maid For You Cleaning Services
            </Text>
          </View>

          {/* Card */}
          <View className="bg-white rounded-2xl p-6 shadow-sm">
            <Text className="text-gray-900 text-xl font-bold mb-1">Welcome back</Text>
            <Text className="text-gray-500 text-sm mb-6">Sign in to your account</Text>

            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Email</Text>
                <TextInput
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="you@example.com"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Password</Text>
                <TextInput
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="••••••••"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              {error && (
                <View className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <Text className="text-red-600 text-sm">{error}</Text>
                </View>
              )}

              <TouchableOpacity
                className="bg-pink-600 rounded-xl py-3.5 items-center mt-2"
                onPress={handleLogin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text className="text-white font-semibold text-sm">Sign In</Text>
                }
              </TouchableOpacity>
            </View>

            <View className="flex-row justify-center mt-6">
              <Text className="text-sm text-gray-500">Don't have an account? </Text>
              <Link href="/(auth)/register">
                <Text className="text-sm text-pink-600 font-semibold">Register</Text>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
