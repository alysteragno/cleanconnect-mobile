import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record as {
      id: string
      user_id: string
      title: string
      body: string
      type: string | null
    }

    if (!record?.user_id) {
      return new Response('Missing user_id', { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', record.user_id)
      .single()

    if (!profile?.push_token) {
      return new Response('No push token for user', { status: 200 })
    }

    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: profile.push_token,
        title: record.title,
        body: record.body,
        sound: 'default',
        channelId: 'default',
        data: { type: record.type ?? 'general' },
      }),
    })

    const result = await expoRes.json()
    return new Response(JSON.stringify(result), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
