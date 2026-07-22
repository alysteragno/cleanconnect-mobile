import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { getPrivacyAccepted, setPrivacyAccepted, subscribePrivacyAccepted } from '@/lib/privacyAck'
import { validateFullName, validateEmail, sanitizeText } from '@/lib/sanitize'

const PWD_RULES = [
  { label: 'At least 8 characters',         test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)',     test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)',     test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number (0–9)',               test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character (!@#…)',   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export default function RegisterScreen() {
  const router = useRouter()
  const hasReadPrivacy = useSyncExternalStore(subscribePrivacyAccepted, getPrivacyAccepted)
  const [fullName,        setFullName]        = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone,           setPhone]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [showPassword,    setShowPassword]    = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [focused,         setFocused]         = useState<string | null>(null)
  const [phoneError,      setPhoneError]      = useState('')
  const [nameError,       setNameError]       = useState('')
  const [showRules,       setShowRules]       = useState(false)
  const [sent,            setSent]            = useState(false)

  // Reset for the next time this screen is mounted fresh (e.g. after a successful
  // registration, or if the user navigates away and back in a later session).
  useEffect(() => () => setPrivacyAccepted(false), [])

  function validatePhone(value: string) {
    setPhone(value)
    setPhoneError(value.length > 0 && !/^09[0-9]{9}$/.test(value) ? 'Invalid phone number format' : '')
  }

  function onFullNameChange(value: string) {
    setFullName(value)
    setNameError(value.length > 0 ? (validateFullName(value) ?? '') : '')
  }

  const rulesMet      = PWD_RULES.map(r => r.test(password))
  const allRulesMet   = rulesMet.every(Boolean)
  const passwordMatch = password === confirmPassword

  async function handleRegister() {
    const fullNameIssue = validateFullName(fullName)
    if (fullNameIssue) {
      setNameError(fullNameIssue)
      setError(fullNameIssue)
      return
    }
    const emailIssue = validateEmail(email)
    if (emailIssue) {
      setError(emailIssue)
      return
    }
    if (!password) {
      setError('Password is required.')
      return
    }
    if (!allRulesMet) {
      setError('Password does not meet all requirements.')
      return
    }
    if (!confirmPassword || !passwordMatch) {
      setError('Passwords do not match.')
      return
    }
    if (phoneError) {
      setError('Please fix the phone number before continuing.')
      return
    }
    if (!hasReadPrivacy) {
      setError('Please read our Privacy Policy before creating an account.')
      return
    }

    setLoading(true)
    setError(null)

    const cleanFullName = sanitizeText(fullName)
    const cleanEmail = email.trim()
    const cleanPhone = phone.trim() || null

    // Account creation + confirmation email now go through the same web
    // endpoint the admin-created-customer flow uses (generateLink({ type:
    // 'signup' }) + a branded email verified via /auth/callback), instead of
    // calling supabase.auth.signUp() directly — that relied on Supabase's
    // default confirmation email deep-linking back into this app, which
    // isn't reliable across Expo Go / custom URL scheme setups.
    let res: Response
    try {
      res = await fetch(`${process.env.EXPO_PUBLIC_WEB_URL}/api/mobile/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: cleanFullName,
          email: cleanEmail,
          password,
          phone: cleanPhone,
        }),
      })
    } catch {
      setLoading(false)
      setError('Could not reach the server. Check your connection and try again.')
      return
    }

    const json = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? 'Registration failed. Please try again.')
      return
    }

    // No session is returned — the account was created server-side via the
    // admin API. There's nothing to sign into until the customer confirms
    // their email.
    setSent(true)
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Pink hero — decorative */}
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
                We sent a confirmation link to{'\n'}
                <Text style={{ fontWeight: '700', color: '#111827' }}>{email.trim()}</Text>
                {'\n\n'}Verify your email, then come back and sign in. Check your spam folder if you don't see it within a minute.
              </Text>
              <TouchableOpacity style={s.btn} onPress={() => router.replace('/(auth)/login')} activeOpacity={0.85}>
                <Text style={s.btnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
          <>
          <Text style={s.title}>Create account</Text>
          <Text style={s.subtitle}>Book your first cleaning in minutes</Text>

          {/* Full name */}
          <View style={[s.inputRow, focused === 'name' && s.inputFocused, nameError && s.inputError]}>
            <Feather name="user" size={16} color={nameError ? '#dc2626' : focused === 'name' ? '#db2777' : '#9ca3af'} style={s.icon} />
            <TextInput
              style={s.input}
              placeholder="Full name"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
              maxLength={80}
              value={fullName}
              onChangeText={onFullNameChange}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
            />
          </View>
          {nameError ? <Text style={s.fieldError}>{nameError}</Text> : null}

          {/* Email */}
          <View style={[s.inputRow, focused === 'email' && s.inputFocused]}>
            <Feather name="mail" size={16} color={focused === 'email' ? '#db2777' : '#9ca3af'} style={s.icon} />
            <TextInput
              style={s.input}
              placeholder="name@gmail.com"
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

          {/* Phone */}
          <View style={[s.inputRow, focused === 'phone' && s.inputFocused]}>
            <Feather name="phone" size={16} color={focused === 'phone' ? '#db2777' : '#9ca3af'} style={s.icon} />
            <TextInput
              style={s.input}
              placeholder="09XX XXX XXXX"
              maxLength={11}
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={validatePhone}
              onFocus={() => setFocused('phone')}
              onBlur={() => setFocused(null)}
            />
          </View>
          {phoneError ? <Text style={s.fieldError}>{phoneError}</Text> : null}

          {/* Password */}
          <View style={[s.inputRow, focused === 'password' && s.inputFocused]}>
            <Feather name="lock" size={16} color={focused === 'password' ? '#db2777' : '#9ca3af'} style={s.icon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              onFocus={() => { setFocused('password'); setShowRules(true) }}
              onBlur={() => setFocused(null)}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={8}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Live requirements checklist */}
          {(showRules || password.length > 0) && (
            <View style={s.rulesBox}>
              <Text style={s.rulesTitle}>Password requirements</Text>
              {PWD_RULES.map((rule, i) => (
                <View key={i} style={s.ruleRow}>
                  <Feather
                    name={rulesMet[i] ? 'check-circle' : 'circle'}
                    size={13}
                    color={rulesMet[i] ? '#16a34a' : '#9ca3af'}
                  />
                  <Text style={[s.ruleText, rulesMet[i] && s.ruleTextMet]}>
                    {rule.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Confirm password */}
          <View style={[
            s.inputRow,
            focused === 'confirm' && s.inputFocused,
            confirmPassword.length > 0 && !passwordMatch && s.inputError,
          ]}>
            <Feather
              name="lock"
              size={16}
              color={
                confirmPassword.length > 0 && !passwordMatch ? '#dc2626'
                : focused === 'confirm' ? '#db2777'
                : '#9ca3af'
              }
              style={s.icon}
            />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Confirm password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showConfirm}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onFocus={() => setFocused('confirm')}
              onBlur={() => setFocused(null)}
            />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={8}>
              <Feather name={showConfirm ? 'eye-off' : 'eye'} size={16} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {confirmPassword.length > 0 && !passwordMatch && (
            <Text style={s.fieldError}>Passwords do not match</Text>
          )}

          {error && (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={14} color="#dc2626" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={s.privacyRow}
            onPress={() => router.push({ pathname: '/privacy-policy', params: { from: 'register' } })}
            activeOpacity={0.7}
          >
            <Feather
              name={hasReadPrivacy ? 'check-circle' : 'circle'}
              size={18}
              color={hasReadPrivacy ? '#16a34a' : '#9ca3af'}
            />
            <Text style={s.privacyRowText}>
              {hasReadPrivacy ? 'You have read and agree to our ' : 'You must read our '}
              <Text style={s.privacyLink}>Privacy Policy</Text>
              {' '}before continuing.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, !hasReadPrivacy && s.btnDisabled]}
            onPress={handleRegister}
            disabled={loading || !hasReadPrivacy}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Create Account</Text>
            }
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login">
              <Text style={s.footerLink}>Sign In</Text>
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
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 28, paddingTop: 32, paddingBottom: 40,
    flex: 1,
  },
  title:    { fontSize: 23, fontWeight: '800', color: '#111827', marginBottom: 4 },
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
  inputError:   { borderColor: '#dc2626', backgroundColor: '#fff' },
  icon:  { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#111827' },

  rulesBox: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, padding: 14, marginBottom: 14,
  },
  rulesTitle: {
    fontSize: 11, fontWeight: '700', color: '#6b7280',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  ruleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  ruleText:   { fontSize: 13, color: '#9ca3af' },
  ruleTextMet:{ color: '#16a34a', fontWeight: '600' },

  fieldError: { fontSize: 12, color: '#dc2626', marginTop: -10, marginBottom: 10, marginLeft: 4 },
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },

  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, padding: 12, marginTop: 6, marginBottom: 14,
  },
  privacyRowText: { flex: 1, fontSize: 12.5, color: '#6b7280', lineHeight: 17 },
  privacyLink: { color: '#db2777', fontWeight: '700' },

  btn: {
    backgroundColor: '#db2777', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 6,
    shadowColor: '#db2777', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  btnDisabled: { backgroundColor: '#f3a8ce', shadowOpacity: 0 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { fontSize: 13, color: '#6b7280' },
  footerLink: { fontSize: 13, color: '#db2777', fontWeight: '700' },
})
