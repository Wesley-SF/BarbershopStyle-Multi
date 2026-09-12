# Provisionamento de uma loja

O provisionamento atual é uma operação interna do proprietário do SaaS. Não existe interface para essa operação no painel das barbearias.

## Fluxo operacional

1. Crie o primeiro administrador em **Authentication > Users** no painel do Supabase.
2. Copie o UUID desse usuário. Não copie senha, token ou qualquer secret.
3. Abra o SQL Editor do projeto usando uma conta administrativa autorizada.
4. Execute `public.provision_store` informando nome, slug e UUID.
5. Confirme que o administrador consegue entrar em `/admin`.
6. Confirme que a página pública abre em `/<slug>`.
7. No Admin, configure os horários antes de aceitar agendamentos. Por segurança, a loja nasce fechada.

## Exemplo

```sql
select *
from public.provision_store(
  p_store_name => 'Barbearia Teste',
  p_store_slug => 'barbearia-teste',
  p_admin_user_id => '00000000-0000-0000-0000-000000000000'::uuid
);
```

Substitua o UUID ilustrativo pelo UUID real criado no Supabase Auth.

## Resultado inicial

- Store ativa, timezone `America/Sao_Paulo` e branding padrão BarbershopStyle.
- Agenda inicialmente fechada (`business_hours = {}`), slots de 15 minutos e antecedência mínima de 30 minutos.
- Profile do usuário com role `admin`.
- Serviços ativos: Corte (40 min), Barba (20 min) e Corte + Barba (60 min).
- Configuração NTFY privada criada com envio desabilitado e sem tópico.

Se qualquer etapa falhar, a chamada inteira é revertida. Um slug existente ou reservado e um usuário já associado a outra store causam erro, sem sobrescrever dados.

Nunca exponha a chave `service_role` no frontend. Para uma automação futura, invoque essa função somente a partir de um backend confiável e autenticado do proprietário do SaaS.
