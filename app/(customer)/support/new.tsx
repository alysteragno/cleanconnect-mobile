import { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import AppHeader from '@/components/AppHeader'

export default function NewComplaintScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="File a Complaint"
        showBack
        onBackPress={() => router.back()}
        hideBell
      />

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">

        {/* Subject */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 8 }}>
            Subject <Text style={{ color: Colors.primary }}>*</Text>
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief description of your concern"
            placeholderTextColor={C.textMuted}
            style={{
              backgroundColor: C.white, borderRadius: 12, borderWidth: 1,
              borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12,
              fontSize: 14, color: C.text,
            }}
          />
        </View>

        {/* Message */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 8 }}>
            Message <Text style={{ color: Colors.primary }}>*</Text>
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your concern in detail..."
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={{
              backgroundColor: C.white, borderRadius: 12, borderWidth: 1,
              borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12,
              fontSize: 14, color: C.text, minHeight: 120,
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
