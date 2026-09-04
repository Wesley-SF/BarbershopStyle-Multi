begin;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  role text not null,
  created_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('admin'))
);

insert into public.stores (name, slug, active, timezone)
values ('Kallé Cortes', 'kalle-cortes', true, 'America/Sao_Paulo')
on conflict (slug) do nothing;

alter table public.appointments
  add column if not exists store_id uuid;

alter table public.schedule_blocks
  add column if not exists store_id uuid;

alter table public.push_subscriptions
  add column if not exists store_id uuid;

update public.appointments
set store_id = (
  select id from public.stores where slug = 'kalle-cortes'
)
where store_id is null;

update public.schedule_blocks
set store_id = (
  select id from public.stores where slug = 'kalle-cortes'
)
where store_id is null;

update public.push_subscriptions
set store_id = (
  select id from public.stores where slug = 'kalle-cortes'
)
where store_id is null;

alter table public.appointments
  alter column store_id set not null;

alter table public.schedule_blocks
  alter column store_id set not null;

alter table public.push_subscriptions
  alter column store_id set not null;

alter table public.appointments
  alter column status set default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_store_id_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_store_id_fkey
      foreign key (store_id) references public.stores(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.schedule_blocks'::regclass
      and conname = 'schedule_blocks_store_id_fkey'
  ) then
    alter table public.schedule_blocks
      add constraint schedule_blocks_store_id_fkey
      foreign key (store_id) references public.stores(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and conname = 'push_subscriptions_store_id_fkey'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_store_id_fkey
      foreign key (store_id) references public.stores(id);
  end if;
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.appointments'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by att.attname)
        from unnest(con.conkey) as key(attnum)
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum = key.attnum
      ) = array['appointment_date', 'appointment_time']::name[]
  loop
    execute format(
      'alter table public.appointments drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

alter table public.appointments
  drop constraint if exists unique_appointment_schedule;

drop index if exists public.unique_appointment_schedule;
drop index if exists public.appointments_store_date_time_uidx;
drop index if exists public.appointments_active_store_date_time_uidx;

create unique index appointments_active_store_date_time_uidx
  on public.appointments (store_id, appointment_date, appointment_time)
  where status in ('pending', 'confirmed');

create index if not exists schedule_blocks_store_date_idx
  on public.schedule_blocks (store_id, block_date);

create index if not exists push_subscriptions_store_user_idx
  on public.push_subscriptions (store_id, user_id);

comment on index public.appointments_active_store_date_time_uidx is
  'Proteção temporária por horário inicial e tenant; não impede sobreposição por duração.';

create or replace function public.current_user_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.store_id
  from public.profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.role = 'admin'
  limit 1
$$;

revoke all on function public.current_user_store_id() from public;
revoke all on function public.current_user_store_id() from anon;
grant execute on function public.current_user_store_id() to authenticated;

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.appointments enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on table public.stores from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.appointments from public, anon, authenticated;
revoke all on table public.schedule_blocks from public, anon, authenticated;
revoke all on table public.push_subscriptions from public, anon, authenticated;

revoke all (id, name, slug, active, timezone, created_at)
  on table public.stores from public, anon, authenticated;
revoke all (user_id, store_id, role, created_at)
  on table public.profiles from public, anon, authenticated;
revoke all (
  id,
  store_id,
  service,
  appointment_date,
  appointment_time,
  customer_name,
  customer_phone,
  status,
  created_at,
  duration_minutes
) on table public.appointments from public, anon, authenticated;
revoke all (
  id,
  store_id,
  block_date,
  start_time,
  end_time,
  all_day,
  reason,
  created_at
) on table public.schedule_blocks from public, anon, authenticated;
revoke all (
  id,
  store_id,
  user_id,
  role,
  endpoint,
  p256dh,
  auth,
  created_at,
  updated_at
) on table public.push_subscriptions from public, anon, authenticated;

grant select (id, name, slug, active, timezone)
  on table public.stores to anon, authenticated;
grant select (user_id, store_id, role)
  on table public.profiles to authenticated;

grant insert (
  store_id,
  service,
  appointment_date,
  appointment_time,
  duration_minutes,
  customer_name,
  customer_phone,
  status
) on table public.appointments to anon, authenticated;
grant select on table public.appointments to authenticated;
grant update (status) on table public.appointments to authenticated;
revoke all on sequence public.appointments_id_seq from public, anon, authenticated;
grant usage on sequence public.appointments_id_seq to anon, authenticated;

grant select on table public.schedule_blocks to authenticated;
grant insert, delete on table public.schedule_blocks to authenticated;
revoke all on sequence public.schedule_blocks_id_seq from public, anon, authenticated;
grant usage on sequence public.schedule_blocks_id_seq to authenticated;

grant select, insert, update, delete
  on table public.push_subscriptions to authenticated;
revoke all on sequence public.push_subscriptions_id_seq from public, anon, authenticated;
grant usage on sequence public.push_subscriptions_id_seq to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'stores',
        'profiles',
        'appointments',
        'schedule_blocks',
        'push_subscriptions'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

create policy stores_public_read_active
on public.stores
for select
to anon, authenticated
using (active = true);

create policy stores_admin_read_own
on public.stores
for select
to authenticated
using (id = (select public.current_user_store_id()));

create policy profiles_read_own
on public.profiles
for select
to authenticated
using (user_id = (select auth.uid()));

create policy appointments_public_create_pending
on public.appointments
for insert
to anon, authenticated
with check (
  status = 'pending'
  and appointment_date >= current_date
  and char_length(btrim(customer_name)) >= 3
  and customer_phone ~ '^[0-9]{10,11}$'
  and exists (
    select 1
    from public.stores as store
    where store.id = appointments.store_id
      and store.active = true
  )
);

create policy appointments_admin_read_own_store
on public.appointments
for select
to authenticated
using (store_id = (select public.current_user_store_id()));

create policy appointments_admin_update_own_store
on public.appointments
for update
to authenticated
using (store_id = (select public.current_user_store_id()))
with check (store_id = (select public.current_user_store_id()));

create policy schedule_blocks_admin_read_own_store
on public.schedule_blocks
for select
to authenticated
using (store_id = (select public.current_user_store_id()));

create policy schedule_blocks_admin_create_own_store
on public.schedule_blocks
for insert
to authenticated
with check (store_id = (select public.current_user_store_id()));

create policy schedule_blocks_admin_remove_own_store
on public.schedule_blocks
for delete
to authenticated
using (store_id = (select public.current_user_store_id()));

create policy push_subscriptions_read_own
on public.push_subscriptions
for select
to authenticated
using (
  user_id = (select auth.uid())
  and store_id = (select public.current_user_store_id())
  and role = 'admin'
);

create policy push_subscriptions_create_own
on public.push_subscriptions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and store_id = (select public.current_user_store_id())
  and role = 'admin'
);

