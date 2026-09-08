begin;

alter table public.stores
  add column if not exists display_name text,
  add column if not exists logo_url text,
  add column if not exists primary_color text not null default '#d4a84f',
  add column if not exists secondary_color text not null default '#0b0b0c',
  add column if not exists accent_color text not null default '#f0cf85',
  add column if not exists phone text,
  add column if not exists instagram text,
  add column if not exists address text;

update public.stores
set
  display_name = 'Kallé Cortes',
  logo_url = '/favicon-kc.png',
  primary_color = '#d4a84f',
  secondary_color = '#0b0b0c',
  accent_color = '#f0cf85'
where slug = 'kalle-cortes';

alter table public.stores
  drop constraint if exists stores_branding_check;

alter table public.stores
  add constraint stores_branding_check check (
    (display_name is null or char_length(btrim(display_name)) between 1 and 120)
    and (logo_url is null or (
      char_length(logo_url) between 1 and 2048
      and logo_url ~ '^(https?://|/)'
    ))
    and primary_color ~ '^#[0-9A-Fa-f]{6}$'
    and secondary_color ~ '^#[0-9A-Fa-f]{6}$'
    and accent_color ~ '^#[0-9A-Fa-f]{6}$'
    and (phone is null or char_length(btrim(phone)) between 1 and 30)
    and (instagram is null or char_length(btrim(instagram)) between 1 and 120)
    and (address is null or char_length(btrim(address)) between 1 and 300)
  );

revoke update (
  display_name,
  logo_url,
  primary_color,
  secondary_color,
  accent_color,
  phone,
  instagram,
  address
) on table public.stores from public, anon, authenticated;

grant select (
  display_name,
  logo_url,
  primary_color,
  secondary_color,
  accent_color,
  phone,
  instagram,
  address
) on table public.stores to anon, authenticated;

grant update (
  display_name,
  logo_url,
  primary_color,
  secondary_color,
  accent_color,
  phone,
  instagram,
  address
) on table public.stores to authenticated;

-- A policy stores_admin_update_operational_settings criada no Bloco 4
-- continua limitando qualquer UPDATE ao id retornado pelo profile autenticado.

commit;
