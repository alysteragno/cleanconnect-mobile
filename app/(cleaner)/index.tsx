import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { Colors } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getService } from "@/constants/services";
import AppHeader from "@/components/AppHeader";
import JobLocationModal from "@/components/JobLocationModal";
import AssignedJobCard from "@/components/AssignedJobCard";

type JobOffer = {
  id: string;
  booking_id: string;
  status: string;
  bookings: {
    service_slug: string;
    service_date: string;
    service_time: string;
    property_sqm: number;
    base_price: number;
    address_city: string | null;
    address_street: string | null;
    address_unit: string | null;
    service_lat: number | null;
    service_lng: number | null;
    customer_id: string;
    status: string;
    payment_method: string;
    payment_status: string;
    special_notes: string | null;
    created_at: string;
    customer: { full_name: string; phone: string | null } | null;
  };
};

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(t: string | null | undefined) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function makeStyles(C: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.background,
    },
    body: { padding: 20, gap: 20, paddingBottom: 32 },

    greetingCard: {
      backgroundColor: C.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.borderLight,
      padding: 20,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    greetingLabel: { fontSize: 13, color: C.textMuted },
    greetingName: {
      fontSize: 22,
      fontWeight: "800",
      color: C.text,
      marginTop: 1,
    },
    greetingDate: { fontSize: 12, color: C.textSecondary, marginTop: 4 },
    offersBadge: {
      backgroundColor: C.primaryBg,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: "center",
    },
    offersBadgeNum: { fontSize: 22, fontWeight: "800", color: Colors.primary },
    offersBadgeLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: Colors.primary,
      marginTop: 1,
    },

    section: { gap: 12 },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: C.text },
    sectionLink: { fontSize: 12, fontWeight: "600", color: Colors.primary },

    startBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: Colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
    },
    startBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

    empty: {
      backgroundColor: C.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.borderLight,
      padding: 36,
      alignItems: "center",
      gap: 8,
    },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: C.primaryBg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: { fontSize: 15, fontWeight: "700", color: C.text },
    emptySub: {
      fontSize: 13,
      color: C.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
  });
}

