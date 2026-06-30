# CleanConnect Mobile — Implementation Plan

Mapped directly to the capstone module table. Each item links to the file(s) that implement it.

---

## Module 1: Customer Booking & Interaction

### 1.4 Module 1A — Booking Management Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 1.4.1 | Create booking (user side) — 5-step form: service type, space/sqm, address + GPS, schedule, payment method, review & confirm | `app/(customer)/bookings/new.tsx` | ✅ Done |

### 1.5 Module 1B — Messaging & Support Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 1.5.1 | Chat with admin — real-time complaint thread using Supabase Realtime | `app/(customer)/support/[id].tsx` | ✅ Done |
| 1.5.2 | Submit complaints/support requests — list + new complaint form | `app/(customer)/support/index.tsx`, `app/(customer)/support/new.tsx` | ✅ Done |

### 1.6 Module 1C — Notification Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 1.6.1 | Receive booking confirmations — in-app notifications screen | `app/(customer)/notifications.tsx`, `app/(cleaner)/notifications.tsx` | ✅ Done |
| 1.6.2 | Receive reminders & updates — bell icon on home screen with unread badge | `app/(customer)/index.tsx`, `app/(cleaner)/index.tsx`, both `_layout.tsx` (hidden tab) | ✅ Done |

---

## Module 2: Cleaner Operations

### 2.4 Module 2A — Cleaner Operations Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 2.4.1 | View assigned jobs — list with Offers / Upcoming / Completed tabs | `app/(cleaner)/jobs/index.tsx` | ✅ Done |
| 2.4.2 | Update job status — Accept/Decline on offer; Start trip/Arrived/Complete on job detail | `app/(cleaner)/jobs/[id].tsx` | ✅ Done |

### 2.5 Module 2B — Geo-location & Geo-tagging Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 2.5.1 | Capture service location GPS on booking | `app/(customer)/bookings/new.tsx` (expo-location, saves service_lat/lng) | ✅ Done |
| 2.5.2 | Geo-tag arrival validation — compare cleaner GPS to service_lat/lng, must be within 500m | `app/(cleaner)/jobs/[id].tsx` (haversineDistance check) | ✅ Done |
| 2.5.3 | Navigation to service location — opens map modal with GPS or address | `app/(cleaner)/jobs/[id].tsx` (JobLocationModal) | ✅ Done |

### 2.6 Module 2C — Availability Management Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 2.6.1 | Set availability status — view accepted jobs by date (read-only; day-off optional) | `app/(cleaner)/availability.tsx` | ✅ Done |
| 2.6.2 | Update working schedule — SectionList of upcoming accepted jobs grouped by date | `app/(cleaner)/availability.tsx` | ✅ Done |

---

## Module 3: Payments & Profile

### 3.1 Module 3A — Payment Processing Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 3.1.1 | Online payment (customer) — NO gateway; shows payment method selected + GCash/bank instructions from `settings` table | `app/(customer)/bookings/[id].tsx` | ✅ Done |
| 3.1.2 | Payment confirmation — payment status badge (unpaid / partial / paid) on booking detail and history | `app/(customer)/bookings/[id].tsx`, `app/(customer)/bookings/index.tsx` | ✅ Done |

### 3.2 Module 3B — User Profile Management

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 3.2.1 | Edit profile (customer) — edit full_name and phone, inline in-card editing | `app/(customer)/profile.tsx` | ✅ Done |
| 3.2.2 | Manage personal details (cleaner) — read-only view + job stats; profile changes go through branch manager | `app/(cleaner)/profile.tsx` | ✅ Done |

### 3.3 Module 3C — Booking History Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 3.3.1 | View past bookings — filterable list (All / Pending / Confirmed / In Progress / Completed / Cancelled) | `app/(customer)/bookings/index.tsx` | ✅ Done |
| 3.3.2 | View transaction history — booking detail with payment method, payment status, and GCash/bank instructions | `app/(customer)/bookings/[id].tsx` | ✅ Done |

### 3.4 Module 3D — Rate & Feedback Module

| # | Feature | File(s) | Status |
|---|---------|---------|--------|
| 3.4.1 | Rate cleaners — 1–5 star selector shown after booking is completed | `app/(customer)/bookings/[id].tsx` | ✅ Done |
| 3.4.2 | Submit feedback — comment field + Submit Review → writes to `feedback` table | `app/(customer)/bookings/[id].tsx` | ✅ Done |

---

## Progress Summary

| Module | Done | Total |
|--------|------|-------|
| 1A Booking Management | 1 | 1 |
| 1B Messaging & Support | 2 | 2 |
| 1C Notifications | 0 | 2 |
| 2A Cleaner Operations | 2 | 2 |
| 2B Geo-location | 3 | 3 |
| 2C Availability | 2 | 2 |
| 3A Payment Processing | 2 | 2 |
| 3B Profile Management | 2 | 2 |
| 3C Booking History | 2 | 2 |
| 3D Rate & Feedback | 2 | 2 |
| **Total** | **20** | **20** |

---

## All modules complete. ✅

---

*Last updated: 2026-06-06*
