import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import AppHeader from '@/components/AppHeader'
import { setPrivacyAccepted } from '@/lib/privacyAck'

const LAST_UPDATED = 'July 14, 2026'

const SECTIONS: Array<{ icon: React.ComponentProps<typeof Feather>['name']; title: string; items: string[] }> = [
  {
    icon: 'database',
    title: 'Information We Collect',
    items: [
      'Account details — full name, email address, phone number, and role (customer or cleaner).',
      'Booking details — service type, property address, schedule, special notes, and furniture/quantity details you provide.',
      'Location data — GPS coordinates of your service address, captured when you pin your location on the booking map, so we can match you with the nearest available cleaner.',
      'Photos & videos — images and optional short videos of the furniture or area you upload so admin can verify and confirm the service rate.',
      'Payment information — your chosen payment method, reference numbers, and payment proof screenshots for GCash, Maya, or bank transfer. We do not collect or store your card, bank login, or e-wallet credentials.',
      'Support & communication — messages sent through in-app complaints, chat threads, and any attachments.',
      'Ratings & feedback — star ratings and comments left after a completed service.',
    ],
  },
  {
    icon: 'settings',
    title: 'How We Use Your Information',
    items: [
      'To create and manage your account and bookings.',
      'To match bookings with the nearest available cleaner based on your service location and schedule.',
      'To verify payments and confirm your booking status.',
      'To respond to support requests and complaints.',
      'To send booking updates and reminders through in-app and push notifications.',
      'To calculate service ratings shown to other customers.',
    ],
  },
  {
    icon: 'users',
    title: 'How We Share Your Information',
    items: [
      'With the cleaner assigned to your booking — your service address, contact number, and job details, so they can complete the service.',
      'With Maid For You Cleaning Services admin staff — for dispatch, payment verification, and customer support.',
      'With service providers that host our infrastructure (Supabase, for authentication, database, and file storage) and, where digital checkout is enabled, our payment processor (PayMongo) — solely to operate the app.',
      'We do not sell your personal information to third parties.',
    ],
  },
  {
    icon: 'clock',
    title: 'Data Retention',
    items: [
      'We keep your account and booking information for as long as your account is active and as needed for service records, dispute resolution, and legal or tax requirements.',
      'You may request deletion of your account and associated data at any time — see "Your Rights" below.',
    ],
  },
  {
    icon: 'lock',
    title: 'Data Security',
    items: [
      'Data is transmitted over encrypted (HTTPS) connections.',
      'Access to your data is restricted through authentication and row-level access controls, limited to authorized personnel who need it to operate the service.',
      'While we take reasonable measures to protect your information, no system is 100% secure.',
    ],
  },
  {
    icon: 'shield',
    title: 'Your Rights',
    items: [
      'Under the Philippine Data Privacy Act of 2012 (RA 10173), you have the right to be informed, to access, to correct, to object to, and to request erasure or blocking of your personal data.',
      'You can update your name and phone number directly from your Profile screen at any time.',
      'To request a copy or deletion of your data, contact us through the in-app Support tab.',
      'You may also file a complaint with the National Privacy Commission (privacy.gov.ph) if you believe your data has been mishandled.',
    ],
  },
  {
    icon: 'user-x',
    title: "Children's Privacy",
    items: [
      'Maid For You Cleaning Services is intended for users 18 years old and above. We do not knowingly collect personal information from children.',
    ],
  },
  {
    icon: 'file-text',
    title: 'Changes to This Policy',
    items: [
      'We may update this Privacy Policy from time to time. Material changes will be reflected by updating the "Last updated" date at the top of this page.',
    ],
  },
]

export default function PrivacyPolicyScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const requiredRead = from === 'register'
  const [reachedEnd, setReachedEnd] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  function checkReachedEnd(scrollY: number, viewport: number, content: number) {
    if (content <= viewport || viewport + scrollY >= content - 32) {
      setReachedEnd(true)
    }
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (reachedEnd) return
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    checkReachedEnd(contentOffset.y, layoutMeasurement.height, contentSize.height)
  }

  function confirmRead() {
    // Signal the still-mounted register screen via a shared store, then go back to that
    // exact instance (router.back, not navigate) so all typed-in form fields are preserved.
    setPrivacyAccepted(true)
    router.back()
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader showBack onBackPress={() => router.back()} title="Privacy Policy" hideBell />

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: requiredRead ? 100 : 40 }}
        showsVerticalScrollIndicator={false}
        onScroll={requiredRead ? handleScroll : undefined}
        scrollEventThrottle={100}
        onContentSizeChange={requiredRead ? (_w, h) => { setContentHeight(h); checkReachedEnd(0, viewportHeight, h) } : undefined}
        onLayout={requiredRead ? (e) => { const h = e.nativeEvent.layout.height; setViewportHeight(h); checkReachedEnd(0, h, contentHeight) } : undefined}
      >
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border,
          padding: 16, gap: 6,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>Maid For You Cleaning Services</Text>
          <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 19 }}>
            This Privacy Policy explains what information CleanConnect collects from customers and cleaners, how we
            use and share it, and the rights you have over it. By using this app, you agree to the collection and
            use of information as described here.
          </Text>
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Last updated: {LAST_UPDATED}</Text>
        </View>

        {SECTIONS.map(section => (
          <View key={section.title} style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border,
            padding: 16, gap: 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: 'rgba(219,39,119,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name={section.icon} size={14} color={Colors.primary} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{section.title}</Text>
            </View>
            <View style={{ gap: 7 }}>
              {section.items.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 7, paddingLeft: 2 }}>
                  <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: C.textSecondary, lineHeight: 19 }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border,
          padding: 16, gap: 6,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="mail" size={16} color={Colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Contact Us</Text>
          </View>
          <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 19 }}>
            Questions about this Privacy Policy or how your data is handled? Reach us anytime through the Support
            tab in the app.
          </Text>
        </View>
      </ScrollView>

      {requiredRead && (
        <View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border,
          padding: 16, paddingBottom: 28,
        }}>
          {!reachedEnd && (
            <Text style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', marginBottom: 8 }}>
              Scroll to the bottom to continue
            </Text>
          )}
          <TouchableOpacity
            onPress={confirmRead}
            disabled={!reachedEnd}
            activeOpacity={0.85}
            style={{
              backgroundColor: reachedEnd ? Colors.primary : C.border,
              borderRadius: 14, paddingVertical: 15, alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}
          >
            <Feather name="check-circle" size={16} color={reachedEnd ? '#fff' : C.textMuted} />
            <Text style={{ color: reachedEnd ? '#fff' : C.textMuted, fontWeight: '700', fontSize: 14 }}>
              I Understand — Back to Registration
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
