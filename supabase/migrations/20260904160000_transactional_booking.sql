begin;

create extension if not exists btree_gist with schema extensions;

alter table public.stores
  add column if not exists business_hours jsonb not null default '{}'::jsonb,
  add column if not exists slot_interval_minutes integer not null default 10,
  add column if not exists minimum_booking_notice_minutes integer not null default 30;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stores'::regclass
      and conname = 'stores_booking_rules_check'
  ) then
    alter table public.stores
      add constraint stores_booking_rules_check check (
        jsonb_typeof(business_hours) = 'object'
        and slot_interval_minutes between 1 and 1440
        and minimum_booking_notice_minutes between 0 and 10080
      );
  end if;
end;
$$;

update public.stores
set
  business_hours = jsonb_build_object(
    '0', jsonb_build_object('start', '09:00', 'end', '11:00'),
    '1', jsonb_build_object('start', '08:00', 'end', '18:00'),
    '2', jsonb_build_object('start', '08:00', 'end', '18:00'),
    '3', jsonb_build_object('start', '08:00', 'end', '18:00'),
    '4', jsonb_build_object('start', '08:00', 'end', '18:00'),
    '5', jsonb_build_object('start', '08:00', 'end', '18:00'),
    '6', jsonb_build_object('start', '09:00', 'end', '18:00')
  ),
  slot_interval_minutes = 10,
  minimum_booking_notice_minutes = 30
where slug = 'kalle-cortes';

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  duration_minutes integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint services_duration_check check (duration_minutes between 1 and 1440)
);

create unique index if not exists services_store_name_uidx
  on public.services (store_id, lower(btrim(name)));

create index if not exists services_store_active_idx
  on public.services (store_id, active);

create or replace function public.set_services_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_services_updated_at() from public, anon, authenticated;

drop trigger if exists set_services_updated_at on public.services;
create trigger set_services_updated_at
before update on public.services
for each row execute function public.set_services_updated_at();

insert into public.services (store_id, name, duration_minutes)
select store.id, service.name, service.duration_minutes
from public.stores as store
cross join (
  values
    ('Corte', 40),
    ('Barba', 20),
    ('Pezinho', 10),
    ('Bigode', 10),
    ('Cavanhaque', 15),
    ('Sobrancelha', 10),
    ('Alisamento', 90),
    ('Luzes', 120),
    ('Nevou', 120),
    ('Pigmentação', 30),
    ('Frisado', 90)
) as service(name, duration_minutes)
where store.slug = 'kalle-cortes'
on conflict do nothing;

alter table public.services enable row level security;

revoke all on table public.services from public, anon, authenticated;
revoke all (id, store_id, name, duration_minutes, active, created_at, updated_at)
  on table public.services from public, anon, authenticated;

grant select on table public.services to anon, authenticated;
grant insert (store_id, name, duration_minutes, active)
  on table public.services to authenticated;
grant update (name, duration_minutes, active)
  on table public.services to authenticated;
grant delete on table public.services to authenticated;

drop policy if exists services_public_read_active on public.services;
drop policy if exists services_admin_read_own_store on public.services;
drop policy if exists services_admin_create_own_store on public.services;
drop policy if exists services_admin_update_own_store on public.services;
drop policy if exists services_admin_remove_own_store on public.services;

create policy services_public_read_active
on public.services
for select
to anon, authenticated
using (
  active = true
  and exists (
    select 1
    from public.stores as store
    where store.id = services.store_id
      and store.active = true
  )
);

create policy services_admin_read_own_store
on public.services
for select
to authenticated
using (store_id = (select public.current_user_store_id()));

create policy services_admin_create_own_store
on public.services
for insert
to authenticated
with check (store_id = (select public.current_user_store_id()));

create policy services_admin_update_own_store
on public.services
for update
to authenticated
using (store_id = (select public.current_user_store_id()))
with check (store_id = (select public.current_user_store_id()));

create policy services_admin_remove_own_store
on public.services
for delete
to authenticated
using (store_id = (select public.current_user_store_id()));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_no_active_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_active_overlap
      exclude using gist (
        store_id with =,
        tsrange(
          appointment_date + appointment_time,
          appointment_date + appointment_time
            + greatest(coalesce(duration_minutes, 60), 1) * interval '1 minute',
          '[)'
        ) with &&
      )
      where (status in ('pending', 'confirmed'));
  end if;
end;
$$;

drop index if exists public.appointments_active_store_date_time_uidx;

