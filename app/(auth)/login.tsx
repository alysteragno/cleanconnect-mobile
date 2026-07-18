import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/pushNotifications'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 30

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const failedAttempts = useRef(0)
  const lockedUntil = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function startLockout() {
    lockedUntil.current = Date.now() + LOCKOUT_SECONDS * 1000
    setCountdown(LOCKOUT_SECONDS)
    timerRef.current = setInterval(() => {
      const remaining = Math.ceil((lockedUntil.current - Date.now()) / 1000)
      if (remaining <= 0) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        failedAttempts.current = 0
        setCountdown(0)
      } else {
        setCountdown(remaining)
      }
    }, 1000)
  }

  async function handleLogin() {
    if (countdown > 0) return
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError(null)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      failedAttempts.current += 1
      if (failedAttempts.current >= MAX_ATTEMPTS) {
        setError(`Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds before trying again.`)
        startLockout()
      } else {
        setError(`${authError.message} (${MAX_ATTEMPTS - failedAttempts.current} attempt${MAX_ATTEMPTS - failedAttempts.current === 1 ? '' : 's'} remaining)`)
      }
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
        setLoading(false)
        router.replace({ pathname: '/(auth)/wrong-platform', params: { email: data.session.user.email ?? '' } })
        return
      }

      if (profile?.role === 'customer') {
        registerPushToken(data.session.user.id)
        router.replace('/(customer)')
        return
      }
      if (profile?.role === 'cleaner') {
        registerPushToken(data.session.user.id)
        router.replace('/(cleaner)')
        return
      }

      setError(`Login succeeded but profile could not be loaded (error: ${profileError?.message ?? 'unknown'}). Check Supabase RLS policies.`)
      await supabase.auth.signOut()
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Pink hero — decorative only */}
        <View style={s.hero}>
          <View style={[s.bubble, s.bubble1]} />
          <View style={[s.bubble, s.bubble2]} />
          <View style={[s.bubble, s.bubble3]} />
        </View>

        {/* Form card */}
        <View style={s.card}>
          {/* Logo on white */}
          <View style={s.logoWrap}>
            <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
            <Text style={s.brand}>Maid For You Cleaning Services</Text>
          </View>

          <Text style={s.title}>Welcome back</Text>
          <Text style={s.subtitle}>Sign in to your account</Text>

          {/* Email */}
          <View style={[s.inputRow, focused === 'email' && s.inputFocused]}>
            <Feather name="mail" size={16} color={focused === 'email' ? '#db2777' : '#9ca3af'} style={s.icon} />
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

          {/* Password */}
          <View style={[s.inputRow, focused === 'password' && s.inputFocused]}>
            <Feather name="lock" size={16} color={focused === 'password' ? '#db2777' : '#9ca3af'} style={s.icon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={8}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Forgot password */}
          <TouchableOpacity
            style={s.forgotRow}
            onPress={() => router.push('/(auth)/forgot-password')}
            hitSlop={8}
          >
            <Text style={s.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {error && (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={14} color="#dc2626" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.btn, (countdown > 0) && s.btnLocked]}
            onPress={handleLogin}
            disabled={loading || countdown > 0}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : countdown > 0
                ? <Text style={s.btnText}>Try again in {countdown}s</Text>
                : <Text style={s.btnText}>Sign In</Text>
            }
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>Don't have an account? </Text>
            <Link href="/(auth)/register">
              <Text style={s.footerLink}>Register</Text>
            </Link>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#db2777' },

  // Hero
  hero: {
    height: 140,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  bubble1: { width: 240, height: 240, top: -80, right: -70 },
  bubble2: { width: 140, height: 140, top: 20, left: -50 },
  bubble3: { width: 90, height: 90, bottom: -20, right: 40 },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 150, height: 96 },
  brand: { color: '#6b7280', fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginTop: 6 },

  // Card
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
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 28 },

  // Inputs
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    backgroundColor: '#f9fafb',
  },
  inputFocused: {
    borderColor: '#db2777',
    backgroundColor: '#fff',
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#111827' },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },

  // Button
  btn: {
    backgroundColor: '#db2777',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#db2777',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },
  btnLocked: { backgroundColor: '#9ca3af', shadowOpacity: 0 },

  // Forgot password
  forgotRow: { alignSelf: 'flex-end', marginTop: -6, marginBottom: 14 },
  forgotText: { fontSize: 13, color: '#db2777', fontWeight: '600' },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { fontSize: 13, color: '#6b7280' },
  footerLink: { fontSize: 13, color: '#db2777', fontWeight: '700' },
})
