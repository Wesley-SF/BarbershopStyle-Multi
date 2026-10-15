begin;

alter table public.appointments
  add column if not exists whatsapp_confirmation_sent_at timestamptz;

revoke update (whatsapp_confirmation_sent_at)
  on table public.appointments
  from public, anon, authenticated;

grant update (whatsapp_confirmation_sent_at)
  on table public.appointments
  to authenticated;

comment on column public.appointments.whatsapp_confirmation_sent_at is
  'Momento em que um administrador abriu a confirmacao do agendamento pelo WhatsApp.';

commit;
