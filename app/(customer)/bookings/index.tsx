import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Modal, Image,
  Pressable,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'
import { Booking, BookingStatus, STATUS_LABELS } from '@/constants/types'
import { useServices } from '@/hooks/useServices'
import { PAYMONGO_ENABLED } from '@/constants/config'
import { isPaymongoMethod } from '@/lib/paymongo'
import GCashLogo from '@/assets/gcash_logo.svg'
import MayaLogo from '@/assets/maya_logo.svg'
import QrphLogo from '@/assets/qrph_logo.svg'

const SPACE_IMAGES: Record<string, any> = {
  residential: require('@/assets/services/residential_cleaning.webp'),
  commercial:  require('@/assets/services/residential_cleaning.webp'),
  condo:       require('@/assets/services/condo_cleaning.jpeg'),
  office:      require('@/assets/services/office_cleaning.webp'),
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BookingStatus, { bg: string; text: string; dot: string }> = {
  pending:     { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  confirmed:   { bg: '#fdf2f8', text: '#831843', dot: Colors.primary },
  in_progress: { bg: '#f5f3ff', text: '#4c1d95', dot: '#7c3aed' },
  completed:   { bg: '#f0fdf4', text: '#14532d', dot: '#16a34a' },
  cancelled:   { bg: '#fee2e2', text: '#7f1d1d', dot: '#dc2626' },
}

// Short list-view labels — bookings/[id].tsx has the fuller "Cash on Service
// Day" etc. wording, but that's too long for a compact card pill.
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:          'Cash',
  gcash:         'GCash',
  maya:          'Maya',
  bank_transfer: 'Bank Transfer',
  bank_check:    'Bank Check',
}

/**
 * Compact version of the icon set already used on the booking detail screen
 * (bookings/[id].tsx) — same brand marks (QR Ph / GCash / Maya) and the same
 * green ₱ badge for cash, just sized down for a list-row pill instead of a
 * detail-page row.
 */
function PaymentMethodIcon({ method, C }: { method: string; C: ReturnType<typeof useThemeColors> }) {
  const boxStyle = {
    width: 18, height: 18, borderRadius: 5,
    alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const,
  }

  if (PAYMONGO_ENABLED && isPaymongoMethod(method)) {
    return (
      <View style={[boxStyle, { backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderLight }]}>
        <QrphLogo width={14} height={14} />
      </View>
    )
  }
  if (method === 'cash') {
    return (
      <View style={[boxStyle, { backgroundColor: '#16a34a' }]}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>₱</Text>
      </View>
    )
  }
  if (method === 'gcash') {
    return (
      <View style={[boxStyle, { backgroundColor: '#fff', borderWidth: 1, borderColor: C.borderLight }]}>
        <GCashLogo width={14} height={14} />
      </View>
    )
  }
  if (method === 'maya') {
    return (
      <View style={[boxStyle, { backgroundColor: '#0a1628' }]}>
        <MayaLogo width={13} height={4} />
      </View>
    )
  }
  if (method === 'bank_transfer') {
    return (
      <View style={[boxStyle, { backgroundColor: '#1d4ed8' }]}>
        <Feather name="home" size={10} color="#fff" />
      </View>
    )
  }
  // bank_check and any unrecognized method
  return (
    <View style={[boxStyle, { backgroundColor: C.background, borderWidth: 1, borderColor: C.borderLight }]}>
      <Feather name="file-text" size={10} color={C.textMuted} />
    </View>
  )
}

function paymentMethodLabel(method: string): string {
  if (PAYMONGO_ENABLED && isPaymongoMethod(method)) return 'Online Payment'
  return PAYMENT_METHOD_LABELS[method] ?? method
}

const PAGE_SIZE = 10

// Mirrors cleanconnect-web's src/components/dashboard/pagination.tsx page-list
// algorithm: always show first, last, and a window around the current page,
// with an ellipsis filling any gap — so a numbered [1][2]...[8] control stays
// compact no matter how many pages there are.
function getPageItems(current: number, total: number): (number | 'ellipsis')[] {
  const pageSet = new Set<number>([1, total, current, current - 1, current + 1])
  const pageList = [...pageSet].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const items: (number | 'ellipsis')[] = []
  let prev = 0
  for (const p of pageList) {
    if (prev && p - prev > 1) items.push('ellipsis')
    items.push(p)
    prev = p
  }
  return items
}

const FILTERS: Array<{ label: string; value: BookingStatus | 'all' }> = [
  { label: 'All Bookings',  value: 'all' },
  { label: 'Pending',       value: 'pending' },
  { label: 'Confirmed',     value: 'confirmed' },
  { label: 'In Progress',   value: 'in_progress' },
  { label: 'Completed',     value: 'completed' },
  { label: 'Cancelled',     value: 'cancelled' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BookingsHistoryScreen() {
  const router     = useRouter()
  const { getService } = useServices()
  const C          = useThemeColors()
  const { isDark } = useTheme()

  const [bookings,       setBookings]       = useState<Booking[]>([])
  const [reviewedIds,    setReviewedIds]    = useState<Set<string>>(new Set())
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [filter,         setFilter]         = useState<BookingStatus | 'all'>('all')
  const [dropdownOpen,   setDropdownOpen]   = useState(false)
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [page,           setPage]           = useState(1)

  useFocusEffect(useCallback(() => { load() }, []))

  // Changing the status filter changes what "page 1" means, so jump back to
  // it rather than leaving the user stranded on a page number that no longer
  // lines up with the newly-filtered list.
  useEffect(() => { setPage(1) }, [filter])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); setRefreshing(false); return }

    const [{ data: bks }, { count }, { data: reviewed }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
      supabase
        .from('feedback')
        .select('booking_id')
        .eq('customer_id', user.id),
    ])

    setBookings((bks as Booking[]) ?? [])
    setReviewedIds(new Set((reviewed ?? []).map((r: any) => r.booking_id)))
    setUnreadCount(count ?? 0)
    setLoading(false)
    setRefreshing(false)
  }

  const activeFilter  = FILTERS.find(f => f.value === filter)!
  const displayed     = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  // Clamped rather than trusting `page` state directly, so a shrinking list
  // (filter change, refresh, cancellation) can never strand the view on a
  // page number that's gone out of range.
  const totalPages  = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems   = getPageItems(currentPage, totalPages)
  const paged       = displayed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="My Bookings"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications')}
      />

      {/* Filter dropdown trigger */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <TouchableOpacity
          onPress={() => setDropdownOpen(true)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
          }}
        >
          <Feather name="filter" size={15} color={Colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.text }}>
            {activeFilter.label}
          </Text>
          <Feather name="chevron-down" size={16} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Dropdown modal */}
      <Modal
        transparent
        visible={dropdownOpen}
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
          onPress={() => setDropdownOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: C.white,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 12, paddingBottom: 32,
            }}
            onPress={() => {}}
          >
            {/* Handle */}
            <View style={{
              width: 40, height: 4, borderRadius: 2,
              backgroundColor: C.border, alignSelf: 'center', marginBottom: 16,
            }} />
            <Text style={{
              fontSize: 11, fontWeight: '700', color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.8,
              paddingHorizontal: 20, marginBottom: 8,
            }}>
              Filter by Status
            </Text>

            {FILTERS.map(f => {
              const selected = f.value === filter
              const sc = f.value !== 'all' ? STATUS_COLORS[f.value as BookingStatus] : null
              return (
                <TouchableOpacity
                  key={f.value}
                  onPress={() => { setFilter(f.value); setDropdownOpen(false) }}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14,
                    backgroundColor: selected ? Colors.primary + '0D' : 'transparent',
                  }}
                >
                  {sc ? (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc.dot, marginRight: 12 }} />
                  ) : (
                    <Feather name="list" size={14} color={C.textMuted} style={{ marginRight: 12 }} />
                  )}
                  <Text style={{
                    flex: 1, fontSize: 15,
                    fontWeight: selected ? '700' : '500',
                    color: selected ? Colors.primary : C.text,
                  }}>
                    {f.label}
                  </Text>
                  {selected && <Feather name="check" size={16} color={Colors.primary} />}
                </TouchableOpacity>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Booking list */}
      <FlatList
        data={paged}
        keyExtractor={b => b.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load() }}
            tintColor={isDark ? '#ffffff' : Colors.primary}
            colors={isDark ? ['#ffffff'] : [Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
          />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: Colors.primary + '15',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="calendar" size={36} color={Colors.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>
              {filter === 'all' ? 'No Bookings Yet' : `No ${STATUS_LABELS[filter as BookingStatus]} Bookings`}
            </Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              {filter === 'all' ? 'Your booking history will appear here.' : 'Try a different filter.'}
            </Text>
            {filter === 'all' && (
              <TouchableOpacity
                onPress={() => router.push('/(customer)/bookings/new')}
                style={{
                  marginTop: 8, paddingHorizontal: 28, paddingVertical: 13,
                  backgroundColor: Colors.primary, borderRadius: 14,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                }}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={17} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Book Now</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item: b }) => {
          const svc         = b.service_slug ? getService(b.service_slug) : undefined
          const serviceName = svc?.name ?? b.service_name ?? 'Cleaning Service'
          const svcIcon     = (svc?.placeholderIcon ?? 'home') as keyof typeof Feather.glyphMap
          const svcImage    = SPACE_IMAGES[b.space_type ?? ''] ?? null
          const sc          = STATUS_COLORS[b.status as BookingStatus] ?? STATUS_COLORS.pending

          return (
            <TouchableOpacity
              onPress={() => router.push(`/(customer)/bookings/${b.id}` as any)}
              activeOpacity={0.88}
              style={{
                backgroundColor: C.white,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: C.border,
                overflow: 'hidden',
              }}
            >
              {/* Top row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                {/* Thumbnail or icon */}
                {svcImage ? (
                  <Image
                    source={svcImage}
                    style={{ width: 56, height: 56, borderRadius: 14 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{
                    width: 56, height: 56, borderRadius: 14,
                    backgroundColor: Colors.primary + '12',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name={svcIcon} size={24} color={Colors.primary} />
                  </View>
                )}

                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }} numberOfLines={1}>
                    {serviceName}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.textSecondary }}>
                    {fmtDate(b.service_date)} · {fmtTime(b.service_time)}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.textMuted }}>
                    #{b.id.slice(0, 8).toUpperCase()}
                  </Text>
                </View>

                <Feather name="chevron-right" size={18} color={C.textMuted} />
              </View>

              {/* Bottom row */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
                paddingHorizontal: 14, paddingVertical: 10,
                backgroundColor: C.background,
                borderTopWidth: 1, borderTopColor: C.borderLight,
                gap: 8, rowGap: 6,
              }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: sc.bg, borderRadius: 99,
                  paddingHorizontal: 10, paddingVertical: 4,
                }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sc.dot }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: sc.text }}>
                    {STATUS_LABELS[b.status as BookingStatus]}
                  </Text>
                </View>

                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: C.white, borderRadius: 99, borderWidth: 1, borderColor: C.border,
                  paddingHorizontal: 8, paddingVertical: 3,
                }}>
                  <PaymentMethodIcon method={b.payment_method} C={C} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary }}>
                    {paymentMethodLabel(b.payment_method)}
                  </Text>
                </View>

                <View style={{ flex: 1 }} />

                <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>
                  ₱{Number(b.base_price).toLocaleString()}
                </Text>

                {b.payment_status === 'paid' && (
                  <View style={{ backgroundColor: '#f0fdf4', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a' }}>Paid</Text>
                  </View>
                )}
              </View>

              {/* Review prompt — hidden once review submitted */}
              {b.status === 'completed' && !reviewedIds.has(b.id) && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 9,
                  backgroundColor: Colors.primary + '0D',
                  borderTopWidth: 1, borderTopColor: Colors.primary + '22',
                }}>
                  <Feather name="star" size={12} color={Colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>
                    Tap to write a review for this service
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )
        }}
      />

      {/* Numbered pagination — mirrors cleanconnect-web's Pagination component */}
      {totalPages > 1 && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
          paddingVertical: 8, paddingHorizontal: 16,
          borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white,
        }}>
          <TouchableOpacity
            onPress={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            style={{ padding: 8, opacity: currentPage === 1 ? 0.35 : 1 }}
          >
            <Feather name="chevron-left" size={18} color={C.textSecondary} />
          </TouchableOpacity>

          {pageItems.map((it, i) =>
            it === 'ellipsis' ? (
              <Text key={`e${i}`} style={{ fontSize: 13, color: C.textMuted, paddingHorizontal: 4 }}>…</Text>
            ) : (
              <TouchableOpacity
                key={it}
                onPress={() => setPage(it)}
                style={{
                  minWidth: 30, height: 30, borderRadius: 8,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: it === currentPage ? Colors.primary : 'transparent',
                }}
              >
                <Text style={{
                  fontSize: 13, fontWeight: '700',
                  color: it === currentPage ? '#fff' : C.textSecondary,
                }}>
                  {it}
                </Text>
              </TouchableOpacity>
            )
          )}

          <TouchableOpacity
            onPress={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={{ padding: 8, opacity: currentPage === totalPages ? 0.35 : 1 }}
          >
            <Feather name="chevron-right" size={18} color={C.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* FAB — New Booking */}
      {bookings.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/(customer)/bookings/new')}
          style={{
            position: 'absolute', bottom: totalPages > 1 ? 72 : 24, right: 20,
            backgroundColor: Colors.primary, borderRadius: 32,
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 20, paddingVertical: 14,
            shadowColor: Colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
          }}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>New Booking</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