export default function CleanerHomeScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const C = useThemeColors();
  const s = useMemo(() => makeStyles(C), [C]);

  const [name, setName] = useState("");
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mapOffer, setMapOffer] = useState<JobOffer | null>(null);
  const [photoMap, setPhotoMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const [{ data: profile }, { data: assignments }, { count }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single(),
          supabase
            .from("cleaner_assignments")
            .select(
              `
            id, booking_id, status,
            bookings (
              service_slug, service_date, service_time,
              property_sqm, base_price,
              address_city, address_street, address_unit,
              service_lat, service_lng,
              customer_id, status, created_at,
              payment_method, payment_status, special_notes,
              customer:profiles!customer_id(full_name, phone)
            )
          `,
            )
            .eq("cleaner_id", user.id)
            .eq("status", "assigned")
            .order("assigned_at", { ascending: false })
            .limit(5),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_read", false),
        ]);

      const p = profile as { full_name: string } | null;
      setName(p?.full_name?.split(" ")[0] ?? "there");
      const offerList = ((assignments ?? []) as unknown as JobOffer[]).filter(
        (a) => !["completed", "cancelled"].includes(a.bookings?.status ?? ""),
      );
      setOffers(offerList);
      setUnreadCount(count ?? 0);
      loadFurniturePhotos(offerList);
    } catch {
      // empty state fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadFurniturePhotos(offerList: JobOffer[]) {
    const map: Record<string, string[]> = {};
    await Promise.all(
      offerList.map(async (offer) => {
        const customerId = offer.bookings?.customer_id;
        if (!customerId) return;
        const { data: files } = await supabase.storage
          .from("furniture-photos")
          .list(customerId, {
            limit: 20,
            sortBy: { column: "created_at", order: "desc" },
          });
        if (files && files.length > 0) {
          map[offer.booking_id] = files
            .filter(
              (f) =>
                f.name &&
                !f.name.startsWith("proof-") &&
                !f.name.startsWith("."),
            )
            .map(
              (f) =>
                supabase.storage
                  .from("furniture-photos")
                  .getPublicUrl(`${customerId}/${f.name}`).data.publicUrl,
            );
        }
      }),
    );
    setPhotoMap(map);
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={s.screen}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={isDark ? "#ffffff" : Colors.primary}
            colors={isDark ? ["#ffffff"] : [Colors.primary]}
            progressBackgroundColor={isDark ? "#334155" : "#ffffff"}
          />
        }
      >
        <AppHeader
          title="Home"
          unreadCount={unreadCount}
          onBellPress={() => router.push("/(cleaner)/notifications")}
        />

        <View style={s.body}>
          {/* Greeting card */}
          <View style={s.greetingCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.greetingLabel}>Welcome back,</Text>
              <Text style={s.greetingName}>{name}</Text>
              <Text style={s.greetingDate}>{todayLabel()}</Text>
            </View>
            {offers.length > 0 && (
              <View style={s.offersBadge}>
                <Text style={s.offersBadgeNum}>{offers.length}</Text>
                <Text style={s.offersBadgeLabel}>
                  job{offers.length > 1 ? "s" : ""} assigned
                </Text>
              </View>
            )}
          </View>

          {/* Assigned Jobs */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>
                Assigned Jobs{offers.length > 0 ? ` (${offers.length})` : ""}
              </Text>
              <TouchableOpacity onPress={() => router.push("/(cleaner)/jobs")}>
                <Text style={s.sectionLink}>All jobs</Text>
              </TouchableOpacity>
            </View>

            {offers.length === 0 ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Feather name="inbox" size={28} color={Colors.primary} />
                </View>
                <Text style={s.emptyTitle}>No assigned jobs</Text>
                <Text style={s.emptySub}>
                  Jobs assigned to you by the dispatch team will appear here.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                {offers.map((offer) => {
                  const bk = offer.bookings;
                  const isInProgress = bk?.status === "in_progress";

                  return (
                    <AssignedJobCard
                      key={offer.id}
                      serviceSlug={bk?.service_slug}
                      serviceDate={bk?.service_date ?? ""}
                      serviceTime={bk?.service_time ?? ""}
                      basePrice={bk?.base_price ?? 0}
                      propertySqm={bk?.property_sqm ?? 0}
                      addressUnit={bk?.address_unit}
                      addressStreet={bk?.address_street}
                      addressCity={bk?.address_city}
                      serviceLatLng={
                        bk?.service_lat && bk?.service_lng
                          ? { lat: bk.service_lat, lng: bk.service_lng }
                          : null
                      }
                      photos={photoMap[offer.booking_id] ?? []}
                      customer={bk?.customer}
                      bookedAt={bk?.created_at}
                      onMapPress={() => setMapOffer(offer)}
                      renderAction={() => (
                        <TouchableOpacity
                          style={[
                            s.startBtn,
                            isInProgress && { backgroundColor: "#7c3aed" },
                          ]}
                          onPress={() =>
                            router.push({
                              pathname: `/(cleaner)/jobs/${offer.id}` as any,
                            })
                          }
                          activeOpacity={0.85}
                        >
                          <Feather
                            name={isInProgress ? "activity" : "play-circle"}
                            size={16}
                            color="#fff"
                          />
                          <Text style={s.startBtnText}>
                            {isInProgress ? "Resume Active Job" : "Start Job"}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {mapOffer != null && (
        <JobLocationModal
          visible
          coord={{
            latitude: mapOffer.bookings.service_lat!,
            longitude: mapOffer.bookings.service_lng!,
          }}
          address={[
            mapOffer.bookings.address_unit,
            mapOffer.bookings.address_street,
            mapOffer.bookings.address_city,
          ]
            .filter(Boolean)
            .join(", ")}
          serviceLabel={
            getService(mapOffer.bookings.service_slug ?? "")?.name ??
            "Cleaning Service"
          }
          onClose={() => setMapOffer(null)}
        />
      )}
    </>
  );
}
