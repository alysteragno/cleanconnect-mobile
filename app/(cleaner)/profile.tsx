import { useEffect, useState } from 'react'
import {
  View, Text, Image, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTheme, Theme } from '@/context/ThemeContext'
import AppHeader from '@/components/AppHeader'
import ResignationRequestModal, { ResignationSubmission } from '@/components/ResignationRequestModal'

type Stats = {
  completed: number
  assigned: number
}

type ResignationRequest = {
  id: string
  status: 'pending' | 'in_progress' | 'approved' | 'rejected'
  reason: string | null
  notes: string | null
  admin_note: string | null
  reviewed_at: string | null
  created_at: string
}

const THEME_OPTIONS: Array<{ key: Theme; label: string; icon: string }> = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
]

function InfoRow({ icon, label, value, isLast, C, editing, onChangeText, keyboardType, placeholder }: {
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
  value: string
  isLast?: boolean
  C: ReturnType<typeof useThemeColors>
  /** When set, the row becomes an editable TextInput bound to `value`/`onChangeText`. */
  editing?: boolean
  onChangeText?: (text: string) => void
  keyboardType?: 'default' | 'phone-pad'
  placeholder?: string
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 13,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: C.borderLight,
    }}>
      <View style={{
        width: 30, height: 30, borderRadius: 8,
        backgroundColor: C.background, alignItems: 'center', justifyContent: 'center',
      }}>
        <Feather name={icon} size={14} color={C.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 2 }}>{label}</Text>
        {editing ? (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            placeholder={placeholder}
            placeholderTextColor={C.textMuted}
            style={{
              fontSize: 14, color: C.text, fontWeight: '500', padding: 0,
              borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2,
            }}
          />
        ) : (
          <Text style={{ fontSize: 14, color: C.text, fontWeight: '500' }}>{value || '—'}</Text>
        )}
      </View>
    </View>
  )
}

// The resignation flow is a genuine two-step sequence (submit in-app, then
// finalize in person) — numbered steps here encode a real order, not decoration.
function ProcessStep({ number, title, description, C }: {
  number: string
  title: string
  description: string
  C: ReturnType<typeof useThemeColors>
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{
        width: 24, height: 24, borderRadius: 12, marginTop: 1,
        backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: Colors.primary }}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 17 }}>{description}</Text>
      </View>
    </View>
  )
}