create or replace function public.create_public_appointment(
  p_store_slug text,
  p_service_ids uuid[],
  p_appointment_date date,
  p_appointment_time time without time zone,
  p_customer_name text,
  p_customer_phone text
)
returns table (
  appointment_id bigint,
  store_id uuid,
  service text,
  duration_minutes integer,
  appointment_date date,
  appointment_time time without time zone,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  target_timezone text;
  target_business_hours jsonb;
  target_slot_interval integer;
  target_minimum_notice integer;
  day_business_hours jsonb;
  opening_time time without time zone;
  closing_time time without time zone;
  requested_start timestamp without time zone;
  requested_end timestamp without time zone;
  current_store_time timestamp without time zone;
  selected_service_count integer;
  selected_service_names text;
  selected_duration integer;
begin
  if p_store_slug is null or btrim(p_store_slug) = '' then
    raise exception using errcode = 'P0001', message = 'STORE_NOT_FOUND';
  end if;

  select
    store.id,
    store.timezone,
    store.business_hours,
    store.slot_interval_minutes,
    store.minimum_booking_notice_minutes
  into
    target_store_id,
    target_timezone,
    target_business_hours,
    target_slot_interval,
    target_minimum_notice
  from public.stores as store
  where store.slug = p_store_slug
    and store.active = true;

  if target_store_id is null then
    raise exception using errcode = 'P0001', message = 'STORE_NOT_FOUND';
  end if;

  if p_service_ids is null
    or cardinality(p_service_ids) = 0
    or cardinality(p_service_ids) > 20
    or exists (select 1 from unnest(p_service_ids) as requested(id) where requested.id is null)
    or cardinality(p_service_ids) <> (
      select count(distinct requested.id)
      from unnest(p_service_ids) as requested(id)
    )
  then
    raise exception using errcode = 'P0001', message = 'INVALID_SERVICES';
  end if;

  select
    count(*)::integer,
    string_agg(service_item.name, ', ' order by requested.position),
    sum(service_item.duration_minutes)::integer
  into
    selected_service_count,
    selected_service_names,
    selected_duration
  from unnest(p_service_ids) with ordinality as requested(id, position)
  join public.services as service_item
    on service_item.id = requested.id
   and service_item.store_id = target_store_id
   and service_item.active = true;

  if selected_service_count <> cardinality(p_service_ids) then
    raise exception using errcode = 'P0001', message = 'INVALID_SERVICES';
  end if;

  if p_customer_name is null
    or char_length(btrim(p_customer_name)) < 3
  then
    raise exception using errcode = 'P0001', message = 'INVALID_CUSTOMER_NAME';
  end if;

  if p_customer_phone is null
    or p_customer_phone !~ '^[0-9]{10,11}$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_CUSTOMER_PHONE';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception using errcode = 'P0001', message = 'INVALID_APPOINTMENT_TIME';
  end if;

  current_store_time := clock_timestamp() at time zone target_timezone;
  requested_start := p_appointment_date + p_appointment_time;
  requested_end := requested_start + selected_duration * interval '1 minute';

  if p_appointment_date < current_store_time::date
    or requested_start < current_store_time
      + target_minimum_notice * interval '1 minute'
  then
    raise exception using errcode = 'P0001', message = 'BOOKING_NOTICE_REQUIRED';
  end if;

  day_business_hours := target_business_hours
    -> (extract(dow from p_appointment_date)::integer)::text;

  if day_business_hours is null
    or jsonb_typeof(day_business_hours) <> 'object'
    or day_business_hours->>'start' is null
    or day_business_hours->>'end' is null
  then
    raise exception using errcode = 'P0001', message = 'STORE_CLOSED';
  end if;

  opening_time := (day_business_hours->>'start')::time;
  closing_time := (day_business_hours->>'end')::time;

  if p_appointment_time < opening_time
    or requested_end > p_appointment_date + closing_time
    or mod(
      (extract(epoch from (p_appointment_time - opening_time)) / 60)::integer,
      target_slot_interval
    ) <> 0
  then
    raise exception using errcode = 'P0001', message = 'OUTSIDE_BUSINESS_HOURS';
  end if;

  if exists (
    select 1
    from public.schedule_blocks as schedule_block
    where schedule_block.store_id = target_store_id
      and schedule_block.block_date = p_appointment_date
      and (
        schedule_block.all_day = true
        or (
          schedule_block.all_day = false
          and schedule_block.start_time < requested_end::time
          and schedule_block.end_time > p_appointment_time
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_BLOCKED';
  end if;

  if exists (
    select 1
    from public.appointments as existing_appointment
    where existing_appointment.store_id = target_store_id
      and existing_appointment.status in ('pending', 'confirmed')
      and tsrange(
        existing_appointment.appointment_date + existing_appointment.appointment_time,
        existing_appointment.appointment_date + existing_appointment.appointment_time
          + greatest(coalesce(existing_appointment.duration_minutes, 60), 1)
            * interval '1 minute',
        '[)'
      ) && tsrange(requested_start, requested_end, '[)')
  ) then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_CONFLICT';
  end if;

  return query
  insert into public.appointments (
    store_id,
    service,
    appointment_date,
    appointment_time,
    duration_minutes,
    customer_name,
    customer_phone,
    status
  )
  values (
    target_store_id,
    selected_service_names,
    p_appointment_date,
    p_appointment_time,
    selected_duration,
    btrim(p_customer_name),
    p_customer_phone,
    'pending'
  )
  returning
    appointments.id,
    appointments.store_id,
    appointments.service,
    appointments.duration_minutes,
    appointments.appointment_date,
    appointments.appointment_time,
    appointments.status;
exception
  when exclusion_violation or unique_violation then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_CONFLICT';
end;
$$;

revoke all on function public.create_public_appointment(
  text,
  uuid[],
  date,
  time without time zone,
  text,
  text
) from public;

grant execute on function public.create_public_appointment(
  text,
  uuid[],
  date,
  time without time zone,
  text,
  text
) to anon, authenticated;

drop policy if exists appointments_public_create_pending on public.appointments;

revoke insert on table public.appointments from public, anon, authenticated;
revoke insert (
  store_id,
  service,
  appointment_date,
  appointment_time,
  duration_minutes,
  customer_name,
  customer_phone,
  status
) on table public.appointments from public, anon, authenticated;

revoke all on sequence public.appointments_id_seq from public, anon, authenticated;

commit;
