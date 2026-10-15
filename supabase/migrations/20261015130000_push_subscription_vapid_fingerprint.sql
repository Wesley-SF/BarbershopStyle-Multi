begin;

alter table public.push_subscriptions
  add column if not exists vapid_key_fingerprint text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and conname = 'push_subscriptions_vapid_key_fingerprint_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_vapid_key_fingerprint_check
      check (
        vapid_key_fingerprint is null
        or vapid_key_fingerprint ~ '^[0-9a-f]{16}$'
      );
  end if;
end;
$$;

revoke all (vapid_key_fingerprint)
  on table public.push_subscriptions
  from public, anon, authenticated;

grant select (vapid_key_fingerprint),
  insert (vapid_key_fingerprint),
  update (vapid_key_fingerprint)
  on table public.push_subscriptions
  to authenticated;

comment on column public.push_subscriptions.vapid_key_fingerprint is
  'Fingerprint SHA-256 curto da chave publica VAPID usada na subscription.';

commit;
