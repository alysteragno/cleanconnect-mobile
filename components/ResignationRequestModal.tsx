import { useEffect, useState } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'

const REASON_OPTIONS = [
  'Better Opportunity',
  'Relocation',
  'Health / Personal',
  'Family Reasons',
  'Compensation',
  'Work Environment',
  'Career Change',
  'Other',
]

export type ResignationSubmission = {
  reason: string
  notes: string
}

type Props = {
  visible: boolean
  onClose: () => void
  onSubmit: (payload: ResignationSubmission) => void
  submitting: boolean
}

export default function ResignationRequestModal({ visible, onClose, onSubmit, submitting }: Props) {
  const C = useThemeColors()

  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [showReasonHint, setShowReasonHint] = useState(false)
  const [showNotesHint, setShowNotesHint] = useState(false)
  const [showAckHint, setShowAckHint] = useState(false)

  useEffect(() => {
    if (visible) {
      setReason(''); setNotes('')
      setAcknowledged(false)
      setShowReasonHint(false); setShowNotesHint(false); setShowAckHint(false)
    }
  }, [visible])

  function handleSubmit() {
    const notesTrimmed = notes.trim()
    const missingReason = !reason
    const missingNotes = notesTrimmed.length === 0

    setShowReasonHint(missingReason)
    setShowNotesHint(missingNotes)
    setShowAckHint(!acknowledged)

    if (missingReason || missingNotes || !acknowledged) return

    onSubmit({ reason, notes: notesTrimmed })
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardAvoidingView wraps the whole modal (backdrop + sheet) so the
          sheet actually gets pushed up when the keyboard opens — wrapping
          just the sheet left the KeyboardAvoidingView with nothing to push
          against. The ScrollView inside is the other half of the fix: on a
          form this tall, the sheet's own maxHeight plus a shrunk keyboard
          area means content still needs to scroll to reach the checkbox and
          submit button, not just get repositioned. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{
            backgroundColor: C.white,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            maxHeight: '88%',
          }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 16, marginBottom: 12 }} />

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 28 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Resignation Request</Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 3, marginBottom: 20, lineHeight: 18 }}>
                This is only a heads-up for your manager. It won't change your account.
              </Text>

              {/* Reason pills */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 }}>
                Reason <Text style={{ color: Colors.primary }}>*</Text>
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REASON_OPTIONS.map(opt => {
                  const selected = reason === opt
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => { setReason(opt); setShowReasonHint(false) }}
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
              {showReasonHint && (
                <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 6, fontWeight: '600' }}>
                  Please choose a reason.
                </Text>
              )}

              {/* Notes */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginTop: 20, marginBottom: 8 }}>
                Additional notes <Text style={{ color: Colors.primary }}>*</Text>
              </Text>
              <TextInput
                value={notes}
                onChangeText={t => { setNotes(t); if (t.trim()) setShowNotesHint(false) }}
                placeholder="Tell your manager more about your decision…"
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={3}
                maxLength={300}
                style={{
                  borderWidth: 1, borderColor: showNotesHint ? '#fca5a5' : C.border, borderRadius: 12,
                  padding: 12, color: C.text, fontSize: 14,
                  backgroundColor: C.background, minHeight: 76,
                  textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                {showNotesHint
                  ? <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600' }}>Please add a note for your manager.</Text>
                  : <View />
                }
                <Text style={{ fontSize: 11, color: C.textMuted }}>{notes.length}/300</Text>
              </View>

              {/* Acknowledgment — same checkbox pattern as the booking flow's
                  "I agree to Terms & Conditions" (bookings/new.tsx), so it
                  reads as a familiar, confident control instead of a cramped
                  inline notice. */}
              <TouchableOpacity
                onPress={() => { setAcknowledged(a => !a); setShowAckHint(false) }}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4 }}
                style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                  marginTop: 22, padding: 14, borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: showAckHint ? '#dc2626' : acknowledged ? Colors.primary : C.border,
                  backgroundColor: showAckHint ? '#fef2f2' : acknowledged ? C.primaryBg : C.background,
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6, marginTop: 1, flexShrink: 0,
                  borderWidth: 1.5,
                  borderColor: acknowledged ? Colors.primary : (showAckHint ? '#dc2626' : C.border),
                  backgroundColor: acknowledged ? Colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {acknowledged && <Feather name="check" size={14} color="#fff" />}
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 19 }}>
                  I understand this only sends a request — my employment doesn't end here. To actually resign, I need to{' '}
                  <Text style={{ fontWeight: '700', color: Colors.primary }}>visit the business office</Text>
                  {' '}and meet my manager in person.
                </Text>
              </TouchableOpacity>
              {showAckHint && (
                <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 6, fontWeight: '600' }}>
                  Please check the box above to continue.
                </Text>
              )}

              {/* Submit */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={{
                  marginTop: 16, backgroundColor: '#dc2626',
                  borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Submit Request</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} disabled={submitting} style={{ marginTop: 12, alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 14, color: C.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
