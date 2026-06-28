-- ─────────────────────────────────────────────────────────────────────────────
-- Table: services
-- Admin-managed service catalog. Mobile app reads this; web admin does CRUD.
-- Images stored in the `service-images` storage bucket (public).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists services (
  id                    uuid        primary key default gen_random_uuid(),
  slug                  text        unique not null,
  name                  text        not null,
  category              text        not null,
  category_icon         text        not null default 'layers',
  description           text        not null,
  full_description      text        not null,
  image_url             text,                          -- nullable; app uses bundled fallback when null
  placeholder_bg        text        not null default '#fce7f3',
  placeholder_icon      text        not null default 'layers',
  placeholder_icon_color text       not null default '#db2777',
  accent_color          text        not null default '#db2777',
  duration_label        text        not null,          -- e.g. "1–2 hrs"
  starting_price        integer     not null,          -- in PHP pesos, whole number
  service_type          text        not null,          -- maps to ServiceType enum on mobile
  is_active             boolean     not null default true,
  display_order         integer     not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_services_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger services_updated_at
  before update on services
  for each row execute function update_services_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table services enable row level security;

-- Anyone (including unauthenticated) can read active services
create policy "Public can read active services"
  on services for select
  using (is_active = true);

-- Only super_admin and branch_manager can modify
create policy "Admins can manage services"
  on services for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('super_admin', 'branch_manager')
    )
  );

-- ── Seed data ─────────────────────────────────────────────────────────────────

insert into services
  (slug, name, category, category_icon, description, full_description,
   placeholder_bg, placeholder_icon, placeholder_icon_color, accent_color,
   duration_label, starting_price, service_type, display_order)
values

-- Deep Cleaning
('mattress_deep_cleaning',
 'Mattress Deep Cleaning', 'Deep Cleaning', 'layers',
 'Removes dust mites, stains, and allergens from your mattress.',
 'Our mattress deep cleaning service uses professional-grade hot-water extraction and UV sanitation to eliminate dust mites, bacteria, allergens, and stubborn stains. Your mattress is left fresh, sanitized, and dry within hours — giving you a healthier sleep environment.',
 '#fce7f3', 'layers', '#db2777', '#db2777', '1–2 hrs', 800, 'deep_cleaning', 1),

('sofa_couch_deep_cleaning',
 'Sofa / Couch Cleaning', 'Deep Cleaning', 'layers',
 'Deep extraction cleaning for all sofa and couch types.',
 'We use hot-water extraction and fabric-safe cleaning solutions to deep clean your sofa, sectionals, and upholstered chairs. Removes embedded dirt, pet hair, odors, and stains — restoring your furniture to its original freshness.',
 '#fff7ed', 'layers', '#ea580c', '#ea580c', '1–2 hrs', 800, 'deep_cleaning', 2),

('carpet_cleaning',
 'Carpet Cleaning', 'Deep Cleaning', 'grid',
 'Hot-water extraction and stain treatment for carpets.',
 'Professional hot-water extraction removes ground-in dirt, allergens, and stubborn stains from all types of carpets. Our process leaves carpets thoroughly cleaned and deodorized, with minimal dry time so you can get back to normal quickly.',
 '#f0fdf4', 'grid', '#22c55e', '#22c55e', '2–3 hrs', 900, 'general', 3),

('curtain_dry_cleaning',
 'Curtain Dry Cleaning', 'Deep Cleaning', 'wind',
 'On-site dry cleaning that freshens and sanitizes curtains.',
 'Our on-site curtain dry cleaning service removes dust, odors, and bacteria from your curtains without taking them down. We use specialized dry-cleaning solutions that are safe for all fabric types, leaving your curtains fresh, bright, and allergen-free.',
 '#eff6ff', 'wind', '#3b82f6', '#3b82f6', '1–2 hrs', 700, 'general', 4),

-- Aircon Services
('aircon_cleaning',
 'Aircon Cleaning', 'Aircon Services', 'wind',
 'Coil wash and blower cleaning for optimal cooling performance.',
 'Regular aircon cleaning extends the lifespan of your unit and improves energy efficiency. Our technicians perform coil washing, blower cleaning, and drain line flushing to restore your aircon''s cooling performance and improve indoor air quality.',
 '#e0f2fe', 'wind', '#0891b2', '#0891b2', '1–2 hrs', 600, 'general', 10),

