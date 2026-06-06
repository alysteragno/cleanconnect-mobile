import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { Booking, BookingStatus } from '@/constants/types'

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: '#ca8a04',
  confirmed: Colors.primary,
  in_progress: '#7c3aed',
  completed: '#16a34a',
  cancelled: '#dc2626',
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function CustomerHomeScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [recent, setRecent] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: profile }, { data: bookings }, { count }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase
        .from('bookings')
        .select('id, service_type, service_date, base_price, status')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ])

    setName(profile?.full_name?.split(' ')[0] ?? 'there')
    setRecent((bookings ?? []) as unknown as Booking[])
    setUnreadCount(count ?? 0)
    setLoading(false)
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
      <View style={{ backgroundColor: Colors.primary, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
          }}>
            <Image
              source={require('../../assets/logo.webp')}
              style={{ width: 80, height: 50 }}
              resizeMode="contain"
            />
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(customer)/notifications')}
            style={{ position: 'relative', padding: 4 }}
          >
            <Feather name="bell" size={24} color="#fff" />
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute', top: 0, right: 0,
                backgroundColor: '#fbbf24', borderRadius: 99,
                minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 3,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={{ color: '#fbcfe8', fontSize: 13 }}>Good day,</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 }}>{name}</Text>
      </View>

      <View className="px-6 -mt-4">
        {/* Book Now CTA */}
        <TouchableOpacity
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5"
          onPress={() => router.push('/(customer)/bookings/new')}
        >
          <Text className="text-gray-900 text-base font-bold">Book a Cleaning</Text>
          <Text className="text-gray-500 text-sm mt-1">
            Schedule a professional cleaning for your home or office.
          </Text>
          <View className="bg-pink-600 rounded-xl py-2.5 px-4 mt-4 self-start">
            <Text className="text-white text-sm font-semibold">Book Now →</Text>
          </View>
        </TouchableOpacity>

        {/* Recent Bookings */}
        {recent.length > 0 && (
          <View className="mb-5">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-gray-900 font-semibold text-sm">Recent Bookings</Text>
              <TouchableOpacity onPress={() => router.push('/(customer)/bookings')}>
                <Text className="text-pink-600 text-xs font-semibold">See all →</Text>
              </TouchableOpacity>
            </View>

            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {recent.map((b, i) => (
                <TouchableOpacity
                  key={b.id}
                  className={`flex-row items-center justify-between p-4 ${i < recent.length - 1 ? 'border-b border-gray-100' : ''}`}
                  onPress={() => router.push(`/(customer)/bookings/${b.id}`)}
                >
                  <View>
                    <Text className="text-sm font-medium text-gray-900 capitalize">
                      {b.service_type.replace('_', ' ')}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-0.5">
                      {formatDate(b.service_date)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-bold text-gray-900">
                      ₱{Number(b.base_price).toLocaleString()}
                    </Text>
                    <Text
                      className="text-xs font-medium mt-0.5 capitalize"
                      style={{ color: STATUS_COLORS[b.status] }}
                    >
                      {b.status.replace('_', ' ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {recent.length === 0 && (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mb-5">
            <Feather name="wind" size={32} color={Colors.textMuted} style={{ marginBottom: 8 }} />
            <Text className="text-gray-900 font-semibold text-center">No bookings yet</Text>
            <Text className="text-gray-400 text-sm text-center mt-1">
              Book your first cleaning above!
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
