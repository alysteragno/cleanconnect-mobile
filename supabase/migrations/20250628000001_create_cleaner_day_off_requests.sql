-- Cleaners submit day-off requests; admins approve or reject via the web dashboard.
create table public.cleaner_day_off_requests (
  id             uuid        primary key default gen_random_uuid(),
  cleaner_id     uuid        not null references public.profiles(id) on delete cascade,
  requested_date date        not null,
  status         text        not null default 'pending'
                               check (status in ('pending', 'approved', 'rejected')),
  reason         text        not null,   -- selected category (e.g. "Medical / Health")
  notes          text,                   -- optional free-text from cleaner
  admin_note     text,                   -- admin's response note shown to cleaner
  reviewed_by    uuid        references public.profiles(id) on delete set null,  -- which admin acted
  reviewed_at    timestamptz,            -- when admin approved / rejected
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (cleaner_id, requested_date)
);

-- Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cleaner_day_off_requests_updated_at
  before update on public.cleaner_day_off_requests
  for each row execute function public.set_updated_at();

alter table public.cleaner_day_off_requests enable row level security;

-- Cleaner can read their own requests
create policy "Cleaners can view their own day-off requests"
  on public.cleaner_day_off_requests for select
  to authenticated
  using (auth.uid() = cleaner_id);

-- Cleaner can submit new requests (status must start as pending)
create policy "Cleaners can submit day-off requests"
  on public.cleaner_day_off_requests for insert
  to authenticated
  with check (auth.uid() = cleaner_id and status = 'pending');

-- Cleaner can cancel their own PENDING requests only
create policy "Cleaners can cancel pending day-off requests"
  on public.cleaner_day_off_requests for delete
  to authenticated
  using (auth.uid() = cleaner_id and status = 'pending');

-- Admins / managers can read all requests
create policy "Admins can view all day-off requests"
  on public.cleaner_day_off_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'branch_manager')
    )
  );

-- Admins / managers can approve or reject (sets reviewed_by + reviewed_at on the web)
create policy "Admins can update day-off request status"
  on public.cleaner_day_off_requests for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'branch_manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'branch_manager')
    )
  );
