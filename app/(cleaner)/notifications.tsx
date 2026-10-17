import { useEffect, useState } from 'react'
import {
  View, Text, SectionList, Pressable, TextInput, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
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

const ANNOUNCEMENTS_PAGE_SIZE = 10
const NOTIFICATIONS_PAGE_SIZE = 10

type DateFilter = 'all' | 'this_week' | 'last_week' | 'last_month'

const DATE_FILTER_OPTIONS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'last_month', label: 'Last Month' },
]

/** [gte, lt) created_at bounds (ISO strings) for a date filter preset. Weeks run Sun–Sat. */
function getDateRange(filter: DateFilter): { gte?: string; lt?: string } {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (filter === 'all') return {}

  if (filter === 'this_week' || filter === 'last_week') {
    const startOfThisWeek = new Date(startOfToday)
    startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfToday.getDay())
    if (filter === 'this_week') return { gte: startOfThisWeek.toISOString() }
    const startOfLastWeek = new Date(startOfThisWeek)
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)
    return { gte: startOfLastWeek.toISOString(), lt: startOfThisWeek.toISOString() }
  }

  // last_month
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { gte: startOfLastMonth.toISOString(), lt: startOfThisMonth.toISOString() }
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

export default function CleanerNotificationsScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [announcementsPage, setAnnouncementsPage] = useState(0)
  const [hasMoreAnnouncements, setHasMoreAnnouncements] = useState(true)
  const [loadingMoreAnnouncements, setLoadingMoreAnnouncements] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [notificationsPage, setNotificationsPage] = useState(0)
  const [hasMoreNotifications, setHasMoreNotifications] = useState(true)
  const [loadingMoreNotifications, setLoadingMoreNotifications] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [searching, setSearching] = useState(false)

  // Debounce the search box so we don't hit the DB on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Re-runs the initial load whenever the search term or date filter changes
  // (this also covers the very first mount, since both start at their
  // default values). Pagination state gets reset by load() itself.
  useEffect(() => {
    setSearching(true)
    load()
  }, [debouncedQuery, dateFilter])

  // Escapes characters PostgREST treats specially inside an `.or()` filter
  // string (`,` separates conditions, `()` group them, `%`/`_` are ILIKE
  // wildcards) so arbitrary user search text can't break the query.
  function escapeForIlike(s: string) {
    return s.replace(/[%_,()]/g, c => `\\${c}`)
  }

  async function fetchAnnouncementsPage(page: number) {
    const from = page * ANNOUNCEMENTS_PAGE_SIZE
    const to = from + ANNOUNCEMENTS_PAGE_SIZE - 1
    let q = supabase.from('announcements').select('id, title, body, created_at').eq('is_active', true)
    if (debouncedQuery) {
      const term = escapeForIlike(debouncedQuery)
      q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`)
    }
    const range = getDateRange(dateFilter)
    if (range.gte) q = q.gte('created_at', range.gte)
    if (range.lt) q = q.lt('created_at', range.lt)
    return q.order('created_at', { ascending: false }).range(from, to)
  }

  async function fetchNotificationsPage(uid: string, page: number) {
    const from = page * NOTIFICATIONS_PAGE_SIZE
    const to = from + NOTIFICATIONS_PAGE_SIZE - 1
    let q = supabase.from('notifications').select('id, title, body, type, is_read, created_at').eq('user_id', uid)
    if (debouncedQuery) {
      const term = escapeForIlike(debouncedQuery)
      q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`)
    }
    const range = getDateRange(dateFilter)
    if (range.gte) q = q.gte('created_at', range.gte)
    if (range.lt) q = q.lt('created_at', range.lt)
    return q.order('created_at', { ascending: false }).range(from, to)
  }

  async function markRead(notifs: Notification[]) {
    const unreadIds = notifs.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: notifs }, { data: annouces }] = await Promise.all([
      fetchNotificationsPage(user.id, 0),
      fetchAnnouncementsPage(0),
    ])

    setNotifications((notifs ?? []) as Notification[])
    setNotificationsPage(0)
    setHasMoreNotifications((notifs ?? []).length === NOTIFICATIONS_PAGE_SIZE)
    setAnnouncements((annouces ?? []) as Announcement[])
    setAnnouncementsPage(0)
    setHasMoreAnnouncements((annouces ?? []).length === ANNOUNCEMENTS_PAGE_SIZE)
    setLoading(false)
    setRefreshing(false)
    setSearching(false)

    await markRead((notifs ?? []) as Notification[])
  }

  async function loadMoreAnnouncements() {
    if (loadingMoreAnnouncements || !hasMoreAnnouncements) return
    setLoadingMoreAnnouncements(true)
    const nextPage = announcementsPage + 1
    const { data: annouces } = await fetchAnnouncementsPage(nextPage)
    setAnnouncements(prev => [...prev, ...((annouces ?? []) as Announcement[])])
    setAnnouncementsPage(nextPage)
    setHasMoreAnnouncements((annouces ?? []).length === ANNOUNCEMENTS_PAGE_SIZE)
    setLoadingMoreAnnouncements(false)
  }

  async function loadMoreNotifications() {
    if (loadingMoreNotifications || !hasMoreNotifications || !userId) return
    setLoadingMoreNotifications(true)
    const nextPage = notificationsPage + 1
    const { data: notifs } = await fetchNotificationsPage(userId, nextPage)
    setNotifications(prev => [...prev, ...((notifs ?? []) as Notification[])])
    setNotificationsPage(nextPage)
    setHasMoreNotifications((notifs ?? []).length === NOTIFICATIONS_PAGE_SIZE)
    setLoadingMoreNotifications(false)
    await markRead((notifs ?? []) as Notification[])
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
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="Notifications"
        showBack
        onBackPress={() => router.back()}
        hideBell
      />

      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border,
          paddingHorizontal: 12, height: 42,
        }}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search notifications..."
            placeholderTextColor={C.textMuted}
            style={{ flex: 1, fontSize: 14, color: C.text, padding: 0 }}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {DATE_FILTER_OPTIONS.map(opt => {
            const active = dateFilter === opt.key
            return (
              <Pressable
                key={opt.key}
                onPress={() => setDateFilter(opt.key)}
                style={{
                  paddingHorizontal: 14, height: 34, borderRadius: 17,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? Colors.primary : C.white,
                  borderWidth: 1, borderColor: active ? Colors.primary : C.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : C.textSecondary }}>
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {searching && (
        <View style={{ paddingBottom: 8 }}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )}

      {isEmpty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
          <Feather name={debouncedQuery || dateFilter !== 'all' ? 'search' : 'bell'} size={40} color={C.textMuted} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>
            {debouncedQuery || dateFilter !== 'all' ? 'No matches found' : 'All caught up'}
          </Text>
          <Text style={{ fontSize: 13, color: C.textMuted, marginTop: 4, textAlign: 'center' }}>
            {debouncedQuery
              ? `Nothing matches "${debouncedQuery}". Try a different search or filter.`
              : dateFilter !== 'all'
              ? `Nothing in ${DATE_FILTER_OPTIONS.find(o => o.key === dateFilter)?.label}. Try a different filter.`
              : 'Job offers, updates and announcements will appear here.'}
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
              tintColor={isDark ? '#ffffff' : Colors.primary}
              colors={isDark ? ['#ffffff'] : [Colors.primary]}
              progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={{ paddingVertical: 8, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {section.title}
              </Text>
            </View>
          )}
          renderSectionFooter={({ section }) => {
            const isNotifications = section.title === 'Notifications'
            const isAnnouncements = section.title === 'Announcements'
            const hasMore = isNotifications ? hasMoreNotifications : hasMoreAnnouncements
            if ((!isNotifications && !isAnnouncements) || !hasMore) return null
            const loadingMore = isNotifications ? loadingMoreNotifications : loadingMoreAnnouncements
            const onLoadMore = isNotifications ? loadMoreNotifications : loadMoreAnnouncements
            return (
              <Pressable
                onPress={onLoadMore}
                disabled={loadingMore}
                style={{
                  alignItems: 'center', justifyContent: 'center',
                  paddingVertical: 12, marginBottom: 8,
                }}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary }}>
                    Load more
                  </Text>
                )}
              </Pressable>
            )
          }}
          renderItem={({ item }: { item: SectionItem }) => {
            if (item.kind === 'notification') {
              const n = item.data
              return (
                <View style={{
                  backgroundColor: n.is_read ? C.white : Colors.primary + '08',
                  borderRadius: 14, borderWidth: 1,
                  borderColor: n.is_read ? C.border : Colors.primary + '30',
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
                        color: C.text, flex: 1, marginRight: 8,
                      }}>
                        {n.title}
                      </Text>
                      {!n.is_read && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4 }} />
                      )}
                    </View>
                    {!!n.body && (
                      <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 3, lineHeight: 18 }}>
                        {n.body}
                      </Text>
                    )}
                    <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
                      {formatTime(n.created_at)}
                    </Text>
                  </View>
                </View>
              )
            }

            const a = item.data
            return (
              <View style={{
                backgroundColor: C.primaryBg,
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
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{a.title}</Text>
                  {!!a.body && (
                    <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 3, lineHeight: 18 }}>
                      {a.body}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
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
