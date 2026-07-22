import { useEffect, useRef, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Image, ScrollView } from 'react-native'
import { WebView } from 'react-native-webview'
import { Feather } from '@expo/vector-icons'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { startPaymongoQrPh, confirmPaymongoQrPh, QRPH_EXPIRY_SECONDS } from '@/lib/paymongo'

type Props = {
  visible: boolean
  bookingId: string
  /** Called once the poll confirms the booking is paid. */
  onPaid: () => void
  /** Called when the user closes the sheet manually (payment status unresolved). */
  onClose: () => void
  // Display-only payment summary — purely informational, none of this is sent
  // to PayMongo from here (billing already went server-side when the QR was
  // created). Every field is optional so callers that don't have a piece of
  // it yet (e.g. still loading a profile) can just omit it.
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  serviceLabel?: string
  amount?: number
  bookingRef?: string
}

const POLL_INTERVAL_MS = 4000

/**
 * PayMongo QR Ph, rendered natively — no browser, no webview for the actual
 * payment step. The QR is just a base64 image returned by the backend's
 * /api/paymongo/qrph-intent, displayed with <Image>. While visible, polls
 * /api/paymongo/qrph-intent/confirm every few seconds; that endpoint actively
 * checks PayMongo and settles the booking server-side, so this component just
 * watches for `paid: true`.
 *
 * The one exception is the sandbox-only "Simulate Test Payment" affordance:
 * PayMongo does not offer any API to mark a test QR Ph payment as paid — per
 * their docs, authorizing/failing a test payment can only be done by visiting
 * their hosted test_url page (https://docs.paymongo.com/docs/payment-acceptance-testing).
 * That page is rendered in an embedded WebView within our own modal chrome
 * below, instead of handing off to the system browser, so it stays inside
 * the app. It only ever appears on sk_test_ keys (see lib/paymongo.ts).
 */
