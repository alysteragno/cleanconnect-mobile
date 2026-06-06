import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

type Notification = {
  id: string
  title: string
  body: string
  read: boolean
  created_at: string
}

function formatTime(d: string) {
  const date = new Date(d)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export default function CustomerNotificationsScreen() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadNotifications()
  }, [])

  async function loadNotifications() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setNotifications((data ?? []) as Notification[])
    setLoading(false)
    setRefreshing(false)

    // Mark all unread as read
    const unreadIds = (data ?? []).filter((n: any) => !n.read).map((n: any) => n.id)
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{
        backgroundColor: Colors.primary,
        paddingTop: 56, paddingBottom: 20, paddingHorizontal: 24,
        flexDirection: 'row', alignItems: 'center',
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ color: '#fff', fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Notifications</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadNotifications() }}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 48 }}>
            <Feather name="bell" size={40} color={Colors.textMuted} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>No notifications</Text>
            <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center' }}>
              Booking updates and reminders will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{
            backgroundColor: item.read ? '#fff' : Colors.primary + '08',
            borderRadius: 14, borderWidth: 1,
            borderColor: item.read ? '#e5e7eb' : Colors.primary + '30',
            padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12,
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: Colors.primary + '15',
              alignItems: 'center', justifyContent: 'center', marginTop: 2,
            }}>
              <Feather name="bell" size={16} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{
                  fontSize: 14, fontWeight: item.read ? '600' : '700', color: '#111827', flex: 1, marginRight: 8,
                }}>
                  {item.title}
                </Text>
                {!item.read && (
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: Colors.primary, marginTop: 4,
                  }} />
                )}
              </View>
              <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 3, lineHeight: 18 }}>
                {item.body}
              </Text>
              <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                {formatTime(item.created_at)}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  )
}
