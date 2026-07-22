import { useState } from 'react'
import { View, Text, TouchableOpacity, Dimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'

const SCREEN_W = Dimensions.get('window').width
const CARD_PADDING = 16 // matches the surrounding step's content padding
const CELL = Math.floor((SCREEN_W - CARD_PADDING * 2) / 7)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function localDateStr(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type Props = {
  /** 'YYYY-MM-DD' or null. */
  selectedDate: string | null
  /** 'YYYY-MM-DD' — dates before this are disabled (matches the 24h-advance rule's date floor). */
  minDate: string
  /** Dates ('YYYY-MM-DD') the customer already has at least one active booking on — crossed out and disabled. */
  bookedDates: Set<string>
  onSelectDate: (dateStr: string) => void
}

/**
 * Custom day-grid calendar for the booking wizard's date step. A date the
 * customer already has an active booking on is crossed out and untappable —
 * one booking per calendar day, regardless of time.
 */
export default function BookingDateCalendar({ selectedDate, minDate, bookedDates, onSelectDate }: Props) {
  const C = useThemeColors()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const todayStr = localDateStr(today)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  function goPrevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) } else { setViewMonth(m => m - 1) }
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) } else { setViewMonth(m => m + 1) }
  }

  return (
    <View style={{ backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <TouchableOpacity onPress={goPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={goNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-right" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        {WEEKDAYS.map(d => (
          <View key={d} style={{ width: CELL, alignItems: 'center', paddingBottom: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.textMuted }}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }}>
          {row.map((day, ci) => {
            if (!day) return <View key={ci} style={{ width: CELL, height: CELL }} />

            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const isBooked = bookedDates.has(dateStr)
            const isDisabled = dateStr < minDate || isBooked

            let circleBg = 'transparent'
            let dayColor = isDisabled ? C.textMuted : C.text
            let dayWeight: '400' | '500' | '700' = '500'
            let ringColor: string | null = null

            if (isSelected) {
              circleBg = Colors.primary; dayColor = '#fff'; dayWeight = '700'
            } else if (isToday && !isDisabled) {
              circleBg = Colors.primary + '25'; dayColor = Colors.primary; dayWeight = '700'
            } else if (isToday) {
              // Today is disabled (bookings need 24h notice) — mark it with a
              // ring only, keep the gray/disabled text so it doesn't look tappable.
              ringColor = C.textMuted
            }

            const inner = CELL - 6
            return (
              <TouchableOpacity
                key={ci}
                disabled={isDisabled}
                onPress={() => onSelectDate(dateStr)}
                activeOpacity={0.65}
                style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  width: inner, height: inner, borderRadius: inner / 2,
                  backgroundColor: circleBg, alignItems: 'center', justifyContent: 'center',
                  borderWidth: ringColor ? 1 : 0, borderColor: ringColor ?? 'transparent',
                }}>
                  <Text style={{
                    fontSize: 14, fontWeight: dayWeight, color: dayColor,
                    textDecorationLine: isBooked ? 'line-through' : 'none',
                  }}>
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}

      {bookedDates.size > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.textMuted, textDecorationLine: 'line-through' }}>12</Text>
          <Text style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>
            Crossed-out dates already have a booking and can't be selected
          </Text>
        </View>
      )}
    </View>
  )
}
