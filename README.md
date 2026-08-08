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

### 2. Criar a tabela e as políticas

Execute o conteúdo de `supabase/push_subscriptions.sql` no SQL Editor do Supabase. As políticas permitem que usuários autenticados gerenciem somente suas próprias assinaturas com papel `admin`; o papel anônimo não recebe acesso.

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

### 4. Criar o Database Webhook

No Dashboard do Supabase, em **Database > Webhooks**, crie um webhook com:

- tabela: `public.appointments`;
- evento: `INSERT`;
- método: `POST`;
- URL: `https://SEU_PROJECT_REF.supabase.co/functions/v1/send-admin-push`;
- header: `x-webhook-secret: UM_SEGREDO_ALEATORIO_FORTE`.

Use exatamente o mesmo valor configurado em `APPOINTMENTS_WEBHOOK_SECRET`. Assim, o envio é iniciado no backend quando o banco recebe o registro e não depende de uma chamada privilegiada do cliente.

### 5. Testar

A interface de ativação de notificações está temporariamente desabilitada. O Service Worker e os arquivos de infraestrutura permanecem no projeto, mas o painel não solicita permissão nem cria subscriptions automaticamente.

Quando a interface de notificações for reativada, os testes de subscription e recebimento deverão ser executados novamente. No estado atual, o painel não solicita permissão, não cria subscriptions e não envia chamadas Push automaticamente; Realtime e o fluxo principal continuam independentes.
