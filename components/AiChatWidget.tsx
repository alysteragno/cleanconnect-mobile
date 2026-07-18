import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Animated,
} from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  content: "Hi! I'm Maid For You Cleaning Services assistant. Ask me about our services, pricing, or how booking works.",
}

const SESSION_TIMEOUT_MS = 10 * 60 * 1000

function MessageBubble({ item, C }: { item: ChatMessage; C: ReturnType<typeof useThemeColors> }) {
  const isMe = item.role === 'user'
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(12)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', opacity, transform: [{ translateY }] }}>
      <View style={{
        maxWidth: '82%',
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
            Maid For You AI
          </Text>
        )}
        <Text style={{ fontSize: 14, color: isMe ? '#fff' : C.text, lineHeight: 20 }}>
          {item.content}
        </Text>
      </View>
    </Animated.View>
  )
}

export default function AiChatWidget() {
  const C = useThemeColors()
  const flatListRef = useRef<FlatList>(null)
  const [visible, setVisible] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const lastActivityAt = useRef(Date.now())

  function openPanel() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (Date.now() - lastActivityAt.current > SESSION_TIMEOUT_MS) {
      setMessages([GREETING])
    }
    setVisible(true)
  }

  function closePanel() {
    setVisible(false)
    setDraft('')
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setDraft('')
    setSending(true)
    lastActivityAt.current = Date.now()
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: nextMessages
            .filter(m => m.id !== 'greeting')
            .map(m => ({ role: m.role, content: m.content })),
        },
      })

      if (error || !data?.reply) throw error ?? new Error('No reply')

      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: data.reply }])
    } catch (err) {
      console.error('[ai-chat] send error:', err)
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: "Sorry, I couldn't reach the assistant — please try again.",
      }])
    } finally {
      setSending(false)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  return (
    <>
      <TouchableOpacity
        onPress={openPanel}
        activeOpacity={0.8}
        style={{
          position: 'absolute', bottom: 88, right: 20,
          backgroundColor: C.white, borderRadius: 14,
          paddingHorizontal: 12, paddingVertical: 6,
          borderWidth: 1, borderColor: C.border,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>Chat with AI</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={openPanel}
        activeOpacity={0.85}
        style={{
          position: 'absolute', bottom: 24, right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: Colors.primary,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
        }}
      >
        <Ionicons name="sparkles" size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={closePanel}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ height: '75%' }}
          >
            <View style={{
              flex: 1, backgroundColor: C.background,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              overflow: 'hidden',
            }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 }} />

              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 18, paddingVertical: 12,
                borderBottomWidth: 1, borderBottomColor: C.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="sparkles" size={18} color={Colors.primary} />
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>Ask AI</Text>
                    <Text style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                      Chat clears after 10 min of inactivity
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closePanel} hitSlop={10}>
                  <Feather name="x" size={22} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16, gap: 10 }}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                renderItem={({ item }) => <MessageBubble item={item} C={C} />}
                ListFooterComponent={sending ? (
                  <View style={{ alignItems: 'flex-start' }}>
                    <View style={{
                      backgroundColor: C.white, borderRadius: 16, borderBottomLeftRadius: 4,
                      borderWidth: 1, borderColor: C.border,
                      paddingHorizontal: 14, paddingVertical: 10,
                    }}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                    </View>
                  </View>
                ) : null}
              />

              <View style={{
                flexDirection: 'row', alignItems: 'flex-end', gap: 8,
                paddingHorizontal: 16, paddingVertical: 12,
                backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border,
              }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Ask about services, pricing..."
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
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  )
}
