import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, SectionList, FlatList,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { SERVICE_LABELS, ServiceType } from '@/constants/types'
import AppHeader from '@/components/AppHeader'

type ScheduleItem = {
  id: string
  booking_id: string
  bookings: {
    service_type: ServiceType
    service_date: string
    service_time: string
    property_sqm: number
    address_city: string | null
    status: string
  }
}

type DayOff = {
  id: string
  unavailable_date: string
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export default function CleanerScheduleScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<'schedule' | 'dayoffs'>('schedule')

  // schedule state
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [refreshingSchedule, setRefreshingSchedule] = useState(false)

  // day-off state
  const [dayoffs, setDayoffs] = useState<DayOff[]>([])
  const [loadingDayoffs, setLoadingDayoffs] = useState(true)
  const [refreshingDayoffs, setRefreshingDayoffs] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerDate, setPickerDate] = useState(tomorrow())
  const [saving, setSaving] = useState(false)

  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    loadSchedule()
    loadDayoffs()
    loadUnread()
  }, [])

  async function loadUnread() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setUnreadCount(count ?? 0)
  }

  async function loadSchedule() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('cleaner_assignments')
      .select(`
        id, booking_id,
        bookings (service_type, service_date, service_time, property_sqm, address_city, status)
      `)
      .eq('cleaner_id', user.id)
      .eq('status', 'accepted')
      .order('assigned_at', { ascending: true })

    setItems((data ?? []) as unknown as ScheduleItem[])
    setLoadingSchedule(false)
    setRefreshingSchedule(false)
  }

  async function loadDayoffs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('cleaner_availability')
      .select('id, unavailable_date')
      .eq('cleaner_id', user.id)
      .gte('unavailable_date', today)
      .order('unavailable_date', { ascending: true })

    setDayoffs((data ?? []) as DayOff[])
    setLoadingDayoffs(false)
    setRefreshingDayoffs(false)
  }

  async function addDayoff() {
    const dateStr = pickerDate.toISOString().slice(0, 10)

    if (dayoffs.some(d => d.unavailable_date === dateStr)) {
      Alert.alert('Already marked', 'That date is already set as a day-off.')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('cleaner_availability')
      .insert({ cleaner_id: user.id, unavailable_date: dateStr })

    setSaving(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setShowPicker(false)
      setPickerDate(tomorrow())
      loadDayoffs()
    }
  }

  async function removeDayoff(id: string, date: string) {
    Alert.alert(
      'Remove day-off?',
      `Remove ${formatDate(date)} from your day-offs?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('cleaner_availability')
              .delete()
              .eq('id', id)
            if (error) {
              Alert.alert('Error', error.message)
            } else {
              setDayoffs(prev => prev.filter(d => d.id !== id))
            }
          },
        },
      ]
    )
  }

  const sections = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = items
      .filter(i => i.bookings?.service_date >= today)
      .sort((a, b) => a.bookings.service_date.localeCompare(b.bookings.service_date))

    const byDate: Record<string, ScheduleItem[]> = {}
    for (const item of upcoming) {
      const d = item.bookings.service_date
      if (!byDate[d]) byDate[d] = []
      byDate[d].push(item)
    }

    return Object.entries(byDate).map(([date, data]) => ({ title: date, data }))
  }, [items])

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <AppHeader
        title="My Schedule"
        subtitle="Schedule & day-off management"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      {/* Tabs */}
      <View style={{
        flexDirection: 'row', backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
      }}>
        {(['schedule', 'dayoffs'] as const).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1, paddingVertical: 13, alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: tab === t ? Colors.primary : 'transparent',
            }}
          >
            <Text style={{
              fontSize: 14, fontWeight: '700',
              color: tab === t ? Colors.primary : '#6b7280',
            }}>
              {t === 'schedule' ? 'Schedule' : 'Day-offs'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Schedule tab */}
      {tab === 'schedule' && (
        loadingSchedule ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : sections.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Feather name="calendar" size={40} color="#9ca3af" style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', textAlign: 'center' }}>
              No upcoming jobs
            </Text>
            <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>
              Accept job offers to see them on your schedule.
            </Text>
            <TouchableOpacity
              style={{ marginTop: 20, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
              onPress={() => router.push('/(cleaner)/jobs')}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>View Job Offers</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 4 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshingSchedule}
                onRefresh={() => { setRefreshingSchedule(true); loadSchedule() }}
                tintColor={Colors.primary}
              />
            }
            renderSectionHeader={({ section }) => (
              <View style={{ paddingVertical: 10, paddingHorizontal: 4, marginTop: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.primary }}>
                  {formatDate(section.title)}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{
                  backgroundColor: '#fff', borderRadius: 14, borderWidth: 1,
                  borderColor: '#e5e7eb', padding: 14, marginBottom: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                }}
                onPress={() => router.push(`/(cleaner)/jobs/${item.id}`)}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 48, height: 48, borderRadius: 12,
                  backgroundColor: Colors.primary + '15',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="briefcase" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
                    {SERVICE_LABELS[item.bookings?.service_type]}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {formatTime(item.bookings?.service_time)} · {item.bookings?.property_sqm} sqm
                  </Text>
                  {item.bookings?.address_city && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Feather name="map-pin" size={11} color="#9ca3af" />
                      <Text style={{ fontSize: 12, color: '#9ca3af' }}>{item.bookings.address_city}</Text>
                    </View>
                  )}
                </View>
                <Feather name="chevron-right" size={16} color="#d1d5db" />
              </TouchableOpacity>
            )}
          />
        )
      )}

      {/* Day-offs tab */}
      {tab === 'dayoffs' && (
        <View style={{ flex: 1 }}>
          {/* Add day-off row */}
          <View style={{
            backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
            borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
              Mark a day-off
            </Text>
            <TouchableOpacity
              onPress={() => setShowPicker(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
                padding: 12, backgroundColor: '#f9fafb',
              }}
            >
              <Feather name="calendar" size={16} color={Colors.primary} />
              <Text style={{ flex: 1, fontSize: 14, color: '#111827' }}>
                {pickerDate.toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
              <Feather name="chevron-down" size={14} color="#9ca3af" />
            </TouchableOpacity>

            {showPicker && (
              <DateTimePicker
                mode="date"
                value={pickerDate}
                minimumDate={tomorrow()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(e: DateTimePickerEvent, date?: Date) => {
                  if (Platform.OS === 'android') setShowPicker(false)
                  if (date) setPickerDate(date)
                }}
              />
            )}

            <TouchableOpacity
              onPress={addDayoff}
              disabled={saving}
              style={{
                marginTop: 12, backgroundColor: Colors.primary, borderRadius: 10,
                paddingVertical: 11, alignItems: 'center',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add Day-off</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Existing day-offs list */}
          {loadingDayoffs ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={dayoffs}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 8 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshingDayoffs}
                  onRefresh={() => { setRefreshingDayoffs(true); loadDayoffs() }}
                  tintColor={Colors.primary}
                />
              }
              ListHeaderComponent={
                dayoffs.length > 0 ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                    UPCOMING DAY-OFFS
                  </Text>
                ) : null
              }
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Feather name="check-circle" size={32} color="#9ca3af" style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
                    No day-offs set. Use the form above to mark dates you're unavailable.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={{
                  backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
                  borderColor: '#e5e7eb', padding: 14,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 10,
                    backgroundColor: '#fce7f3', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name="moon" size={18} color={Colors.primary} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' }}>
                    {formatDate(item.unavailable_date)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeDayoff(item.id, item.unavailable_date)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  )
}
