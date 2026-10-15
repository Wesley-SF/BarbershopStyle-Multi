# BarbershopStyle

Aplicação React + Vite para agendamentos, painel administrativo e integração com Supabase.

## Web Push administrativo

A aplicação usa um Service Worker gerado por `vite-plugin-pwa`. O frontend recebe apenas `VITE_VAPID_PUBLIC_KEY`; a chave privada permanece nos secrets da Edge Function.

### 1. Gerar as chaves VAPID

```bash
npx web-push generate-vapid-keys --json
```

Copie a chave pública para `.env.local`:

```env
VITE_VAPID_PUBLIC_KEY=SUA_CHAVE_PUBLICA
```

Nunca coloque a chave privada em uma variável `VITE_`.

### 2. Aplicar o schema versionado

A tabela `push_subscriptions`, seus vínculos por `store_id` e as políticas multi-tenant fazem parte das migrations versionadas em `supabase/migrations`. Aplique somente as migrations pendentes, na ordem; não reaplique scripts SQL avulsos de versões anteriores.

### 3. Configurar e publicar a Edge Function

Crie um segredo aleatório forte para autenticar o webhook e configure:

```bash
supabase secrets set VAPID_PUBLIC_KEY=SUA_CHAVE_PUBLICA
supabase secrets set VAPID_PRIVATE_KEY=SUA_CHAVE_PRIVADA
supabase secrets set VAPID_SUBJECT=mailto:seu-email@dominio.com
supabase secrets set APPOINTMENTS_WEBHOOK_SECRET=UM_SEGREDO_ALEATORIO_FORTE
supabase functions deploy send-admin-push --no-verify-jwt
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas pelo ambiente das Edge Functions. A função não expõe esses valores ao React. `verify_jwt` fica desativado apenas porque o chamador é o webhook do banco; a função valida obrigatoriamente o header privado `x-webhook-secret`.

### 4. Configurar o webhook atual do banco

Em produção, o trigger `appointments_send_admin_push` executa
`public.notify_admin_new_appointment()`. Essa função lê
`appointments_webhook_secret` de `vault.decrypted_secrets` e chama, via
`pg_net`, tanto `send-admin-push` quanto `send-ntfy-appointment`.

O valor do Vault deve ser exatamente igual ao secret
`APPOINTMENTS_WEBHOOK_SECRET` das duas Edge Functions. Não crie um segundo
Database Webhook no Dashboard: isso duplicaria os envios.

Consultas seguras para conferir a existência do secret e a definição do fluxo,
sem imprimir o valor descriptografado:

```sql
select
  name,
  decrypted_secret is not null as has_value,
  char_length(decrypted_secret) as value_length
from vault.decrypted_secrets
where name = 'appointments_webhook_secret';

select pg_get_functiondef(
  'public.notify_admin_new_appointment()'::regprocedure
);

select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_name = 'appointments_send_admin_push';
```

Se o log da Edge Function registrar `webhook_secret_missing`, o header não
chegou. Se registrar `webhook_secret_mismatch`, o header chegou, mas o valor do
Vault diverge de `APPOINTMENTS_WEBHOOK_SECRET`. Como secrets de Edge Functions
não podem ser lidos de volta, gere/guarde um único valor forte e reaplique o
mesmo valor ao Vault e às duas funções.

### 5. Conferir as chaves VAPID

`VITE_VAPID_PUBLIC_KEY` e `VAPID_PUBLIC_KEY` devem receber a mesma chave
pública. Uma chave pública válida decodifica para 65 bytes e começa por `0x04`;
a chave privada decodifica para 32 bytes. O frontend rejeita chaves públicas
estruturalmente inválidas e a Edge Function registra uma categoria de
configuração sem registrar nenhuma chave.

Depois de alterar uma variável `VITE_` na Vercel, é necessário gerar um novo
deploy, pois essas variáveis são incorporadas durante o build. Nunca use
`VAPID_PRIVATE_KEY` no frontend.

### 6. Testar

A ativação fica em **Admin > Configurações > Avisos de novos agendamentos**. A permissão do navegador só é solicitada depois do clique em **Ativar notificações** e vale para o aparelho/navegador atual.

No iPhone, instale primeiro o PWA pelo Safari usando **Compartilhar > Adicionar à Tela de Início** e faça a ativação dentro do aplicativo instalado. Para desativar somente o aparelho atual, use **Desativar neste aparelho**.

Valide com um novo agendamento da mesma loja do administrador. O Web Push deve chegar somente aos dispositivos cadastrados para aquela `store_id`; NTFY continua independente. Ao tocar na notificação, uma janela já aberta do Admin recebe foco ou `/admin` é aberto.
