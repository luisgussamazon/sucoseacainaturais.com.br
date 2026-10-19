# Mobile e PWA — AMAZONITOS STORE

## Experiência mobile

O desktop aprovado permanece com seus estilos originais. As alterações de interface estão em `src/app/mobile.css`, restritas a larguras até 768 px. Em celulares e tablets pequenos, o menu recolhível reutiliza a navegação existente e o perfil recebido do servidor. Os cinco acessos inferiores são Início, Loja, Carteira, Missões e Perfil. Meus resgates e as opções de gestão continuam acessíveis pelo menu, conforme as permissões atuais.

O menu oferece fechamento por toque fora, botão e Escape, contenção de foco e bloqueio do conteúdo de fundo. Banners e fotografias mantêm proporções sem cortes. Indicadores usam duas colunas; formulários têm controles adequados ao toque e fontes de 16 px para evitar zoom automático de campos no iPhone. Tabelas extensas rolam dentro de seu próprio painel, com indicação de deslize, sem alargar a página. A barra inferior e o cabeçalho respeitam áreas seguras do aparelho.

## Instalação

- Android: no menu mobile ou na tela de login, toque em **Instalar aplicativo**. Quando o navegador disponibilizar o convite nativo, ele será aberto após esse toque. Como alternativa, use Instalar aplicativo / Adicionar à tela inicial no menu do navegador.
- iPhone: abra no Safari, toque em **Compartilhar → Adicionar à Tela de Início**. O botão Instalar aplicativo mostra essas instruções quando não há convite nativo.
- O manifest configura nome, ícones PNG próprios, ícone maskable, início em `/`, escopo `/`, cor azul-marinho e exibição `standalone`.
- Ícone Apple Touch próprio de 180×180 e metadados de aplicativo Apple estão disponíveis.
- A instalação é uma ação do usuário no navegador/sistema. A validação automatizada confirma os critérios da PWA e os fluxos de interface; não instala fisicamente em um telefone.

## Sessões e funcionamento offline

A autenticação, os cookies, os perfis e a duração da sessão não foram alterados. O aplicativo usa o mesmo mecanismo seguro existente. Não grava credenciais em localStorage ou IndexedDB e não cria filas offline de resgates ou outras operações.

O service worker `public/sw.js` mantém somente estes recursos públicos no CacheStorage `amazonitos-public-v1`: `/offline.html`, `/brand.svg` e os quatro ícones em `/icons/`. As requisições de instalação desses recursos omitem credenciais. HTML de páginas privadas, carteira, pedidos, relatórios, APIs e respostas RSC do Next.js nunca entram nesse cache. Navegações usam a rede; na falta de conexão, recebem apenas uma página pública genérica. Requisições POST não são interceptadas nem repetidas. APIs/RSC não recebem HTML como resposta offline.

As regras de cache não modificam a sessão. Reconectar permite continuar enquanto a sessão original for válida. Sair continua revogando a sessão no servidor. Nenhuma informação da carteira fica disponível ao reabrir o site offline depois do logout.

Ao alterar recursos públicos pré-armazenados no futuro, atualize a versão `CACHE_NAME`. A ativação remove apenas versões antigas com o prefixo da própria PWA. A entrega do service worker usa `Cache-Control: no-cache, no-store, must-revalidate`.

## Validação realizada

- `npm run typecheck`: passou.
- `npm test`: 8 testes passaram, incluindo 5 de manifest, ícones e isolamento do cache.
- `npm run build`: passou.
- `node scripts/validate-mobile-pwa.mjs`: 33 verificações passaram, reutilizando os testes funcionais existentes em PostgreSQL isolado.
- Larguras 320, 375, 390, 430 e 768 px: seis telas do colaborador e quatro painéis de gestão sem rolagem horizontal da página; menu, permissões e barra inferior funcionais.
- Comparação de pixels do desktop em 1920×1080 e 1366×768: nenhuma diferença na execução final fora das regiões de fotos remotas.
- Chromium em perfil normal confirmou ausência de erros de instalação. O teste usa perfil normal isolado porque perfis anônimos bloqueiam instalação de PWA.
- Cache real do navegador continha somente os seis recursos públicos permitidos.
- Offline, reconexão e logout não expuseram dados privados; reconectar preservou o cookie da sessão existente.
- WebKit validou a tela de login nas cinco larguras e as instruções de instalação do iPhone. Emulação Android Pixel 7 validou navegação por toque.
- Os fluxos existentes de crédito, quiz, resgate, FEFO, concorrência, estorno e auditoria passaram novamente.

Os testes são em navegadores automatizados e emulação, não em aparelhos físicos. Dados de QA foram criados exclusivamente no PostgreSQL local isolado; nenhum produto ou usuário fictício foi inserido na produção. Não foram alterados Prisma, migrações, autenticação, RBAC, regras de negócio, dependências ou configurações de banco/implantação.

## Reproduzir os testes

Use Node.js 22 e as ferramentas de QA descritas no README. Para WebKit, instale o navegador no próprio projeto:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.setup\browsers"
node .setup/qa/node_modules/playwright/cli.js install webkit
node scripts/validate-mobile-pwa.mjs
```

A suíte reutiliza `scripts/validate-e2e.mjs` sem modificá-lo e adiciona os checks de `tests/mobile-browser-checks.mjs`. Capturas, perfis de navegador e bancos de QA ficam em `.setup`, fora do Git. A comparação de pixels exige capturas anteriores `mobile-before-fullhd.png` e `mobile-before-notebook.png`; sem elas, a suíte indica explicitamente que essa comparação foi ignorada.

## Referências oficiais

- [Next.js — Progressive Web Apps](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [MDN — Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN — Caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