create policy push_subscriptions_change_own
on public.push_subscriptions
for update
to authenticated
using (
  user_id = (select auth.uid())
  and store_id = (select public.current_user_store_id())
  and role = 'admin'
)
with check (
  user_id = (select auth.uid())
  and store_id = (select public.current_user_store_id())
  and role = 'admin'
);

create policy push_subscriptions_remove_own
on public.push_subscriptions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and store_id = (select public.current_user_store_id())
  and role = 'admin'
);

drop view if exists public.occupied_appointments;

create view public.occupied_appointments
with (security_barrier = true, security_invoker = false)
as
select
  appointment.store_id,
  appointment.appointment_date,
  appointment.appointment_time,
  appointment.service,
  appointment.duration_minutes,
  appointment.status
from public.appointments as appointment
join public.stores as store
  on store.id = appointment.store_id
where store.active = true
  and appointment.status in ('pending', 'confirmed');

revoke all on table public.occupied_appointments from public, anon, authenticated;
grant select on table public.occupied_appointments to anon, authenticated;

drop view if exists public.public_schedule_blocks;

create view public.public_schedule_blocks
with (security_barrier = true, security_invoker = false)
as
select
  schedule_block.store_id,
  schedule_block.block_date,
  schedule_block.start_time,
  schedule_block.end_time,
  schedule_block.all_day
from public.schedule_blocks as schedule_block
join public.stores as store
  on store.id = schedule_block.store_id
where store.active = true;

revoke all on table public.public_schedule_blocks from public, anon, authenticated;
grant select on table public.public_schedule_blocks to anon, authenticated;

commit;
