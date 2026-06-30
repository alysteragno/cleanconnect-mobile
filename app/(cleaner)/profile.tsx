import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme, Theme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'

type Stats = {
  completed: number
  assigned: number
}

const THEME_OPTIONS: Array<{ key: Theme; label: string; icon: string }> = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
]

export default function CleanerProfileScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { theme, setTheme, isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [stats, setStats] = useState<Stats>({ completed: 0, assigned: 0 })
  const [unreadCount, setUnreadCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? '')

    const [{ data: profile }, { data: assignments }, { count }] = await Promise.all([
      supabase.from('profiles').select('full_name, phone').eq('id', user.id).single(),
      supabase.from('cleaner_assignments').select('status').eq('cleaner_id', user.id),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
    ])

    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setStats({
      completed: (assignments ?? []).filter(a => a.status === 'completed').length,
      assigned: (assignments ?? []).filter(a => a.status === 'assigned').length,
    })
    setUnreadCount(count ?? 0)
    setLoading(false)
    setRefreshing(false)
  }

  async function signOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { await supabase.auth.signOut() },
      },
    ])
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="My Profile"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadProfile() }}
            tintColor={isDark ? '#ffffff' : Colors.primary}
            colors={isDark ? ['#ffffff'] : [Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
          />
        }
      >

        {/* Avatar block */}
        <View style={{
          backgroundColor: C.white, borderRadius: 20, borderWidth: 1,
          borderColor: C.border, padding: 24, alignItems: 'center',
        }}>
          <View style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: Colors.primary + '20',
            alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: Colors.primary }}>
              {fullName.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{fullName}</Text>
          <Text style={{ fontSize: 14, color: C.textSecondary, marginTop: 2 }}>{email}</Text>
          <View style={{
            marginTop: 8, paddingHorizontal: 10, paddingVertical: 3,
            backgroundColor: '#7c3aed15', borderRadius: 99,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c3aed' }}>Cleaner</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{
            flex: 1, backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.border, padding: 16, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#16a34a' }}>{stats.completed}</Text>
            <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2, fontWeight: '600' }}>Completed</Text>
          </View>
          <View style={{
            flex: 1, backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.border, padding: 16, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.primary }}>{stats.assigned}</Text>
            <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2, fontWeight: '600' }}>Upcoming</Text>
          </View>
        </View>

        {/* Account info */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
          borderColor: C.border, overflow: 'hidden',
        }}>
          <View style={{
            backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Account Details</Text>
          </View>

          {[
            { label: 'EMAIL', value: email },
            { label: 'FULL NAME', value: fullName || '—' },
            { label: 'PHONE', value: phone || '—' },
          ].map((row, i, arr) => (
            <View key={row.label} style={{
              paddingHorizontal: 16, paddingVertical: 14,
              borderBottomWidth: i < arr.length - 1 ? 1 : 0,
              borderBottomColor: C.borderLight,
            }}>
              <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>{row.label}</Text>
              <Text style={{ fontSize: 14, color: C.text, fontWeight: '500' }}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={{
          backgroundColor: C.primaryBg, borderRadius: 14, borderWidth: 1,
          borderColor: Colors.primary + '30', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
        }}>
          <Feather name="info" size={16} color={Colors.primary} />
          <Text style={{ fontSize: 13, color: Colors.primary, flex: 1, lineHeight: 18 }}>
            To update your profile or contact details, please reach out to your branch manager.
          </Text>
        </View>

        {/* Theme toggle */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
          borderColor: C.border, overflow: 'hidden',
        }}>
          <View style={{
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: C.background, borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Appearance</Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 12 }}>
              Choose between light and dark appearance.
            </Text>
            <View style={{
              flexDirection: 'row', backgroundColor: C.background,
              borderRadius: 12, padding: 4, gap: 4,
            }}>
              {THEME_OPTIONS.map(opt => {
                const active = theme === opt.key
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setTheme(opt.key)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center',
                      justifyContent: 'center', gap: 5,
                      paddingVertical: 9, borderRadius: 9,
                      backgroundColor: active ? C.white : 'transparent',
                      shadowColor: active ? '#000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: active ? 0.08 : 0,
                      shadowRadius: 3,
                      elevation: active ? 2 : 0,
                    }}
                  >
                    <Feather
                      name={opt.icon as any}
                      size={14}
                      color={active ? Colors.primary : C.textMuted}
                    />
                    <Text style={{
                      fontSize: 13, fontWeight: active ? '700' : '500',
                      color: active ? Colors.primary : C.textMuted,
                    }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={signOut}
          style={{
            backgroundColor: C.white, borderRadius: 14, borderWidth: 1,
            borderColor: '#fca5a5', paddingVertical: 14, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 8,
          }}
        >
          <Feather name="log-out" size={16} color="#dc2626" />
          <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 }}>Sign Out</Text>
        </TouchableOpacity>

        {/* App version */}
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: C.textMuted, fontWeight: '500' }}>
            CleanConnect v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  )
}
