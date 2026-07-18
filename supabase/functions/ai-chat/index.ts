import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Per-user request log, kept in memory for the life of this isolate. Resets on cold
// start and isn't shared across concurrent isolates, but stops a single logged-in
// user from looping requests and draining the shared Groq free-tier quota.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const requestLog = new Map<string, number[]>()

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const recent = (requestLog.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  requestLog.set(userId, recent)
  return recent.length > RATE_LIMIT_MAX
}

const SYSTEM_PROMPT = `You are the friendly AI assistant for Maid For You Cleaning Services, a home and commercial cleaning service booking app in the Philippines. Keep answers short (2-4 sentences), warm, and helpful.

What we offer, by category:
- Deep Cleaning: Mattress Deep Cleaning (from ₱800, 1-2 hrs), Sofa/Couch Cleaning (from ₱800, 1-2 hrs), Carpet Cleaning (from ₱900, 2-3 hrs), Curtain Dry Cleaning (from ₱700, 1-2 hrs)
- Aircon Services: Aircon Cleaning (from ₱600, 1-2 hrs), Aircon Freon Charging (from ₱800, 1-2 hrs), Aircon Repair (from ₱1,000, 1-3 hrs)
- Grease Trap: Grease Trap Cleaning (from ₱1,500, 2-4 hrs), Grease Trap Installation (from ₱2,500, 3-5 hrs)
- General Cleaning: General/House Cleaning (from ₱1,500, 3-5 hrs), Condo Cleaning (from ₱1,200, 2-4 hrs), Office Cleaning (from ₱1,200, 2-4 hrs), Commercial Cleaning (from ₱1,500, 3-5 hrs), Post-Construction Cleaning (from ₱3,000, 4-8 hrs)
All prices are starting prices — final quotes depend on space size and condition.

How booking works: customers pick a service, enter their address (with GPS capture), choose a date/time, pick a payment method, then review and confirm. Payment methods are Cash, GCash, or Bank Transfer — the admin verifies payment manually, there's no in-app payment gateway charge at booking time for cash.

Our office is located at Recuerdo Towers, Conchu Street, Sta. Ana, Manila. Cleaners are dispatched to the customer's own address for the actual service — customers don't need to visit the office for a booking.

You do not have access to any specific customer's account, bookings, or payment status. If asked about "my booking", "my cleaner", or anything account-specific, politely tell them to check the Bookings tab, or reach a human via the Chat tab for anything you can't answer. Never make up booking details, prices outside this list, or promises about scheduling/availability.`

type ChatMessage = { role: 'user' | 'assistant'; content: string }

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (isRateLimited(user.id)) {
      return new Response(JSON.stringify({ error: 'Too many requests — please slow down' }), {
        status: 429,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const { messages } = (await req.json()) as { messages: ChatMessage[] }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing messages' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const trimmed = messages.slice(-10)

    const GROQ_MODEL = 'llama-3.3-70b-versatile'
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 512,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('[ai-chat] Groq error:', errText)
      return new Response(JSON.stringify({ error: 'AI request failed' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const data = await groqRes.json()
    const reply = data?.choices?.[0]?.message?.content ?? ''

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[ai-chat] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
