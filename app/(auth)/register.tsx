import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function RegisterScreen() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegister() {
    if (!fullName || !email || !password) {
      setError('Full name, email, and password are required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        role: 'customer',
        is_active: true,
      })

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

      router.replace('/(customer)')
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-pink-600"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 pt-16 pb-8">
          <View className="mb-10">
            <Text className="text-white text-3xl font-bold">CleanConnect</Text>
            <Text className="text-pink-200 text-sm mt-2">
              Maid For You Cleaning Services
            </Text>
          </View>

          <View className="bg-white rounded-2xl p-6 shadow-sm">
            <Text className="text-gray-900 text-xl font-bold mb-1">Create account</Text>
            <Text className="text-gray-500 text-sm mb-6">Book your first cleaning in minutes</Text>

            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Full Name *</Text>
                <TextInput
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="Maria Santos"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="words"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Email *</Text>
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
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Phone</Text>
                <TextInput
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="+63 9XX XXX XXXX"
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Password *</Text>
                <TextInput
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry
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
                onPress={handleRegister}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text className="text-white font-semibold text-sm">Create Account</Text>
                }
              </TouchableOpacity>
            </View>

            <View className="flex-row justify-center mt-6">
              <Text className="text-sm text-gray-500">Already have an account? </Text>
              <Link href="/(auth)/login">
                <Text className="text-sm text-pink-600 font-semibold">Sign In</Text>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
