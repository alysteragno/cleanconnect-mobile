import { View, Text, TouchableOpacity, StyleSheet, Image, Linking } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'

const WEB_PORTAL_URL = 'https://cleanconnect-one.vercel.app/'

export default function WrongPlatformScreen() {
  const router = useRouter()
  const { email } = useLocalSearchParams<{ email: string }>()

  async function handleBack() {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  return (
    <View style={s.screen}>
      {/* Same bubble hero as login/register */}
      <View style={s.hero}>
        <View style={[s.bubble, s.bubble1]} />
        <View style={[s.bubble, s.bubble2]} />
        <View style={[s.bubble, s.bubble3]} />
      </View>

      <View style={s.card}>
        <View style={s.logoWrap}>
          <Image source={require('../../assets/logo.webp')} style={s.logo} resizeMode="contain" />
          <Text style={s.brand}>Maid For You Cleaning Services</Text>
        </View>

        <View style={s.iconWrap}>
          <Feather name="monitor" size={36} color="#db2777" />
        </View>

        <Text style={s.title}>Admin Account</Text>
        <Text style={s.subtitle}>
          This mobile app is for customers and cleaners only. Administrator accounts must use the
          CleanConnect web portal.
        </Text>

        {email ? (
          <View style={s.emailBox}>
            <Text style={s.emailLabel}>Signed in as</Text>
            <Text style={s.emailValue}>{email}</Text>
          </View>
        ) : null}

        <View style={s.infoBox}>
          <Feather name="info" size={14} color="#7c3aed" />
          <Text style={s.infoText}>
            If you are a customer or cleaner, please sign in with the correct account.
          </Text>
        </View>

        <TouchableOpacity style={s.portalBtn} onPress={() => Linking.openURL(WEB_PORTAL_URL)} activeOpacity={0.85}>
          <Feather name="external-link" size={16} color="#db2777" />
          <Text style={s.portalBtnText}>Open Web Portal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btn} onPress={handleBack} activeOpacity={0.85}>
          <Feather name="arrow-left" size={16} color="#fff" />
          <Text style={s.btnText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#db2777' },

  hero: { height: 140, overflow: 'hidden' },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)' },
  bubble1: { width: 240, height: 240, top: -80, right: -70 },
  bubble2: { width: 140, height: 140, top: 20, left: -50 },
  bubble3: { width: 90, height: 90, bottom: -20, right: 40 },

  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
    flex: 1,
  },

  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 150, height: 96 },
  brand: { color: '#6b7280', fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginTop: 6 },

  iconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#fce7f3',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },

  title: { fontSize: 23, fontWeight: '800', color: '#111827', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6b7280', lineHeight: 22, textAlign: 'center', marginBottom: 24 },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#ede9fe',
    borderWidth: 1, borderColor: '#ddd6fe',
    borderRadius: 12, padding: 14, marginBottom: 28,
  },
  infoText: { flex: 1, fontSize: 13, color: '#5b21b6', lineHeight: 19 },

  emailBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    alignItems: 'center', marginBottom: 16,
  },
  emailLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  emailValue: { fontSize: 14, fontWeight: '700', color: '#111827' },

  portalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#db2777',
    borderRadius: 14, paddingVertical: 15,
    marginBottom: 12,
  },
  portalBtnText: { color: '#db2777', fontWeight: '700', fontSize: 15 },

  btn: {
    backgroundColor: '#db2777',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#db2777',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },
})
