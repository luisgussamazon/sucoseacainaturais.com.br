# Entrega de Produtos

A central `/entregas` está disponível exclusivamente para RH e ADMIN, com validação no servidor. O menu Gestão inclui o novo acesso no desktop e no menu mobile. A seção de pedidos e sua consulta saíram da Administração; acessos, criação de usuários, redefinição de senha e auditoria continuam preservados.

## Dados e histórico

Os quatro indicadores são calculados no PostgreSQL sobre todos os pedidos: quantidade de pedidos aguardando retirada, retirados, cancelados e soma dos custos de pedidos reservados ou retirados. Cancelados ficam fora da soma de Amazonitos, e esse critério está identificado na tela. São contagens de pedidos, não de unidades de produto.

A consulta inicial prioriza RESERVED e mantém todo o histórico acessível por paginação de 20 pedidos. Há busca por colaborador, produto, ID do pedido e código privado de retirada; período de 7/30/90 dias; estado; e ordenação por pendentes, recentes ou antigos. Os indicadores gerais não mudam com os filtros da lista. Nenhum limite de 100 registros oculta pedidos antigos.

Fotos vêm do catálogo, incluindo uploads privados persistidos, com fallback neutro. Detalhes mostram colaborador, número real do pedido, descrição, custo original, quantidade, lote, validade e comprovante. Valor unitário é o total histórico dividido pela quantidade. Não é criado QR Code demonstrativo: o comprovante existente usa seu código UUID validado no servidor.

## Entrega e cancelamento

Confirmar entrega abre uma segunda janela de confirmação. Apenas a confirmação final chama a validação existente do comprovante em `/api/redemptions`, exigindo RH/ADMIN e pedido RESERVED. A mesma transação serializável registra estado, responsável, horário e auditoria, sem movimentar saldo ou estoque. Pedido finalizado ou cancelado não pode ser entregue novamente.

O cancelamento permanece exclusivo de ADMIN, como no gerenciamento anterior. A nova API `/api/deliveries` reutiliza `finalizeOrder`, devolvendo saldo e alocações uma única vez na transação. RH não ganha permissão de estorno. A ação também exige confirmação explícita e validação da origem da requisição.

Consultas privadas periódicas atualizam a central e a tela Meus resgates sem recarregamento manual. A versão agregada do histórico cobre também pedidos além dos 100 mais recentes, sem carregar uma lista ilimitada no navegador. Os estados recebidos do servidor são usados na linha do tempo; dados históricos de responsável/horário vêm da auditoria anterior quando disponíveis e nunca são inventados.

## Notificações e compatibilidade

O sino mantém as notificações existentes e abre `/entregas?notification=...`, validando destinatário e função atual antes de carregar o pedido. O código privado não aparece na URL. Leitura individual e criação de avisos não foram modificadas, portanto não há duplicação de notificações.

A conferência por código e as denúncias existentes em `/resgates/conferir` continuam acessíveis por link na central, preservando os fluxos anteriores. A loja, FEFO, carteira, autenticação global e navegação inferior PWA não foram modificados.

Não é necessária migração: os campos de confirmação e os modelos de pedidos existentes são reutilizados.

## Validação

`npm run typecheck`, `npm test`, `npm run build` e `node scripts/validate-deliveries.mjs`.

O teste integrado usa PostgreSQL isolado e cobre remoção da seção antiga com preservação dos controles administrativos, histórico de 27 pedidos, filtros, paginação, prioridade de pendentes, fotos, comprovante, permissões, confirmação em duas etapas, entrega única e atualização do colaborador, ausência de débito adicional, cancelamento concorrente, notificações, cache e CSRF. Inclui regressões de compra, saldo, FEFO, quiz e notificações. Capturas conferem 320, 375, 390, 430, 768, 1366 e 1920 px. Não são criados dados de teste em produção.
