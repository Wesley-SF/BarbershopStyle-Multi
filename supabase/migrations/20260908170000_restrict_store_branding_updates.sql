begin;

alter table public.stores
  alter column display_name set default 'BarbershopStyle',
  alter column primary_color set default '#d4a84f',
  alter column secondary_color set default '#0b0b0c',
  alter column accent_color set default '#f0cf85';

revoke update on table public.stores from authenticated;

revoke update (
  display_name,
  logo_url,
  primary_color,
  secondary_color,
  accent_color,
  phone,
  instagram,
  address
) on table public.stores from authenticated;

grant update (
  business_hours,
  slot_interval_minutes,
  minimum_booking_notice_minutes
) on table public.stores to authenticated;

-- Restaurados explicitamente apenas os grants operacionais do Bloco 4.
-- RLS permanece ativo e as colunas públicas de branding continuam legíveis.

commit;
