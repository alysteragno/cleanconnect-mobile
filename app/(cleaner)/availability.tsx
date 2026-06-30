import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl, Alert, Dimensions,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import { getService } from '@/constants/services'
import AppHeader from '@/components/AppHeader'

type ScheduleItem = {
  id: string
  booking_id: string
  bookings: {
    service_slug: string
    service_date: string
    service_time: string
    property_sqm: number
    address_city: string | null
    status: string
  }
}

type DayOffRequest = {
  id: string
  requested_date: string
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  notes: string | null
  admin_note: string | null
  created_at: string
}

const SCREEN_W = Dimensions.get('window').width
const CARD_MX = 16
const CARD_PX = 16
const CELL = Math.floor((SCREEN_W - CARD_MX * 2 - CARD_PX * 2) / 7)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const REASON_OPTIONS = [
  'Personal Leave',
  'Medical / Health',
  'Family Emergency',
  'Prior Commitment',
  'Other',
]

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: '#f59e0b22', text: '#f59e0b', icon: 'clock'       } as const,
  approved: { label: 'Approved', bg: '#22c55e22', text: '#22c55e', icon: 'check-circle' } as const,
  rejected: { label: 'Rejected', bg: '#ef444422', text: '#ef4444', icon: 'x-circle'     } as const,
}

function localDateStr(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function todayStr()    { return localDateStr(new Date()) }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return localDateStr(d) }
function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────
type GridProps = {
  year: number; month: number
  markedDates: Set<string>
  pendingDates: Set<string>; approvedDates: Set<string>; rejectedDates: Set<string>
  selectedDate: string
  onSelectDate: (d: string) => void
  mode: 'schedule' | 'dayoffs'
  today: string
}

