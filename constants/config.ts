// ─── Feature flags ────────────────────────────────────────────────────────────

/**
 * PayMongo hosted checkout for digital (non-cash) payments.
 *
 * When `true`, any non-cash booking is paid through the web backend's
 * PayMongo checkout endpoint — the customer is redirected to PayMongo's
 * hosted page (GCash / Maya / bank QR) and payment is confirmed server-side
 * via the PayMongo webhook, which flips `bookings.payment_status` to `paid`.
 *
 * When `false`, the app falls back to the legacy manual flow: the customer
 * is shown the GCash QR / bank-account details from the `settings` table and
 * uploads a reference number + proof-of-payment screenshot for the admin to
 * verify by hand.
 *
 * Cash is NEVER affected by this flag — it is always collected on-site and
 * confirmed by the cleaner via the web `/api/collect-cash` endpoint.
 *
 * This flag exists purely as a transition safety net while PayMongo is on
 * TEST keys. Once LIVE keys are verified in production, the manual fallback
 * (and this flag) can be deleted.
 */
export const PAYMONGO_ENABLED = true
