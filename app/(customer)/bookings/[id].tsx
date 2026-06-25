import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather, Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import AppHeader from '@/components/AppHeader'
import { Booking, BookingStatus, Feedback, SERVICE_LABELS, STATUS_LABELS } from '@/constants/types'

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: '#ca8a04',
  confirmed: Colors.primary,
  in_progress: '#7c3aed',
  completed: '#16a34a',
  cancelled: '#dc2626',
}

const PROGRESS_STEPS: BookingStatus[] = ['pending', 'confirmed', 'in_progress', 'completed']

type BookingDetail = Booking & {
  cleaner_assignments?: Array<{
    status: string
    profiles: { full_name: string; id: string } | null
  }>
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`
}

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const C = useThemeColors()

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [paymentSettings, setPaymentSettings] = useState<Record<string, string>>({})
  const [existingFeedback, setExistingFeedback] = useState<Feedback | null | undefined>(undefined)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  useEffect(() => {
    loadBooking()
  }, [id])

  async function loadBooking() {
    const { data } = await supabase
      .from('bookings')
      .select(`*, cleaner_assignments (status, profiles (full_name, id))`)
      .eq('id', id)
      .maybeSingle()

    if (!data) { setLoading(false); return }
    setBooking(data as BookingDetail)
    setLoading(false)

    if (data.payment_method === 'gcash' || data.payment_method === 'bank_transfer') {
      const { data: settings } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['gcash_number', 'bank_name', 'bank_account', 'bank_account_name'])
      const map: Record<string, string> = {}
      ;(settings ?? []).forEach((s: { key: string; value: string }) => { map[s.key] = s.value })
      setPaymentSettings(map)
    }

    if (data.status === 'completed') {
      const { data: fb } = await supabase
        .from('feedback')
        .select('*')
        .eq('booking_id', id)
        .maybeSingle()
      setExistingFeedback(fb as Feedback | null)
    }
  }

  async function submitFeedback() {
    if (rating === 0) { Alert.alert('Rating required', 'Please select a star rating.'); return }
    setSubmittingFeedback(true)
    const accepted = booking?.cleaner_assignments?.find(a => a.status === 'accepted')
    const cleaner_id = accepted?.profiles?.id ?? null

    const { error } = await supabase.from('feedback').insert({
      booking_id: id,
      cleaner_id,
      rating,
      comment: comment.trim() || null,
    })
    setSubmittingFeedback(false)
    if (error) { Alert.alert('Error', error.message); return }

    setExistingFeedback({ id: '', booking_id: id, cleaner_id: cleaner_id ?? '', rating, comment, created_at: '' })
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.textSecondary, fontSize: 15 }}>Booking not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const acceptedAssignment = booking.cleaner_assignments?.find(a => a.status === 'accepted')
  const cleanerName = acceptedAssignment?.profiles?.full_name ?? null
  const currentProgressIndex = PROGRESS_STEPS.indexOf(booking.status as BookingStatus)

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        showBack
        onBackPress={() => router.back()}
        title={SERVICE_LABELS[booking.service_type]}
        subtitle={`Booking #${booking.id.slice(0, 8).toUpperCase()}`}
        hideBell
        rightContent={
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: STATUS_COLORS[booking.status] + '30' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: STATUS_COLORS[booking.status] }}>{STATUS_LABELS[booking.status]}</Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>

        {/* Status tracker */}
        {booking.status === 'cancelled' ? (
          <View style={{
            backgroundColor: C.errorBg, borderRadius: 14, padding: 16,
            borderWidth: 1, borderColor: '#fca5a5', alignItems: 'center',
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#dc2626' }}>Booking Cancelled</Text>
            <Text style={{ fontSize: 13, color: '#b91c1c', marginTop: 4 }}>
              This booking has been cancelled. Contact support for assistance.
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 16 }}>
              Booking Progress
            </Text>
            <View style={{ flexDirection: 'row' }}>
              {PROGRESS_STEPS.map((s, i) => (
                <View key={s} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                    <View style={{
                      flex: 1, height: 2,
                      backgroundColor: i === 0 ? 'transparent' : i <= currentProgressIndex ? Colors.primary : C.border,
                    }} />
                    <View style={{
                      width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: i <= currentProgressIndex ? Colors.primary : C.borderLight,
                      borderWidth: 2,
                      borderColor: i <= currentProgressIndex ? Colors.primary : C.border,
                    }}>
                      {i < currentProgressIndex
                        ? <Feather name="check" size={13} color="#fff" />
                        : <View style={{
                            width: 7, height: 7, borderRadius: 3.5,
                            backgroundColor: i === currentProgressIndex ? '#fff' : C.textMuted,
                          }} />
                      }
                    </View>
                    <View style={{
                      flex: 1, height: 2,
                      backgroundColor: i === PROGRESS_STEPS.length - 1 ? 'transparent' : i < currentProgressIndex ? Colors.primary : C.border,
                    }} />
                  </View>
                  <Text style={{
                    fontSize: 9, fontWeight: '600', marginTop: 6, textAlign: 'center',
                    color: i <= currentProgressIndex ? Colors.primary : C.textMuted,
                    lineHeight: 13,
                  }}>
                    {STATUS_LABELS[s]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Cleaner En Route banner */}
        {booking.status === 'confirmed' && acceptedAssignment && (
          <View style={{
            backgroundColor: '#eff6ff', borderRadius: 14, borderWidth: 1,
            borderColor: '#93c5fd', padding: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="navigation" size={20} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1d4ed8' }}>
                Cleaner En Route
              </Text>
              <Text style={{ fontSize: 13, color: '#3b82f6', marginTop: 2 }}>
                {cleanerName ?? 'Your cleaner'} is on the way to your location.
              </Text>
            </View>
          </View>
        )}

        <DetailCard title="Service Details" C={C} rows={[
          { label: 'Service', value: SERVICE_LABELS[booking.service_type] },
          { label: 'Space', value: booking.space_type === 'residential' ? 'Residential' : 'Commercial' },
          { label: 'Size', value: `${booking.property_sqm} sqm` },
          ...(cleanerName ? [{ label: 'Cleaner', value: cleanerName }] : []),
        ]} />

        <DetailCard title="Service Address" C={C} rows={[
          {
            label: 'Address',
            value: [booking.address_unit, booking.address_street, booking.address_city, booking.address_province]
              .filter(Boolean).join(', ') || '—',
          },
          ...(booking.service_lat ? [{
            label: 'GPS',
            value: `${booking.service_lat.toFixed(5)}, ${booking.service_lng!.toFixed(5)}`,
          }] : []),
        ]} />

        <DetailCard title="Schedule" C={C} rows={[
          { label: 'Date', value: formatDate(booking.service_date) },
          { label: 'Time', value: formatTime(booking.service_time) },
          { label: 'Duration', value: `~${booking.duration_hours}h` },
          { label: 'ETA', value: booking.status === 'cancelled' ? '—' : formatTime(booking.service_time) },
        ]} />

        <DetailCard title="Payment" C={C} rows={[
          { label: 'Method', value: booking.payment_method.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) },
          { label: 'Est. Price', value: `₱${Number(booking.base_price).toLocaleString()}` },
          { label: 'Status', value: booking.payment_status.replace(/\b\w/g, c => c.toUpperCase()), highlight: booking.payment_status === 'paid' },
        ]} />

        {/* Payment instructions */}
        {(booking.payment_method === 'gcash' || booking.payment_method === 'bank_transfer') &&
          Object.keys(paymentSettings).length > 0 && (
          <View style={{
            backgroundColor: C.primaryBg, borderRadius: 16, borderWidth: 1,
            borderColor: Colors.primary + '40', padding: 16,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 10 }}>
              How to Pay
            </Text>
            {booking.payment_method === 'gcash' && paymentSettings.gcash_number && (
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <Text style={{ width: 90, fontSize: 13, color: C.textSecondary }}>GCash #</Text>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }}>
                  {paymentSettings.gcash_number}
                </Text>
              </View>
            )}
            {booking.payment_method === 'bank_transfer' && (
              <>
                {paymentSettings.bank_name && (
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <Text style={{ width: 90, fontSize: 13, color: C.textSecondary }}>Bank</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }}>{paymentSettings.bank_name}</Text>
                  </View>
                )}
                {paymentSettings.bank_account && (
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <Text style={{ width: 90, fontSize: 13, color: C.textSecondary }}>Account #</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }}>{paymentSettings.bank_account}</Text>
                  </View>
                )}
                {paymentSettings.bank_account_name && (
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <Text style={{ width: 90, fontSize: 13, color: C.textSecondary }}>Account Name</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }}>{paymentSettings.bank_account_name}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {booking.special_notes && (
          <View style={{
            backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 6 }}>Special Notes</Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>{booking.special_notes}</Text>
          </View>
        )}

        {/* Rate & Feedback */}
        {booking.status === 'completed' && (
          <View style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 14 }}>
              Rate Your Experience
            </Text>

            {existingFeedback ? (
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Ionicons
                      key={n}
                      name={n <= existingFeedback.rating ? 'star' : 'star-outline'}
                      size={28}
                      color={n <= existingFeedback.rating ? '#f59e0b' : C.border}
                    />
                  ))}
                </View>
                {existingFeedback.comment && (
                  <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', fontStyle: 'italic' }}>
                    "{existingFeedback.comment}"
                  </Text>
                )}
                <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
                  Thank you for your feedback!
                </Text>
              </View>
            ) : existingFeedback === null ? (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity key={n} onPress={() => setRating(n)}>
                      <Ionicons
                        name={n <= rating ? 'star' : 'star-outline'}
                        size={36}
                        color={n <= rating ? '#f59e0b' : C.border}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Share your experience (optional)..."
                  placeholderTextColor={C.textMuted}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={{
                    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
                    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                    fontSize: 14, color: C.text, minHeight: 80, marginBottom: 12,
                  }}
                />

                <TouchableOpacity
                  onPress={submitFeedback}
                  disabled={submittingFeedback}
                  style={{
                    backgroundColor: Colors.primary, borderRadius: 12,
                    paddingVertical: 13, alignItems: 'center',
                    opacity: submittingFeedback ? 0.7 : 1,
                  }}
                >
                  {submittingFeedback
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Submit Review</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <ActivityIndicator color={Colors.primary} />
            )}
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  )
}

function DetailCard({ title, rows, C }: {
  title: string
  rows: Array<{ label: string; value: string; highlight?: boolean }>
  C: ReturnType<typeof useThemeColors>
}) {
  return (
    <View style={{
      backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, overflow: 'hidden',
    }}>
      <View style={{
        backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: C.border,
      }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>{title}</Text>
      </View>
      {rows.map((row, i) => (
        <View key={row.label} style={{
          flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 11,
          borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.borderLight,
        }}>
          <Text style={{ width: 90, fontSize: 13, color: C.textSecondary }}>{row.label}</Text>
          <Text style={{
            flex: 1, fontSize: 13, fontWeight: '600',
            color: row.highlight ? '#16a34a' : C.text,
          }}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  )
}
