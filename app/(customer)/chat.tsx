import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import AppHeader from '@/components/AppHeader'

type Message = {
  id: string
  sender_id: string
  message: string
  created_at: string
}

function formatTime(d: string) {
  return new Date(d).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [isClosed, setIsClosed] = useState(false)
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

      // Find or create the single "Chat with Admin" thread
      let tid: string | null = null
      const { data: existing } = await supabase
        .from('complaints')
        .select('id, status')
        .eq('customer_id', user.id)
        .eq('subject', 'Chat with Admin')
        .maybeSingle()

      if (existing) {
        tid = existing.id
        setIsClosed(existing.status === 'resolved' || existing.status === 'closed')
      } else {
        const { data: created } = await supabase
          .from('complaints')
          .insert({ customer_id: user.id, subject: 'Chat with Admin', status: 'open' })
          .select('id, status')
          .single()
        if (created) {
          tid = created.id
          setIsClosed(false)
        }
      }

      if (!tid) { setLoading(false); return }
      setThreadId(tid)

      const { data: msgs } = await supabase
        .from('complaint_messages')
        .select('id, sender_id, message, created_at')
        .eq('complaint_id', tid)
        .order('created_at', { ascending: true })

      setMessages((msgs ?? []) as Message[])
      setLoading(false)

      channel = supabase
        .channel(`chat-admin-${tid}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'complaint_messages',
          filter: `complaint_id=eq.${tid}`,
        }, (payload) => {
          setMessages(prev => [...prev, payload.new as Message])
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
        })
        .subscribe()
    }

    init()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

  async function sendMessage() {
    if (!draft.trim() || !userId || !threadId) return
    setSending(true)
    await supabase.from('complaint_messages').insert({
      complaint_id: threadId,
      sender_id: userId,
      message: draft.trim(),
    })
    setDraft('')
    setSending(false)
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <AppHeader
        title="Admin Support"
        subtitle="CleanConnect Support Team"
        hideBell
      />

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: '#9ca3af', fontSize: 14 }}>No messages yet. Say hello!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.sender_id === userId
          return (
            <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              <View style={{
                maxWidth: '80%',
                backgroundColor: isMe ? Colors.primary : '#fff',
                borderRadius: 16,
                borderBottomRightRadius: isMe ? 4 : 16,
                borderBottomLeftRadius: isMe ? 16 : 4,
                paddingHorizontal: 14, paddingVertical: 10,
                borderWidth: isMe ? 0 : 1,
                borderColor: '#e5e7eb',
              }}>
                {!isMe && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary, marginBottom: 4 }}>
                    Admin
                  </Text>
                )}
                <Text style={{ fontSize: 14, color: isMe ? '#fff' : '#111827', lineHeight: 20 }}>
                  {item.message}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, marginHorizontal: 4 }}>
                {formatTime(item.created_at)}
              </Text>
            </View>
          )
        }}
      />

      {isClosed ? (
        <View style={{
          paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff',
          borderTopWidth: 1, borderTopColor: '#e5e7eb', alignItems: 'center',
        }}>
          <Text style={{ fontSize: 13, color: '#9ca3af' }}>
            This chat is closed. Contact admin to reopen.
          </Text>
        </View>
      ) : (
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end', gap: 8,
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
        }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message..."
            placeholderTextColor="#9ca3af"
            multiline
            style={{
              flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20,
              paddingHorizontal: 14, paddingVertical: 10,
              fontSize: 14, color: '#111827', maxHeight: 100,
            }}
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={sending || !draft.trim()}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: draft.trim() ? Colors.primary : '#e5e7eb',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: draft.trim() ? '#fff' : '#9ca3af', fontSize: 18, marginLeft: 2 }}>›</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
