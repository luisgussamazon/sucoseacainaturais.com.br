# Validação AMAZONITOS STORE

Execução: 18/10/2026. Projeto: C:\Users\luisguss\LOJINHA\sucoseacainaturais.com.br.

## Verificações executadas
- TypeScript: npm run typecheck passou.
- Testes unitários: npm test passou, 3 testes (senha com salt, FEFO e estoque insuficiente).
- Produção: npm run build passou, Next.js 16.4.2 e Prisma 6.19.3.
- Auditoria: npm audit --omit=dev --audit-level=high retornou zero vulnerabilidades após atualizar as dependências transitivas.
- Integração: scripts/validate-e2e.mjs passou com 18 verificações em PostgreSQL 17 isolado e Google Chrome headless. Credenciais geradas em memória; banco de teste sem acesso a dados externos.

- PASS: Migração PostgreSQL real aplicada
- PASS: Administrador inicial criado sem expor credenciais
- PASS: Healthcheck valida banco e schema
- PASS: Rotas privadas exigem autenticação
- PASS: Login seguro funciona
- PASS: Cookie HttpOnly, Secure e SameSite
- PASS: RH concede crédito com extrato e auditoria
- PASS: Colaborador não acessa formulário RH
- PASS: Resgate debita saldo e usa FEFO sem lotes vencidos
- PASS: Resposta incorreta não concede recompensa
- PASS: Quiz correto concede recompensa única
- PASS: Cancelamento estorna saldo e estoque
- PASS: Servidor rejeita resgate sem saldo e faz rollback
- PASS: Resgates simultâneos não duplicam estoque nem débito
- PASS: Dashboard mobile sem rolagem horizontal
- PASS: Saldo insuficiente impede resgate na interface
- PASS: Banco rejeita estoque negativo
- PASS: Operações administrativas são auditadas

## Inspeção visual
Dashboard inspecionado em desktop 1440 px e celular 390 px. Navegação, resumo, loja, campanhas e extrato adaptam-se à largura. Capturas locais em .setup/screenshots, não versionadas. Fotos remotas têm ilustração local de fallback.

## Limites da verificação
- A imagem Docker não foi construída nesta máquina: Docker não está disponível no PATH. O build Next.js e a aplicação de produção foram testados diretamente com Node.js 22.
- PostgreSQL Railway foi provisionado e seu deployment foi confirmado como SUCCESS/RUNNING. Seu schema de aplicação ainda não foi migrado: não há endpoint público do banco, e a aplicação ainda não foi implantada. Migrações estão configuradas no preDeployCommand.
- O serviço Railway AMAZONITOS-STORE está preparado com DATABASE_URL por referência ao serviço Postgres, sem origem de código ou deployment da aplicação.
- Não há administrador de produção criado. O script bootstrap-admin.mjs foi testado no banco isolado e está incluído no Dockerfile.
- Os testes automatizados concentram-se nos fluxos financeiros, FEFO, login, quiz, permissões e estorno. Nem todos os formulários administrativos têm cobertura de navegador.