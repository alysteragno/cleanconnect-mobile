// app/api/payment/submit/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Per-user: max 3 submissions per hour across all bookings
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { bookingId, paymentMethod, receiptUrl } = body as {
    bookingId: string;
    paymentMethod: string;
    receiptUrl: string;
  };

  if (!bookingId || !paymentMethod || !receiptUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["gcash", "bank_transfer"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  // Verify the booking belongs to this user
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, customer_id, status, payment_submitted_at")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.customer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prevent re-submission if already pending or verified
  if (["pending_verification", "confirmed", "completed"].includes(booking.status)) {
    return NextResponse.json(
      { error: "A receipt has already been submitted for this booking." },
      { status: 409 }
    );
  }

  // Rate limit: count submissions by this user in the last hour
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: countError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", user.id)
    .gte("payment_submitted_at", windowStart);

  if (countError) {
    return NextResponse.json({ error: "Could not verify rate limit" }, { status: 500 });
  }

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait before trying again." },
      { status: 429 }
    );
  }

  // All checks passed — update the booking
  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "pending_verification",
      payment_method: paymentMethod,
      payment_receipt_url: receiptUrl,
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
