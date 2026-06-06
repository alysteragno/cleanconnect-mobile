import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function CustomerProfileScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

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
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>My Profile</Text>
        <TouchableOpacity onPress={() => router.push('/(customer)/notifications')} style={{ position: 'relative', padding: 4 }}>
          <Feather name="bell" size={22} color="#fff" />
          {unreadCount > 0 && (
            <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: '#fbbf24', borderRadius: 99, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>

        {/* Avatar block */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 20, borderWidth: 1,
          borderColor: '#e5e7eb', padding: 24, alignItems: 'center',
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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{fullName}</Text>
          <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>{email}</Text>
          <View style={{
            marginTop: 8, paddingHorizontal: 10, paddingVertical: 3,
            backgroundColor: Colors.primary + '15', borderRadius: 99,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>Customer</Text>
          </View>
        </View>

        {/* Info card */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
          borderColor: '#e5e7eb', overflow: 'hidden',
        }}>
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Account Details</Text>
            {!editing && (
              <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="edit-2" size={13} color={Colors.primary} />
                <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 3 }}>EMAIL</Text>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>{email}</Text>
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 3 }}>FULL NAME</Text>
            {editing ? (
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                autoFocus
                style={{ fontSize: 14, color: '#111827', borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2 }}
              />
            ) : (
              <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{fullName || '—'}</Text>
            )}
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 3 }}>PHONE</Text>
            {editing ? (
              <TextInput
                value={draftPhone}
                onChangeText={setDraftPhone}
                keyboardType="phone-pad"
                placeholder="e.g. 09123456789"
                placeholderTextColor="#9ca3af"
                style={{ fontSize: 14, color: '#111827', borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2 }}
              />
            ) : (
              <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{phone || '—'}</Text>
            )}
          </View>
        </View>

        {editing && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setEditing(false)}
              style={{
                flex: 1, backgroundColor: '#fff', borderRadius: 12,
                paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb',
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
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

        <TouchableOpacity
          onPress={signOut}
          style={{
            backgroundColor: '#fff', borderRadius: 14, borderWidth: 1,
            borderColor: '#fca5a5', paddingVertical: 14, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 8,
          }}
        >
          <Feather name="log-out" size={16} color="#dc2626" />
          <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 }}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  )
}