export default function PaymongoQrModal({
  visible, bookingId, onPaid, onClose,
  customerName, customerEmail, customerPhone, serviceLabel, amount, bookingRef,
}: Props) {
  const C = useThemeColors()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrUri, setQrUri] = useState<string | null>(null)
  const [testUrl, setTestUrl] = useState<string | null>(null)
  const [showTestPayment, setShowTestPayment] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(QRPH_EXPIRY_SECONDS)
  const [paid, setPaid] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopTimers() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
  }

  async function generate() {
    stopTimers()
    setLoading(true)
    setError(null)
    setQrUri(null)
    setTestUrl(null)
    setPaid(false)
    setSecondsLeft(QRPH_EXPIRY_SECONDS)

    const result = await startPaymongoQrPh(bookingId)
    if (result.status === 'already_paid') {
      setLoading(false)
      setPaid(true)
      setTimeout(onPaid, 900)
      return
    }
    if (result.status === 'error') {
      setLoading(false)
      setError(result.message)
      return
    }

    setQrUri(normalizeQrImageUri(result.qrImageUrl))
    setTestUrl(result.testUrl ?? null)
    setLoading(false)

    pollRef.current = setInterval(async () => {
      const { paid: isPaid } = await confirmPaymongoQrPh(bookingId)
      if (isPaid) {
        stopTimers()
        setPaid(true)
        setTimeout(onPaid, 900)
      }
    }, POLL_INTERVAL_MS)

    countdownRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          stopTimers()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  useEffect(() => {
    if (visible) generate()
    else stopTimers()
    return stopTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, bookingId])

  function handleClose() {
    stopTimers()
    onClose()
  }

  const expired = !loading && !error && !paid && qrUri && secondsLeft <= 0
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  const hasPaymentSummary = !!(customerName || customerEmail || customerPhone || serviceLabel || amount != null || bookingRef)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 54 : 30, backgroundColor: C.white, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>Scan to Pay</Text>
          <View style={styles.closeBtn} />
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', padding: 24, gap: 18 }}>

          {hasPaymentSummary && (
            <View style={[styles.summaryCard, { backgroundColor: C.white, borderColor: C.border }]}>
              <Text style={[styles.summaryHeader, { color: C.textMuted }]}>PAYMENT DETAILS</Text>
              {amount != null && (
                <View style={[styles.summaryRow, { borderBottomColor: C.borderLight }]}>
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>Amount Due</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.primary }}>
                    ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              )}
              {serviceLabel && (
                <SummaryRow label="Service" value={serviceLabel} C={C} />
              )}
              {bookingRef && (
                <SummaryRow label="Booking Ref" value={`#${bookingRef}`} C={C} />
              )}
              {customerName && (
                <SummaryRow label="Customer Name" value={customerName} C={C} />
              )}
              {customerEmail && (
                <SummaryRow label="Email" value={customerEmail} C={C} />
              )}
              {customerPhone && (
                <SummaryRow label="Phone" value={customerPhone} isLast C={C} />
              )}
            </View>
          )}

          {loading && (
            <View style={styles.centerFill}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={{ color: C.textSecondary, fontSize: 13, marginTop: 12 }}>Generating your QR code…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={[styles.centerFill, { gap: 14 }]}>
              <View style={[styles.iconCircle, { backgroundColor: '#fef2f2' }]}>
                <Feather name="alert-circle" size={28} color="#dc2626" />
              </View>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>Couldn&apos;t start payment</Text>
              <Text style={{ color: C.textSecondary, fontSize: 13, textAlign: 'center' }}>{error}</Text>
              <TouchableOpacity onPress={generate} activeOpacity={0.85} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && paid && (
            <View style={[styles.centerFill, { gap: 14 }]}>
              <View style={[styles.iconCircle, { backgroundColor: '#f0fdf4' }]}>
                <Feather name="check" size={28} color="#16a34a" />
              </View>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Payment received!</Text>
            </View>
          )}

          {!loading && !error && !paid && qrUri && (
            <View style={{ alignItems: 'center', gap: 18 }}>
              <View style={[styles.qrCard, { backgroundColor: C.white, borderColor: C.border, opacity: expired ? 0.25 : 1 }]}>
                <Image source={{ uri: qrUri }} style={{ width: 240, height: 240 }} resizeMode="contain" />
              </View>

              {expired ? (
                <>
                  <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '700' }}>This QR code expired</Text>
                  <TouchableOpacity onPress={generate} activeOpacity={0.85} style={styles.primaryBtn}>
                    <Feather name="refresh-cw" size={15} color="#fff" />
                    <Text style={styles.primaryBtnText}>Generate New QR</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ color: C.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
                    Scan with GCash, Maya, or any InstaPay/QR Ph banking app
                  </Text>
                  <View style={[styles.timerPill, { backgroundColor: C.background, borderColor: C.border }]}>
                    <Feather name="clock" size={13} color={C.textMuted} />
                    <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '700' }}>Expires in {mm}:{ss}</Text>
                  </View>

                  {testUrl ? (
                    <TouchableOpacity onPress={() => setShowTestPayment(true)} activeOpacity={0.85} style={styles.testBtn}>
                      <Feather name="zap" size={13} color="#92400e" />
                      <Text style={styles.testBtnText}>Simulate Test Payment</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Sandbox-only: PayMongo's own hosted authorize/fail page for test QR Ph
          payments, embedded here instead of handed off to the system browser —
          see the file-level comment for why an embed (not a native reimplementation)
          is the only option PayMongo supports. Closing this just returns to the QR
          screen; the poll above picks up the resulting paid status either way. */}
      {testUrl && (
        <Modal visible={showTestPayment} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTestPayment(false)}>
          <View style={{ flex: 1, backgroundColor: C.background }}>
            <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 20 : 16, backgroundColor: C.white, borderBottomColor: C.border }]}>
              <TouchableOpacity onPress={() => setShowTestPayment(false)} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={22} color={C.text} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>Simulate Test Payment</Text>
              <View style={styles.closeBtn} />
            </View>
            <WebView source={{ uri: testUrl }} style={{ flex: 1 }} startInLoadingState />
          </View>
        </Modal>
      )}
    </Modal>
  )
}

function SummaryRow({ label, value, isLast, C }: {
  label: string
  value: string
  isLast?: boolean
  C: ReturnType<typeof useThemeColors>
}) {
  return (
    <View style={[styles.summaryRow, !isLast && { borderBottomColor: C.borderLight }, isLast && { borderBottomWidth: 0 }]}>
      <Text style={{ fontSize: 13, color: C.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

/**
 * PayMongo's docs describe the QR Ph image as "Base64-encoded" without
 * confirming (unverified in this environment) whether the API returns a
 * full data URI or a bare base64 string. Normalize both to something
 * <Image> can load directly.
 */
function normalizeQrImageUri(raw: string): string {
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `data:image/png;base64,${raw}`
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  centerFill: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  qrCard: {
    padding: 16, borderRadius: 20, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 24,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14,
  },
  testBtnText: { color: '#92400e', fontWeight: '700', fontSize: 12 },
  summaryCard: {
    width: '100%', borderRadius: 16, borderWidth: 1, padding: 14,
  },
  summaryHeader: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1,
  },
})
