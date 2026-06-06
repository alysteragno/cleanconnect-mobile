import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { SERVICE_LABELS, ServiceType } from '@/constants/types'

type BookingOption = {
  id: string
  service_type: ServiceType
  service_date: string
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function NewComplaintScreen() {
  const router = useRouter()
  const [bookings, setBookings] = useState<BookingOption[]>([])
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadBookings()
  }, [])

  async function loadBookings() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('id, service_type, service_date')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    setBookings((data ?? []) as BookingOption[])
  }

  async function submit() {
    if (!subject.trim()) { Alert.alert('Required', 'Please enter a subject.'); return }
    if (!message.trim()) { Alert.alert('Required', 'Please describe your concern.'); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const { data: complaint, error } = await supabase
      .from('complaints')
      .insert({
        customer_id: user.id,
        booking_id: selectedBookingId,
        subject: subject.trim(),
        status: 'open',
      })
      .select('id')
      .single()

    if (error || !complaint) {
      setSubmitting(false)
      Alert.alert('Error', error?.message ?? 'Could not submit complaint.')
      return
    }

    await supabase.from('complaint_messages').insert({
      complaint_id: complaint.id,
      sender_id: user.id,
      message: message.trim(),
    })

    setSubmitting(false)
    router.replace(`/(customer)/support/${complaint.id}`)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{
        backgroundColor: Colors.primary,
        paddingTop: 56, paddingBottom: 20, paddingHorizontal: 24,
        flexDirection: 'row', alignItems: 'center',
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>File a Complaint</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">

        {/* Related booking (optional) */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }}>
            Related Booking (optional)
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
              borderColor: selectedBookingId ? Colors.primary : '#e5e7eb',
              paddingHorizontal: 14, paddingVertical: 12,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            }}
            onPress={() => {
              if (bookings.length === 0) return
              Alert.alert(
                'Select Booking',
                'Choose the booking related to your complaint:',
                [
                  { text: 'None', onPress: () => setSelectedBookingId(null) },
                  ...bookings.map(b => ({
                    text: `${SERVICE_LABELS[b.service_type]} — ${formatDate(b.service_date)}`,
                    onPress: () => setSelectedBookingId(b.id),
                  })),
                ]
              )
            }}
          >
            <Text style={{
              fontSize: 14, color: selectedBookingId ? '#111827' : '#9ca3af',
            }}>
              {selectedBookingId
                ? (() => {
                    const b = bookings.find(x => x.id === selectedBookingId)
                    return b ? `${SERVICE_LABELS[b.service_type]} — ${formatDate(b.service_date)}` : 'Selected'
                  })()
                : 'Select a booking...'}
            </Text>
            <Feather name="chevron-down" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Subject */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }}>
            Subject <Text style={{ color: Colors.primary }}>*</Text>
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief description of your concern"
            placeholderTextColor="#9ca3af"
            style={{
              backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
              borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 12,
              fontSize: 14, color: '#111827',
            }}
          />
        </View>

        {/* Message */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }}>
            Message <Text style={{ color: Colors.primary }}>*</Text>
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your concern in detail..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={{
              backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
              borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 12,
              fontSize: 14, color: '#111827', minHeight: 120,
            }}
          />
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={submitting}
          style={{
            backgroundColor: Colors.primary, borderRadius: 14,
            paddingVertical: 15, alignItems: 'center', marginTop: 4,
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Submit Complaint</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </View>
  )
}