function CalendarGrid({
  year, month, markedDates, pendingDates, approvedDates, rejectedDates,
  selectedDate, onSelectDate, mode, today,
}: GridProps) {
  const C = useThemeColors()
  const tomorrow = tomorrowStr()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay   = new Date(year, month, 1).getDay()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        {WEEKDAYS.map(d => (
          <View key={d} style={{ width: CELL, alignItems: 'center', paddingBottom: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.textMuted }}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }}>
          {row.map((day, ci) => {
            if (!day) return <View key={ci} style={{ width: CELL, height: CELL }} />

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday    = dateStr === today
            const isSelected = dateStr === selectedDate
            const isMarked   = markedDates.has(dateStr)
            const isPast     = dateStr < today
            const hasRequest = pendingDates.has(dateStr) || approvedDates.has(dateStr) || rejectedDates.has(dateStr)
            const isSunday   = new Date(dateStr + 'T00:00:00').getDay() === 0
            const canTap     = mode === 'dayoffs' ? (hasRequest || (!isSunday && dateStr >= tomorrow)) : true

            let circleBg = 'transparent'
            let dayColor: string = isPast && !isToday ? C.textMuted : C.text
            let dayWeight: '400' | '500' | '700' = isPast ? '400' : '500'
            let dotColor: string | null = null

            if (mode === 'schedule') {
              if (isSelected) {
                circleBg = Colors.primary; dayColor = '#fff'; dayWeight = '700'
              } else if (isToday) {
                circleBg = Colors.primary + '25'; dayColor = Colors.primary; dayWeight = '700'
              }
              if (isMarked && !isSelected) dotColor = Colors.primary
            } else {
              if (approvedDates.has(dateStr)) {
                circleBg = '#22c55e22'; dayColor = '#22c55e'; dayWeight = '700'
              } else if (pendingDates.has(dateStr)) {
                circleBg = '#f59e0b22'; dayColor = '#f59e0b'; dayWeight = '700'
              } else if (rejectedDates.has(dateStr)) {
                dayColor = C.textMuted; dayWeight = '400'
              } else if (isToday) {
                circleBg = Colors.primary + '25'; dayColor = Colors.primary; dayWeight = '700'
              } else if (isPast || isSunday) {
                dayColor = C.textMuted; dayWeight = '400'
              }
            }

            const inner = CELL - 6
            return (
              <TouchableOpacity
                key={ci}
                onPress={() => { if (canTap) onSelectDate(dateStr) }}
                activeOpacity={canTap ? 0.65 : 1}
                style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  width: inner, height: inner, borderRadius: inner / 2,
                  backgroundColor: circleBg, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 14, fontWeight: dayWeight, color: dayColor }}>{day}</Text>
                  {dotColor && (
                    <View style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor }} />
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

// ─── Month Navigator ──────────────────────────────────────────────────────────
function MonthNav({ year, month, onPrev, onNext, C }: {
  year: number; month: number; onPrev: () => void; onNext: () => void
  C: ReturnType<typeof useThemeColors>
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 }}>
      <TouchableOpacity onPress={onPrev} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="chevron-left" size={22} color={C.text} />
      </TouchableOpacity>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{MONTHS[month]} {year}</Text>
      <TouchableOpacity onPress={onNext} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="chevron-right" size={22} color={C.text} />
      </TouchableOpacity>
    </View>
  )
}

// ─── Day-off Request Form (bottom sheet modal) ────────────────────────────────
function RequestForm({ visible, date, onClose, onSubmit, submitting, C }: {
  visible: boolean; date: string; onClose: () => void
  onSubmit: (reason: string, notes: string) => void
  submitting: boolean; C: ReturnType<typeof useThemeColors>
}) {
  const [reason, setReason] = useState('')
  const [notes, setNotes]   = useState('')

  // Reset when opened for a new date
  useEffect(() => {
    if (visible) { setReason(''); setNotes('') }
  }, [visible, date])

  function handleSubmit() {
    if (!reason) {
      Alert.alert('Select a reason', 'Please choose a reason for your day-off request.')
      return
    }
    onSubmit(reason, notes.trim())
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{
            backgroundColor: C.white,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 24, paddingTop: 16,
            paddingBottom: Platform.OS === 'ios' ? 40 : 28,
          }}>
            {/* Handle bar */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 }} />

            {/* Header */}
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Request Day-off</Text>
            <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '600', marginTop: 3, marginBottom: 20 }}>
              {date ? formatDate(date) : ''}
            </Text>

            {/* Reason pills */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 }}>
              Reason <Text style={{ color: Colors.primary }}>*</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {REASON_OPTIONS.map(opt => {
                const selected = reason === opt
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setReason(opt)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8,
                      borderRadius: 20, borderWidth: 1.5,
                      borderColor: selected ? Colors.primary : C.border,
                      backgroundColor: selected ? Colors.primary + '15' : 'transparent',
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '600',
                      color: selected ? Colors.primary : C.textSecondary,
                    }}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Notes */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 8 }}>
              Additional notes{' '}
              <Text style={{ fontWeight: '400', color: C.textMuted }}>(optional)</Text>
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Any details the admin should know…"
              placeholderTextColor={C.textMuted}
              multiline
              numberOfLines={3}
              maxLength={300}
              style={{
                borderWidth: 1, borderColor: C.border, borderRadius: 12,
                padding: 12, color: C.text, fontSize: 14,
                backgroundColor: C.background, minHeight: 76,
                textAlignVertical: 'top',
              }}
            />
            <Text style={{ fontSize: 11, color: C.textMuted, textAlign: 'right', marginTop: 4 }}>
              {notes.length}/300
            </Text>

            {/* Submit */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || !reason}
              style={{
                marginTop: 16, backgroundColor: Colors.primary,
                borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                opacity: !reason || submitting ? 0.45 : 1,
              }}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Submit Request</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={{ marginTop: 12, alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontSize: 14, color: C.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CleanerScheduleScreen() {
  const router   = useRouter()
  const C        = useThemeColors()
  const { isDark } = useTheme()
  const [tab, setTab] = useState<'schedule' | 'dayoffs'>('schedule')

  const today   = useMemo(() => todayStr(), [])
  const nowDate = new Date()

  const [schedYear,     setSchedYear]     = useState(nowDate.getFullYear())
  const [schedMonth,    setSchedMonth]    = useState(nowDate.getMonth())
  const [schedSelected, setSchedSelected] = useState(today)

  const [doffYear,  setDoffYear]  = useState(nowDate.getFullYear())
  const [doffMonth, setDoffMonth] = useState(nowDate.getMonth())

  const [items,              setItems]              = useState<ScheduleItem[]>([])
  const [loadingSchedule,    setLoadingSchedule]    = useState(true)
  const [refreshingSchedule, setRefreshingSchedule] = useState(false)

  const [requests,           setRequests]           = useState<DayOffRequest[]>([])
  const [loadingRequests,    setLoadingRequests]    = useState(true)
  const [refreshingRequests, setRefreshingRequests] = useState(false)
  const [submitting,         setSubmitting]         = useState(false)

  const [showForm,  setShowForm]  = useState(false)
  const [formDate,  setFormDate]  = useState('')

  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => { loadSchedule(); loadRequests(); loadUnread() }, [])

  async function loadUnread() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { count } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_read', false)
    setUnreadCount(count ?? 0)
  }

  async function loadSchedule() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('cleaner_assignments')
      .select(`id, booking_id, bookings (service_slug, service_date, service_time, property_sqm, address_city, status)`)
      .eq('cleaner_id', user.id).eq('status', 'assigned')
      .order('assigned_at', { ascending: true })
    setItems((data ?? []) as unknown as ScheduleItem[])
    setLoadingSchedule(false); setRefreshingSchedule(false)
  }

  async function loadRequests() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('cleaner_day_off_requests')
      .select('id, requested_date, status, reason, notes, admin_note, created_at')
      .eq('cleaner_id', user.id)
      .order('requested_date', { ascending: true })
    if (!error) setRequests((data ?? []) as DayOffRequest[])
    setLoadingRequests(false); setRefreshingRequests(false)
  }

  async function submitRequest(reason: string, notes: string) {
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const { error } = await supabase
      .from('cleaner_day_off_requests')
      .insert({ cleaner_id: user.id, requested_date: formDate, status: 'pending', reason, notes: notes || null })

    if (!error) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: 'Day-off Request Submitted',
        body: `Your request for ${formatDate(formDate)} (${reason}) is pending admin approval.`,
        type: 'day_off_request',
      })
    }

    setSubmitting(false)
    if (error) {
      if (error.code === '23505') {
        setShowForm(false)
        loadRequests()
        Alert.alert('Already requested', 'You already have a day-off request for this date.')
      } else {
        Alert.alert('Error', error.message)
      }
    } else {
      setShowForm(false)
      loadRequests()
      loadUnread()
      Alert.alert('Request submitted', 'Admin will review your request and notify you of the decision.')
    }
  }

  async function cancelRequest(id: string, date: string) {
    Alert.alert('Cancel request?', `Cancel your day-off request for ${formatDate(date)}?`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel Request', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('cleaner_day_off_requests').delete().eq('id', id)
          if (error) Alert.alert('Error', error.message)
          else setRequests(prev => prev.filter(r => r.id !== id))
        },
      },
    ])
  }

  function handleDayoffTap(dateStr: string) {
    const existing = requests.find(r => r.requested_date === dateStr)
    if (existing) {
      if (existing.status === 'pending') {
        Alert.alert(
          'Pending Request',
          `Your request for ${formatDate(dateStr)} is awaiting admin approval.\n\nReason: ${existing.reason}${existing.notes ? `\nNotes: ${existing.notes}` : ''}`,
          [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Cancel Request', style: 'destructive', onPress: () => cancelRequest(existing.id, dateStr) },
          ]
        )
      } else if (existing.status === 'approved') {
        Alert.alert('Day-off Approved ✓', `Your day-off for ${formatDate(dateStr)} has been approved.`)
      } else {
        const note = existing.admin_note ? `\n\nAdmin note: "${existing.admin_note}"` : ''
        Alert.alert('Request Rejected', `Your request for ${formatDate(dateStr)} was not approved.${note}`)
      }
    } else if (dateStr >= tomorrowStr() && new Date(dateStr + 'T00:00:00').getDay() !== 0) {
      setFormDate(dateStr)
      setShowForm(true)
    }
  }

  const jobsByDate   = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {}
    for (const item of items) {
      const d = item.bookings?.service_date; if (!d) continue
      if (!map[d]) map[d] = []
      map[d].push(item)
    }
    return map
  }, [items])

  const jobDates     = useMemo(() => new Set(Object.keys(jobsByDate)), [jobsByDate])
  const selectedJobs = useMemo(() => jobsByDate[schedSelected] ?? [], [jobsByDate, schedSelected])

  const pendingDates  = useMemo(() => new Set(requests.filter(r => r.status === 'pending').map(r => r.requested_date)),  [requests])
  const approvedDates = useMemo(() => new Set(requests.filter(r => r.status === 'approved').map(r => r.requested_date)), [requests])
  const rejectedDates = useMemo(() => new Set(requests.filter(r => r.status === 'rejected').map(r => r.requested_date)), [requests])

  const visibleRequests = useMemo(() => {
    const prefix = `${doffYear}-${String(doffMonth + 1).padStart(2, '0')}`
    return requests.filter(r => r.requested_date.startsWith(prefix))
  }, [requests, doffYear, doffMonth])

  function prevSchedMonth() { if (schedMonth === 0) { setSchedYear(y => y - 1); setSchedMonth(11) } else setSchedMonth(m => m - 1) }
  function nextSchedMonth() { if (schedMonth === 11) { setSchedYear(y => y + 1); setSchedMonth(0) } else setSchedMonth(m => m + 1) }
  function prevDoffMonth()  { if (doffMonth === 0)  { setDoffYear(y => y - 1);  setDoffMonth(11) }  else setDoffMonth(m => m - 1) }
  function nextDoffMonth()  { if (doffMonth === 11) { setDoffYear(y => y + 1);  setDoffMonth(0) }   else setDoffMonth(m => m + 1) }

  const refreshProps = (refreshing: boolean, onRefresh: () => void) => ({
    refreshing, onRefresh,
    tintColor: isDark ? '#ffffff' : Colors.primary,
    colors:    isDark ? ['#ffffff'] : [Colors.primary],
    progressBackgroundColor: isDark ? '#334155' : '#ffffff',
  })

  const EMPTY_SET = useMemo(() => new Set<string>(), [])

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="My Schedule"
        subtitle="Schedule & day-off management"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {(['schedule', 'dayoffs'] as const).map(t => (
          <TouchableOpacity
            key={t} onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: tab === t ? Colors.primary : 'transparent' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: tab === t ? Colors.primary : C.textSecondary }}>
              {t === 'schedule' ? 'Schedule' : 'Day-off Requests'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Schedule Tab ── */}
      {tab === 'schedule' && (
        loadingSchedule ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }}
            refreshControl={<RefreshControl {...refreshProps(refreshingSchedule, () => { setRefreshingSchedule(true); loadSchedule() })} />}
          >
            <View style={{
              backgroundColor: C.white, marginHorizontal: CARD_MX, marginTop: 16,
              borderRadius: 16, borderWidth: 1, borderColor: C.border,
              paddingHorizontal: CARD_PX, paddingBottom: 14,
            }}>
              <MonthNav year={schedYear} month={schedMonth} onPrev={prevSchedMonth} onNext={nextSchedMonth} C={C} />
              <CalendarGrid
                year={schedYear} month={schedMonth}
                markedDates={jobDates} pendingDates={EMPTY_SET} approvedDates={EMPTY_SET} rejectedDates={EMPTY_SET}
                selectedDate={schedSelected} onSelectDate={setSchedSelected}
                mode="schedule" today={today}
              />
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary }} />
                  <Text style={{ fontSize: 12, color: C.textSecondary }}>Has job</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>1</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: C.textSecondary }}>Selected</Text>
                </View>
              </View>
            </View>

            <View style={{ marginHorizontal: CARD_MX, marginTop: 20, marginBottom: 32 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.primary, marginBottom: 10 }}>
                {formatDate(schedSelected)}
              </Text>

              {items.length === 0 ? (
                <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 28, alignItems: 'center' }}>
                  <Feather name="calendar" size={36} color={C.textMuted} style={{ marginBottom: 10 }} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' }}>No upcoming jobs</Text>
                  <Text style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', marginTop: 5 }}>
                    Accept job offers to see them on your schedule.
                  </Text>
                  <TouchableOpacity
                    style={{ marginTop: 16, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                    onPress={() => router.push('/(cleaner)/jobs')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>View Job Offers</Text>
                  </TouchableOpacity>
                </View>
              ) : selectedJobs.length === 0 ? (
                <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 20, alignItems: 'center' }}>
                  <Feather name="moon" size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, color: C.textMuted, textAlign: 'center' }}>No jobs on this day</Text>
                </View>
              ) : (
                selectedJobs.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    onPress={() => router.push(`/(cleaner)/jobs/${item.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="briefcase" size={20} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{getService(item.bookings?.service_slug)?.name ?? item.bookings?.service_slug ?? 'Cleaning Service'}</Text>
                      <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 2 }}>
                        {formatTime(item.bookings?.service_time)} · {item.bookings?.property_sqm} sqm
                      </Text>
                      {item.bookings?.address_city && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Feather name="map-pin" size={11} color={C.textMuted} />
                          <Text style={{ fontSize: 12, color: C.textMuted }}>{item.bookings.address_city}</Text>
                        </View>
                      )}
                    </View>
                    <Feather name="chevron-right" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        )
      )}

      {/* ── Day-off Requests Tab ── */}
      {tab === 'dayoffs' && (
        loadingRequests ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }}
            refreshControl={<RefreshControl {...refreshProps(refreshingRequests, () => { setRefreshingRequests(true); loadRequests() })} />}
          >
            <View style={{
              backgroundColor: C.white, marginHorizontal: CARD_MX, marginTop: 16,
              borderRadius: 16, borderWidth: 1, borderColor: C.border,
              paddingHorizontal: CARD_PX, paddingBottom: 14,
            }}>
              <MonthNav year={doffYear} month={doffMonth} onPrev={prevDoffMonth} onNext={nextDoffMonth} C={C} />
              <CalendarGrid
                year={doffYear} month={doffMonth}
                markedDates={EMPTY_SET} pendingDates={pendingDates} approvedDates={approvedDates} rejectedDates={rejectedDates}
                selectedDate="" onSelectDate={handleDayoffTap}
                mode="dayoffs" today={today}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {(Object.entries(STATUS_CONFIG) as [keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([key, cfg]) => (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.text }} />
                    <Text style={{ fontSize: 11, color: C.textSecondary }}>{cfg.label}</Text>
                  </View>
                ))}
                <Text style={{ fontSize: 11, color: C.textMuted }}>· tap a future date to request</Text>
              </View>
            </View>

            <View style={{ marginHorizontal: CARD_MX, marginTop: 20, marginBottom: 32 }}>
              {visibleRequests.length > 0 && (
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.textSecondary, marginBottom: 10, letterSpacing: 0.5 }}>
                  REQUESTS IN {MONTHS[doffMonth].toUpperCase()}
                </Text>
              )}

              {visibleRequests.length === 0 ? (
                <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 24, alignItems: 'center' }}>
                  <Feather name="send" size={28} color={C.textMuted} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, textAlign: 'center' }}>No requests in {MONTHS[doffMonth]}</Text>
                  <Text style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', marginTop: 4 }}>
                    Tap any future date on the calendar to request a day-off.
                  </Text>
                </View>
              ) : (
                visibleRequests.map(req => {
                  const cfg = STATUS_CONFIG[req.status]
                  return (
                    <View key={req.id} style={{ backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name={cfg.icon} size={18} color={cfg.text} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>{formatDate(req.requested_date)}</Text>
                          <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>{req.reason}</Text>
                          <View style={{ marginTop: 5, alignSelf: 'flex-start', backgroundColor: cfg.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.text }}>{cfg.label}</Text>
                          </View>
                        </View>
                        {req.status === 'pending' && (
                          <TouchableOpacity
                            onPress={() => cancelRequest(req.id, req.requested_date)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Feather name="x-circle" size={20} color={C.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {req.notes && (
                        <View style={{ marginTop: 10, backgroundColor: C.background, borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary, marginBottom: 2 }}>Your notes</Text>
                          <Text style={{ fontSize: 13, color: C.text }}>{req.notes}</Text>
                        </View>
                      )}
                      {req.admin_note && (
                        <View style={{ marginTop: 8, backgroundColor: C.background, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: cfg.text }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary, marginBottom: 2 }}>Admin note</Text>
                          <Text style={{ fontSize: 13, color: C.text }}>{req.admin_note}</Text>
                        </View>
                      )}
                    </View>
                  )
                })
              )}
            </View>
          </ScrollView>
        )
      )}

      {/* Day-off request form */}
      <RequestForm
        visible={showForm}
        date={formDate}
        onClose={() => setShowForm(false)}
        onSubmit={submitRequest}
        submitting={submitting}
        C={C}
      />
    </View>
  )
}
