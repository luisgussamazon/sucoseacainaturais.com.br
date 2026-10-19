# Loja SSD VBJ2: referência visual

A tela `/loja` recebeu banner, filtros e cards inspirados na referência aprovada. A identidade VBJ2 / SSD, navegação existente e dados da sessão foram preservados. Os ajustes de shell são limitados à loja; as demais páginas mantêm sua apresentação.

## Arquivos e componentes

- `src/app/(app)/loja/page.tsx`: banner e filtros GET reais (busca, categoria, preço, disponibilidade e ordenação).
- `src/components/product-card.tsx`: cards, disponibilidade real, descrição integral expansível e botão de resgate existente.
- `src/lib/store-presentation.ts`: identificação das seis caixas, apresentação de fotos e intervalos de preço.
- `src/app/store.css` e import em `src/app/layout.tsx`: estilos isolados e responsividade.
- `public/images/store/*.webp`: sete artes próprias de caixas, sem alimentos.
- `tests/store-presentation.test.ts`, `tests/store-design-e2e.mjs`, `scripts/validate-store-design.mjs`: verificações unitárias e integradas.

## Dados e fotografias

A inspeção somente leitura encontrou as seis caixas existentes com preços 10, 20, 35, 50, 75 e 100 Amazonitos. Na inspeção inicial, nenhuma tinha lote válido disponível: produção deve mostrar estoque esgotado, sem inventar disponibilidade para imitar a referência.

Não houve migração nem escrita no banco de produção. As artes substituem apenas a apresentação das seis fotografias originais identificadas por hash SHA-256 e nome/categoria. As fotos originais continuam armazenadas. Um novo upload ou URL altera o hash e volta a ser exibido normalmente. Outros produtos usam suas fotografias cadastradas.

Quantidades, descrição, alergênicos, validade, preços e disponibilidade vêm dos registros existentes. O texto integral e validade estão no detalhe expansível do card. O resgate mantém a ação original, saldo e FEFO. Não foram adicionadas notificações ou controles fictícios.

## Validação

`npm test`, `npm run typecheck`, `npm run build` e `node scripts/validate-store-design.mjs`.

O teste integrado usa PostgreSQL isolado, nunca produção: autenticação, permissões, carteira, resgate, FEFO, concorrência, upload persistente e filtros. A referência de cinco caixas disponíveis e uma esgotada é reproduzida apenas nessa base temporária. Capturas verificam 320, 375, 390, 768, 1366, 1672 e 1920 px, incluindo carregamento das imagens, grade e ausência de overflow.
