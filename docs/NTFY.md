# Configuração privada do NTFY

As configurações ficam em `public.store_notification_settings`, mas não são acessíveis por `anon` nem por administradores autenticados das lojas. A operação deve ser feita pelo proprietário do SaaS no SQL Editor ou por um backend privado com `service_role`.

## Configurar uma loja

Use um tópico privado, imprevisível e diferente para cada loja. Não coloque tokens ou credenciais no repositório.

```sql
update public.store_notification_settings as settings
set
  ntfy_enabled = true,
  ntfy_server_url = 'https://ntfy.sh',
  ntfy_topic = 'topico-privado-da-loja',
  use_legacy_ntfy_env = false
from public.stores as store
where store.id = settings.store_id
  and store.slug = 'barbearia-teste';
```

Confira que exatamente uma linha foi atualizada. Para desabilitar os envios sem apagar a configuração:

```sql
update public.store_notification_settings as settings
set ntfy_enabled = false
from public.stores as store
where store.id = settings.store_id
  and store.slug = 'barbearia-teste';
```

## Transição da Kallé

A migration marca somente a Kallé com `use_legacy_ntfy_env = true`. Assim, ela continua usando `NTFY_SERVER` e `NTFY_TOPIC` já configurados na Edge Function, sem copiar esses valores secretos para a migration. Nenhuma outra store recebe essa permissão de fallback.

Quando o tópico da Kallé for gravado na tabela, defina `use_legacy_ntfy_env = false`. Depois que a transição estiver concluída e validada, os secrets globais legados poderão ser removidos da Edge Function em uma manutenção futura.
