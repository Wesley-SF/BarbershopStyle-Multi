-- Revisar no SQL Editor antes de aplicar em produção.
-- Este arquivo não é executado automaticamente pelo frontend.

alter table public.appointments enable row level security;

-- A constraint mantém exatamente os quatro estados usados pela aplicação.
alter table public.appointments
  drop constraint if exists valid_status;
alter table public.appointments
  add constraint valid_status check (
    status in ('pending', 'confirmed', 'cancelled', 'completed')
  );

-- Privilégios mínimos na tabela base.
revoke all on table public.appointments from anon, authenticated;
grant insert (
  service,
  appointment_date,
  appointment_time,
  duration_minutes,
  customer_name,
  customer_phone
) on table public.appointments to anon, authenticated;
grant select on table public.appointments to authenticated;
grant update (status) on table public.appointments to authenticated;
grant usage, select on sequence public.appointments_id_seq to anon, authenticated;

-- Nenhum DELETE é concedido porque o frontend não exclui agendamentos.

drop policy if exists "Allow public appointment creation" on public.appointments;
drop policy if exists "Public can create appointments" on public.appointments;
drop policy if exists "Public and authenticated can create pending appointments" on public.appointments;
create policy "Public and authenticated can create pending appointments"
on public.appointments
for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "Authenticated can read appointments" on public.appointments;
create policy "Authenticated can read appointments"
on public.appointments
for select
to authenticated
using (true);

drop policy if exists "Authenticated can update appointment status" on public.appointments;
create policy "Authenticated can update appointment status"
on public.appointments
for update
to authenticated
using (true)
with check (status in ('pending', 'confirmed', 'cancelled', 'completed'));

-- A view pública projeta somente dados de disponibilidade e exclui status
-- que não devem bloquear novos horários. Ela não contém dados pessoais.
create or replace view public.occupied_appointments
with (security_barrier = true)
as
select
  appointment_date,
  appointment_time,
  service,
  duration_minutes,
  status
from public.appointments
where status in ('pending', 'confirmed');

revoke all on table public.occupied_appointments from public, anon, authenticated;
grant select on table public.occupied_appointments to anon, authenticated;
