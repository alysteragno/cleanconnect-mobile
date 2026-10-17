import { useState } from 'react'
import { View, Text, TouchableOpacity, LayoutChangeEvent } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'

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
  /**
   * Dates ('YYYY-MM-DD') the customer already has at least one active booking
   * on. Purely informational (a small dot) — it does NOT disable the date,
   * since only a specific overlapping time actually conflicts. The time
   * picker is what enforces the real conflict, per-slot.
   */
  bookedDates: Set<string>
  onSelectDate: (dateStr: string) => void
}

/**
 * Custom day-grid calendar for the booking wizard's date step. A date the
 * customer already has an active booking on stays tappable — it's only
 * marked with a small dot — since a booking earlier or later that day may
 * not overlap the time being picked. The actual conflict check happens in
 * the time picker below, against the specific booking window(s).
 */
export default function BookingDateCalendar({ selectedDate, minDate, bookedDates, onSelectDate }: Props) {
  const C = useThemeColors()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const todayStr = localDateStr(today)

  // Measured from the actual rendered grid width rather than derived from
  // Dimensions.get('window') — the old fixed-math approach only subtracted
  // the calendar card's own padding and ignored whatever horizontal padding
  // the caller's screen adds around it, so the 7 columns overflowed past the
  // card's right inner edge (no visible right padding). Measuring the real
  // container makes this correct regardless of where the calendar is placed.
  const [gridWidth, setGridWidth] = useState(0)
  const CELL = gridWidth > 0 ? Math.floor(gridWidth / 7) : 0

  function onGridLayout(e: LayoutChangeEvent) {
    setGridWidth(e.nativeEvent.layout.width)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  // Nothing before the month containing "today" is ever selectable, so
  // navigating further back is a dead end — disable it instead of letting
  // the customer scroll into a wall of crossed-out months.
  const viewMonthIndex = viewYear * 12 + viewMonth
  const todayMonthIndex = today.getFullYear() * 12 + today.getMonth()
  const isOnCurrentMonth = viewMonthIndex === todayMonthIndex
  const canGoPrev = viewMonthIndex > todayMonthIndex

  function goPrevMonth() {
    if (!canGoPrev) return
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) } else { setViewMonth(m => m - 1) }
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) } else { setViewMonth(m => m + 1) }
  }
  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  return (
    <View style={{ backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <TouchableOpacity
          onPress={goPrevMonth}
          disabled={!canGoPrev}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={{ opacity: canGoPrev ? 1 : 0.3 }}
        >
          <Feather name="chevron-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity
          onPress={goNextMonth}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Feather name="chevron-right" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      {!isOnCurrentMonth && (
        <View style={{ alignItems: 'flex-end', marginBottom: 6 }}>
          <TouchableOpacity
            onPress={goToday}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{
              paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
              backgroundColor: Colors.primary + '12',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>Today</Text>
          </TouchableOpacity>
        </View>
      )}

      <View onLayout={onGridLayout}>
        <View style={{ flexDirection: 'row', marginBottom: 2 }}>
          {WEEKDAYS.map((d, i) => (
            <View key={d} style={{ width: CELL, alignItems: 'center', paddingBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: i === 0 || i === 6 ? C.textMuted : C.textSecondary }}>
                {d}
              </Text>
            </View>
          ))}
        </View>

        {gridWidth > 0 && rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row' }}>
            {row.map((day, ci) => {
              if (!day) return <View key={ci} style={{ width: CELL, height: CELL }} />

            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const isBooked = bookedDates.has(dateStr)
            const isDisabled = dateStr < minDate
            const isWeekend = ci === 0 || ci === 6

            let circleBg = 'transparent'
            let dayColor = isDisabled ? C.textMuted : isWeekend ? C.textSecondary : C.text
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
            const label = `${MONTHS[viewMonth]} ${day}, ${viewYear}`
              + (isToday ? ' (today)' : '')
              + (isBooked ? ', you have a booking this day' : '')
              + (isDisabled ? ', unavailable' : '')

            return (
              <TouchableOpacity
                key={ci}
                disabled={isDisabled}
                onPress={() => onSelectDate(dateStr)}
                activeOpacity={0.65}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: isDisabled, selected: isSelected }}
                style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  width: inner, height: inner, borderRadius: inner / 2,
                  backgroundColor: circleBg, alignItems: 'center', justifyContent: 'center',
                  borderWidth: ringColor ? 1 : 0, borderColor: ringColor ?? 'transparent',
                }}>
                  <Text style={{ fontSize: 14, fontWeight: dayWeight, color: dayColor }}>
                    {day}
                  </Text>
                  {isBooked && (
                    <View style={{
                      position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2,
                      backgroundColor: isSelected ? '#fff' : '#f59e0b',
                    }} />
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
      </View>

      {bookedDates.size > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' }} />
          <Text style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>
            Dates marked with a dot already have a booking — the time picker below will show which times are unavailable
          </Text>
        </View>
      )}
    </View>
  )
}
