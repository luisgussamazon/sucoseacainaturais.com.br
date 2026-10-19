# Visão Geral: eventos e reconhecimento

## Diagnóstico confirmado em produção

Consulta somente de leitura em 19/10/2026: nenhum evento cadastrado; quatro publicações, nenhuma publicada na categoria Reconhecimento nem vinculada a conclusão; três conclusões sem publicação, incluindo duas evidências aprovadas com consentimento para imagem. Dois usuários ativos tinham a permissão individual de eventos e dois a de reconhecimento.

Assim, a existência dos módulos não significava que houvesse conteúdo publicado. A aprovação de evidência gera a recompensa, mas não deve publicar dados pessoais ou fotos automaticamente. O cadastro e a fila de conquistas já existiam em Mais ferramentas; faltavam acessos diretos na Visão Geral. O reconhecimento também apontava para uma categoria genérica, e não para a publicação específica; não havia atualização entre sessões abertas.

## Comportamento

- Próximos eventos usa eventos Publicados/INTERNAL ainda não encerrados, em ordem crescente de início. Inclui futuros e os que estão em andamento, preservando a ordem por proximidade. Rascunhos, arquivos e legados privados permanecem fora.
- Cadastrar evento abre o editor existente: título, descrição, local, início/término em Brasília e fotos, conforme permissões individuais. Não há dependência de RH ou concessões automáticas.
- /eventos/[id] abre detalhes de um evento publicado para usuários autenticados. Conteúdo privado/rascunho retorna a página de não encontrado, sem dados; fotos exigem a autorização de imagem existente.
- Reconhecimento usa publicações efetivamente publicadas da categoria Reconhecimento ou vinculadas a uma conclusão/evidência. Não lista a evidência privada diretamente. Cada item abre /mural?post=id.
- Publicar conquista acessa a fila existente, inclusive para quizzes antigos. A publicação continua exigindo autorização administrativa, consentimento de identificação e consentimento específico das fotos quando aplicáveis. Não concede moedas novamente.
- Atualizações no mesmo navegador usam sinal entre abas sem dados pessoais. Enquanto a Visão Geral estiver visível, ela também atualiza a cada 15 segundos e ao receber foco. Não há cache offline ou mudança da autenticação.
- Os estados vazios explicam que é necessário cadastrar/publicar. Nenhum conteúdo fictício, permissão ou publicação foi criado em produção.

## Validação

npm run typecheck; npm test; npm run build; node scripts/validate-home-cards.mjs.
Os testes usam PostgreSQL isolado, exercitam cadastro com foto por colaborador autorizado, ordenação/privacidade, detalhes, atualização entre usuários sem reload, reconhecimento de conclusão antiga sem créditos duplicados, desktop/celular e regressões dos módulos existentes.
