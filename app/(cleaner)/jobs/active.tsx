import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
  Platform,
  Image,
} from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
} from "react-native-maps";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { Colors } from "@/constants/colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useTheme } from "@/context/ThemeContext";
import AppHeader from "@/components/AppHeader";
import { getService } from "@/constants/services";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "Bank Transfer",
  bank_check: "Bank Check",
}

const SPACE_LABELS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  condo: "Condo",
  office: "Office",
}

type JobInfo = {
  assignmentId: string;
  bookingId: string;
  service_name: string | null;
  service_slug: string | null;
  service_date: string;
  service_time: string;
  property_sqm: number;
  space_type: string | null;
  duration_hours: number | null;
  required_cleaners: number;
  sofa_seaters: number | null;
  other_furniture: string | null;
  base_price: number;
  address_unit: string | null;
  address_street: string | null;
  address_barangay: string | null;
  address_city: string | null;
  address_province: string | null;
  service_lat: number | null;
  service_lng: number | null;
  special_notes: string | null;
  booking_status: string;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  furniture_images: string[] | null;
  started_at: string | null;
  customer_name: string | null;
  customer_id: string | null;
};

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

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function isStartAllowed(serviceDate: string, serviceTime: string): boolean {
  const now = new Date();
  const [year, month, day] = serviceDate.split("-").map(Number);
  const [hours, minutes] = serviceTime.split(":").map(Number);
  const serviceDay = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() !== serviceDay.getTime()) return false;
  const serviceDateTime = new Date(year, month - 1, day, hours, minutes, 0);
  return now >= new Date(serviceDateTime.getTime() - 60 * 60 * 1000);
}
function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

