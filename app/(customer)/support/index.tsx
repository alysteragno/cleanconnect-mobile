import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

type Complaint = {
  id: string
  subject: string
  status: string
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  open: '#ca8a04',
  in_progress: '#7c3aed',
  resolved: '#16a34a',
  closed: '#6b7280',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function SupportScreen() {
  const router = useRouter()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadComplaints() }, [])

  async function loadComplaints() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('complaints')
      .select('id, subject, status, created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })

    setComplaints((data ?? []) as Complaint[])
    setLoading(false)
    setRefreshing(false)
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
      <View className="bg-pink-600 px-6 pt-16 pb-6">
        <Text className="text-white text-xl font-bold">Support</Text>
        <Text className="text-pink-200 text-sm mt-0.5">Your complaints & requests</Text>
      </View>

      <FlatList
        data={complaints}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadComplaints() }} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Feather name="message-square" size={32} color={Colors.textMuted} style={{ marginBottom: 8 }} />
            <Text className="text-gray-900 font-semibold text-center">No complaints yet</Text>
            <Text className="text-gray-400 text-sm text-center mt-1 mb-4">
              Need help? File a support request below.
            </Text>
            <TouchableOpacity
              className="bg-pink-600 rounded-xl px-6 py-3"
              onPress={() => router.push('/(customer)/support/new')}
            >
              <Text className="text-white font-semibold text-sm">File a Complaint</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="bg-white rounded-2xl border border-gray-100 p-4"
            onPress={() => router.push(`/(customer)/support/${item.id}`)}
            activeOpacity={0.7}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-gray-900 font-semibold text-sm" numberOfLines={2}>
                  {item.subject}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  {formatDate(item.created_at)}
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99,
                backgroundColor: (STATUS_COLORS[item.status] ?? '#6b7280') + '18',
              }}>
                <Text style={{
                  fontSize: 11, fontWeight: '600',
                  color: STATUS_COLORS[item.status] ?? '#6b7280',
                  textTransform: 'capitalize',
                }}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={{
          position: 'absolute', bottom: 24, right: 24,
          backgroundColor: Colors.primary, borderRadius: 28,
          paddingVertical: 14, paddingHorizontal: 20,
          shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}
        onPress={() => router.push('/(customer)/support/new')}
      >
        <Feather name="plus" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>New Complaint</Text>
      </TouchableOpacity>
    </View>
  )
}
