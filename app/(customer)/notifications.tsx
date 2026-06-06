import { useEffect, useState } from 'react'
import {
  View, Text, SectionList,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import AppHeader from '@/components/AppHeader'

type Notification = {
  id: string
  title: string
  body: string
  type: string | null
  is_read: boolean
  created_at: string
}

type Announcement = {
  id: string
  title: string
  body: string | null
  created_at: string
}

type SectionItem =
  | { kind: 'notification'; data: Notification }
  | { kind: 'announcement'; data: Announcement }

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: notifs }, { data: annouces }] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, title, body, type, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ])

    setNotifications((notifs ?? []) as Notification[])
    setAnnouncements((annouces ?? []) as Announcement[])
    setLoading(false)
    setRefreshing(false)

    // Mark all unread notifications as read
    const unreadIds = (notifs ?? []).filter((n: any) => !n.is_read).map((n: any) => n.id)
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    }
  }

  const sections = [
    ...(notifications.length > 0
      ? [{ title: 'Notifications', data: notifications.map(n => ({ kind: 'notification' as const, data: n })) }]
      : []),
    ...(announcements.length > 0
      ? [{ title: 'Announcements', data: announcements.map(a => ({ kind: 'announcement' as const, data: a })) }]
      : []),
  ]

  const isEmpty = notifications.length === 0 && announcements.length === 0

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <AppHeader
        title="Notifications"
        showBack
        onBackPress={() => router.back()}
        hideBell
      />

      {isEmpty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
          <Feather name="bell" size={40} color={Colors.textMuted} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>All caught up</Text>
          <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center' }}>
            Booking updates and announcements will appear here.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.data.id}
          contentContainerStyle={{ padding: 16, gap: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load() }}
              tintColor={Colors.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={{ paddingVertical: 8, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }: { item: SectionItem }) => {
            if (item.kind === 'notification') {
              const n = item.data
              return (
                <View style={{
                  backgroundColor: n.is_read ? '#fff' : Colors.primary + '08',
                  borderRadius: 14, borderWidth: 1,
                  borderColor: n.is_read ? '#e5e7eb' : Colors.primary + '30',
                  padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                  marginBottom: 8,
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
                        fontSize: 14, fontWeight: n.is_read ? '600' : '700',
                        color: '#111827', flex: 1, marginRight: 8,
                      }}>
                        {n.title}
                      </Text>
                      {!n.is_read && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4 }} />
                      )}
                    </View>
                    {!!n.body && (
                      <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 3, lineHeight: 18 }}>
                        {n.body}
                      </Text>
                    )}
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                      {formatTime(n.created_at)}
                    </Text>
                  </View>
                </View>
              )
            }

            // Announcement
            const a = item.data
            return (
              <View style={{
                backgroundColor: '#fdf2f8',
                borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + '30',
                padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                marginBottom: 8,
              }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: Colors.primary + '20',
                  alignItems: 'center', justifyContent: 'center', marginTop: 2,
                }}>
                  <Feather name="volume-2" size={16} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{a.title}</Text>
                  {!!a.body && (
                    <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 3, lineHeight: 18 }}>
                      {a.body}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                    {formatTime(a.created_at)}
                  </Text>
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}
