# Confirmação de compra e notificações internas

## Compra

O botão do catálogo abre uma confirmação centralizada. Nenhum pedido ou débito é criado ao abrir ou cancelar. O modal consulta saldo, preço e estoque válidos no servidor, permite escolher a quantidade e exibe total e saldo restante. Os valores exibidos não substituem a validação transacional no momento da confirmação.

`redeem` exige confirmação explícita, preço esperado e chave UUID. A chave é vinculada ao usuário e ao conteúdo da confirmação em `RedemptionRequest`. Reenvios da mesma confirmação retornam o mesmo pedido; alterações de produto, quantidade ou preço com a mesma chave são rejeitadas. Não há cache local de dados financeiros ou credenciais.

A transação serializável existente continua executando débito condicionado ao saldo, seleção FEFO, reserva das alocações, criação do pedido, extrato e auditoria. Preço alterado, produto indisponível, saldo ou estoque insuficiente fazem rollback integral. Pedido, chave de confirmação e notificações são confirmados juntos. Após sucesso, Meus resgates oferece acesso direto ao comprovante.

## Notificações

Cada novo pedido confirmado cria uma `RedemptionNotice` para cada RH/ADMIN ativo naquele momento. A chave única destinatário/pedido evita duplicações. Não são criadas notificações retroativas para pedidos antigos, para falhas ou ao cancelar o modal. Se um pedido reservado for cancelado depois, sua notificação sai da listagem e do contador, sem apagar o histórico persistido.

O sino aparece no cabeçalho apenas para RH/ADMIN. A central inclui contador não lido, fotos reais do catálogo, colaborador, produto, quantidade, total, data, código do pedido, estado atual, leitura individual e paginação. A consulta periódica atualiza automaticamente o contador enquanto a aba está visível. Dados administrativos usam `private, no-store` e nunca entram no cache offline da PWA.

`Ver pedido` marca apenas a notificação daquele destinatário e abre `/resgates/conferir?notification=...`. O servidor valida o destinatário e a função atual antes de carregar o pedido. O código privado de retirada não é colocado na URL. A conferência e a confirmação de entrega existentes são reutilizadas, com responsável e horário e sem novo débito ou baixa de estoque.

## Migração e publicação

`20261020020000_purchase_confirmation_notifications` cria somente as tabelas de idempotência e notificações, índices únicos e relações. Não altera registros históricos, saldos ou quantidades existentes. O pré-deploy precisa executar `npm run db:migrate` antes de ativar a versão que utiliza essas tabelas; a configuração efetiva do serviço e o registro da migração devem ser conferidos, não apenas o arquivo `railway.json`.

O comando efetivo de pré-deploy do serviço AMAZONITOS-STORE em production foi configurado como `["npm run db:migrate"]` e consultado pela API autenticada do Railway antes da publicação desta versão. Somente esse serviço foi configurado.

## Verificação

- `npm run typecheck`, `npm test`, `npm run build`.
- `node scripts/validate-purchase-notifications.mjs`: base PostgreSQL isolada, regressões financeiras e de resgates, modal sem efeitos antes de confirmar, preço/estoque revalidados, reenvios simultâneos, entrega sem novo débito, destinatários ativos por função, leitura individual, privacidade e CSRF.
- Capturas e limites de layout em 320, 375, 390, 430, 768 e 1920 px.

Nenhuma compra ou notificação de teste deve ser criada em produção. A conferência de publicação usa saúde, autenticação, estado da migração e leituras de integridade dos dados.
