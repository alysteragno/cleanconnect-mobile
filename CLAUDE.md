@AGENTS.md

# CLAUDE HANDOFF — CleanConnect Mobile

Welcome! You are continuing development of **CleanConnect Mobile**, the iOS/Android companion app for the CleanConnect cleaning service platform built for **Maid For You Cleaning Services** (a BS-IT capstone project at FEU Institute of Technology).

---

## Project Overview

- **Framework:** React Native + Expo (SDK 56), Expo Router (file-based routing)
- **Styling:** NativeWind v4 + Tailwind CSS v3
- **Backend:** Supabase (same project as web — shared DB, Auth, RLS)
- **Language:** TypeScript throughout
- **Repo:** `cleanconnect-mobile` (separate from `cleanconnect-web`)

The web app (`cleanconnect-web`) handles all admin/manager operations. The mobile app serves **customers** and **cleaners** only.

---

## Supabase Connection

Same Supabase project as the web. Credentials are in `.env` (gitignored):
```
EXPO_PUBLIC_SUPABASE_URL=https://swpkivehbqugxzsijujq.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```
Client is at `lib/supabase.ts`. Uses `AsyncStorage` for session persistence.

---

## Current State

### Done (initial setup commit)
- Expo Router + NativeWind + Supabase fully configured
- `lib/supabase.ts` — Supabase client
- `constants/colors.ts` — Pink/gray color palette (matches web exactly)
- `constants/types.ts` — Shared TypeScript types (Booking, Profile, enums)
- `app/_layout.tsx` — Root layout: watches auth state, redirects by role
- `app/index.tsx` — Redirects to login
- `app/(auth)/login.tsx` — Login with role-based redirect + deactivated account check
- `app/(auth)/register.tsx` — Customer self-registration
- `app/(customer)/_layout.tsx` — 4-tab shell: Home, Bookings, Support, Profile
- `app/(customer)/index.tsx` — Customer home: greeting + recent bookings + Book Now CTA (live data)
- `app/(cleaner)/_layout.tsx` — 4-tab shell: Home, Jobs, Schedule, Profile
- `app/(cleaner)/index.tsx` — Cleaner home: live job offers with accept/decline buttons
- Placeholder screens: customer bookings, support, profile; cleaner jobs, availability, profile

---

## Mobile Checklist (what still needs to be built)

### Module 1: Customer Booking & Interaction

**1A — Booking Management**
- [ ] Multi-step booking form with GPS location capture (`app/(customer)/bookings/new.tsx`)
  - Step 1: Service type, space type, property sqm
  - Step 2: Address + GPS capture (expo-location saves service_lat/lng)
  - Step 3: Schedule (date + time picker)
  - Step 4: Payment method (Cash / GCash / Bank Transfer)
  - Step 5: Review & confirm
- [ ] Booking history list (`app/(customer)/bookings.tsx` — currently placeholder)
- [ ] Booking detail + status tracker (`app/(customer)/bookings/[id].tsx`)

**1B — Messaging & Support**
- [ ] Complaints list (`app/(customer)/support.tsx` — currently placeholder)
- [ ] Complaint detail / chat thread (`app/(customer)/support/[id].tsx`)
- [ ] File new complaint form

**1C — Notifications**
- [ ] Notifications screen (in-app via Supabase Realtime)
- [ ] `expo-notifications` push registration on login

### Module 2: Cleaner Operations

**2A — Cleaner Operations**
- [ ] Job list: offered + accepted/upcoming (`app/(cleaner)/jobs.tsx` — currently placeholder)
- [ ] Job detail page (`app/(cleaner)/jobs/[id].tsx`)
- [ ] Active job flow: GPS arrival check → start → complete (built into `app/(cleaner)/jobs/[id].tsx`, not a separate screen)

**2B — Geo-location & Geo-tagging**
- [ ] Capture service location GPS on customer booking form (saves `service_lat/lng` to DB)
- [ ] Geo-tag arrival validation on active job screen (compare cleaner GPS to service location)
- [ ] Open native Maps app for navigation to service address

**2C — Availability Management** *(revised scope)*
- [ ] View assigned schedule — list of accepted jobs by date (read-only)
- [ ] (Optional) Set day-off if allowed by admin — writes to `cleaner_availability` table

### Module 3: Payments & Profile

**3A — Payment Processing**
- [ ] Show payment instructions on booking confirmation (GCash number / bank details from `settings` table)
- [ ] Payment status shown on booking history and detail
- [ ] No payment gateway — admin verifies manually via web

**3B — User Profile Management**
- [ ] Customer profile edit — update full_name, phone (`app/(customer)/profile.tsx`)
- [ ] Cleaner profile view (`app/(cleaner)/profile.tsx`)

**3C — Booking History**
- [ ] Full booking history list with status filters
- [ ] Booking detail with payment info and assignment info

**3D — Rate & Feedback**
- [ ] Star rating + comment form shown after booking status = 'completed'
- [ ] Writes to `feedback` table: cleaner_id, booking_id, rating (1-5), comment

---

## Key Architecture Decisions

- **No PayMongo / payment gateway** — client's request. Payment method selected at booking, admin verifies manually on web. Show payment instructions from `settings` table.
- **Admin stays web-only** — mobile is customer + cleaner only. If a user logs in with `branch_manager` or `super_admin` role, show an error and sign them out (already handled in login.tsx).
- **Geo coordinates** — `service_lat/lng` on bookings feeds the web AI dispatch engine. Mobile captures these via `expo-location` during booking. Cleaner `home_lat/lng` on profiles is set separately.
- **Module 2C revised** — Cleaners view their assigned schedule (read-only). Day-off setting is optional — only if admin allows it. Writes to `cleaner_availability` table.

---

## Design System

Match the web's visual language exactly:
- Primary: `#db2777` (pink-600) — buttons, active tabs, accents
- Text: `#111827` (gray-900)
- Secondary text: `#6b7280` (gray-500)
- Muted text: `#9ca3af` (gray-400)
- Border: `#e5e7eb` (gray-200)
- Cards: white background, `rounded-2xl`, `border border-gray-100`
- Page background: `#f9fafb` (gray-50)
- Headers: `bg-pink-600` with white text

All colors are in `constants/colors.ts`. Use NativeWind `className` for styling (same as Tailwind on web).

---

## Running the App

```bash
npm start          # starts Expo dev server
# Scan QR with Expo Go on your phone
# Press 'a' for Android emulator (Android Studio must be open)
```

---

## DB Tables Relevant to Mobile

| Table | Used for |
|---|---|
| `profiles` | user profile, role, is_active, phone, home_lat, home_lng |
| `bookings` | all booking fields including service_lat, service_lng |
| `branches` | branch list — needed for branch_id when customer creates a booking |
| `cleaner_assignments` | offered / accepted / declined / completed assignments |
| `cleaner_availability` | cleaner day-offs (unavailable_date) |
| `feedback` | star ratings + comments post-service |
| `notifications` | in-app notifications |
| `complaints` + `complaint_messages` | customer ↔ admin support thread |
| `settings` | payment instructions (GCash number, bank transfer details) |
