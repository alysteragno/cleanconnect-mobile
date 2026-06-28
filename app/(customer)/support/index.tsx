import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'

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
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
]

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function SupportScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { isDark } = useTheme()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState('all')

  const openCount = complaints.filter(c => c.status === 'open').length
  const resolvedCount = complaints.filter(c => c.status === 'resolved').length

  useEffect(() => { loadComplaints() }, [])

  async function loadComplaints() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('complaints')
        .select('id, subject, status, created_at')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ])

    setComplaints((data ?? []) as Complaint[])
    setUnreadCount(count ?? 0)
    setLoading(false)
    setRefreshing(false)
  }

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return complaints
    return complaints.filter(c => c.status === activeFilter)
  }, [complaints, activeFilter])

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
        title="Support"
        subtitle="Your complaints & requests"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications')}
      />

      {/* Hero banner */}
      <View style={{
        marginHorizontal: 16, marginTop: 14,
        borderRadius: 20, backgroundColor: Colors.primary,
        padding: 20, flexDirection: 'row', alignItems: 'center',
      }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17, marginBottom: 4 }}>
            We're here to help
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 18 }}>
            Our team typically responds within 24 hours.
          </Text>
          {complaints.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{openCount} Open</Text>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{resolvedCount} Resolved</Text>
              </View>
            </View>
          )}
        </View>
        <View style={{
          width: 60, height: 60, borderRadius: 30,
          backgroundColor: 'rgba(255,255,255,0.18)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather name="headphones" size={30} color="#fff" />
        </View>
      </View>

      {/* Filter tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveFilter(tab.key)}
            style={{
              flex: 1, paddingVertical: 9, borderRadius: 20, alignItems: 'center',
              backgroundColor: activeFilter === tab.key ? Colors.primary : C.white,
              borderWidth: 1,
              borderColor: activeFilter === tab.key ? Colors.primary : C.border,
            }}
          >
            <Text style={{
              fontSize: 13, fontWeight: '600',
              color: activeFilter === tab.key ? '#fff' : C.textSecondary,
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadComplaints() }}
            tintColor={isDark ? '#ffffff' : Colors.primary}
            colors={isDark ? ['#ffffff'] : [Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
          />
        }
        ListEmptyComponent={
          <View style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.borderLight, padding: 32, alignItems: 'center', marginTop: 16,
          }}>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: Colors.primary + '15',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <Feather name="message-square" size={26} color={Colors.primary} />
            </View>
            {activeFilter === 'all' ? (
              <>
                <Text style={{ color: C.text, fontWeight: '600', textAlign: 'center' }}>No complaints yet</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 }}>
                  Need help? File a support request below.
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                  onPress={() => router.push('/(customer)/support/new')}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>File a Complaint</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ color: C.text, fontWeight: '600', textAlign: 'center' }}>
                  No {STATUS_LABELS[activeFilter]?.toLowerCase()} complaints
                </Text>
                <TouchableOpacity onPress={() => setActiveFilter('all')} style={{ marginTop: 8 }}>
                  <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '600' }}>Clear filter</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{
              backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
              borderColor: C.borderLight, padding: 16,
            }}
            onPress={() => router.push(`/(customer)/support/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }} numberOfLines={2}>
                  {item.subject}
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>
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
                }}>
                  {STATUS_LABELS[item.status] ?? item.status}
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
