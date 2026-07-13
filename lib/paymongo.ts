import * as WebBrowser from 'expo-web-browser'
import { Colors } from '@/constants/colors'
import { supabase } from './supabase'

/**
 * PayMongo hosted checkout client.
 *
 * The web backend owns the whole PayMongo flow — creating the checkout
 * session and confirming payment via webhook. The mobile app only:
 *   1. asks the backend for a checkout URL for an already-created booking,
 *   2. opens that URL in an in-app browser,
 *   3. refetches the booking on return (payment is confirmed server-side).
 *
 * The endpoint is idempotent: calling it again for the same booking returns
 * the same `checkout_url`, so this doubles as the "pay later / retry" path.
 */

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL

/**
 * Whether a booking's `payment_method` is collected online via PayMongo.
 *
 * Everything digital (gcash / maya / bank_transfer — the web treats any
 * non-cash value as PayMongo-eligible) goes through the hosted QRPh page.
 * The two exceptions are collected off-platform and are NEVER sent to
 * PayMongo:
 *   - `cash`       → collected on-site by the cleaner
 *   - `bank_check` → physical check, verified manually by admin
 */
export const isPaymongoMethod = (method: string) =>
  method !== 'cash' && method !== 'bank_check'

export type CheckoutResult =
  /** Browser opened and was dismissed — caller should refetch the booking. */
  | { status: 'opened' }
  /** Backend reported the booking is already paid (HTTP 409) — treat as success. */
  | { status: 'already_paid' }
  /** Something went wrong — `message` is safe to show to the user. */
  | { status: 'error'; message: string }

/**
 * Create (or reuse) a PayMongo checkout session for `bookingId` and open the
 * hosted payment page in an in-app browser.
 *
 * Never call this for a cash booking — cash is collected on-site and the web
 * endpoint rejects it (422).
 */
export async function startPaymongoCheckout(bookingId: string): Promise<CheckoutResult> {
  if (!WEB_URL) {
    return { status: 'error', message: 'Payment service is not configured. Please contact support.' }
  }

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    return { status: 'error', message: 'Your session has expired. Please sign in again.' }
  }

  let res: Response
  try {
    res = await fetch(`${WEB_URL}/api/paymongo/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ booking_id: bookingId }),
    })
  } catch {
    return { status: 'error', message: 'Could not reach the payment service. Check your connection and try again.' }
  }

  // "Already paid" is a success — the webhook already settled this booking.
  if (res.status === 409) return { status: 'already_paid' }

  let body: any = null
  try { body = await res.json() } catch { /* non-JSON error body */ }

  if (!res.ok) {
    return { status: 'error', message: body?.error ?? `Payment service error (${res.status}). Please try again.` }
  }

  const url: string | undefined = body?.checkout_url
  if (!url) {
    return { status: 'error', message: 'The payment service did not return a checkout link. Please try again.' }
  }

  // Opens SFSafariViewController (iOS) / Chrome Custom Tab (Android). Resolves
  // when the user dismisses the browser (after paying, cancelling, or backing
  // out). We don't read the redirect result here — payment is confirmed by the
  // PayMongo webhook on the server, so the caller just refetches the booking.
  await WebBrowser.openBrowserAsync(url, {
    toolbarColor: Colors.primary,
    controlsColor: Colors.primary,
    dismissButtonStyle: 'close',
  })

  return { status: 'opened' }
}
