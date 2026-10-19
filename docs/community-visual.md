# Comunidade e Eventos — reformulação visual

A tela /comunidade usa a referência aprovada: título com ícone e ação Nova publicação, abas principais, navegação complementar, quatro indicadores, editor dividido entre campos e fotos e listagem administrativa. A composição permanece integrada às APIs, permissões individuais e armazenamento privado existentes.

## Dados e segurança

- Indicadores consultam PostgreSQL; participações em fotos considera envios desde o início do mês em Brasília.
- Curtidas e comentários visíveis da listagem são contagens reais. Busca e categoria são filtros no servidor, com ordenação e paginação preservadas.
- O editor reutiliza CommunityForm e PhotoUpload, com autorização de imagem e revisão de informações restritas. Limites: 8 fotos por conteúdo, 4 MB por foto e 20 MB por envio; fotografias existentes reduzem a capacidade disponível.
- Não há alteração no schema, migrations, autenticação, concessão de permissões ou regras financeiras. Não há dados demonstrativos na produção.
- Funções de álbuns, eventos, missões, conquistas, fotos, revisão e moderação continuam acessíveis conforme permissões.

## Interface e validação

- Formulário em duas áreas no desktop; coluna única e listagem em cards nos dispositivos menores. Indicadores em duas colunas no celular.
- Seleção múltipla, câmera, arrastar/soltar, remoção, ordem, capa, prévia e progresso reutilizam os controles existentes. Falhas preservam os campos e arquivos selecionados.
- tests/community-visual-e2e.mjs exercita criação, edição preservando fotos, busca, filtros, abas e capturas nas larguras 320, 375, 390, 768, 1366 e 1920.
- A suíte scripts/validate-community.mjs executa os testes financeiros e de comunidade anteriores e os novos testes visuais em PostgreSQL isolado.
