import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

type JobOffer = {
  id: string
  booking_id: string
  status: string
  bookings: {
    service_type: string
    service_date: string
    service_time: string
    property_sqm: number
    base_price: number
    address_city: string | null
  }
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

export default function CleanerHomeScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [offers, setOffers] = useState<JobOffer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: profile }, { data: assignments }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase
        .from('cleaner_assignments')
        .select(`
          id, booking_id, status,
          bookings (service_type, service_date, service_time, property_sqm, base_price, address_city)
        `)
        .eq('cleaner_id', user.id)
        .eq('status', 'offered')
        .order('assigned_at', { ascending: false })
        .limit(5),
    ])

    setName(profile?.full_name?.split(' ')[0] ?? 'there')
    setOffers((assignments ?? []) as unknown as JobOffer[])
    setLoading(false)
  }

  async function respondToOffer(assignmentId: string, accept: boolean) {
    await supabase
      .from('cleaner_assignments')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', assignmentId)

    setOffers((prev) => prev.filter((o) => o.id !== assignmentId))
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-pink-600 px-6 pt-16 pb-8">
        <Text className="text-pink-200 text-sm">Welcome back,</Text>
        <Text className="text-white text-2xl font-bold mt-0.5">{name}</Text>
      </View>

      <View className="px-6 -mt-4">
        {/* Pending Offers */}
        <View className="mb-5">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-900 font-semibold text-sm">
              Job Offers {offers.length > 0 ? `(${offers.length})` : ''}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(cleaner)/jobs')}>
              <Text className="text-pink-600 text-xs font-semibold">All jobs →</Text>
            </TouchableOpacity>
          </View>

          {offers.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center">
              <Text className="text-2xl mb-2">✅</Text>
              <Text className="text-gray-900 font-semibold text-center">No pending offers</Text>
              <Text className="text-gray-400 text-sm text-center mt-1">
                New job offers will appear here.
              </Text>
            </View>
          ) : (
            <View className="space-y-3">
              {offers.map((offer) => (
                <View key={offer.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900 capitalize">
                        {offer.bookings?.service_type?.replace('_', ' ')}
                      </Text>
                      <Text className="text-xs text-gray-400 mt-0.5">
                        {formatDate(offer.bookings?.service_date)} · {formatTime(offer.bookings?.service_time)}
                      </Text>
                      {offer.bookings?.address_city && (
                        <Text className="text-xs text-gray-400 mt-0.5">
                          📍 {offer.bookings.address_city}
                        </Text>
                      )}
                    </View>
                    <Text className="text-base font-bold text-gray-900">
                      ₱{Number(offer.bookings?.base_price).toLocaleString()}
                    </Text>
                  </View>

                  <Text className="text-xs text-gray-400 mb-3">
                    {offer.bookings?.property_sqm} sqm
                  </Text>

                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1 bg-pink-600 rounded-xl py-2.5 items-center"
                      onPress={() => respondToOffer(offer.id, true)}
                    >
                      <Text className="text-white text-sm font-semibold">Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 bg-gray-100 rounded-xl py-2.5 items-center"
                      onPress={() => respondToOffer(offer.id, false)}
                    >
                      <Text className="text-gray-600 text-sm font-semibold">Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  )
}
