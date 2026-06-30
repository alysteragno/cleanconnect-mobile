import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
  Animated,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import AppHeader from '@/components/AppHeader'

type Message = {
  id: string
  sender_id: string
  customer_id: string
  message: string
  created_at: string
}

function formatTime(d: string) {
  return new Date(d).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function MessageBubble({ item, userId, animate, C }: { item: Message; userId: string; animate: boolean; C: ReturnType<typeof useThemeColors> }) {
  const isMe = item.sender_id === userId
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current
  const translateY = useRef(new Animated.Value(animate ? 12 : 0)).current

  useEffect(() => {
    if (!animate) return
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', opacity, transform: [{ translateY }] }}>
      <View style={{
        maxWidth: '80%',
        backgroundColor: isMe ? Colors.primary : C.white,
        borderRadius: 16,
        borderBottomRightRadius: isMe ? 4 : 16,
        borderBottomLeftRadius: isMe ? 16 : 4,
        paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: isMe ? 0 : 1,
        borderColor: C.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
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
    </Animated.View>
  )
}

export default function ChatScreen() {
  const C = useThemeColors()
  const router = useRouter()
  const flatListRef = useRef<FlatList>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const animatedIds = useRef<Set<string>>(new Set())
  const pendingTexts = useRef<Set<string>>(new Set())

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const { data: msgs, error } = await supabase
        .from('admin_messages')
        .select('id, sender_id, customer_id, message, created_at')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: true })

      if (error) console.error('[chat] fetch error:', error.message)
      setMessages((msgs ?? []) as Message[])
      setLoading(false)
    }

    init()
  }, [])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`direct-chat-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'admin_messages',
        filter: `customer_id=eq.${userId}`,
      }, (payload) => {
        const incoming = payload.new as Message

        if (animatedIds.current.has(incoming.id)) return
        if (incoming.sender_id === userId && pendingTexts.current.has(incoming.message)) return

        animatedIds.current.add(incoming.id)
        setMessages(prev => [...prev, incoming])
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function sendMessage() {
    if (!draft.trim() || !userId) return
    setSending(true)
    const text = draft.trim()
    setDraft('')
    pendingTexts.current.add(text)

    const optimisticId = `opt-${Date.now()}`
    const optimistic: Message = {
      id: optimisticId,
      sender_id: userId,
      customer_id: userId,
      message: text,
      created_at: new Date().toISOString(),
    }
    animatedIds.current.add(optimisticId)
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)

    const { data, error } = await supabase
      .from('admin_messages')
      .insert({ customer_id: userId, sender_id: userId, message: text })
      .select('id, sender_id, customer_id, message, created_at')
      .single()

    pendingTexts.current.delete(text)

    if (error) {
      console.error('[chat] insert error:', error.message)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    } else if (data) {
      animatedIds.current.add(data.id)
      setMessages(prev => prev.map(m => m.id === optimisticId ? data as Message : m))
    }

    setSending(false)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <AppHeader
        title="Messages"
        subtitle="Direct messages with admin"
        hideBell
        showBack
        onBackPress={() => router.back()}
      />

      {messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Feather name="message-circle" size={48} color={C.border} />
          <Text style={{ color: C.textMuted, fontSize: 14 }}>No messages yet. Say hello!</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <MessageBubble
              item={item}
              userId={userId!}
              animate={animatedIds.current.has(item.id)}
              C={C}
            />
          )}
        />
      )}

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
    </KeyboardAvoidingView>
  )
}
