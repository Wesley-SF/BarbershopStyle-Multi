supabase/migrations/20260910120000_store_notification_settings.sqlbegin;

create table public.store_notification_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  ntfy_enabled boolean not null default false,
  ntfy_server_url text,
  ntfy_topic text,
  use_legacy_ntfy_env boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_notification_settings_server_check check (
    ntfy_server_url is null
    or (
      char_length(ntfy_server_url) between 1 and 2048
      and ntfy_server_url ~ '^https://[^[:space:]]+$'
    )
  ),
  constraint store_notification_settings_topic_check check (
    ntfy_topic is null
    or ntfy_topic ~ '^[A-Za-z0-9_-]{1,128}$'
  ),
  constraint store_notification_settings_enabled_check check (
    not ntfy_enabled
    or ntfy_topic is not null
    or use_legacy_ntfy_env
  )
);

comment on column public.store_notification_settings.use_legacy_ntfy_env is
  'Transicao exclusiva para configuracoes NTFY que ainda estao nos secrets da Edge Function.';

create unique index store_notification_settings_destination_uidx
  on public.store_notification_settings (
    coalesce(ntfy_server_url, 'https://ntfy.sh'),
    ntfy_topic
  )
  where ntfy_topic is not null;

create or replace function public.set_store_notification_settings_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_store_notification_settings_updated_at()
  from public, anon, authenticated;

create trigger set_store_notification_settings_updated_at
before update on public.store_notification_settings
for each row
execute function public.set_store_notification_settings_updated_at();

create or replace function public.initialize_store_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.store_notification_settings (
    store_id,
    ntfy_enabled,
    ntfy_server_url,
    ntfy_topic,
    use_legacy_ntfy_env
  )
  values (new.id, false, null, null, false)
  on conflict (store_id) do nothing;

  return new;
end;
$$;

revoke all on function public.initialize_store_notification_settings()
  from public, anon, authenticated;

create trigger initialize_store_notification_settings
after insert on public.stores
for each row
execute function public.initialize_store_notification_settings();

insert into public.store_notification_settings (
  store_id,
  ntfy_enabled,
  ntfy_server_url,
  ntfy_topic,
  use_legacy_ntfy_env
)
select store.id, false, null, null, false
from public.stores as store
on conflict (store_id) do nothing;

update public.store_notification_settings as settings
set
  ntfy_enabled = true,
  use_legacy_ntfy_env = true
from public.stores as store
where store.id = settings.store_id
  and store.slug = 'kalle-cortes';

alter table public.store_notification_settings enable row level security;

revoke all on table public.store_notification_settings
  from public, anon, authenticated;
revoke all (
  store_id,
  ntfy_enabled,
  ntfy_server_url,
  ntfy_topic,
  use_legacy_ntfy_env,
  created_at,
  updated_at
) on table public.store_notification_settings
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.store_notification_settings
  to service_role;

commit;
