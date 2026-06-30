import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)

  async function handleReset() {
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    setLoading(true)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase()
    )
    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setSent(true)
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Pink hero — matches login/register */}
        <View style={s.hero}>
          <View style={[s.bubble, s.bubble1]} />
          <View style={[s.bubble, s.bubble2]} />
          <View style={[s.bubble, s.bubble3]} />
        </View>

        {/* Form card */}
        <View style={s.card}>
          <View style={s.logoWrap}>
            <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
            <Text style={s.brand}>Maid For You Cleaning Services</Text>
          </View>

          {sent ? (
            <>
              <View style={s.successIcon}>
                <Feather name="mail" size={32} color="#db2777" />
              </View>
              <Text style={s.title}>Check your inbox</Text>
              <Text style={s.subtitle}>
                We sent a password reset link to{'\n'}
                <Text style={{ fontWeight: '700', color: '#111827' }}>{email}</Text>
                {'\n\n'}Follow the link in the email to set a new password. Check your spam folder if you don't see it within a minute.
              </Text>
              <TouchableOpacity
                style={s.btn}
                onPress={() => router.replace('/(auth)/login')}
                activeOpacity={0.85}
              >
                <Text style={s.btnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.title}>Forgot password?</Text>
              <Text style={s.subtitle}>
                Enter your account email and we'll send you a link to reset your password.
              </Text>

              <View style={[s.inputRow, focused === 'email' && s.inputFocused]}>
                <Feather
                  name="mail"
                  size={16}
                  color={focused === 'email' ? '#db2777' : '#9ca3af'}
                  style={s.icon}
                />
                <TextInput
                  style={s.input}
                  placeholder="Email address"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                />
              </View>

              {error && (
                <View style={s.errorBox}>
                  <Feather name="alert-circle" size={14} color="#dc2626" />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={s.btn}
                onPress={handleReset}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Send Reset Link</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={s.backRow}
                onPress={() => router.back()}
                hitSlop={8}
              >
                <Feather name="arrow-left" size={14} color="#db2777" />
                <Text style={s.backText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#db2777' },

  hero: { height: 140, overflow: 'hidden' },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)' },
  bubble1: { width: 240, height: 240, top: -80, right: -70 },
  bubble2: { width: 140, height: 140, top: 20, left: -50 },
  bubble3: { width: 90, height: 90, bottom: -20, right: 40 },

  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 150, height: 96 },
  brand: { color: '#6b7280', fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginTop: 6 },

  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
    flex: 1,
  },
  title: { fontSize: 23, fontWeight: '800', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 28, lineHeight: 20 },

  successIcon: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#fce7f3',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 14, backgroundColor: '#f9fafb',
  },
  inputFocused: { borderColor: '#db2777', backgroundColor: '#fff' },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#111827' },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },

  btn: {
    backgroundColor: '#db2777',
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 6,
    shadowColor: '#db2777',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },

  backRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: 24,
  },
  backText: { fontSize: 13, color: '#db2777', fontWeight: '700' },
})