('aircon_freon_charging',
 'Aircon Freon Charging', 'Aircon Services', 'zap',
 'Refrigerant recharge to restore your aircon''s cooling power.',
 'Low refrigerant is a common cause of poor cooling. Our certified technicians will check for leaks, repair if needed, and recharge your unit with the correct refrigerant type and amount — restoring full cooling performance.',
 '#dbeafe', 'zap', '#1d4ed8', '#1d4ed8', '1–2 hrs', 800, 'general', 11),

('aircon_repair',
 'Aircon Repair', 'Aircon Services', 'tool',
 'Diagnosis and repair for common aircon faults and malfunctions.',
 'From faulty thermostats to compressor issues, our technicians diagnose and fix common aircon problems on-site. We carry common replacement parts to minimize downtime and get your unit running again as quickly as possible.',
 '#fff1f2', 'tool', '#e11d48', '#e11d48', '1–3 hrs', 1000, 'general', 12),

-- Grease Trap
('grease_trap_cleaning',
 'Grease Trap Cleaning', 'Grease Trap', 'droplet',
 'High-pressure cleaning for commercial grease traps and interceptors.',
 'Clogged grease traps cause foul odors and compliance violations. Our team performs thorough high-pressure cleaning and waste removal to keep your grease trap functioning properly and your kitchen compliant with health and sanitation standards.',
 '#fef3c7', 'droplet', '#d97706', '#d97706', '2–4 hrs', 1500, 'general', 20),

('grease_trap_installation',
 'Grease Trap Installation', 'Grease Trap', 'tool',
 'Professional installation of grease traps for kitchens and restaurants.',
 'We supply and install the right grease trap size for your commercial kitchen or restaurant, ensuring proper placement and connection to your drainage system. All installations meet local plumbing and environmental codes.',
 '#fef3c7', 'tool', '#b45309', '#b45309', '3–5 hrs', 2500, 'general', 21),

-- General Cleaning
('house_cleaning',
 'House Cleaning', 'General Cleaning', 'home',
 'Thorough cleaning for houses, townhouses, and residential properties.',
 'Our professional house cleaning covers all rooms — living areas, bedrooms, kitchen, and bathrooms. We dust, vacuum, mop, wipe surfaces, and sanitize key areas to leave your home spotless and fresh.',
 '#fce7f3', 'home', '#db2777', '#db2777', '3–5 hrs', 1500, 'general', 30),

('condo_cleaning',
 'Condo Cleaning', 'General Cleaning', 'square',
 'Efficient cleaning tailored for condominiums and studio units.',
 'Specialized cleaning service for condos and studio units. We work efficiently in smaller spaces, covering all surfaces, appliances, bathrooms, and floors — making your condo feel hotel-fresh after every session.',
 '#eff6ff', 'square', '#3b82f6', '#3b82f6', '2–4 hrs', 1200, 'general', 31),

('office_cleaning',
 'Office Cleaning', 'General Cleaning', 'briefcase',
 'Professional cleaning for offices, workspaces, and business premises.',
 'Keep your workplace clean, healthy, and professional. We clean desks, floors, pantries, restrooms, and common areas — using commercial-grade supplies that meet workplace hygiene standards.',
 '#f0fdf4', 'briefcase', '#16a34a', '#16a34a', '2–4 hrs', 1200, 'general', 32),

('commercial_cleaning',
 'Commercial Cleaning', 'General Cleaning', 'package',
 'Comprehensive cleaning for commercial establishments and large spaces.',
 'Large-scale cleaning for commercial spaces including shops, warehouses, event venues, and establishments. Our crew handles high-traffic areas, deep floor cleaning, and comprehensive sanitization to keep your business ready for customers.',
 '#fff7ed', 'package', '#ea580c', '#ea580c', '3–5 hrs', 1500, 'general', 33)

on conflict (slug) do nothing;