export default function CleanerProfileScreen() {
  const router = useRouter()
  const C = useThemeColors()
  const { theme, setTheme, isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [stats, setStats] = useState<Stats>({ completed: 0, assigned: 0 })
  const [unreadCount, setUnreadCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftFullName, setDraftFullName] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftEmergencyName, setDraftEmergencyName] = useState('')
  const [draftEmergencyPhone, setDraftEmergencyPhone] = useState('')

  const [resignationRequest, setResignationRequest] = useState<ResignationRequest | null>(null)
  const [showResignModal, setShowResignModal] = useState(false)
  const [submittingResignation, setSubmittingResignation] = useState(false)

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? '')

    const [{ data: profile }, { data: assignments }, { count }, { data: latestRequest }] = await Promise.all([
      supabase.from('profiles').select('full_name, phone, photo_url, emergency_contact_name, emergency_contact_phone').eq('id', user.id).single(),
      supabase.from('cleaner_assignments').select('status').eq('cleaner_id', user.id),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
      supabase
        .from('cleaner_resignation_requests')
        .select('id, status, reason, notes, admin_note, reviewed_at, created_at')
        .eq('cleaner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setPhotoUrl(profile?.photo_url ?? null)
    setEmergencyContactName(profile?.emergency_contact_name ?? '')
    setEmergencyContactPhone(profile?.emergency_contact_phone ?? '')
    setStats({
      completed: (assignments ?? []).filter(a => a.status === 'completed').length,
      assigned: (assignments ?? []).filter(a => a.status === 'assigned').length,
    })
    setUnreadCount(count ?? 0)
    setResignationRequest((latestRequest as ResignationRequest | null) ?? null)
    setLoading(false)
    setRefreshing(false)
  }

  async function signOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { await supabase.auth.signOut() },
      },
    ])
  }

  function startEdit() {
    setDraftFullName(fullName)
    setDraftPhone(phone)
    setDraftEmergencyName(emergencyContactName)
    setDraftEmergencyPhone(emergencyContactPhone)
    setEditing(true)
  }

  // Role/employment fields (role, is_active, etc.) stay admin-only on the web —
  // this only ever touches the same four self-service fields the form exposes.
  async function saveProfile() {
    if (!draftFullName.trim()) { Alert.alert('Required', 'Name cannot be empty.'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: draftFullName.trim(),
        phone: draftPhone.trim() || null,
        emergency_contact_name: draftEmergencyName.trim() || null,
        emergency_contact_phone: draftEmergencyPhone.trim() || null,
      })
      .eq('id', user.id)

    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }

    setFullName(draftFullName.trim())
    setPhone(draftPhone.trim())
    setEmergencyContactName(draftEmergencyName.trim())
    setEmergencyContactPhone(draftEmergencyPhone.trim())
    setEditing(false)
    Alert.alert('Saved', 'Profile updated successfully.')
  }

  // Self-service resignation is a REQUEST, not an instant self-delete/deactivate —
  // a super_admin reviews and approves/rejects it (web admin UI). This keeps a
  // service-role-only action (deactivating an account, akin to the admin's
  // existing toggleCleanerStatus) out of a self-service mobile client, and
  // lets an admin coordinate reassigning any upcoming jobs first. Submitting
  // just inserts a 'pending' row — the account itself is untouched until an
  // admin approves it. `acknowledged: true` is set here because the modal
  // already blocked submission until the cleaner checked it — the DB's
  // chk_resignation_acknowledged CHECK constraint is the real guarantee,
  // this is just the value that constraint requires.
  async function submitResignation(payload: ResignationSubmission) {
    setSubmittingResignation(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmittingResignation(false); return }

    const { error } = await supabase
      .from('cleaner_resignation_requests')
      .insert({
        cleaner_id: user.id,
        status: 'pending',
        reason: payload.reason,
        notes: payload.notes,
        acknowledged: true,
      })

    if (!error) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: 'Resignation Request Sent',
        body: 'Your manager has been notified. Visit the business office in person to finalize your resignation.',
        type: 'resignation_request',
      })
    }

    setSubmittingResignation(false)
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already submitted', 'You already have a pending resignation request.')
        setShowResignModal(false)
      } else {
        Alert.alert('Error', error.message)
      }
    } else {
      setShowResignModal(false)
      Alert.alert(
        'Request Sent',
        'Your manager has been notified — this is just a heads-up, your account hasn\'t changed. To actually resign, visit the business office and meet your manager in person.',
      )
    }
    loadProfile()
  }

  function cancelResignation(id: string) {
    Alert.alert('Cancel Request?', 'Cancel your pending resignation request?', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel Request', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('cleaner_resignation_requests').delete().eq('id', id)
          if (error) Alert.alert('Error', error.message)
          else loadProfile()
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        title="My Profile"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(cleaner)/notifications')}
      />

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadProfile() }}
            tintColor={isDark ? '#ffffff' : Colors.primary}
            colors={isDark ? ['#ffffff'] : [Colors.primary]}
            progressBackgroundColor={isDark ? '#334155' : '#ffffff'}
          />
        }
      >

        {/* Avatar block */}
        <View style={{
          backgroundColor: C.white, borderRadius: 20, borderWidth: 1,
          borderColor: C.border, padding: 24, alignItems: 'center',
        }}>
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
            />
          ) : (
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: Colors.primary + '20',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: Colors.primary }}>
                {fullName.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{fullName}</Text>
          <Text style={{ fontSize: 14, color: C.textSecondary, marginTop: 2 }}>{email}</Text>
          <View style={{
            marginTop: 8, paddingHorizontal: 10, paddingVertical: 3,
            backgroundColor: '#7c3aed15', borderRadius: 99,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c3aed' }}>Cleaner</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{
            flex: 1, backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.border, padding: 16, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#16a34a' }}>{stats.completed}</Text>
            <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2, fontWeight: '600' }}>Completed</Text>
          </View>
          <View style={{
            flex: 1, backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
            borderColor: C.border, padding: 16, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.primary }}>{stats.assigned}</Text>
            <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2, fontWeight: '600' }}>Upcoming</Text>
          </View>
        </View>

        {/* Account info */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
          borderColor: C.border, overflow: 'hidden',
        }}>
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: C.background, paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Account Details</Text>
            {!editing && (
              <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="edit-2" size={13} color={Colors.primary} />
                <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <InfoRow icon="mail" label="Email" value={email} C={C} />
          <InfoRow
            icon="user" label="Full Name" C={C} editing={editing}
            value={editing ? draftFullName : fullName}
            onChangeText={setDraftFullName}
          />
          <InfoRow
            icon="phone" label="Phone" C={C} editing={editing}
            value={editing ? draftPhone : phone}
            onChangeText={setDraftPhone}
            keyboardType="phone-pad"
            placeholder="e.g. 09123456789"
          />

          <View style={{
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
            backgroundColor: C.background, borderTopWidth: 1, borderTopColor: C.borderLight,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 0.4 }}>
              EMERGENCY CONTACT
            </Text>
          </View>
          <InfoRow
            icon="user-check" label="Name" C={C} editing={editing}
            value={editing ? draftEmergencyName : emergencyContactName}
            onChangeText={setDraftEmergencyName}
          />
          <InfoRow
            icon="phone-call" label="Phone" C={C} editing={editing} isLast
            value={editing ? draftEmergencyPhone : emergencyContactPhone}
            onChangeText={setDraftEmergencyPhone}
            keyboardType="phone-pad"
            placeholder="e.g. 09123456789"
          />
        </View>

        {editing ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setEditing(false)}
              style={{
                flex: 1, backgroundColor: C.white, borderRadius: 12,
                paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.border,
              }}
            >
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveProfile}
              disabled={saving}
              style={{
                flex: 2, backgroundColor: Colors.primary, borderRadius: 12,
                paddingVertical: 13, alignItems: 'center', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{
            backgroundColor: C.primaryBg, borderRadius: 14, borderWidth: 1,
            borderColor: Colors.primary + '30', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <Feather name="info" size={16} color={Colors.primary} />
            <Text style={{ fontSize: 13, color: Colors.primary, flex: 1, lineHeight: 18 }}>
              Need to change your email? Reach out to your branch manager.
            </Text>
          </View>
        )}

        {/* Theme toggle */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
          borderColor: C.border, overflow: 'hidden',
        }}>
          <View style={{
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: C.background, borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Appearance</Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 12 }}>
              Choose between light and dark appearance.
            </Text>
            <View style={{
              flexDirection: 'row', backgroundColor: C.background,
              borderRadius: 12, padding: 4, gap: 4,
            }}>
              {THEME_OPTIONS.map(opt => {
                const active = theme === opt.key
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setTheme(opt.key)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center',
                      justifyContent: 'center', gap: 5,
                      paddingVertical: 9, borderRadius: 9,
                      backgroundColor: active ? C.white : 'transparent',
                      shadowColor: active ? '#000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: active ? 0.08 : 0,
                      shadowRadius: 3,
                      elevation: active ? 2 : 0,
                    }}
                  >
                    <Feather
                      name={opt.icon as any}
                      size={14}
                      color={active ? Colors.primary : C.textMuted}
                    />
                    <Text style={{
                      fontSize: 13, fontWeight: active ? '700' : '500',
                      color: active ? Colors.primary : C.textMuted,
                    }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>

        {/* Legal */}
        <TouchableOpacity
          onPress={() => router.push('/privacy-policy')}
          style={{
            backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border,
            paddingHorizontal: 16, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}
        >
          <View style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(219,39,119,0.15)', alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name="shield" size={16} color={Colors.primary} />
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.text }}>Privacy Policy</Text>
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={signOut}
          style={{
            backgroundColor: C.white, borderRadius: 14, borderWidth: 1,
            borderColor: '#fca5a5', paddingVertical: 14, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 8,
          }}
        >
          <Feather name="log-out" size={16} color="#dc2626" />
          <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 }}>Sign Out</Text>
        </TouchableOpacity>

        {/* Resignation */}
        <View style={{
          backgroundColor: C.white, borderRadius: 16, borderWidth: 1,
          borderColor: C.border, overflow: 'hidden',
        }}>
          <View style={{
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: C.background, borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary }}>Resignation</Text>
          </View>
          <View style={{ padding: 16, gap: 16 }}>

            {resignationRequest?.status === 'pending' ? (
              <>
                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: '#fefce8', borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', padding: 12,
                }}>
                  <Feather name="clock" size={16} color="#ca8a04" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#854d0e' }}>Request Sent — Awaiting Your Manager</Text>
                    <Text style={{ fontSize: 12, color: '#92400e', marginTop: 3, lineHeight: 17 }}>
                      Submitted {new Date(resignationRequest.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}.
                      This was only a heads-up — your account and job stay exactly the same for now.
                    </Text>
                    {resignationRequest.reason ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <View style={{ backgroundColor: '#fde68a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#854d0e' }}>{resignationRequest.reason}</Text>
                        </View>
                      </View>
                    ) : null}
                    {resignationRequest.notes ? (
                      <Text style={{ fontSize: 12, color: '#92400e', marginTop: 6, fontStyle: 'italic' }}>
                        "{resignationRequest.notes}"
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: C.primaryBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary + '30', padding: 12,
                }}>
                  <Feather name="map-pin" size={16} color={Colors.primary} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary }}>Next: visit the business office</Text>
                    <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 3, lineHeight: 17, opacity: 0.85 }}>
                      Nothing is final yet. Meet your manager in person at the business office to finalize your resignation.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => cancelResignation(resignationRequest.id)}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 12, borderWidth: 1, borderColor: C.border,
                    paddingVertical: 12, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: C.textSecondary, fontWeight: '700', fontSize: 13 }}>Cancel Request</Text>
                </TouchableOpacity>
              </>
            ) : resignationRequest?.status === 'in_progress' ? (
              <>
                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: '#eff6ff', borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', padding: 12,
                }}>
                  <Feather name="check-circle" size={16} color="#2563eb" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e3a8a' }}>Request Acknowledged</Text>
                    <Text style={{ fontSize: 12, color: '#1e40af', marginTop: 3, lineHeight: 17 }}>
                      {resignationRequest.reviewed_at
                        ? `Acknowledged on ${new Date(resignationRequest.reviewed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                        : 'Your manager has acknowledged this request.'}
                      {' '}Your account and job stay exactly the same until you finish this in person.
                    </Text>
                  </View>
                </View>

                {/* admin_note is the actual instruction (when/where to go) — shown
                    persistently here since the cleaner may not have seen/kept the
                    push notification it was also sent in. */}
                {resignationRequest.admin_note ? (
                  <View style={{
                    backgroundColor: C.primaryBg, borderRadius: 12, borderWidth: 1,
                    borderColor: Colors.primary + '30', padding: 14,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Feather name="map-pin" size={15} color={Colors.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary }}>
                        Message from your manager
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: C.text, lineHeight: 19 }}>
                      {resignationRequest.admin_note}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : resignationRequest?.status === 'approved' ? (
              // Legacy value — the web admin flow no longer writes 'approved' (see
              // migration_resignation_status_in_progress.sql), only kept as a
              // display fallback for rows created before that change.
              <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                backgroundColor: '#f0fdf4', borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0', padding: 12,
              }}>
                <Feather name="check-circle" size={16} color="#16a34a" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>Resignation Approved</Text>
                  {resignationRequest.admin_note ? (
                    <Text style={{ fontSize: 12, color: '#15803d', marginTop: 3, lineHeight: 17 }}>
                      {resignationRequest.admin_note}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Planning to leave?</Text>

                <View style={{ gap: 14 }}>
                  <ProcessStep
                    number="1"
                    title="Submit a request here"
                    description="A heads-up for your manager — it doesn't end your employment. You can cancel it any time before it's reviewed."
                    C={C}
                  />
                  <ProcessStep
                    number="2"
                    title="Visit the business office"
                    description="Resignations are only finalized in person. You'll meet your manager there to complete the process."
                    C={C}
                  />
                </View>

                {resignationRequest?.status === 'rejected' && (
                  <View style={{ backgroundColor: C.background, borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary, marginBottom: 2 }}>
                      Your last request was not approved
                    </Text>
                    {resignationRequest.admin_note ? (
                      <Text style={{ fontSize: 12, color: C.text }}>{resignationRequest.admin_note}</Text>
                    ) : null}
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => setShowResignModal(true)}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 12, borderWidth: 1.5, borderColor: '#dc2626',
                    backgroundColor: '#fff5f5', paddingVertical: 13,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Feather name="user-x" size={15} color="#dc2626" />
                  <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 }}>Submit Resignation Request</Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </View>

        {/* App version */}
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: C.textMuted, fontWeight: '500' }}>
            CleanConnect v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      <ResignationRequestModal
        visible={showResignModal}
        onClose={() => setShowResignModal(false)}
        onSubmit={submitResignation}
        submitting={submittingResignation}
      />
    </View>
  )
}
