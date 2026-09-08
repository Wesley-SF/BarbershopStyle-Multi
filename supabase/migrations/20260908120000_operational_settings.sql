begin;

create or replace function public.is_valid_business_hours(hours jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  day_key text;
  day_hours jsonb;
  opening_time time without time zone;
  closing_time time without time zone;
begin
  if hours is null or jsonb_typeof(hours) <> 'object' then
    return false;
  end if;

  for day_key, day_hours in
    select entry.key, entry.value
    from pg_catalog.jsonb_each(hours) as entry
  loop
    if day_key !~ '^[0-6]$'
      or jsonb_typeof(day_hours) <> 'object'
      or not (day_hours ? 'start')
      or not (day_hours ? 'end')
      or day_hours - 'start' - 'end' <> '{}'::jsonb
      or jsonb_typeof(day_hours->'start') <> 'string'
      or jsonb_typeof(day_hours->'end') <> 'string'
      or day_hours->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or day_hours->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then
      return false;
    end if;

    opening_time := (day_hours->>'start')::time;
    closing_time := (day_hours->>'end')::time;

    if opening_time >= closing_time then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.is_valid_business_hours(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_business_hours(jsonb)
  to authenticated;

alter table public.stores
  drop constraint if exists stores_booking_rules_check;

alter table public.stores
  add constraint stores_booking_rules_check check (
    public.is_valid_business_hours(business_hours)
    and slot_interval_minutes between 1 and 240
    and minimum_booking_notice_minutes between 0 and 10080
  );

revoke update on table public.stores from public, anon, authenticated;
revoke update (
  id,
  name,
  slug,
  active,
  timezone,
  created_at,
  business_hours,
  slot_interval_minutes,
  minimum_booking_notice_minutes
) on table public.stores from public, anon, authenticated;

grant select (
  business_hours,
  slot_interval_minutes,
  minimum_booking_notice_minutes
) on table public.stores to anon, authenticated;

grant update (
  business_hours,
  slot_interval_minutes,
  minimum_booking_notice_minutes
) on table public.stores to authenticated;

drop policy if exists stores_admin_update_operational_settings
  on public.stores;

create policy stores_admin_update_operational_settings
on public.stores
for update
to authenticated
using (id = (select public.current_user_store_id()))
with check (id = (select public.current_user_store_id()));

commit;
