do $$
declare
  target_email constant text := 'SUBSTITUA_PELO_EMAIL_DO_ADMIN';
  matched_user_id uuid;
  matched_user_count integer;
  kalle_store_id uuid;
  existing_store_id uuid;
begin
  select count(*)
  into matched_user_count
  from auth.users
  where lower(email) = lower(target_email);

  if matched_user_count <> 1 then
    raise exception
      'Era esperado exatamente um usuário para o e-mail informado; encontrados: %',
      matched_user_count;
  end if;

  select id
  into matched_user_id
  from auth.users
  where lower(email) = lower(target_email);

  select id
  into kalle_store_id
  from public.stores
  where slug = 'kalle-cortes';

  if kalle_store_id is null then
    raise exception 'A loja kalle-cortes não foi encontrada.';
  end if;

  select store_id
  into existing_store_id
  from public.profiles
  where user_id = matched_user_id;

  if existing_store_id is not null and existing_store_id <> kalle_store_id then
    raise exception 'O usuário já possui profile vinculado a outra loja.';
  end if;

  insert into public.profiles (user_id, store_id, role)
  values (matched_user_id, kalle_store_id, 'admin')
  on conflict (user_id) do nothing;
end;
$$;

select
  profile.user_id,
  profile.store_id,
  profile.role,
  store.slug
from public.profiles as profile
join public.stores as store
  on store.id = profile.store_id
where profile.user_id = (
  select id
  from auth.users
  where lower(email) = lower('SUBSTITUA_PELO_EMAIL_DO_ADMIN')
);
