# SSD VBJ2

## Versão de apresentação no Render (sem banco)

A pasta [`demo/`](demo/README.md) contém uma demonstração estática independente, com dados fictícios e interações salvas no navegador. Para publicar como **Static Site** no Render, use `node demo/build.mjs` como Build Command e `demo/dist` como Publish Directory. O [`render.yaml`](render.yaml) também permite configurar o serviço por Blueprint. Veja o [passo a passo completo](demo/README.md).

Loja interna de colaboradores com Next.js App Router, TypeScript, Tailwind CSS, Prisma e PostgreSQL. Amazonitos são moedas fictícias, sem valor monetário real.

## Funcionalidades

- Catálogo com fotos HTTPS, busca, categorias, preço, estoque e validade do primeiro lote disponível.
- Carteira com extrato de créditos, débitos e estornos.
- Missões e quizzes com recompensa única por colaborador e prazo de encerramento.
- Resgates transacionais, reserva por FEFO, retirada administrativa e cancelamento com estorno.
- RH: concessões auditadas, publicação e encerramento de campanhas/quizzes.
- Administração: criação, perfis, inativação e recuperação de acesso; produtos, lotes, ajustes de estoque, pedidos e auditoria.
- Relatórios consolidados de participação, moedas, pedidos e vencimentos.
- Troca de senha pelo colaborador, com revogação de todas as sessões.

## Desenvolvimento

1. Use Node.js 22 e PostgreSQL.
2. Execute `npm ci`.
3. Copie `.env.example` para `.env` e preencha DATABASE_URL localmente. Nunca comite o arquivo.
4. Execute `npm run db:migrate`.
5. Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no ambiente (mínimo 12 caracteres), execute `npm run db:seed` e remova as variáveis depois. O seed não altera contas existentes.
6. Execute `npm run dev` e acesse http://localhost:3000.
7. Cadastre colaboradores em Administração, produtos/lotes em Estoque e campanhas no painel RH. Não há contas ou saldos padrão.

Caso Node não esteja no PATH deste computador, a instalação local utilizada está em `.setup/node-v22.23.3-win-x64`. Ela não integra o Git nem a imagem Docker.

## Validação

Execute `npm run typecheck`, `npm test` e `npm run build`.

Para reproduzir a validação com PostgreSQL isolado e navegador:

```powershell
npm install --prefix .setup/qa embedded-postgres@17.9.0-beta.17 playwright
node scripts/validate-e2e.mjs
```

No Windows é necessário Google Chrome. Em Linux, execute primeiro `.setup/qa/node_modules/.bin/playwright install chromium`. O teste usa apenas portas locais 55439 e 3147, gera credenciais aleatórias em memória, não conecta a bancos externos e preserva seu cluster de teste em `.setup`. Os dados dessa pasta não são versionados. Evidências visuais ficam em `.setup/screenshots`. Consulte VALIDATION.md para os resultados efetivamente executados.

## Railway

1. Crie um projeto e adicione um serviço PostgreSQL.
2. Adicione o serviço deste repositório na branch main. Dockerfile e railway.json são detectados automaticamente.
3. Configure DATABASE_URL como referência ao PostgreSQL do próprio projeto. Não coloque a URL no Git. Defina APP_URL com o domínio HTTPS público do serviço.
4. A etapa preDeployCommand aplica `prisma migrate deploy` antes de cada release. A imagem inclui o Prisma CLI e as migrações versionadas.
5. Crie o administrador inicial em um terminal seguro com Node 22, `npm ci`, DATABASE_URL de acesso externo do banco e as variáveis SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD. Execute `npm run db:seed` e remova as variáveis de seed. Não publique senhas no chat, em logs ou em arquivos versionados.
6. Gere o domínio no Railway. O serviço respeita PORT e escuta em 0.0.0.0. O healthcheck `/api/health` retorna 503 se banco ou schema estiver indisponível.
7. Valide login, crédito, resgate, retirada e cancelamento com contas de teste antes de liberar o acesso.

## Segurança e operação

Senhas são derivadas com scrypt e salt aleatório. Sessões opacas de oito horas são armazenadas como SHA-256 no banco; cookies usam HttpOnly, SameSite=Lax e Secure em produção. O Next.js valida a origem das Server Actions. Ações sensíveis verificam o usuário e perfil no servidor. Operações de saldo e estoque usam transações serializáveis com repetição de conflitos. O banco também impede saldo, preço e estoque inválidos. Login limita tentativas por e-mail em janela de 15 minutos. Não há cadastro público.

Datas informadas nos formulários de validade e encerramento usam horário de Brasília (UTC-3). Produtos vencidos ficam bloqueados. O estoque é reservado no resgate e a retirada é confirmada pelo administrador. Cancelamento restitui os lotes originais, que continuam bloqueados se estiverem vencidos.

Use HTTPS, backups PostgreSQL e política de retenção para sessões e auditoria. Recuperação de senha é assistida pelo administrador; e-mail automático e SSO não estão implementados. Fotos são URLs HTTPS cadastradas pela administração, sem upload. Extrato, pedidos e auditoria mostram os últimos 100 registros. Campanhas são missões com quiz; não há premiação automática sem responder ao quiz. O catálogo e os painéis de gestão ainda não têm paginação para grandes volumes.

### Ambiente Railway preparado nesta execução

Projeto exclusivo: https://railway.com/project/23999a62-565d-43ae-99e0-6974d6241f8c

O PostgreSQL e o serviço vazio AMAZONITOS-STORE foram criados. A aplicação referencia DATABASE_URL do serviço Postgres; nenhuma credencial foi gravada no código. O PostgreSQL está em rede privada, sem URL pública. A migração de produção será aplicada automaticamente na etapa de pré-deploy, dentro dessa rede. A aplicação ainda precisa ter a origem GitHub conectada ou receber `railway up --service AMAZONITOS-STORE` a partir desta pasta.

Para criar o primeiro administrador após o deploy, defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD nas variáveis do serviço pela interface segura do Railway. Execute `railway ssh --service AMAZONITOS-STORE -- node scripts/bootstrap-admin.mjs` e remova as duas variáveis depois. O script está incluído na imagem e não depende de tsx. A criação não sobrescreve usuários existentes. Nenhuma senha inicial foi criada automaticamente.

As dependências transitivas deepmerge-ts e effect têm overrides para versões corrigidas; migrações e testes foram reexecutados com essas versões.
