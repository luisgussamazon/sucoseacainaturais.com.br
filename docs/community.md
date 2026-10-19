# Mural, Momentos VBJ2 e missões fotográficas

Módulo incremental da plataforma existente. Não altera sessões, perfis existentes, preços, FEFO, resgates ou concessões antigas. Não há dados demonstrativos nem permissões pré-concedidas em produção.

## Operação

- `/`: saudação, quatro indicadores reais, mural (70%), missões/eventos/reconhecimentos/atalhos (30%), banner e produtos existentes. Em telas pequenas o mural vem antes da coluna secundária.
- `/mural`: publicações autorizadas com busca, categorias, paginação, curtidas e comentários.
- `/momentos`: álbuns publicados e galeria acessível por teclado.
- `/missoes`: quizzes existentes e missões fotográficas separadas.
- `/comunidade`: publicações, álbuns, eventos, missões com foto, moderação e permissões.
- `/comunidade/evidencias`: filtro de status, busca, avaliação e histórico.

O administrador deve abrir **Comunidade e Eventos → Permissões** e conceder explicitamente os acessos necessários, inclusive para si. `publish`, `review` e `moderate` são independentes. Associados comuns só recebem acesso de gestão se o administrador os designar explicitamente como liderança neste módulo. Isso não modifica o perfil nem concede acesso aos demais painéis.

Rascunhos, arquivos, publicações futuras e conteúdo restrito não aparecem no feed de associados. A primeira imagem é a capa; é possível escolher outra capa ao editar álbuns/publicações. Conteúdo é arquivado em vez de excluído. Missões com participações não podem alterar recompensa ou regras; podem ser encerradas.

## Imagens privadas e retenção

`CommunityMedia` mantém as imagens no PostgreSQL persistente existente, sem depender do filesystem do Railway ou de buckets públicos. Não requer novos segredos. A rota autenticada `/api/community/media/[id]` verifica a autorização do recurso, responde `private, no-store` e não permite acesso público em massa.

- JPEG, PNG e WebP; validação do formato decodificado no servidor.
- Até 4 MB por arquivo, 20 MB por formulário, 8 imagens por publicação/álbum, 1 capa por missão, até 5 fotos por evidência, 100 imagens por pessoa/dia.
- Conversão para WebP, máximo 1600×1600, até 1 MB persistido por imagem; remoção de EXIF/GPS/XMP e perfis desnecessários.
- Evidências expiram após 90 dias; publicações, capas e álbuns após 365 dias. Arquivos expirados deixam de ser servidos.
- O administrador executa a limpeza controlada de arquivos expirados em Permissões; os registros de participação, avaliações, auditoria e extrato são preservados. A limpeza não é agendada automaticamente.
- O volume de imagens passa a compor o tamanho e os backups do PostgreSQL. Para crescimento expressivo, migrar futuramente os binários a armazenamento privado de objetos, preservando a mesma autorização.

O PWA não foi ampliado para cachear APIs, fotos, conteúdo autenticado, tokens ou carteira. A whitelist dos seis assets públicos permanece intacta.

## Recompensa e divulgação

O participante envia imagens e acompanha o status. Reenvio somente após reprovação, se autorizado pela política e dentro do prazo. Cancelamento somente enquanto pendente.

A aprovação usa transação serializável com retry, transição condicional de PENDING e unicidade de Completion por pessoa/missão. Avaliação, saldo, lançamento no extrato e auditoria são confirmados juntos. A origem financeira contém o ID da evidência. Autoavaliação é proibida; um avaliador específico, quando definido, é respeitado.

A recompensa não publica fotos. O destaque exige evidência aprovada, consentimento opcional do participante, confirmação administrativa de autorização de uso e revisão de dados restritos. Cria cópias para a publicação; a evidência original continua privada. O nome do participante não é preenchido automaticamente no destaque.

## Migração e deploy

`20261019150000_community_photo_missions` cria somente tabelas/enums/índices/relações novos. Não altera nem remove registros existentes. Tabelas: CommunityGrant, CommunityEvent, CommunityAlbum, CommunityPost, CommunityLike, CommunityComment, PhotoMission, PhotoEvidence, EvidenceReview, CommunityMedia. Restrições SQL adicionais controlam recurso único por mídia, tamanho e limites.

O Railway já usa `npm run db:migrate` no pre-deploy. Não executar reset, db push ou comandos destrutivos. Não há seeds de conteúdo ou concessão automática de permissões.

## Validação reproduzível

- `npm run typecheck`
- `npm test`
- `npm run build`
- `node scripts/validate-community.mjs` (requer ferramentas locais de QA em `.setup/qa`: PostgreSQL embutido e Playwright; roda exclusivamente em banco isolado na porta 55439 e servidor local 3147).

O último comando reutiliza a regressão de autenticação, quizzes, saldo, FEFO, resgates, cancelamentos e concorrência; acrescenta testes de permissões explícitas, uploads reais/inválidos, privacidade, moderação, idempotência, reprovação/reenvio, consentimento, galeria, retenção e cache PWA, nas larguras 320/375/390/768/1366/1920. Os dados de QA nunca são enviados a produção. O projeto não possui comando de lint configurado; a formatação dos arquivos novos é conferida com Prettier.

## Resultado da validação local (19/10/2026)

TypeScript e build de produção aprovados; 8 testes unitários aprovados; 42 verificações integradas cobrindo a regressão anterior e o novo módulo; teste adicional de atualização de banco com registros existentes aprovado. As seis larguras foram verificadas após o carregamento real das telas. Prettier aprovado e `npm audit` sem vulnerabilidades após usar Sharp 0.35.5 também nas dependências transitivas.

`node scripts/validate-community-upgrade.mjs` prepara um PostgreSQL isolado com a migração antiga, cria registros de teste, aplica a migração incremental e compara integralmente os registros anteriores. Requer o histórico Git do commit anterior ao módulo e as ferramentas de QA locais; não usa produção.

Após o deploy, `node scripts/check-community.mjs` no contêiner verifica somente leitura da migração e das novas tabelas. O comando não imprime identidades ou credenciais. A URL, o serviço Railway, a configuração de deploy e o processo de autenticação continuam os mesmos.
