import { supabase } from './supabase'

/**
 * PayMongo native QR Ph client.
 *
 * The web backend owns the whole PayMongo flow — creating the Payment
 * Intent + QR Ph payment method and confirming payment. The mobile app only:
 *   1. asks the backend for a fresh QR code image for a booking,
 *   2. renders that image natively in <PaymongoQrModal> (no browser, no
 *      webview — the QR is just an <Image>),
 *   3. polls the backend's confirm endpoint while the code is on screen;
 *      payment is confirmed server-side against PayMongo directly.
 *
 * Not idempotent by design — QR Ph codes expire quickly, so every call
 * issues a brand new Payment Intent + QR rather than reusing a stale one.
 */

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL

/**
 * QR codes are documented by PayMongo to expire in either 10 or 30 minutes
 * depending on which doc page you read — unverified against a live response
 * in this environment. Using the more conservative (shorter) figure so the
 * in-app countdown never shows a code as valid after PayMongo has actually
 * expired it; worst case the app offers "Generate New QR" a bit early.
 */
export const QRPH_EXPIRY_SECONDS = 10 * 60

/**
 * Whether a booking's `payment_method` is collected online via PayMongo.
 *
 * Everything digital (gcash / maya / bank_transfer — the web treats any
 * non-cash value as PayMongo-eligible) goes through QR Ph. The two
 * exceptions are collected off-platform and are NEVER sent to PayMongo:
 *   - `cash`       → collected on-site by the cleaner
 *   - `bank_check` → physical check, verified manually by admin
 */
export const isPaymongoMethod = (method: string) =>
  method !== 'cash' && method !== 'bank_check'

export type QrPhResult =
  // testUrl is only ever set on PayMongo sandbox (sk_test_) keys — it's
  // PayMongo's own "authorize this test payment" page, since no real
  // e-wallet app can scan a sandbox QR. Absent entirely in live mode.
  | { status: 'qr'; qrImageUrl: string; paymentIntentId: string; testUrl?: string }
  | { status: 'already_paid' }
  | { status: 'error'; message: string }

type AuthedFetchResult = { error: string } | { res: Response }

async function authedFetch(path: string, bookingId: string): Promise<AuthedFetchResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { error: 'Your session has expired. Please sign in again.' }

  try {
    const res = await fetch(`${WEB_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ booking_id: bookingId }),
    })
    return { res }
  } catch {
    return { error: 'Could not reach the payment service. Check your connection and try again.' }
  }
}

/** Requests a fresh QR Ph code for `bookingId`, rendered natively (no browser/webview). */
export async function startPaymongoQrPh(bookingId: string): Promise<QrPhResult> {
  if (!WEB_URL) {
    return { status: 'error', message: 'Payment service is not configured. Please contact support.' }
  }

  const attempt = await authedFetch('/api/paymongo/qrph-intent', bookingId)
  if ('error' in attempt) return { status: 'error', message: attempt.error }
  const { res } = attempt

  if (res.status === 409) return { status: 'already_paid' }

  let body: any = null
  try { body = await res.json() } catch { /* non-JSON error body */ }

  if (!res.ok) {
    return { status: 'error', message: body?.error ?? `Payment service error (${res.status}). Please try again.` }
  }

  const qrImageUrl: string | undefined = body?.qr_image_url
  const paymentIntentId: string | undefined = body?.payment_intent_id
  if (!qrImageUrl || !paymentIntentId) {
    return { status: 'error', message: 'The payment service did not return a QR code. Please try again.' }
  }

  const testUrl: string | undefined = body?.test_url ?? undefined
  return { status: 'qr', qrImageUrl, paymentIntentId, testUrl }
}

/** Polled while the QR is on screen — actively checks PayMongo and settles the booking server-side if paid. */
export async function confirmPaymongoQrPh(bookingId: string): Promise<{ paid: boolean }> {
  if (!WEB_URL) return { paid: false }
  const attempt = await authedFetch('/api/paymongo/qrph-intent/confirm', bookingId)
  if ('error' in attempt) return { paid: false }
  const { res } = attempt
  if (!res.ok) return { paid: false }
  try {
    const body = await res.json()
    return { paid: !!body?.paid }
  } catch {
    return { paid: false }
  }
}
