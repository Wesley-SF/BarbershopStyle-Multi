begin;

create or replace function public.provision_store(
  p_store_name text,
  p_store_slug text,
  p_admin_user_id uuid
)
returns table (
  provisioned_store_id uuid,
  provisioned_store_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := pg_catalog.btrim(p_store_name);
  normalized_slug text := pg_catalog.btrim(p_store_slug);
  new_store_id uuid;
  existing_profile_store_id uuid;
  reserved_slugs constant text[] := array[
    'admin',
    'login',
    'api',
    'auth',
    'rest',
    'realtime',
    'storage',
    'functions',
    'dashboard',
    'supabase',
    'www'
  ];
begin
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 1 and 120
  then
    raise exception 'INVALID_STORE_NAME'
      using errcode = '22023';
  end if;

  if normalized_slug is null
    or pg_catalog.char_length(normalized_slug) not between 3 and 63
    or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception 'INVALID_STORE_SLUG'
      using errcode = '22023';
  end if;

  if normalized_slug = any (reserved_slugs) then
    raise exception 'RESERVED_STORE_SLUG'
      using errcode = '22023';
  end if;

  if p_admin_user_id is null
    or not exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = p_admin_user_id
    )
  then
    raise exception 'ADMIN_USER_NOT_FOUND'
      using errcode = '23503';
  end if;

  select profile.store_id
  into existing_profile_store_id
  from public.profiles as profile
  where profile.user_id = p_admin_user_id;

  if existing_profile_store_id is not null then
    raise exception 'ADMIN_USER_ALREADY_ASSIGNED'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.stores as store
    where store.slug = normalized_slug
  ) then
    raise exception 'STORE_SLUG_ALREADY_EXISTS'
      using errcode = '23505';
  end if;

  insert into public.stores (
    name,
    slug,
    active,
    timezone,
    business_hours,
    slot_interval_minutes,
    minimum_booking_notice_minutes,
    display_name,
    logo_url,
    primary_color,
    secondary_color,
    accent_color,
    phone,
    instagram,
    address
  )
  values (
    normalized_name,
    normalized_slug,
    true,
    'America/Sao_Paulo',
    '{}'::jsonb,
    15,
    30,
    normalized_name,
    null,
    '#d4a84f',
    '#0b0b0c',
    '#f0cf85',
    null,
    null,
    null
  )
  returning id into new_store_id;

  insert into public.profiles (user_id, store_id, role)
  values (p_admin_user_id, new_store_id, 'admin');

  insert into public.services (store_id, name, duration_minutes, active)
  values
    (new_store_id, 'Corte', 40, true),
    (new_store_id, 'Barba', 20, true),
    (new_store_id, 'Corte + Barba', 60, true);

  return query
  select new_store_id, normalized_slug;
end;
$$;

revoke all on function public.provision_store(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.provision_store(text, text, uuid)
  to service_role;

comment on function public.provision_store(text, text, uuid) is
  'Provisiona atomicamente uma store, seu primeiro profile admin e servicos iniciais. Uso exclusivo da operacao privilegiada do SaaS.';

commit;
