import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { Colors } from "@/constants/colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useTheme } from "@/context/ThemeContext";
import AppHeader from "@/components/AppHeader";
import AssignedJobCard from "@/components/AssignedJobCard";
import SwipeSlider from "@/components/SwipeSlider";
import JobLocationModal from "@/components/JobLocationModal";

const ARRIVAL_RADIUS_METERS = 500;

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Booking = {
  service_name: string | null;
  service_slug: string | null;
  space_type: string;
  service_date: string;
  service_time: string;
  property_sqm: number;
  base_price: number;
  duration_hours: number;
  address_unit: string | null;
  address_street: string | null;
  address_city: string | null;
  address_province: string | null;
  service_lat: number | null;
  service_lng: number | null;
  special_notes: string | null;
  status: string;
  payment_method: string;
  payment_status: string;
  started_at: string | null;
  cleaner_en_route_at: string | null;
  customer_id: string | null;
  created_at: string | null;
  customer: { full_name: string } | null;
};

type Assignment = {
  id: string;
  booking_id: string;
  status: string;
  bookings: Booking;
};

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const C = useThemeColors();
  const { isDark } = useTheme();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // flow states
  const [tripStarted, setTripStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [jobMarkedComplete, setJobMarkedComplete] = useState(false);
  const [cashCollected, setCashCollected] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);

  // async states
  const [locating, setLocating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  useEffect(() => {
    loadAssignment();
  }, [id]);

  async function loadAssignment() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error } = await supabase
      .from("cleaner_assignments")
      .select(
        `
        id, booking_id, status,
        bookings (
          service_name, service_slug, space_type, service_date, service_time, property_sqm,
          base_price, duration_hours, address_unit, address_street, address_city,
          address_province, service_lat, service_lng, special_notes, status, created_at,
          payment_method, payment_status, started_at, cleaner_en_route_at, customer_id,
          customer:profiles!customer_id(full_name)
        )
      `,
      )
      .eq("id", id)
      .eq("cleaner_id", user.id)
      .single();

    if (error) console.warn("[loadAssignment] error:", JSON.stringify(error));

    if (data?.bookings) {
      const b = data.bookings as any;
      const isInProgress = b.status === "in_progress";
      const isCompleted =
        b.status === "completed" || data.status === "completed";
      if (b.cleaner_en_route_at) setTripStarted(true);
      if (isInProgress) {
        setTripStarted(true);
        setArrived(true);
      }
      if (isCompleted) {
        setTripStarted(true);
        setArrived(true);
        setJobMarkedComplete(true);
        setCompleted(true);
        setCompletedAt(new Date());
      }
      if (b.payment_status === "paid") setCashCollected(true);
    }
    setAssignment(data as unknown as Assignment);
    setLoading(false);
    setRefreshing(false);
  }

  // Step 1 — geo-tag starting location, transition to "On the Way"
  async function startTrip() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location access is required to start your trip.",
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !assignment) return;

      const nowIso = new Date().toISOString();
      const { error: bookingErr, data: bookingData } = await supabase
        .from("bookings")
        .update({ cleaner_en_route_at: nowIso })
        .eq("id", assignment.booking_id)
        .select();
      if (bookingErr || !bookingData || bookingData.length === 0) {
        throw (
          bookingErr ??
          new Error("Could not save your starting location. Please try again.")
        );
      }

      await supabase
        .from("profiles")
        .update({
          home_lat: loc.coords.latitude,
          home_lng: loc.coords.longitude,
        })
        .eq("id", user.id);

      setAssignment((prev) =>
        prev
          ? { ...prev, bookings: { ...prev.bookings, cleaner_en_route_at: nowIso } }
          : prev,
      );
      setTripStarted(true);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Could not get your location. Please try again.");
    }
  }

  // Step 2 — verify GPS within range, mark booking in_progress
  async function markArrived() {
    if (!assignment) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location access is required to verify arrival.",
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const b = assignment.bookings;

      if (b.service_lat && b.service_lng) {
        const dist = haversineDistance(
          loc.coords.latitude,
          loc.coords.longitude,
          b.service_lat,
          b.service_lng,
        );
        if (dist > ARRIVAL_RADIUS_METERS) {
          Alert.alert(
            "Not at location yet",
            `You are ${Math.round(dist)}m away. You must be within ${ARRIVAL_RADIUS_METERS}m to confirm arrival.`,
          );
          return;
        }
      }

      // Guard: another job already in progress
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: otherAssignments } = await supabase
          .from("cleaner_assignments")
          .select("booking_id")
          .eq("cleaner_id", user.id)
          .neq("id", assignment.id);
        const bookingIds = (otherAssignments ?? []).map((a: any) => a.booking_id);
        if (bookingIds.length > 0) {
          const { data: activeBookings } = await supabase
            .from("bookings")
            .select("id")
            .in("id", bookingIds)
            .eq("status", "in_progress")
            .limit(1);
          if ((activeBookings ?? []).length > 0) {
            Alert.alert(
              "Job Already In Progress",
              "You already have another job in progress. Complete it before starting a new one.",
              [{ text: "OK" }],
            );
            return;
          }
        }
      }

      const now = new Date().toISOString();
      const { error, data: bookingData } = await supabase
        .from("bookings")
        .update({ status: "in_progress", started_at: now })
        .eq("id", assignment.booking_id)
        .select();
      if (error) throw error;
      if (!bookingData || bookingData.length === 0) {
        throw new Error("Could not start the job — the booking may no longer be assigned to you.");
      }

      if (b.customer_id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let first = "Your cleaner";
        if (user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();
          if (prof?.full_name) first = (prof.full_name as string).split(" ")[0];
        }
        try {
          await supabase.from("notifications").insert({
            user_id: b.customer_id,
            title: "Cleaner Has Arrived",
            body: `${first} has arrived at your location and the service has started.`,
            type: "info",
          });
        } catch {}
      }

      setArrived(true);
      setAssignment((prev) =>
        prev
          ? {
              ...prev,
              bookings: {
                ...prev.bookings,
                status: "in_progress",
                started_at: now,
              },
            }
          : prev,
      );
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message ?? "Could not confirm arrival. Please try again.",
      );
    } finally {
      setLocating(false);
    }
  }

  // Step 3 — mark job completed in DB
  async function completeJob() {
    if (!assignment) return;
    setUpdating(true);
    const b = assignment.bookings;
    try {
      await Promise.all([
        supabase
          .from("bookings")
          .update({ status: "completed" })
          .eq("id", assignment.booking_id),
        supabase
          .from("cleaner_assignments")
          .update({ status: "completed" })
          .eq("id", assignment.id),
      ]);
      if (b.customer_id) {
        try {
          await supabase.from("notifications").insert({
            user_id: b.customer_id,
            title: "Service Completed",
            body: `Your ${b.service_name ?? "cleaning service"} has been completed. Please leave a review!`,
            type: "info",
          });
        } catch {}
      }
      setJobMarkedComplete(true);
      setAssignment((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              bookings: { ...prev.bookings, status: "completed" },
            }
          : prev,
      );
      if (b.payment_method !== "cash") {
        setCompleted(true);
        setCompletedAt(new Date());
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Could not complete job.");
    } finally {
      setUpdating(false);
    }
  }

  // Step 4 (cash only) — mark payment paid, show completion screen
  async function collectCash() {
    if (!assignment) return;
    setUpdating(true);
    const { error } = await supabase
      .from("bookings")
      .update({ payment_status: "paid" })
      .eq("id", assignment.booking_id);
    setUpdating(false);
    if (error) {
      Alert.alert("Error", "Could not record payment. Please try again.");
      return;
    }
    setCashCollected(true);
    setAssignment((prev) =>
      prev
        ? { ...prev, bookings: { ...prev.bookings, payment_status: "paid" } }
        : prev,
    );
    setCompleted(true);
    setCompletedAt(new Date());
  }


  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!assignment?.bookings) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ color: C.textSecondary }}>Job not found.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: Colors.primary, fontWeight: "600" }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const b = assignment.bookings;
  const fullAddress =
    [b.address_unit, b.address_street, b.address_city, b.address_province]
      .filter(Boolean)
      .join(", ") || "—";

  const headerBg = completed
    ? "#16a34a"
    : arrived
      ? "#7c3aed"
      : tripStarted
        ? "#1d4ed8"
        : Colors.primary;

  const headerStatus = completed
    ? "Completed"
    : arrived
      ? "In Progress"
      : tripStarted
        ? "On the Way"
        : "Assigned";

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        showBack
        onBackPress={() => router.back()}
        title={b.service_name ?? "Cleaning Service"}
        subtitle={`Job #${assignment.id.slice(0, 8).toUpperCase()}`}
        hideBell
        backgroundColor={headerBg}
        rightContent={
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 99,
              backgroundColor: "rgba(255,255,255,0.2)",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
              {headerStatus}
            </Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ gap: 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAssignment();
            }}
            tintColor={isDark ? "#fff" : Colors.primary}
            colors={[Colors.primary]}
            progressBackgroundColor={isDark ? "#334155" : "#fff"}
          />
        }
      >
        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          {/* ── Job summary ── */}
          <AssignedJobCard
            serviceName={b.service_name}
            spaceType={b.space_type}
            serviceDate={b.service_date}
            serviceTime={b.service_time}
            basePrice={b.base_price}
            propertySqm={b.property_sqm}
            durationHours={b.duration_hours}
            addressUnit={b.address_unit}
            addressStreet={b.address_street}
            addressCity={b.address_city}
            paymentMethod={b.payment_method}
            customer={b.customer}
            bookedAt={b.created_at}
            serviceLatLng={
              b.service_lat && b.service_lng
                ? { lat: b.service_lat, lng: b.service_lng }
                : null
            }
            onMapPress={() => setShowMapModal(true)}
          />

          {/* ── Completion success card ── */}
          {completed && (
            <View
              style={{
                backgroundColor: "#16a34a",
                borderRadius: 20,
                padding: 24,
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="check" size={32} color="#fff" />
              </View>
              <Text
                style={{ fontSize: 22, fontWeight: "800", color: "#fff" }}
              >
                Job Completed!
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.8)",
                  textAlign: "center",
                }}
              >
                Great work! The customer has been notified.
              </Text>
              {completedAt && (
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.15)",
                    borderRadius: 99,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "rgba(255,255,255,0.9)",
                    }}
                  >
                    Completed at{" "}
                    {completedAt.toLocaleTimeString("en-PH", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}


          {b.special_notes ? (
            <View
              style={{
                backgroundColor: C.white,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: C.border,
                padding: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: C.textSecondary,
                  marginBottom: 6,
                }}
              >
                Special Notes
              </Text>
              <Text
                style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}
              >
                {b.special_notes}
              </Text>
            </View>
          ) : null}

          {/* ── Step 1: Swipe to Start Trip ── */}
          {!tripStarted && !completed && (
            <SwipeSlider
              label="Swipe to Start Trip"
              color="#1d4ed8"
              icon="navigation"
              onComplete={startTrip}
            />
          )}

          {/* ── Step 2: On the Way → I've Arrived ── */}
          {tripStarted && !arrived && !completed && (
            <View style={{ gap: 12 }}>
              <View
                style={{
                  backgroundColor: "#eff6ff",
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#bfdbfe",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "#dbeafe",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="navigation" size={18} color="#1d4ed8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: "#1e3a8a",
                    }}
                  >
                    On the Way
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#3b82f6",
                      marginTop: 2,
                      lineHeight: 17,
                    }}
                  >
                    Head to the service address. Tap below when you arrive.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={markArrived}
                disabled={locating}
                style={{
                  backgroundColor: Colors.primary,
                  borderRadius: 14,
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: locating ? 0.7 : 1,
                }}
              >
                {locating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="map-pin" size={18} color="#fff" />
                    <Text
                      style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                    >
                      I've Arrived at Location
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 3: Swipe to Complete ── */}
          {/* ── Step 4: Swipe to Collect Cash (cash only) ── */}
          {arrived && !completed && (
            <View style={{ gap: 12 }}>
              {!jobMarkedComplete ? (
                <SwipeSlider
                  label="Swipe to Complete Job"
                  color="#16a34a"
                  icon="chevrons-right"
                  disabled={updating}
                  onComplete={completeJob}
                />
              ) : b.payment_method === "cash" && !cashCollected ? (
                <>
                  <View
                    style={{
                      backgroundColor: "#f0fdf4",
                      borderRadius: 12,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      borderWidth: 1,
                      borderColor: "#86efac",
                    }}
                  >
                    <Feather name="check-circle" size={16} color="#16a34a" />
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#15803d",
                        fontWeight: "600",
                        flex: 1,
                      }}
                    >
                      Job completed! Now collect cash from the customer.
                    </Text>
                  </View>
                  <SwipeSlider
                    label={`Swipe to Collect ₱${Number(b.base_price).toLocaleString()}`}
                    color="#f59e0b"
                    icon="dollar-sign"
                    disabled={updating}
                    onComplete={collectCash}
                  />
                </>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      {b.service_lat && b.service_lng && (
        <JobLocationModal
          visible={showMapModal}
          coord={{ latitude: b.service_lat, longitude: b.service_lng }}
          address={fullAddress !== "—" ? fullAddress : undefined}
          serviceLabel={b.service_name ?? "Service Location"}
          showDirections
          onClose={() => setShowMapModal(false)}
        />
      )}
    </View>
  );
}
