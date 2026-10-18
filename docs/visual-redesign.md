# Redesign visual — referência aprovada

## Escopo

Identidade azul-marinho (#131921), laranja (#FF9900 / #FF7A00), branco, fundo #F6F7F9 e verde sustentável #78A83B. Logo com sorriso laranja no cabeçalho. Sidebar branca, seleção laranja suave, cards e formulários com melhor contraste. Banner bege com caixas, produtos, plantas e moeda Amazonitos; título e botão são HTML acessível e responsivo.

Preservados os nomes, rotas, organização das seções, indicadores ligados ao banco, filtros e formulários reais. Não foram alterados Prisma, migrações, autenticação, sessões, RBAC, carteira, resgates, FEFO ou movimentações de estoque. Não foram criados produtos/categorias na produção para imitar os exemplos da referência.

## Arte

- Ferramenta: imagegen integrada, modo padrão, usando a imagem anexada como referência estética.
- Arquivo de produção: `public/images/amazonitos-hero.webp` (1536 × 1024, 104284 bytes).
- Arte apenas decorativa: não representa disponibilidade ou oferta do catálogo.
- Logo: SVG vetorial no componente `src/components/brand.tsx`; favicon em `public/brand.svg`.
- A imagem foi convertida de PNG para WebP para reduzir tráfego, sem modificar a composição gerada.

### Prompt utilizado

Create a production website hero art asset, using the attached AMAZONITOS STORE screenshot ONLY as visual reference. Reproduce the photographic/3D product arrangement in the RIGHT HALF of its beige banner very faithfully: natural lush green plants behind stacked kraft cardboard parcel boxes with small black smile arrows, black over-ear headphones at lower left, a large luminous matte lime-green coin leaning upright at center on a cream cylindrical podium, the coin has a dark-green lowercase 'a' and small 'AMAZONITOS' lettering, a dark green steel bottle at right, and one white/gray athletic shoe at far right on another low cream podium. Warm soft studio light, premium ecommerce commercial aesthetic, natural contact shadows, detailed realistic materials. Wide landscape 3:2 composition of this isolated arrangement, all objects entirely within frame including leaves and shoe, generous 8% safe margin, pale warm ivory/beige seamless backdrop #FCF0DD that fades to solid pale ivory at all outer edges, cream stage. The arrangement fills the frame but no clipping. Important: this is only the art asset, NOT the complete website screenshot. Do NOT include navigation, cards, header, headline, buttons, badges, floating text cards, dates or UI. Do not include any human. The only text allowed is the lowercase a and AMAZONITOS on the green coin. Preserve the reference's spatial hierarchy and sophisticated pale beige/green/brown palette.

## Validação local

- `npm run typecheck`: passou.
- `npm test`: 3 testes existentes passaram.
- `npm run build`: passou.
- 18 verificações existentes de integração passaram, incluindo login, cookie seguro, permissões, crédito, quiz, resgate FEFO, saldo insuficiente no servidor, concorrência, cancelamento e auditoria.
- 4 verificações visuais adicionais passaram: 1920×1080, 1366×768, 768×1024 e 390×844. Logo visível no cabeçalho, arte carregada e nenhuma rolagem horizontal da página.
- Capturas foram inspecionadas em `.setup/screenshots/redesign-*.png` (não versionadas).
- Banco dos testes é PostgreSQL isolado local. Dados de teste não foram enviados ao Railway.
- `git diff` confirmou que os arquivos de regras de negócio, banco e implantação permanecem iguais à versão anterior.

A publicação utiliza o fluxo GitHub main → deploy automático do serviço AMAZONITOS-STORE no Railway. Não há mudança de configuração do banco ou do serviço neste redesign.
