# Meus resgates — acompanhamento, retirada e conquistas

## Fluxo entregue

- `/resgates`: indicadores do usuário, foto real do catálogo com fallback neutro, filtros, paginação, detalhes, lotes, validade e comprovante para celular.
- O preço unitário exibido usa `cost / quantity` do resgate original, nunca o preço atual do catálogo. Total utilizado exclui cancelamentos; os indicadores de produtos somam quantidades.
- `/resgates/conferir`: acesso restrito a RH e ADMIN. O responsável consulta o código, confere a entrega e confirma uma única vez. O colaborador recebe a atualização por consulta privada periódica, sem recarregar manualmente.
- O código UUID é aleatório, privado e vinculado ao pedido. Não há validação apenas visual, nem confirmação pelo colaborador, nem QR ilustrativo. A consulta é limitada a 30 tentativas por minuto por responsável; o servidor rejeita repetição e pedidos cancelados.
- O cancelamento pelo titular reutiliza a mesma transição transacional do fluxo administrativo: estorno e devolução das alocações uma única vez. A confirmação não cria lançamento nem altera estoque ou saldo.

## Mural e fotografias

Após a retirada, o titular pode enviar uma fotografia com prévia e legenda e publicar imediatamente, sem aprovação. O vínculo único `RedemptionShare` identifica a modalidade dentro de `CommunityPost`; não existe mural paralelo nem concessão de permissões administrativas.

São reutilizados `imageFiles` e `CommunityMedia`: JPEG/PNG/WEBP, até 4 MB, decodificação e normalização WebP, limites de pixels, remoção de metadados e persistência no PostgreSQL. A retenção segue a política existente de mídias. Arquivos temporários do Railway não são utilizados.

Uso de imagem e revisão de informações restritas são obrigatórios. A legenda rejeita códigos do pedido e padrões de documentos/e-mail. A validação do arquivo é técnica; não há análise semântica/OCR capaz de assegurar a ausência de informação confidencial dentro de uma fotografia. A orientação ao autor, consentimento, denúncia e moderação posterior fazem parte do fluxo.

A publicação expõe produto, foto e legenda. Código de retirada, identificadores do pedido, e-mail, comprovante, lote e dados privados da transação não são enviados ao Mural. Curtidas e comentários existentes continuam funcionando.

O autor pode remover sua publicação. Outros usuários autenticados podem denunciá-la; administradores veem as denúncias em `/resgates/conferir` e podem moderar também no próprio Mural. A remoção arquiva a publicação e bloqueia sua mídia para leitores, mantendo resgate, vínculo e auditoria. Reenvios não criam outra publicação para o mesmo pedido.

## Compatibilidade e migração

`20261020010000_redemption_receipts_and_shares` é exclusivamente aditiva. Preserva colunas e registros financeiros e de estoque, acrescenta códigos de retirada e metadados opcionais de confirmação/cancelamento e cria tabelas para vínculo, denúncia e limite de consultas. Não inventa responsáveis ou horários para pedidos históricos; a tela pode consultar a auditoria anterior quando disponível.

O resgate e a seleção FEFO não foram alterados. A transição administrativa existente foi extraída para `order-transition.ts`, mantendo autorização no chamador e a transação serializável. Header, sidebar, carteira, autenticação e navegação PWA permanecem inalterados.

O `railway.json` declara `npm run db:migrate` em pré-deploy, mas a configuração efetiva do serviço não executou esse comando nesta publicação. A migração foi aplicada explicitamente via Railway SSH no projeto e serviço corretos e sua conclusão foi consultada no banco. Em futuras migrações, confirme a execução do comando antes de considerar a publicação concluída. A aplicação anterior continua compatível com as colunas adicionadas. Não é necessário recriar o banco nem redefinir credenciais.

## Validação reproduzível

- `npm run typecheck`
- `npm test`
- `npm run build`
- `node scripts/validate-redemptions.mjs`

A integração usa PostgreSQL local isolado: migração sobre pedidos antigos e preservação de valores, autenticação, FEFO, estorno, concorrência, foto persistente, detalhes, comprovante, autorização RH, confirmação única e atualização do titular, upload, publicação imediata, privacidade, denúncias, remoção e moderação, limites de tentativas, CSRF e cache privado. Testa 320, 375, 390, 430, 768 e 1920 px. Nenhum pedido ou foto de teste é criado em produção.
