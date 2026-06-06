import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

type Stats = {
  completed: number
  accepted: number
}

export default function CleanerProfileScreen() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [stats, setStats] = useState<Stats>({ completed: 0, accepted: 0 })

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? '')

    const [{ data: profile }, { data: assignments }] = await Promise.all([
      supabase.from('profiles').select('full_name, phone').eq('id', user.id).single(),
      supabase.from('cleaner_assignments').select('status').eq('cleaner_id', user.id),
    ])

    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setStats({
      completed: (assignments ?? []).filter(a => a.status === 'completed').length,
      accepted: (assignments ?? []).filter(a => a.status === 'accepted').length,
    })
    setLoading(false)
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
      <View className="bg-pink-600 px-6 pt-16 pb-8">
        <Text className="text-white text-xl font-bold">My Profile</Text>
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
            backgroundColor: '#7c3aed15', borderRadius: 99,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c3aed' }}>Cleaner</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{
            flex: 1, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
            borderColor: '#e5e7eb', padding: 16, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#16a34a' }}>{stats.completed}</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontWeight: '600' }}>Completed</Text>
          </View>
          <View style={{
            flex: 1, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
            borderColor: '#e5e7eb', padding: 16, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.primary }}>{stats.accepted}</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontWeight: '600' }}>Upcoming</Text>
          </View>
        </View>

        {/* Account info */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
          borderColor: '#e5e7eb', overflow: 'hidden',
        }}>
          <View style={{
            backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Account Details</Text>
          </View>

          {[
            { label: 'EMAIL', value: email },
            { label: 'FULL NAME', value: fullName || '—' },
            { label: 'PHONE', value: phone || '—' },
          ].map((row, i, arr) => (
            <View key={row.label} style={{
              paddingHorizontal: 16, paddingVertical: 14,
              borderBottomWidth: i < arr.length - 1 ? 1 : 0,
              borderBottomColor: '#f3f4f6',
            }}>
              <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 3 }}>{row.label}</Text>
              <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={{
          backgroundColor: '#fdf2f8', borderRadius: 14, borderWidth: 1,
          borderColor: Colors.primary + '30', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
        }}>
          <Feather name="info" size={16} color={Colors.primary} />
          <Text style={{ fontSize: 13, color: '#9c4a7a', flex: 1, lineHeight: 18 }}>
            To update your profile or contact details, please reach out to your branch manager.
          </Text>
        </View>

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
