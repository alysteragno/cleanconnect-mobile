import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme, Theme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'

const THEME_OPTIONS: Array<{ key: Theme; label: string; icon: string }> = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
]

export default function CustomerProfileScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { theme, setTheme, isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? '')

    const [{ data }, { count }] = await Promise.all([
      supabase.from('profiles').select('full_name, phone').eq('id', user.id).single(),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
    ])

    setFullName(data?.full_name ?? '')
    setPhone(data?.phone ?? '')
    setUnreadCount(count ?? 0)
    setLoading(false)
    setRefreshing(false)
  }

  function startEdit() {
    setDraftName(fullName)
    setDraftPhone(phone)
    setEditing(true)
  }

  async function saveProfile() {
    if (!draftName.trim()) { Alert.alert('Required', 'Name cannot be empty.'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: draftName.trim(), phone: draftPhone.trim() || null })
      .eq('id', user.id)

    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }

    setFullName(draftName.trim())
    setPhone(draftPhone.trim())
    setEditing(false)
    Alert.alert('Saved', 'Profile updated successfully.')
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
        onBellPress={() => router.push('/(customer)/notifications')}
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
            backgroundColor: Colors.primary + '20', borderRadius: 99,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>Customer</Text>
          </View>
        </View>

        {/* Account details */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
          borderColor: C.border, overflow: 'hidden',
        }}>
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: C.background, borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Account Details</Text>
            {!editing && (
              <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="edit-2" size={13} color={Colors.primary} />
                <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>EMAIL</Text>
            <Text style={{ fontSize: 14, color: C.textSecondary }}>{email}</Text>
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>FULL NAME</Text>
            {editing ? (
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                autoFocus
                placeholderTextColor={C.textMuted}
                style={{ fontSize: 14, color: C.text, borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2 }}
              />
            ) : (
              <Text style={{ fontSize: 14, color: C.text, fontWeight: '500' }}>{fullName || '—'}</Text>
            )}
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 }}>PHONE</Text>
            {editing ? (
              <TextInput
                value={draftPhone}
                onChangeText={setDraftPhone}
                keyboardType="phone-pad"
                placeholder="e.g. 09123456789"
                placeholderTextColor={C.textMuted}
                style={{ fontSize: 14, color: C.text, borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2 }}
              />
            ) : (
              <Text style={{ fontSize: 14, color: C.text, fontWeight: '500' }}>{phone || '—'}</Text>
            )}
          </View>
        </View>

        {editing && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setEditing(false)}
              style={{
                flex: 1, backgroundColor: C.white, borderRadius: 12,
                paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.border,
              }}
            >
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveProfile}
              disabled={saving}
              style={{
                flex: 2, backgroundColor: Colors.primary, borderRadius: 12,
                paddingVertical: 13, alignItems: 'center', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        )}

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

        {/* Legal */}
        <TouchableOpacity
          onPress={() => router.push('/privacy-policy')}
          style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border,
            paddingHorizontal: 16, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}
        >
          <View style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(219,39,119,0.15)', alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name="shield" size={16} color={Colors.primary} />
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.text }}>Privacy Policy</Text>
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </TouchableOpacity>

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