export default function ActiveJobScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const router = useRouter();
  const C = useThemeColors();
  const { isDark } = useTheme();

  const [job, setJob] = useState<JobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [withinRange, setWithinRange] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cashCollected, setCashCollected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [locationTagged, setLocationTagged] = useState(false);
  const [taggingLocation, setTaggingLocation] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const startMsRef = useRef<number | null>(null);

  useEffect(() => {
    loadJob();
  }, [assignmentId]);

  useEffect(() => {
    if (!arrived) return;
    if (startMsRef.current === null) startMsRef.current = Date.now();
    setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMsRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [arrived]);

  async function loadJob() {
    const { data } = await supabase
      .from("cleaner_assignments")
      .select(
        `
        id, booking_id, status,
        bookings (
          service_name, service_slug, service_date, service_time, property_sqm,
          space_type, duration_hours, required_cleaners, sofa_seaters, other_furniture,
          base_price, address_unit, address_street, address_barangay, address_city, address_province,
          service_lat, service_lng, special_notes, status,
          payment_method, payment_status, payment_reference, furniture_images, started_at, customer_id,
          customer:profiles!customer_id(full_name)
        )
      `,
      )
      .eq("id", assignmentId)
      .single();

    if (data?.bookings) {
      const b = data.bookings as any;
      const isInProgress = b.status === "in_progress";
      const isCompleted = b.status === "completed";
      if (isInProgress && b.started_at) {
        startMsRef.current = new Date(b.started_at).getTime();
      }
      if (isCompleted) {
        setCompleted(true);
        setCompletedAt(new Date());
      }
      setJob({
        assignmentId,
        bookingId: data.booking_id,
        service_name: b.service_name ?? null,
        service_slug: b.service_slug ?? null,
        service_date: b.service_date,
        service_time: b.service_time,
        property_sqm: b.property_sqm,
        space_type: b.space_type ?? null,
        duration_hours: b.duration_hours ?? null,
        required_cleaners: b.required_cleaners ?? 1,
        sofa_seaters: b.sofa_seaters ?? null,
        other_furniture: b.other_furniture ?? null,
        base_price: b.base_price,
        address_unit: b.address_unit,
        address_street: b.address_street,
        address_barangay: b.address_barangay ?? null,
        address_city: b.address_city,
        address_province: b.address_province,
        service_lat: b.service_lat,
        service_lng: b.service_lng,
        special_notes: b.special_notes,
        booking_status: b.status,
        payment_method: b.payment_method ?? "",
        payment_status: b.payment_status ?? "unpaid",
        payment_reference: b.payment_reference ?? null,
        furniture_images: b.furniture_images ?? null,
        started_at: b.started_at ?? null,
        customer_name: b.customer?.full_name ?? null,
        customer_id: b.customer_id ?? null,
      });
      if (isInProgress) setArrived(true);
      if (b.payment_status === "paid") setCashCollected(true);
    }
    setLoading(false);
    setRefreshing(false);
  }

  async function tagStartingLocation() {
    setTaggingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Location access is required to tag your starting location.",
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("profiles")
        .update({
          home_lat: loc.coords.latitude,
          home_lng: loc.coords.longitude,
        })
        .eq("id", user.id);
      setLocationTagged(true);
      Alert.alert(
        "Location Tagged",
        "Your starting location has been saved. Head to the service address when ready.",
      );
    } catch {
      Alert.alert("Error", "Could not get your location. Please try again.");
    } finally {
      setTaggingLocation(false);
    }
  }

  async function checkArrival() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Location access is required to verify arrival.",
        );
        setLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const cleanerLat = loc.coords.latitude;
      const cleanerLng = loc.coords.longitude;

      if (job?.service_lat && job?.service_lng) {
        const dist = haversineDistance(
          cleanerLat,
          cleanerLng,
          job.service_lat,
          job.service_lng,
        );
        setDistance(Math.round(dist));
        setWithinRange(dist <= ARRIVAL_RADIUS_METERS);
        if (dist > ARRIVAL_RADIUS_METERS) {
          Alert.alert(
            "Not at location",
            `You are ${Math.round(dist)}m away from the service address. You must be within ${ARRIVAL_RADIUS_METERS}m to confirm arrival.`,
          );
        }
      } else {
        setWithinRange(true);
      }
    } catch {
      Alert.alert("Error", "Could not get your location. Please try again.");
    }
    setLocating(false);
  }

  async function confirmArrival() {
    setUpdating(true);
    try {
      const now = new Date().toISOString();
      startMsRef.current = Date.now();

      const { error: bookingErr, data: bookingData } = await supabase
        .from("bookings")
        .update({ status: "in_progress", started_at: now })
        .eq("id", job!.bookingId)
        .select();

      console.log("[confirmArrival] booking update result:", {
        bookingData,
        bookingErr,
      });

      if (bookingErr) throw bookingErr;

      if (job?.customer_id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let cleanerFirst = "Your cleaner";
        if (user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();
          if (prof?.full_name) cleanerFirst = prof.full_name.split(" ")[0];
        }
        await supabase.from("notifications").insert({
          user_id: job.customer_id,
          title: "Cleaner Has Arrived",
          body: `${cleanerFirst} is now at your location and has started the service.`,
          type: "info",
        });
      }

      setArrived(true);
      setJob((prev) =>
        prev
          ? { ...prev, booking_status: "in_progress", started_at: now }
          : prev,
      );
      Alert.alert(
        "Job Started!",
        "Arrival confirmed. The customer has been notified and your timer is running.",
      );
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message ?? "Could not start the job. Please try again.",
      );
    } finally {
      setUpdating(false);
    }
  }

  async function collectCash() {
    Alert.alert(
      "Collect Cash",
      `Confirm you received ₱${Number(job?.base_price).toLocaleString()} from the customer?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Collection",
          onPress: async () => {
            setUpdating(true);
            const { error } = await supabase
              .from("bookings")
              .update({ payment_status: "paid" })
              .eq("id", job!.bookingId);
            setUpdating(false);
            if (error) {
              Alert.alert(
                "Error",
                "Could not record payment. Please try again.",
              );
              return;
            }
            setCashCollected(true);
            setJob((prev) =>
              prev ? { ...prev, payment_status: "paid" } : prev,
            );
            Alert.alert(
              "Cash Collected",
              "Payment has been marked as collected.",
            );
          },
        },
      ],
    );
  }

  async function completeJob() {
    if (job?.payment_method === "cash" && !cashCollected) {
      Alert.alert(
        "Cash Not Collected",
        "Please collect the cash payment before marking this job as completed.",
        [{ text: "OK" }],
      );
      return;
    }
    Alert.alert(
      "Complete Job",
      "Are you sure you want to mark this job as completed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            setUpdating(true);
            const bookingUpdate: Record<string, string> = {
              status: "completed",
            };
            if (job!.payment_method === "cash")
              bookingUpdate.payment_status = "paid";
            const [bookingRes, assignmentRes] = await Promise.all([
              supabase
                .from("bookings")
                .update(bookingUpdate)
                .eq("id", job!.bookingId)
                .select(),
              supabase
                .from("cleaner_assignments")
                .update({ status: "completed" })
                .eq("id", assignmentId)
                .select(),
            ]);
            console.log("[completeJob] bookingId:", job!.bookingId);
            console.log("[completeJob] booking update:", {
              data: bookingRes.data,
              error: bookingRes.error,
            });
            console.log("[completeJob] assignment update:", {
              data: assignmentRes.data,
              error: assignmentRes.error,
            });
            if (bookingRes.error || assignmentRes.error) {
              setUpdating(false);
              Alert.alert(
                "Error",
                bookingRes.error?.message ??
                  assignmentRes.error?.message ??
                  "Could not complete job.",
              );
              return;
            }
            if (job?.customer_id) {
              try {
                await supabase.from("notifications").insert({
                  user_id: job.customer_id,
                  title: "Service Completed",
                  body: `Your ${job.service_name ?? "cleaning service"} has been completed. Please leave a review!`,
                  type: "info",
                });
              } catch {}
            }
            setCompleted(true);
            setCompletedAt(new Date());
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    booking_status: "completed",
                    ...(job!.payment_method === "cash" && {
                      payment_status: "paid",
                    }),
                  }
                : prev,
            );
            setUpdating(false);
          },
        },
      ],
    );
  }

  function openMaps() {
    if (!job) return;
    const address = [
      job.address_unit,
      job.address_street,
      job.address_city,
      job.address_province,
    ]
      .filter(Boolean)
      .join(", ");
    let url: string;
    if (job.service_lat && job.service_lng) {
      url =
        Platform.OS === "ios"
          ? `maps://?daddr=${job.service_lat},${job.service_lng}`
          : `https://www.google.com/maps/dir/?api=1&destination=${job.service_lat},${job.service_lng}`;
    } else {
      url =
        Platform.OS === "ios"
          ? `maps://?daddr=${encodeURIComponent(address)}`
          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    }
    Linking.openURL(url);
  }

  const svcDef = job ? getService(job.service_slug ?? "") : undefined;
  const canStart = job ? isStartAllowed(job.service_date, job.service_time) : false;

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

  if (completed && job) {
    const completedTimeStr = completedAt
      ? completedAt.toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : null;
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <AppHeader
          showBack={false}
          title="Job Completed"
          subtitle={job.service_name ?? "Cleaning Service"}
          hideBell
          backgroundColor="#16a34a"
        />
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Success hero */}
          <View
            style={{
              backgroundColor: "#16a34a",
              borderRadius: 24,
              padding: 32,
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "rgba(255,255,255,0.2)",
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.4)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="check" size={40} color="#fff" />
            </View>
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: "#fff",
                letterSpacing: -0.5,
              }}
            >
              Great Work!
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.8)",
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              This job has been marked as completed.{"\n"}The customer has been
              notified.
            </Text>
            {completedTimeStr && (
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  borderRadius: 99,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  Completed at {completedTimeStr}
                </Text>
              </View>
            )}
          </View>

          {/* Waiting for review */}
          <View
            style={{
              backgroundColor: C.white,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#fde68a",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                backgroundColor: "#fffbeb",
                paddingHorizontal: 18,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#fde68a",
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: "#f59e0b20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="star" size={20} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 15, fontWeight: "800", color: "#92400e" }}
                >
                  Waiting for Customer Review
                </Text>
                <Text style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                  The customer can now rate your service
                </Text>
              </View>
            </View>
            <View style={{ padding: 18, gap: 10 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Feather key={n} name="star" size={22} color="#fde68a" />
                ))}
              </View>
              <Text
                style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}
              >
                Your rating will appear on your profile once the customer
                submits their review. Great service leads to better job offers!
              </Text>
            </View>
          </View>

          {/* Job summary */}
          <View
            style={{
              backgroundColor: C.white,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: C.border,
              overflow: "hidden",
            }}
          >
            {svcDef?.image ? (
              <Image source={svcDef.image} style={{ width: "100%", height: 130 }} resizeMode="cover" />
            ) : (
              <View style={{ width: "100%", height: 70, backgroundColor: svcDef?.placeholderBg ?? "#fce7f3", alignItems: "center", justifyContent: "center" }}>
                <Feather name={(svcDef?.placeholderIcon ?? "home") as any} size={24} color={svcDef?.placeholderIconColor ?? Colors.primary} style={{ opacity: 0.55 }} />
              </View>
            )}
            <View
              style={{
                backgroundColor: C.background,
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: C.borderLight,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: C.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                Job Summary
              </Text>
            </View>
            <View style={{ padding: 18, gap: 12 }}>
              {([
                { label: "Service", value: job.service_name ?? "Cleaning Service" },
                { label: "Date", value: formatDate(job.service_date) },
                { label: "Time", value: formatTime(job.service_time) },
                { label: "Property", value: `${job.property_sqm} sqm` },
                job.space_type ? { label: "Space Type", value: SPACE_LABELS[job.space_type] ?? job.space_type } : null,
                job.duration_hours ? { label: "Duration", value: `~${job.duration_hours}h` } : null,
                job.required_cleaners > 1 ? { label: "Cleaners", value: `${job.required_cleaners} cleaners` } : null,
                { label: "Customer", value: job.customer_name ?? "—" },
                { label: "Payment", value: `₱${Number(job.base_price).toLocaleString()} · ${PAYMENT_LABELS[job.payment_method] ?? job.payment_method}` },
                { label: "Pay Status", value: job.payment_status === "paid" ? "Paid ✓" : "Unpaid" },
                job.payment_reference ? { label: "Reference", value: job.payment_reference } : null,
              ] as ({ label: string; value: string } | null)[])
                .filter(Boolean)
                .map((row) => (
                  <View
                    key={row!.label}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, color: C.textSecondary }}>{row!.label}</Text>
                    <Text
                      style={{
                        fontSize: 13, fontWeight: "700",
                        color: row!.label === "Pay Status"
                          ? (job.payment_status === "paid" ? "#16a34a" : "#d97706")
                          : C.text,
                        maxWidth: "60%", textAlign: "right",
                      }}
                    >
                      {row!.value}
                    </Text>
                  </View>
                ))}
            </View>
          </View>

          {/* Back to jobs */}
          <TouchableOpacity
            onPress={() => router.replace("/(cleaner)/jobs")}
            style={{
              backgroundColor: Colors.primary,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Feather name="briefcase" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              Back to My Jobs
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (!job) {
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

  const fullAddress =
    [
      job.address_unit,
      job.address_street,
      job.address_barangay,
      job.address_city,
      job.address_province,
    ]
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppHeader
        showBack
        onBackPress={() => router.back()}
        title={arrived ? "Active Job" : "Start Job"}
        subtitle={job.service_name ?? "Cleaning Service"}
        hideBell
        backgroundColor={arrived ? "#7c3aed" : undefined}
        rightContent={
          arrived ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 99,
                backgroundColor: "#ffffff30",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
                In Progress
              </Text>
            </View>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadJob();
            }}
            tintColor={isDark ? "#ffffff" : Colors.primary}
            colors={isDark ? ["#ffffff"] : [Colors.primary]}
            progressBackgroundColor={isDark ? "#334155" : "#ffffff"}
          />
        }
      >
        {/* Live timer — always purple, intentional branding */}
        {arrived && (
          <View
            style={{
              backgroundColor: "#7c3aed",
              borderRadius: 16,
              padding: 20,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#ede9fe",
                fontSize: 12,
                fontWeight: "600",
                marginBottom: 4,
                letterSpacing: 1,
              }}
            >
              TIME ELAPSED
            </Text>
            <Text
              style={{
                color: "#fff",
                fontSize: 44,
                fontWeight: "800",
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatElapsed(elapsed)}
            </Text>
            {job.customer_name && (
              <Text style={{ color: "#ddd6fe", fontSize: 13, marginTop: 8 }}>
                Customer: {job.customer_name}
              </Text>
            )}
          </View>
        )}

        {/* Job details */}
        <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
          {svcDef?.image ? (
            <Image source={svcDef.image} style={{ width: "100%", height: 120 }} resizeMode="cover" />
          ) : (
            <View style={{ width: "100%", height: 70, backgroundColor: svcDef?.placeholderBg ?? "#fce7f3", alignItems: "center", justifyContent: "center" }}>
              <Feather name={(svcDef?.placeholderIcon ?? "home") as any} size={24} color={svcDef?.placeholderIconColor ?? Colors.primary} style={{ opacity: 0.55 }} />
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: C.text }}>
                {job.service_name ?? "Cleaning Service"}
              </Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 3 }}>
                {formatDate(job.service_date)} · {formatTime(job.service_time)}
              </Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.primary }}>
              ₱{Number(job.base_price).toLocaleString()}
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: C.borderLight, marginHorizontal: 16 }} />
          <View style={{ padding: 14, gap: 10 }}>
            {([
              { icon: "maximize", label: "Property", value: `${job.property_sqm} sqm` },
              job.space_type ? { icon: "home", label: "Space Type", value: SPACE_LABELS[job.space_type] ?? job.space_type } : null,
              job.duration_hours ? { icon: "clock", label: "Est. Duration", value: `~${job.duration_hours}h` } : null,
              job.required_cleaners > 1 ? { icon: "users", label: "Cleaners Needed", value: `${job.required_cleaners} cleaners` } : null,
              job.sofa_seaters ? { icon: "layers", label: "Sofa Seaters", value: `${job.sofa_seaters} seaters` } : null,
              job.customer_name ? { icon: "user", label: "Customer", value: job.customer_name } : null,
              job.other_furniture ? { icon: "package", label: "Other Items", value: job.other_furniture } : null,
            ] as ({ icon: string; label: string; value: string } | null)[])
              .filter(Boolean)
              .map((row) => (
                <View key={row!.label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Feather name={row!.icon as any} size={13} color={C.textMuted} />
                  <Text style={{ fontSize: 13, color: C.textSecondary, flex: 1 }}>{row!.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.text, maxWidth: "55%", textAlign: "right" }}>{row!.value}</Text>
                </View>
              ))}
          </View>
        </View>

        {/* Payment */}
        <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.background, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
            <Feather name="credit-card" size={13} color={C.textSecondary} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 }}>Payment</Text>
          </View>
          <View style={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="dollar-sign" size={13} color={C.textMuted} />
              <Text style={{ fontSize: 13, color: C.textSecondary, flex: 1 }}>Method</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }}>{PAYMENT_LABELS[job.payment_method] ?? job.payment_method}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="check-circle" size={13} color={C.textMuted} />
              <Text style={{ fontSize: 13, color: C.textSecondary, flex: 1 }}>Status</Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, backgroundColor: job.payment_status === "paid" ? "#dcfce7" : "#fef3c7" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: job.payment_status === "paid" ? "#16a34a" : "#d97706" }}>
                  {job.payment_status === "paid" ? "Paid" : "Unpaid"}
                </Text>
              </View>
            </View>
            {job.payment_reference ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="hash" size={13} color={C.textMuted} />
                <Text style={{ fontSize: 13, color: C.textSecondary, flex: 1 }}>Reference</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>{job.payment_reference}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Furniture photos */}
        {(job.furniture_images ?? []).length > 0 && (
          <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.background, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
              <Feather name="image" size={13} color={C.textSecondary} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Furniture Photos ({job.furniture_images!.length})
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 10 }} nestedScrollEnabled>
              {job.furniture_images!.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={{ width: 110, height: 110, borderRadius: 12 }} resizeMode="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Address + Map */}
        <View
          style={{
            backgroundColor: C.white,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.border,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: C.background,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: C.border,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: C.textSecondary,
              }}
            >
              Service Location
            </Text>
            <TouchableOpacity
              onPress={openMaps}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Feather name="navigation" size={13} color={Colors.primary} />
              <Text
                style={{
                  fontSize: 13,
                  color: Colors.primary,
                  fontWeight: "600",
                }}
              >
                Get Directions
              </Text>
            </TouchableOpacity>
          </View>

          {job.service_lat && job.service_lng ? (
            <MapView
              provider={
                Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT
              }
              style={{ height: 160 }}
              region={{
                latitude: job.service_lat,
                longitude: job.service_lng,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: job.service_lat,
                  longitude: job.service_lng,
                }}
                pinColor={Colors.primary}
              />
            </MapView>
          ) : null}

          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 14, color: C.text, lineHeight: 20 }}>
              {fullAddress}
            </Text>
            {job.service_lat && (
              <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                GPS: {job.service_lat.toFixed(5)}, {job.service_lng!.toFixed(5)}
              </Text>
            )}
          </View>
        </View>

        {/* ── Job start guide — 2-step geo-tag flow ── */}
        {!arrived && (
          <View style={{ gap: 12 }}>
            {!canStart ? (
              /* ── Locked: not yet within 1 hour of service time ── */
              <View
                style={{
                  backgroundColor: C.white,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    backgroundColor: "#f3f4f6",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "#e5e7eb",
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: "#e5e7eb",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="lock" size={18} color="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#374151" }}>
                      Job Start Locked
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      Available 1 hour before your scheduled time
                    </Text>
                  </View>
                </View>
                <View style={{ padding: 16, gap: 12 }}>
                  <View
                    style={{
                      backgroundColor: "#f9fafb",
                      borderRadius: 12,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Feather name="calendar" size={16} color="#6b7280" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        This booking is assigned on
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: "#111827", marginTop: 2 }}>
                        {formatTime(job.service_time)} · {formatDate(job.service_date)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: "#9ca3af", lineHeight: 18, textAlign: "center" }}>
                    The start job steps will unlock 1 hour before the scheduled time on the day of service.
                  </Text>
                </View>
              </View>
            ) : (
              <>
            {/* Guide banner */}
            <View
              style={{
                backgroundColor: "#eff6ff",
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: "#bfdbfe",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <Feather
                name="info"
                size={15}
                color="#1e40af"
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    color: "#1e3a8a",
                    marginBottom: 3,
                  }}
                >
                  How to Start Your Job
                </Text>
                <Text
                  style={{ fontSize: 12, color: "#2563eb", lineHeight: 18 }}
                >
                  Complete both steps in order. Tag your starting location
                  before you leave, then verify arrival once you reach the
                  service address.
                </Text>
              </View>
            </View>

            {/* Step 1 — Tag starting location */}
            <View
              style={{
                backgroundColor: C.white,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1.5,
                borderColor: locationTagged ? "#86efac" : "#bfdbfe",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: locationTagged ? "#86efac" : "#bfdbfe",
                  backgroundColor: locationTagged ? "#f0fdf4" : "#eff6ff",
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: locationTagged ? "#16a34a" : "#1e40af",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {locationTagged ? (
                    <Feather name="check" size={14} color="#fff" />
                  ) : (
                    <Text
                      style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}
                    >
                      1
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: locationTagged ? "#15803d" : "#1e3a8a",
                    }}
                  >
                    Tag Your Starting Location
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: locationTagged ? "#16a34a" : "#3b82f6",
                      marginTop: 1,
                    }}
                  >
                    {locationTagged
                      ? "Done — you're ready to head out"
                      : "Do this before leaving your current location"}
                  </Text>
                </View>
              </View>
              <View style={{ padding: 14, gap: 10 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: C.textSecondary,
                    lineHeight: 18,
                  }}
                >
                  Capture your current GPS so the customer sees an accurate
                  estimated arrival time. Make sure you're still at your
                  starting point when you tap this.
                </Text>
                {locationTagged ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      backgroundColor: "#f0fdf4",
                      borderRadius: 10,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: "#86efac",
                    }}
                  >
                    <Feather name="check-circle" size={15} color="#16a34a" />
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#15803d",
                        fontWeight: "700",
                      }}
                    >
                      Starting location saved
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={tagStartingLocation}
                    disabled={taggingLocation}
                    style={{
                      backgroundColor: "#1e40af",
                      borderRadius: 12,
                      paddingVertical: 13,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: taggingLocation ? 0.7 : 1,
                    }}
                  >
                    {taggingLocation ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="crosshair" size={16} color="#fff" />
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 14,
                          }}
                        >
                          Tag My Starting Location
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Step 2 — Verify arrival */}
            <View
              style={{
                backgroundColor: C.white,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1.5,
                borderColor: withinRange ? "#86efac" : C.border,
                opacity: locationTagged ? 1 : 0.5,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: withinRange ? "#86efac" : C.borderLight,
                  backgroundColor: withinRange ? "#f0fdf4" : C.background,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: withinRange ? "#16a34a" : C.borderLight,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {withinRange ? (
                    <Feather name="check" size={14} color="#fff" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "800",
                        color: C.textMuted,
                      }}
                    >
                      2
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: withinRange ? "#15803d" : C.text,
                    }}
                  >
                    Verify Arrival at Job Site
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: withinRange ? "#16a34a" : C.textSecondary,
                      marginTop: 1,
                    }}
                  >
                    {withinRange
                      ? "Location confirmed — you're within range!"
                      : `Do this when you reach the service address`}
                  </Text>
                </View>
              </View>
              <View style={{ padding: 14, gap: 10 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: C.textSecondary,
                    lineHeight: 18,
                  }}
                >
                  Once you arrive at the service address, tap the button below.
                  You must be within {ARRIVAL_RADIUS_METERS}m to confirm. This
                  starts your job timer and notifies the customer.
                </Text>

                {distance !== null && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      backgroundColor: withinRange ? "#f0fdf4" : "#fef9c3",
                      borderColor: withinRange ? "#86efac" : "#fde68a",
                    }}
                  >
                    <Feather
                      name={withinRange ? "check-circle" : "alert-circle"}
                      size={15}
                      color={withinRange ? "#16a34a" : "#ca8a04"}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: withinRange ? "#15803d" : "#92400e",
                        flex: 1,
                      }}
                    >
                      {withinRange
                        ? `${distance}m from job site — you're within range!`
                        : `${distance}m away — must be within ${ARRIVAL_RADIUS_METERS}m`}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={checkArrival}
                  disabled={locating || !locationTagged}
                  style={{
                    backgroundColor: C.borderLight,
                    borderRadius: 12,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {locating ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <>
                      <Feather
                        name="map-pin"
                        size={16}
                        color={Colors.primary}
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: Colors.primary,
                        }}
                      >
                        {distance === null
                          ? "Check My Arrival Location"
                          : "Re-check My Location"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {withinRange && (
                  <TouchableOpacity
                    onPress={confirmArrival}
                    disabled={updating}
                    style={{
                      backgroundColor: Colors.primary,
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: updating ? 0.7 : 1,
                    }}
                  >
                    {updating ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Feather name="play-circle" size={18} color="#fff" />
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 15,
                          }}
                        >
                          Confirm Arrival & Start Job
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
              </>
            )}
          </View>
        )}

        {job.special_notes && (
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
              {job.special_notes}
            </Text>
          </View>
        )}

        {arrived &&
          job.payment_method === "cash" &&
          (cashCollected ? (
            <View
              style={{
                backgroundColor: "#f0fdf4",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#86efac",
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Feather name="check-circle" size={20} color="#16a34a" />
              <View>
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: "#15803d" }}
                >
                  Cash Collected
                </Text>
                <Text style={{ fontSize: 12, color: "#16a34a", marginTop: 1 }}>
                  ₱{Number(job.base_price).toLocaleString()} received from
                  customer
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={collectCash}
              disabled={updating}
              style={{
                backgroundColor: "#f59e0b",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                opacity: updating ? 0.7 : 1,
              }}
            >
              <Feather name="dollar-sign" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Collect Cash — ₱{Number(job.base_price).toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}

        {arrived && (
          <TouchableOpacity
            onPress={completeJob}
            disabled={updating}
            style={{
              backgroundColor: "#16a34a",
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: updating ? 0.7 : 1,
            }}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="check-circle" size={18} color="#fff" />
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}
                >
                  Mark as Completed
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}
