import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import AppHeader from '@/components/AppHeader'

type Complaint = {
  id: string
  subject: string
  status: string
  booking_id: string | null
}

type Message = {
  id: string
  sender_id: string
  message: string
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  open: '#ca8a04',
  in_progress: '#7c3aed',
  resolved: '#16a34a',
  closed: '#6b7280',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

function formatTime(d: string) {
  return new Date(d).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function ComplaintDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const C = useThemeColors()
  const flatListRef = useRef<FlatList>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: c }, { data: msgs }] = await Promise.all([
        supabase.from('complaints').select('id, subject, status, booking_id').eq('id', id).single(),
        supabase.from('complaint_messages').select('id, sender_id, message, created_at')
          .eq('complaint_id', id).order('created_at', { ascending: true }),
      ])

      setComplaint(c as Complaint)
      setMessages((msgs ?? []) as Message[])
      setLoading(false)

      channel = supabase
        .channel(`complaint-${id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'complaint_messages',
          filter: `complaint_id=eq.${id}`,
        }, (payload) => {
          setMessages(prev => [...prev, payload.new as Message])
        })
        .subscribe()
    }

    init()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [id])

  async function sendMessage() {
    if (!draft.trim() || !userId) return
    setSending(true)

    await supabase.from('complaint_messages').insert({
      complaint_id: id,
      sender_id: userId,
      message: draft.trim(),
    })

    setDraft('')
    setSending(false)
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  if (!complaint) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.textSecondary }}>Complaint not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const isClosed = complaint.status === 'resolved' || complaint.status === 'closed'
  const statusColor = STATUS_COLORS[complaint.status] ?? '#6b7280'

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <AppHeader
        showBack
        onBackPress={() => router.back()}
        title={complaint.subject}
        hideBell
        rightContent={
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
            backgroundColor: statusColor + '18',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor, textTransform: 'capitalize' }}>
              {STATUS_LABELS[complaint.status] ?? complaint.status}
            </Text>
          </View>
        }
      />

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: C.textMuted, fontSize: 14 }}>No messages yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.sender_id === userId
          return (
            <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              <View style={{
                maxWidth: '80%',
                backgroundColor: isMe ? Colors.primary : C.white,
                borderRadius: 16,
                borderBottomRightRadius: isMe ? 4 : 16,
                borderBottomLeftRadius: isMe ? 16 : 4,
                paddingHorizontal: 14, paddingVertical: 10,
                borderWidth: isMe ? 0 : 1,
                borderColor: C.border,
              }}>
                {!isMe && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary, marginBottom: 4 }}>
                    Admin
                  </Text>
                )}
                <Text style={{ fontSize: 14, color: isMe ? '#fff' : C.text, lineHeight: 20 }}>
                  {item.message}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: C.textMuted, marginTop: 3, marginHorizontal: 4 }}>
                {formatTime(item.created_at)}
              </Text>
            </View>
          )
        }}
      />

      {isClosed ? (
        <View style={{
          paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.white,
          borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center',
        }}>
          <Text style={{ fontSize: 13, color: C.textMuted }}>
            This complaint is {STATUS_LABELS[complaint.status]?.toLowerCase()}. No further replies.
          </Text>
        </View>
      ) : (
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end', gap: 8,
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border,
        }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message..."
            placeholderTextColor={C.textMuted}
            multiline
            style={{
              flex: 1, backgroundColor: C.background, borderRadius: 20,
              paddingHorizontal: 14, paddingVertical: 10,
              fontSize: 14, color: C.text, maxHeight: 100,
            }}
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={sending || !draft.trim()}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: draft.trim() ? Colors.primary : C.border,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="send" size={16} color={draft.trim() ? '#fff' : C.textMuted} />
            }
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
