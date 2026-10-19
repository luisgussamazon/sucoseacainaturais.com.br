# Correções da comunidade e da Visão Geral — SSD VBJ2

## Causas confirmadas

1. A autorização antiga dependia simultaneamente do grant `publish` e de `role=HR/ADMIN` ou `leadership=true`. O grant sozinho não bastava. A nova implementação usa somente permissões individuais, relidas do banco em cada requisição; a coluna antiga de liderança é preservada, mas ignorada. Nenhum nível de liderança é criado.
2. Curtidas e comentários só existiam para `CommunityPost`. A galeria ampliada mostrava apenas imagens e o formulário de comentário do mural ficava dentro de detalhes recolhidos. Álbuns e fotografias agora possuem interações próprias, e o mural usa controles visíveis.
3. Antes das alterações, a inspeção somente leitura de produção encontrou 3 conclusões: 1 quiz antigo e 2 evidências fotográficas aprovadas com consentimento, sem publicação associada. A aprovação nunca criava uma publicação automaticamente; a tela de avaliação exigia `review` e o botão de destaque dependia de `publish`. Não existia fila para todas as conclusões antigas. Isso foi corrigido sem novos créditos.

## Visão Geral

A mesma imagem `/images/amazonitos-hero.webp` e o botão Explorar a loja foram preservados. Ordem: capa → quatro indicadores reais → mural → Momentos VBJ2 → missões/eventos/reconhecimentos (coluna secundária no desktop e abaixo de Momentos no mobile). Produtos foram removidos somente da página inicial; loja, carteira, estoque e resgates continuam nos módulos existentes.

`CommunityFeed` é compartilhado por Visão Geral e mural completo; `CommunityMoments` é compartilhado pela Visão Geral e página Momentos. A galeria abre dentro da própria página, com fotos recentes e interações independentes por álbum e fotografia. O histórico e as publicações completas continuam acessíveis.

## Permissões individuais

Administrador: **Comunidade e Eventos → Permissões**, busque qualquer usuário ativo e habilite somente as ações desejadas:

- Criar publicações (`publish`).
- Enviar e gerenciar fotos (`photos`).
- Criar e editar álbuns (`albums`).
- Criar eventos (`events`).
- Criar missões (`missions`).
- Avaliar evidências (`review`).
- Publicar reconhecimentos (`recognize`).
- Moderar comentários (`moderate`).

As novas permissões começam desativadas. Os valores anteriores de publicação, avaliação e moderação não são alterados. Para criar uma publicação com fotos, habilite publicação e fotos. Para álbum com fotos, habilite álbuns e fotos. Para apenas acrescentar fotos a conteúdo existente, habilite fotos. Cargo, setor e liderança não interferem. Concessão e revogação são refletidas sem novo login. O administrador continua sendo o único responsável por conceder ou revogar acessos.

Os formulários legados de criação/encerramento de missões também respeitam `missions`; a concessão antiga de moedas permanece com suas regras existentes. Quizzes podem ser criados no painel Comunidade por qualquer usuário autorizado.

## Conquistas anteriores

**Comunidade e Eventos → Conquistas aguardando publicação** reúne conclusões de quiz e de missões fotográficas, com busca e filtro de status.

- Clique em **Publicar conquista no mural** para criar o reconhecimento, ou edite a publicação já vinculada.
- Sem autorização de identificação ou imagem, use reconhecimento coletivo sem dados pessoais ou evidência privada.
- O associado pode autorizar sua identificação em **Missões e quizzes → Minhas conquistas**. Isso não autoriza imagens automaticamente.
- Para fotos de evidências, é necessário status aprovado, consentimento de imagem do participante e confirmação administrativa independente.
- O preview administrativo de evidência consentida exige `recognize`; a rota normal de evidências continua restrita ao participante e avaliador.
- A publicação nunca altera saldo, extrato, conclusão, recompensa ou avaliação. Vínculos únicos impedem duplicação; publicações antigas ligadas à evidência também são reconhecidas sem backfill de dados.

## Visibilidade e privacidade

Todo conteúdo novo publicado usa o mesmo público: todos os usuários autenticados. O seletor de público foi removido. Rascunhos, agendamentos futuros, fotos sem confirmação e evidências continuam protegidos. Conteúdos legados `MANAGEMENT` não são convertidos ou expostos automaticamente: permanecem privados até revisão e republicação explícita pelo autor autorizado. Não há filtros por cargo nos conteúdos liberados.

Fotos antigas de álbuns com autorização registrada pelo fluxo anterior são verificadas pela auditoria existente, sem criar novos consentimentos. Confirmações explícitas posteriores prevalecem. A migração não altera autorizações, status ou registros existentes.

## Upload e interações

O seletor reutilizado em publicações, álbuns, eventos e missões oferece Adicionar fotos, câmera, galeria, arrastar e soltar, remoção antes do envio, ordem, capa e progresso real via XMLHttpRequest. As validações do servidor e a remoção de metadados continuam; os limites de tamanho, quantidade e armazenamento privado foram preservados.

Curtidas usam chaves únicas; comentários são imediatos, têm proteção contra spam e identificador de envio para prevenir duplicidade. O usuário pode excluir logicamente seus próprios comentários. Moderadores autorizados podem ocultar/restaurar comentários, sem restaurar comentários excluídos pelo autor. Não existem interações públicas em evidências privadas.

Após salvar, o formulário revalida a interface e os controles atualizam os dados, sem recarregar manualmente o navegador. Nenhuma foto, publicação privada ou informação financeira foi adicionada ao cache do PWA.

## Migração e arquivos

`20261019190000_community_individual_access_and_interactions` é transacional e aditiva. Acrescenta permissões, consentimento de identificação, vínculo de conclusão/publicação, contexto de evento e ordem das imagens; cria `CommunityThread`, `MediaLike` e `MediaComment`. A substituição da constraint de mídia apenas inclui o contexto de evento na validação de recurso único. Não há reset, remoção de tabela, alteração de saldos ou atualização automática de grants/consentimentos/status.

Principais módulos: `src/lib/community.ts`, `community-options.ts`, `community-social.ts`; APIs em `src/app/api/community`; componentes `community-client.tsx` e `community-server.tsx`; páginas de Visão Geral, mural, Momentos, Comunidade, conquistas, missões e RH; CSS da comunidade e testes de regressão. Autenticação, cookies, resgates, estoque, loja e arquivos do PWA permanecem preservados.

## Validação

- `npm run typecheck`, `npm test`, `npm run build`.
- `node scripts/validate-community.mjs`: regressão anterior e cenários novos em PostgreSQL isolado e Chromium, incluindo as seis larguras solicitadas.
- `node scripts/validate-community-upgrade.mjs`: aplica a migração sobre registros do schema anterior e compara dados originais, grants, conteúdo privado e histórico.
- O projeto não possui script de lint; a formatação é verificada com Prettier.
- Produção é verificada por checagens autenticadas somente leitura no contêiner e navegação pública sem credenciais. Dados financeiros e operacionais são comparados por contagens e hashes, sem exportar informações pessoais.

## Resultado local

TypeScript, build de produção, 13 testes unitários, 63 verificações integradas e o teste de atualização com dados anteriores foram aprovados. As seis larguras foram verificadas com as fotos carregadas. A formatação também passou. Os dados e as imagens de QA existem apenas no banco isolado dos testes.
