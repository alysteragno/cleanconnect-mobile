import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/pushNotifications'
import { validateEmail } from '@/lib/sanitize'
import { setOtpPending } from '@/lib/authFlow'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 30
const MAX_OTP_ATTEMPTS = 5
const OTP_RESEND_SECONDS = 30
// Supabase's emailed OTP token is 8 digits by default (not 6) — accept up to that length
// rather than hardcoding an exact digit count that depends on dashboard/GoTrue defaults.
const MIN_OTP_LENGTH = 6
const MAX_OTP_LENGTH = 8

export default function LoginScreen() {
  const router = useRouter()
  const [step, setStep] = useState<'password' | 'otp'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [otpResending, setOtpResending] = useState(false)
  const [otpResendCooldown, setOtpResendCooldown] = useState(0)
  const failedAttempts = useRef(0)
  const lockedUntil = useRef(0)
  const otpAttempts = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (otpTimerRef.current) clearInterval(otpTimerRef.current)
    }
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

  function startOtpCooldown() {
    setOtpResendCooldown(OTP_RESEND_SECONDS)
    otpTimerRef.current = setInterval(() => {
      setOtpResendCooldown(c => {
        if (c <= 1) {
          clearInterval(otpTimerRef.current!)
          otpTimerRef.current = null
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  async function handlePasswordStep() {
    if (countdown > 0) return
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    const emailIssue = validateEmail(email)
    if (emailIssue) {
      setError(emailIssue)
      return
    }
    setLoading(true)
    setError(null)
    setUnconfirmed(false)
    setResendSent(false)

    const cleanEmail = email.trim()

    // signInWithPassword() and the signOut() below each fire their own transient
    // SIGNED_IN/SIGNED_OUT — root layout ignores both while this is true. See lib/authFlow.ts.
    setOtpPending(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })

    if (authError) {
      setOtpPending(false)
      setLoading(false)
      const isUnconfirmed = authError.code === 'email_not_confirmed'
        || authError.message.toLowerCase().includes('email not confirmed')
      if (isUnconfirmed) {
        // Not a wrong password — don't burn a lockout attempt on it.
        setUnconfirmed(true)
        setError('Please confirm your email before signing in. Check your inbox for the confirmation link.')
        return
      }

      // signInWithPassword deliberately returns the same generic error for a wrong
      // password vs. an unknown email — this RPC (SECURITY DEFINER, returns a bare
      // boolean) is the only way to tell them apart. Falls back to the generic message
      // if the RPC itself errors (e.g. migration not applied yet), so this never crashes.
      const { data: emailExists } = await supabase.rpc('check_email_exists', { p_email: cleanEmail })
      const baseMessage = emailExists === false
        ? 'No account found with that email address.'
        : authError.message

      failedAttempts.current += 1
      if (failedAttempts.current >= MAX_ATTEMPTS) {
        setError(`Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds before trying again.`)
        startLockout()
      } else {
        setError(`${baseMessage} (${MAX_ATTEMPTS - failedAttempts.current} attempt${MAX_ATTEMPTS - failedAttempts.current === 1 ? '' : 's'} remaining)`)
      }
      return
    }

    if (!data.session) {
      setOtpPending(false)
      setLoading(false)
      setError('Sign in failed. Please try again.')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', data.session.user.id)
      .single()

    if (profile?.is_active === false) {
      await supabase.auth.signOut()
      setOtpPending(false)
      setError('Your account has been deactivated. Please contact support.')
      setLoading(false)
      return
    }

    if (profile?.role && profile.role !== 'customer' && profile.role !== 'cleaner') {
      await supabase.auth.signOut()
      setOtpPending(false)
      setLoading(false)
      router.replace({ pathname: '/(auth)/wrong-platform', params: { email: data.session.user.email ?? '' } })
      return
    }

    if (!profile) {
      await supabase.auth.signOut()
      setOtpPending(false)
      setLoading(false)
      setError(`Login succeeded but profile could not be loaded (error: ${profileError?.message ?? 'unknown'}). Check Supabase RLS policies.`)
      return
    }

    // Password (and role/active) check passed. Drop this session and require a fresh
    // emailed code before granting real access — otpPending stays true (no legitimate
    // auth event fires again until verifyOtp() below succeeds).
    await supabase.auth.signOut()
    const { error: otpSendError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false },
    })
    setLoading(false)

    if (otpSendError) {
      setOtpPending(false)
      setError(otpSendError.message)
      return
    }

    otpAttempts.current = 0
    setOtpCode('')
    setStep('otp')
    startOtpCooldown()
  }

  async function handleVerifyOtp() {
    const code = otpCode.trim()
    if (code.length < MIN_OTP_LENGTH) {
      setError('Enter the verification code from your email.')
      return
    }
    setLoading(true)
    setError(null)

    // From here on a successful sign-in is the real thing — let root layout handle it.
    setOtpPending(false)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: 'email',
    })

    if (verifyError) {
      setLoading(false)
      otpAttempts.current += 1
      if (otpAttempts.current >= MAX_OTP_ATTEMPTS) {
        setError('Too many incorrect codes. Please sign in again.')
        handleBackToPassword()
      } else {
        setError(`${verifyError.message} (${MAX_OTP_ATTEMPTS - otpAttempts.current} attempt${MAX_OTP_ATTEMPTS - otpAttempts.current === 1 ? '' : 's'} remaining)`)
      }
      return
    }
    // Success: root layout's onAuthStateChange picks up SIGNED_IN from here.
  }

  async function handleResendOtp() {
    setOtpResending(true)
    setError(null)
    const { error: resendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setOtpResending(false)
    if (resendError) {
      setError(resendError.message)
      return
    }
    otpAttempts.current = 0
    setOtpCode('')
    startOtpCooldown()
  }

  function handleBackToPassword() {
    setOtpPending(false)
    if (otpTimerRef.current) { clearInterval(otpTimerRef.current); otpTimerRef.current = null }
    setOtpResendCooldown(0)
    setOtpCode('')
    setPassword('')
    setStep('password')
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    const webUrl = process.env.EXPO_PUBLIC_WEB_URL
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      ...(webUrl ? { options: { emailRedirectTo: `${webUrl}/login` } } : {}),
    })
    setResending(false)
    if (resendError) {
      setError(resendError.message)
      return
    }
    setResendSent(true)
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

          {step === 'otp' ? (
            <>
              <View style={s.successIcon}>
                <Feather name="shield" size={32} color="#db2777" />
              </View>
              <Text style={s.title}>Enter verification code</Text>
              <Text style={s.subtitle}>
                We sent a verification code to{'\n'}
                <Text style={{ fontWeight: '700', color: '#111827' }}>{email.trim()}</Text>
                {'\n\n'}Enter it below to finish signing in.
              </Text>

              <View style={[s.inputRow, focused === 'otp' && s.inputFocused]}>
                <Feather name="hash" size={16} color={focused === 'otp' ? '#db2777' : '#9ca3af'} style={s.icon} />
                <TextInput
                  style={[s.input, s.otpInput]}
                  placeholder="00000000"
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                  maxLength={MAX_OTP_LENGTH}
                  value={otpCode}
                  onChangeText={v => setOtpCode(v.replace(/[^0-9]/g, ''))}
                  onFocus={() => setFocused('otp')}
                  onBlur={() => setFocused(null)}
                  autoFocus
                />
              </View>

              {error && (
                <View style={s.errorBox}>
                  <Feather name="alert-circle" size={14} color="#dc2626" />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={s.resendRow}
                onPress={handleResendOtp}
                disabled={otpResending || otpResendCooldown > 0}
                hitSlop={8}
              >
                {otpResending
                  ? <ActivityIndicator size="small" color="#db2777" />
                  : (
                    <Text style={[s.resendText, otpResendCooldown > 0 && s.resendTextDisabled]}>
                      {otpResendCooldown > 0 ? `Resend code in ${otpResendCooldown}s` : 'Resend code'}
                    </Text>
                  )
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btn}
                onPress={handleVerifyOtp}
                disabled={loading || otpCode.length < MIN_OTP_LENGTH}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Verify & Sign In</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity style={s.backRow} onPress={handleBackToPassword} hitSlop={8}>
                <Feather name="arrow-left" size={14} color="#db2777" />
                <Text style={s.backText}>Use a different account</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
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

              {unconfirmed && (
                resendSent ? (
                  <View style={s.resendSentRow}>
                    <Feather name="check-circle" size={14} color="#16a34a" />
                    <Text style={s.resendSentText}>Confirmation email resent. Check your inbox.</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={s.resendRow} onPress={handleResend} disabled={resending} hitSlop={8}>
                    {resending
                      ? <ActivityIndicator size="small" color="#db2777" />
                      : <Text style={s.resendText}>Resend confirmation email</Text>
                    }
                  </TouchableOpacity>
                )
              )}

              <TouchableOpacity
                style={[s.btn, (countdown > 0) && s.btnLocked]}
                onPress={handlePasswordStep}
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
            </>
          )}
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
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 28, lineHeight: 20 },

  successIcon: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#fce7f3',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },

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
  otpInput: { fontSize: 18, fontWeight: '700', letterSpacing: 5 },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },

  // Resend confirmation / resend OTP
  resendRow: { alignSelf: 'center', marginBottom: 14 },
  resendText: { fontSize: 13, color: '#db2777', fontWeight: '700' },
  resendTextDisabled: { color: '#9ca3af' },
  resendSentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginBottom: 14,
  },
  resendSentText: { fontSize: 13, color: '#16a34a', fontWeight: '600' },

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

  // Back (OTP step)
  backRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: 24,
  },
  backText: { fontSize: 13, color: '#db2777', fontWeight: '700' },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { fontSize: 13, color: '#6b7280' },
  footerLink: { fontSize: 13, color: '#db2777', fontWeight: '700' },
})
